import {Mesh, type Object3D, type Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'meshoptimizer';
import {assetDigest} from '../characters/AssetDigest';
import {cattailAsset} from './CattailAssets';

/** One shared, verified Cattail template, loaded only for a discovered wet pocket. */
export class WetlandModelAsset {
    private abort = new AbortController();
    private root?: Object3D;
    private loading?: Promise<Object3D | undefined>;
    private state = 'idle';
    constructor(private base = '/', private download: (url: string) => Promise<ArrayBuffer> = async url => {
        const response = await fetch(url, {signal: this.abort.signal});
        if (!response.ok) throw new Error('Wetland model unavailable.');
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
                const bytes = await this.download(this.base + cattailAsset.path + '?v=' + cattailAsset.sha256.slice(0, 12));
                if (bytes.byteLength !== cattailAsset.bytes || await assetDigest(bytes) !== cattailAsset.sha256)
                    throw new Error('Wetland model identity differs.');
                const root = await this.decode(bytes);
                if (this.state === 'disposed') {this.release(root); return;}
                this.root = root;
                this.state = 'ready';
                return root;
            } catch {
                if (this.state !== 'disposed') this.state = 'failed';
            }
        })();
    }
    inspect() {return {state: this.state, texturePixelsRGBA: cattailAsset.texturePixelsRGBA};}
    private release(root: Object3D) {
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
        for (const texture of textures) {texture.dispose(); (texture.image as ImageBitmap)?.close?.();}
    }
    dispose() {
        if (this.state === 'disposed') return;
        this.state = 'disposed'; this.abort.abort();
        if (this.root) this.release(this.root);
        this.root = undefined;
    }
}
