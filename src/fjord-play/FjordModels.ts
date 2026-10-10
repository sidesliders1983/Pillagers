import { Box3, BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { AssetManager } from '../core/AssetManager';
import { placeSettlement } from '../world/PlaceSettlement';
import type { FjordEntity } from './FjordProjection';
/** Static source reuse; no new character assembly, animation or asset production. */
export class FjordModels {
    readonly diagnostics: string[] = [];
    private templates = new Map<string, Promise<Object3D>>();
    private loaded = new Set<Object3D>();
    private draco = new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/');
    private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(this.draco);
    constructor(private assets: AssetManager) { }
    async create(entity: FjordEntity): Promise<Object3D> {
        if (entity.kind === 'building') {
            const model = placeSettlement(this.assets, [{ id: entity.selectionKey, key: entity.asset,
                    terrainKey: entity.terrainAsset === 'farmyardMarker' ? undefined : entity.terrainAsset, x: 0, z: 0, rotation: 0,
                    halfWidth: entity.plot!.halfWidth, halfDepth: entity.plot!.halfDepth, radius: 9 }], () => 0);
            if (entity.terrainAsset === 'farmyardMarker') {
                const yard = new Mesh(new BoxGeometry(12, .03, 12), new MeshStandardMaterial({
                    color: 0x566b38, roughness: 1, transparent: true, opacity: .25, depthWrite: false
                }));
                yard.position.y = .015;
                yard.name = 'farmyardMarker';
                yard.userData.placeholder = true;
                model.add(yard);
                // Marker resources are instance-specific; source house resources stay asset-owned.
                this.loaded.add(yard);
            }
            const size = new Box3().setFromObject(model).getSize(new Vector3());
            if (size.x > entity.plot!.halfWidth * 2 || size.z > entity.plot!.halfDepth * 2) {
                this.diagnostics.push(entity.id + ': source exceeds reserved footprint; explicit house placeholder.');
                const root = new Group(), mesh = new Mesh(new BoxGeometry(4, 3, 4), new MeshStandardMaterial({ color: 0x9d8465, roughness: 1 }));
                mesh.position.y = 1.5;
                root.add(mesh);
                root.userData.placeholder = true;
                this.loaded.add(root);
                return root;
            }
            return model;
        }
        if (entity.kind === 'household')
            return this.assets.get('tent');
        const child = entity.kind === 'persona' && entity.status.age! < 16;
        const cacheKey = entity.asset;
        let template = this.templates.get(cacheKey);
        if (!template) {
            template = this.load(entity);
            this.templates.set(cacheKey, template);
        }
        const root = clone(await template);
        if (child)
            root.scale.multiplyScalar(.6);
        return root;
    }
    private async load(entity: FjordEntity) {
        let url: string, height: number | undefined;
        try {
            if (entity.kind === 'persona') {
                url = 'game-assets/human/Human_LOD2.glb';
                height = 1.8;
            }
            else if (entity.kind === 'cattle') {
                const response = await fetch(import.meta.env.BASE_URL + 'game-assets/cattle/' + entity.asset + '/manifest.json');
                if (!response.ok)
                    throw new Error('Cattle manifest unavailable');
                const manifest = await response.json();
                if (!Number.isFinite(manifest.height) || manifest.height <= 0 ||
                    typeof manifest.file !== 'string' || /[\/\\]/.test(manifest.file))
                    throw new Error('Invalid cattle source metadata');
                url = 'game-assets/cattle/' + entity.asset + '/' + manifest.file;
                height = manifest.height;
            }
            else
                url = 'assets/Terrain/longship-drakkar.glb';
            const source = (await this.loader.loadAsync(import.meta.env.BASE_URL + url)).scene;
            source.updateMatrixWorld(true);
            const bounds = new Box3().setFromObject(source), size = bounds.getSize(new Vector3());
            if (!Number.isFinite(size.y) || size.y <= 0)
                throw new Error('Invalid model bounds');
            const scale = height === undefined ? 1 : height / size.y;
            source.scale.multiplyScalar(scale);
            const center = bounds.getCenter(new Vector3());
            source.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
            const root = new Group();
            root.add(source);
            root.traverse(node => { if (node instanceof Mesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            } });
            this.loaded.add(root);
            return root;
        }
        catch (error) {
            this.diagnostics.push(entity.asset + ': explicit metric placeholder — ' + String(error));
            const root = new Group();
            const person = entity.kind === 'persona';
            const dimensions: [
                number,
                number,
                number
            ] = entity.kind === 'longship' ? [1.5, .5, 4] :
                entity.asset === 'baby' ? [.4, .6, .9] : [.6, 1.1, 1.6];
            const mesh = new Mesh(person ? new CapsuleGeometry(.2, 1.4, 3, 6) : new BoxGeometry(...dimensions), new MeshStandardMaterial({ color: person ? 0xc6ad86 : 0x887461, roughness: 1 }));
            mesh.position.y = person ? .9 : dimensions[1] / 2;
            root.add(mesh);
            root.userData.placeholder = true;
            this.loaded.add(root);
            return root;
        }
    }
    dispose() {
        const geometries = new Set<import('three').BufferGeometry>();
        const materials = new Set<import('three').Material>();
        const textures = new Set<import('three').Texture>();
        for (const root of this.loaded)
            root.traverse(node => {
                if (!(node instanceof Mesh))
                    return;
                geometries.add(node.geometry);
                for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                    materials.add(material);
                    for (const value of Object.values(material))
                        if (value && typeof value === 'object' && 'isTexture' in value)
                            textures.add(value as import('three').Texture);
                }
            });
        for (const resource of [...geometries, ...materials, ...textures])
            resource.dispose();
        this.templates.clear();
        this.loaded.clear();
        this.draco.dispose();
    }
}
