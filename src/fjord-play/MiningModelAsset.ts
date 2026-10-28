import { Mesh, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetDigest } from '../characters/AssetDigest';
import { miningAsset } from './MiningAssets';

export interface MiningModelSource {
    prepare(): Promise<Object3D | undefined>;
    dispose(): void;
    inspect(): {state: string; estimatedTextureMiB?: number};
}
function release(root: Object3D): void {
    const geometries = new Set<import('three').BufferGeometry>();
    const materials = new Set<import('three').Material>();
    const textures = new Set<Texture>();
    root.traverse(node => {
        if (!(node instanceof Mesh)) return;
        geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if ((value as Texture)?.isTexture) textures.add(value as Texture);
        }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) {
        texture.dispose();
        (texture.image as ImageBitmap)?.close?.();
    }
}

/** One lazy rigid template. All developed-mine instances share geometry and texture storage. */
export class MiningModelAsset implements MiningModelSource {
    private abort = new AbortController();
    private template?: Object3D;
    private loading?: Promise<Object3D | undefined>;
    private state = 'idle';
    constructor(private base = '/', private download: (url: string) => Promise<ArrayBuffer> = async url => {
        const response = await fetch(url, {signal: this.abort.signal});
        if (!response.ok) throw new Error('Mine model unavailable.');
        return response.arrayBuffer();
    }, private decode: (bytes: ArrayBuffer) => Promise<Object3D> = async bytes => {
        await MeshoptDecoder.ready;
        return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, '')).scene;
    }) {}
    prepare(): Promise<Object3D | undefined> {
        if (this.state === 'disposed') return Promise.resolve(undefined);
        return this.loading ??= (async () => {
            this.state = 'loading';
            try {
                const bytes = await this.download(this.base + miningAsset.path + '?v=' + miningAsset.sha256.slice(0, 12));
                if (bytes.byteLength !== miningAsset.bytes || await assetDigest(bytes) !== miningAsset.sha256)
                    throw new Error('Mine model identity differs.');
                const root = await this.decode(bytes);
                if (this.state === 'disposed') { release(root); return undefined; }
                root.traverse(node => {
                    if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; }
                });
                this.template = root;
                this.state = 'ready';
                return root;
            } catch {
                if (this.state !== 'disposed') this.state = 'failed';
                return undefined;
            }
        })();
    }
    inspect() {
        return {state: this.state, ...(this.template ? {
            estimatedTextureMiB: miningAsset.texturePixelsRGBA * 4 / 3 / 1048576
        } : {})};
    }
    dispose(): void {
        if (this.state === 'disposed') return;
        this.state = 'disposed';
        this.abort.abort();
        if (this.template) release(this.template);
        this.template = undefined;
    }
}
