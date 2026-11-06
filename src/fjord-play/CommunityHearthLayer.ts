import { Box3, BoxGeometry, BufferGeometry, Group, Mesh,
    MeshStandardMaterial, Raycaster, Vector2, Vector3, type Camera, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetDigest } from '../characters/AssetDigest';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import type { projectFjordSettlement } from './FjordProjection';
import { communityHearthAssets } from './CommunityHearthAssets';

type Site = NonNullable<ReturnType<typeof projectFjordSettlement>['communityHearthSite']>;

function release(root: Object3D) {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<import('three').Material>();
    const textures = new Set<Texture>();
    root.traverse(node => {
        if (!(node instanceof Mesh)) return;
        geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if ((value as Texture)?.isTexture)
                textures.add(value as Texture);
        }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    for (const texture of textures) {
        texture.dispose();
        (texture.image as ImageBitmap)?.close?.();
    }
}

/** One selected community structure, sharing the existing renderer, light and outdoor fire. */
export class CommunityHearthLayer {
    readonly root = new Group();
    private templates = new Map<1 | 2, Promise<Object3D | undefined>>();
    private sources = new Set<Object3D>();
    private abort = new AbortController();
    private signature = '';
    private generation = 0;
    private season?: StructureSeasonTint;
    private footing?: Object3D;
    private disposed = false;
    private snow = 0;
    private status = 'absent';
    private tier = 0;
    private bounds?: Box3;
    private transform?: Site['transform'];
    private footingCount = 0;
    constructor(private base = '/', private decorate?: (root: Object3D) => void) {
        this.root.name = 'Community Hearth structure';
    }
    private prepare(tier: 1 | 2) {
        let pending = this.templates.get(tier);
        if (!pending) {
            pending = (async () => {
                const asset = communityHearthAssets[tier];
                try {
                    const response = await fetch(this.base + asset.path + '?v=' + asset.sha256.slice(0, 12),
                        { signal: this.abort.signal });
                    if (!response.ok) throw new Error('Community structure unavailable.');
                    const bytes = await response.arrayBuffer();
                    if (bytes.byteLength !== asset.bytes || await assetDigest(bytes) !== asset.sha256)
                        throw new Error('Community structure asset identity differs.');
                    await MeshoptDecoder.ready;
                    const source = (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
                        .parseAsync(bytes, '')).scene;
                    if (this.disposed) { release(source); return undefined; }
                    source.traverse(node => {
                        if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; }
                    });
                    this.sources.add(source);
                    return source;
                } catch {
                    return undefined;
                }
            })();
            this.templates.set(tier, pending);
        }
        return pending;
    }
    private clear() {
        this.season?.dispose();
        this.season = undefined;
        if (this.footing) release(this.footing);
        this.footing = undefined;
        this.root.clear();
        this.bounds = undefined;
        this.transform = undefined;
        this.footingCount = 0;
    }
    async sync(site: Site | undefined, world: WorldBlueprint): Promise<void> {
        if (this.disposed) return;
        const signature = JSON.stringify(site);
        if (signature === this.signature) return;
        this.signature = signature;
        const generation = ++this.generation;
        this.clear();
        this.tier = site?.tier ?? 0;
        if (!site) { this.status = 'absent'; return; }
        this.status = 'loading';
        const source = await this.prepare(site.tier);
        if (this.disposed || generation !== this.generation) return;
        if (!source) { this.status = 'unavailable'; return; }
        const model = source.clone(true);
        model.position.set(site.transform.x, site.transform.y, site.transform.z);
        model.rotation.y = site.transform.rotation;
        model.scale.setScalar(site.transform.scale);
        this.transform = { ...site.transform };
        this.footing = this.createFooting(site);
        this.root.add(model, this.footing);
        this.season = new StructureSeasonTint(this.root);
        this.season.setSnowAmount(this.snow);
        this.decorate?.(this.root);
        this.root.updateMatrixWorld(true);
        this.bounds = new Box3().setFromObject(this.root);
        this.status = 'ready';
    }
    private createFooting(site: Site): Group {
        const group = new Group();
        const material = new MeshStandardMaterial({ color: '#67645a', roughness: 1, flatShading: true });
        for (const support of site.supports) {
            const gap = site.transform.y - support.base;
            if (gap <= .06) continue;
            const bounds = support.bounds, scale = site.transform.scale;
            const height = gap + .025;
            const mesh = new Mesh(new BoxGeometry(bounds.maxX - bounds.minX,
                height / scale, bounds.maxZ - bounds.minZ), material);
            mesh.position.set((bounds.minX + bounds.maxX) / 2, -height / scale / 2,
                (bounds.minZ + bounds.maxZ) / 2);
            mesh.receiveShadow = true;
            group.add(mesh);
        }
        this.footingCount = group.children.length;
        if (!this.footingCount) material.dispose();
        group.position.set(site.transform.x, site.transform.y, site.transform.z);
        group.rotation.y = site.transform.rotation;
        group.scale.setScalar(site.transform.scale);
        return group;
    }
    setSnowAmount(value: number) { this.snow = value; this.season?.setSnowAmount(value); }
    pick(camera: Camera, x: number, y: number,
        viewport: { left: number; top: number; width: number; height: number }): boolean {
        if (!this.bounds || !viewport.width || !viewport.height) return false;
        const ray = new Raycaster();
        ray.setFromCamera(new Vector2((x - viewport.left) / viewport.width * 2 - 1,
            -(y - viewport.top) / viewport.height * 2 + 1), camera);
        return ray.intersectObject(this.root, true).length > 0;
    }
    get obstacleBounds() { return this.bounds?.clone(); }
    inspect() { return { state: this.status, tier: this.tier, bounds: this.bounds?.clone(),
        transform: this.transform ? { ...this.transform } : undefined, footingCount: this.footingCount }; }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.abort.abort();
        this.clear();
        for (const source of this.sources) release(source);
        this.sources.clear();
        this.templates.clear();
        this.root.removeFromParent();
    }
}
