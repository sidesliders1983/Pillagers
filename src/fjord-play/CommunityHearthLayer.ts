import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh,
    MeshStandardMaterial, Raycaster, Vector2, Vector3, type Camera, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetDigest } from '../characters/AssetDigest';
import { StructureSeasonTint } from '../world/StructureSeasonTint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
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
        model.position.set(site.placement.x, site.support.floor, site.placement.z);
        model.rotation.y = site.placement.rotation;
        this.footing = this.createFooting(site, world);
        this.root.add(model, this.footing);
        this.season = new StructureSeasonTint(this.root);
        this.season.setSnowAmount(this.snow);
        this.decorate?.(this.root);
        this.root.updateMatrixWorld(true);
        this.bounds = new Box3().setFromObject(this.root);
        this.status = 'ready';
    }
    private createFooting(site: Site, world: WorldBlueprint): Group {
        const group = new Group();
        const source = communityHearthAssets[site.tier].bounds;
        const halfWidth = Math.max(Math.abs(source.min[0]), Math.abs(source.max[0])) + .1;
        const halfDepth = Math.max(Math.abs(source.min[2]), Math.abs(source.max[2])) + .1;
        const surface = createBlueprintSurface(world);
        const vertices: number[] = [];
        const colors: number[] = [];
        const stone = (points: number[][], variation: number) => {
            for (const point of points) {
                vertices.push(...point);
                // Slightly earthier lower faces meet the terrain without a hard uniform slab edge.
                const buried = Math.min(1, Math.max(0, -point[1] / .6));
                colors.push(variation * (1 - buried * .07), variation * (1 - buried * .06),
                    variation * (1 - buried * .12));
            }
        };
        const worldPoint = (x: number, z: number) => ({
            x: site.placement.x + x * Math.cos(site.placement.rotation) + z * Math.sin(site.placement.rotation),
            z: site.placement.z - x * Math.sin(site.placement.rotation) + z * Math.cos(site.placement.rotation),
        });
        const corners = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth],
            [halfWidth, halfDepth], [-halfWidth, halfDepth]];
        const point = (x: number, y: number, z: number) => [x, y - site.support.floor, z];
        const columns = Math.ceil(halfWidth * 2 / .8), rows = Math.ceil(halfDepth * 2 / .6);
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const left = -halfWidth + halfWidth * 2 * column / columns;
                const right = -halfWidth + halfWidth * 2 * (column + 1) / columns;
                const back = -halfDepth + halfDepth * 2 * row / rows;
                const front = -halfDepth + halfDepth * 2 * (row + 1) / rows;
                const top = [[left, back], [right, back], [right, front], [left, front]]
                    .map(([x, z]) => point(x, site.support.floor - .01, z));
                const variation = .91 + ((column * 17 + row * 29) % 13) / 100;
                stone([top[0], top[2], top[1], top[0], top[3], top[2]], variation);
            }
        }
        for (let side = 0; side < 4; side++) {
            const first = corners[side], last = corners[(side + 1) % 4];
            const steps = Math.ceil(Math.hypot(last[0] - first[0], last[1] - first[1]) / .5);
            for (let step = 0; step < steps; step++) {
                const pair = [step, step + 1].map(index => {
                    const x = first[0] + (last[0] - first[0]) * index / steps;
                    const z = first[1] + (last[1] - first[1]) * index / steps;
                    const ground = worldPoint(x, z);
                    return { upper: point(x, site.support.floor - .01, z),
                        lower: point(x, surface.surfaceHeightAt(ground.x, ground.z) - .04, z) };
                });
                stone([pair[0].upper, pair[1].upper, pair[0].lower,
                    pair[1].upper, pair[1].lower, pair[0].lower], .9 + (step * 7 + side * 3) % 13 / 100);
            }
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        const material = new MeshStandardMaterial({ color: '#67645a', roughness: 1,
            flatShading: true, vertexColors: true });
        const pad = new Mesh(geometry, material);
        pad.receiveShadow = true;
        group.add(pad);
        // A low, visible stair meets the untouched ground in front of the doorway.
        const entrance = worldPoint(0, halfDepth + .9);
        const base = surface.surfaceHeightAt(entrance.x, entrance.z);
        const rise = Math.max(0, site.support.floor - base);
        const count = Math.max(1, Math.ceil(rise / .18));
        const stairMaterial = material.clone();
        stairMaterial.vertexColors = false;
        for (let step = 0; step < count; step++) {
            const height = Math.max(.03, rise * (count - step) / count);
            const mesh = new Mesh(new BoxGeometry(1.6, height, .9 / count), stairMaterial);
            mesh.position.set(0, base + height / 2 - site.support.floor,
                halfDepth + (step + .5) * .9 / count);
            mesh.receiveShadow = true;
            group.add(mesh);
        }
        group.position.set(site.placement.x, site.support.floor, site.placement.z);
        group.rotation.y = site.placement.rotation;
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
    inspect() { return { state: this.status, tier: this.tier, bounds: this.bounds?.clone() }; }
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
