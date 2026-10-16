import { heightfieldNormalSteps } from './TerrainShading';
import { registerTerrainNavigation, refreshTerrainNavigationIndex, releaseTerrainNavigation } from './TerrainNavigation';
import { blendedMaterialIds, groundBlendMaskSteps, groundLayerIndexSteps } from './GroundBlending';
import { createSpatialOverlay } from './SpatialOverlay';
import { environmentColours } from './EnvironmentOverlay';
import { macroRegions } from '../world-generation/MacroIsland';
import {
    BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Color,
    Texture, DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import { regionalGroundConfig } from '../config/RegionalGroundConfig';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface, terrainTriangles } from '../world-generation/TerrainQueries';
export { createBlueprintSurface } from '../world-generation/TerrainQueries';
export type { TerrainSurface } from '../world-generation/TerrainQueries';

// Retain only the immutable source reference for live wear updates; no derived world data is saved.
const blendedWorlds = new WeakMap<Mesh, { world: WorldBlueprint; snow: boolean }>();
const materialIds = ['Ground037', 'Ground054', 'mossy_rock', 'grass_path_2'] as const;
const biomePalette = {
    water: '#355962', shore: '#cfb986', clearing: '#bd8151',
    grass: '#739956', forest: '#285b42', rock: '#909eac',
};

/** Native alphaMap uses a separate world UV channel; source maps retain their physical repeat. */
function layerMask(world: WorldBlueprint, layer: number, wear?: readonly number[]): DataTexture {
    const data = new Uint8Array(world.terrain.heights.length * 4);
    for (let index = 0; index < world.terrain.heights.length; index++) {
        const biome = world.biomes.cells[index];
        const weight = layer === 1 ? Number(biome === 'water' || biome === 'shore') :
            layer === 2 ? Number(biome === 'rock') : (wear ?? world.biomes.worn)[index];
        const value = Math.round(weight * 255);
        data.set([value, value, value, 255], index * 4);
    }
    const texture = new DataTexture(data, world.terrain.columns, world.terrain.rows,
        RGBAFormat, UnsignedByteType);
    texture.channel = 1;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

export function createBlueprintTerrain(...args: Parameters<typeof terrainBuildSteps>): Mesh {
    const steps = terrainBuildSteps(...args);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
}

/** Same buffers and materials, with bounded CPU batches between browser input opportunities. */
export async function createBlueprintTerrainAsync(world: WorldBlueprint,
    sources?: ReadonlyMap<string, MeshStandardMaterial>, overlay = 'none', wear?: readonly number[],
    blending: 'baseline' | 'zoned' = 'baseline', snow = false,
    yieldControl: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))) {
    const steps = terrainBuildSteps(world, sources, overlay, wear, blending, snow);
    let step = steps.next();
    while (!step.done) { await yieldControl(); step = steps.next(); }
    return step.value;
}

function* terrainBuildSteps(world: WorldBlueprint,
    sources?: ReadonlyMap<string, MeshStandardMaterial>, overlay = 'none', wear?: readonly number[], blending: 'baseline' | 'zoned' = 'baseline', snow = false): Generator<void, Mesh> {
    const blended = blending === 'zoned' && !!world.environment && !!sources && overlay === 'none';
    const positions: number[] = [];
    const sourceUvs: number[] = [];
    const maskUvs: number[] = [];
    const colors: number[] = [];
    const { terrain } = world;
    const triangles = terrainTriangles(terrain);
    const smoothed = yield* heightfieldNormalSteps(world, triangles);
    const macroPalette = { sea: '#244a68', shore: '#dac393', lowland: '#7fba66',
        valley: '#438b69', upland: '#8b8971', highland: '#e0dcd3' };
    const environmentColors = environmentColours(world, overlay);
    const diagnosticColors = overlay === 'macro' ? macroRegions(world).map(region => macroPalette[region]) : [];
    // Independent source repeats are applied through native texture transforms.
    const repeat = regionalGroundConfig.sources.Ground037.repeatMeters;
    let vertices = 0;
    for (const triangle of triangles) {
        if (vertices % 6144 === 0) yield;
        vertices += 3;
        for (const index of triangle) {
            const column = index % terrain.columns;
            const row = Math.floor(index / terrain.columns);
            const x = terrain.bounds.minX + column * terrain.spacing;
            const z = terrain.bounds.minZ + row * terrain.spacing;
            positions.push(x, terrain.heights[index], z);
            sourceUvs.push(x / repeat, -z / repeat);
            maskUvs.push((column + .5) / terrain.columns, (row + .5) / terrain.rows);
            const colour = new Color();
            if (environmentColors) {
                colour.copy(environmentColors[index]);
            } else if (overlay === 'form') {
                colour.set('#c9c1ad');
            } else if (overlay === 'macro') {
                colour.set(diagnosticColors[index]);
            } else if (overlay === 'elevation') {
                const elevation = terrain.heights[index] - world.waterLevel;
                colour.set(elevation <= 0 ? '#244a68' : '#49765d');
                if (elevation > 0) colour.lerp(new Color('#f5e4c9'), Math.min(1, elevation / 35));
            } else if (overlay === 'biomes') {
                colour.set(biomePalette[world.biomes.cells[index]]);
            } else if (overlay === 'walkability') {
                const nav = world.navigation;
                const cell = Math.round(z - nav.bounds.minZ) * nav.columns +
                    Math.round(x - nav.bounds.minX);
                colour.set(nav.cells[cell] ? '#4d9c67' : '#a94d43');
            } else {
                colour.setScalar(world.biomes.cells[index] === 'water' ? .72 : 1);
            }
            colors.push(colour.r, colour.g, colour.b);
        }
    }
    if (world.config.preset === 'island') {
        // The canonical query already defines flat deep sea outside the heightfield. Render that
        // same continuation so the bounded heightfield does not appear as a square underwater.
        const surface = createBlueprintSurface(world), { minX, maxX, minZ, maxZ } = terrain.bounds;
        const extent = world.config.width * 2;
        const inner = [[minX,minZ],[minX,maxZ],[maxX,maxZ],[maxX,minZ]];
        const outer = [[-extent,-extent],[-extent,extent],[extent,extent],[extent,-extent]];
        const colour = new Color(overlay === 'form' ? '#c9c1ad' :
            overlay === 'none' ? '#dddddd' : '#244a68');
        for (let side = 0; side < 4; side++) {
            const next = (side+1)%4;
            const corners = [outer[side],outer[next],inner[next],inner[side]];
            for (const i of [0,1,2,0,2,3]) {
                const [x,z] = corners[i];
                positions.push(x,surface.surfaceHeightAt(x,z),z);
                sourceUvs.push(x/repeat,-z/repeat);
                maskUvs.push((x-minX)/world.config.width,(z-minZ)/world.config.depth);
                colors.push(colour.r,colour.g,colour.b);
            }
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(sourceUvs, 2));
    geometry.setAttribute('uv1', new Float32BufferAttribute(maskUvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    yield;
    geometry.computeVertexNormals();
    {
        let started = performance.now();
        const normal = geometry.getAttribute('normal');
        const count = (terrain.columns - 1) * (terrain.rows - 1) * 6;
        for (let vertex = 0; vertex < count; vertex++) {
            if (vertex > 0 && vertex % 8192 === 0) {
                const elapsed = performance.now() - started;
                smoothed.cpuMs += elapsed;
                smoothed.maxBatchMs = Math.max(smoothed.maxBatchMs, elapsed);
                yield;
                started = performance.now();
            }
            const column = Math.round((positions[vertex * 3] - terrain.bounds.minX) / terrain.spacing);
            const row = Math.round((positions[vertex * 3 + 2] - terrain.bounds.minZ) / terrain.spacing);
            const offset = (row * terrain.columns + column) * 3;
            const rock = smoothed.rock[row * terrain.columns + column];
            if (rock === 1) continue;
            const x = smoothed.corners[offset] * (1 - rock) + normal.getX(vertex) * rock;
            const y = smoothed.corners[offset + 1] * (1 - rock) + normal.getY(vertex) * rock;
            const z = smoothed.corners[offset + 2] * (1 - rock) + normal.getZ(vertex) * rock;
            const length = Math.hypot(x, y, z) || 1;
            normal.setXYZ(vertex, x / length, y / length, z / length);
        }
        const elapsed = performance.now() - started;
        smoothed.cpuMs += elapsed;
        smoothed.maxBatchMs = Math.max(smoothed.maxBatchMs, elapsed);
    }
    yield;
    if (blended) {
        const sideX = new Float32Array(positions.length / 3 * 2);
        const sideZ = new Float32Array(sideX.length);
        for (let vertex = 0; vertex < positions.length / 3; vertex++) {
            if (vertex % 8192 === 0) yield;
            const x = positions[vertex * 3], y = positions[vertex * 3 + 1], z = positions[vertex * 3 + 2];
            sideX.set([z / repeat, y / repeat], vertex * 2);
            sideZ.set([x / repeat, y / repeat], vertex * 2);
        }
        geometry.setAttribute('uv2', new Float32BufferAttribute(sideX, 2));
        geometry.setAttribute('uv3', new Float32BufferAttribute(sideZ, 2));
    }
    const textureClones: Texture[] = [];
    const spatial = createSpatialOverlay(world, overlay);
    if (spatial) textureClones.push(spatial.texture);
    const masks = blended ? yield* groundBlendMaskSteps(world, wear, snow) : null;
    // The first material is opaque; no mask is needed for it.
    masks?.[0].dispose();
    const diagnostic = overlay === 'source-grass' ? sources?.get('Ground037')?.clone() : null;
    if (diagnostic) {
        diagnostic.name = 'Approved grass source only';
        diagnostic.flatShading = false;
        diagnostic.vertexColors = false;
        diagnostic.normalMap = diagnostic.roughnessMap = diagnostic.alphaMap = null;
        if (diagnostic.map) {
            diagnostic.map = diagnostic.map.clone();
            diagnostic.map.repeat.setScalar(repeat / (sources!.get('Ground037')!.userData.repeatMeters ?? repeat));
            diagnostic.map.needsUpdate = true;
            textureClones.push(diagnostic.map);
        }
    }
    const material = diagnostic ?? (sources && overlay === 'none' ? (blended ? blendedMaterialIds : materialIds).map((id, layer) => {
        const source = sources.get(id);
        if (!source) throw new Error('Missing required approved ground material: ' + id);
        const copy = source.clone();
        copy.flatShading = false;
        const scale = repeat / (source.userData.repeatMeters ?? regionalGroundConfig.sources[id].repeatMeters);
        if (scale !== 1 || (blended && layer >= 4)) {
            for (const property of ['map', 'normalMap', 'roughnessMap'] as const) {
                const original = copy[property];
                if (!original) continue;
                const texture = original.clone();
                texture.repeat.set(scale, scale);
                if (blended && layer >= 4) texture.channel = layer - 2;
                texture.needsUpdate = true;
                copy[property] = texture;
                textureClones.push(texture);
            }
        }
        if (layer > 0) {
            copy.alphaMap = masks?.[layer] ?? layerMask(world, layer, wear);
            copy.transparent = true;
            copy.depthWrite = false;
            copy.polygonOffset = true;
            // Slope-scaled bias grows with camera distance and can pull ground through
            // authored yard floors. Fixed depth units separate coplanar layers without that drift.
            copy.polygonOffsetFactor = 0;
            copy.polygonOffsetUnits = -layer;
        }
        geometry.addGroup(0, positions.length / 3, layer);
        return copy;
    }) : new MeshStandardMaterial({ roughness: 1, flatShading: false,
        vertexColors: !spatial, map: spatial?.texture ?? null }));
    if (masks && masks.length === 7 && Array.isArray(material)) {
        material.push(new MeshStandardMaterial({ name: 'Climate snow candidate', color: '#edf1f1',
            roughness: 1, flatShading: false, vertexColors: true, alphaMap: masks[6],
            transparent: true, depthWrite: false, polygonOffset: true,
            polygonOffsetFactor: 0, polygonOffsetUnits: -6 }));
    }
    if (masks) yield* groundLayerIndexSteps(geometry, world, masks);
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Generated canonical terrain';
    mesh.userData.terrainShading = { variant: 'smooth', normalCpuMs: smoothed.cpuMs, maxNormalBatchMs: smoothed.maxBatchMs,
        scratchBytes: smoothed.scratchBytes, retainedAttributeByteDelta: 0 };
    mesh.userData.textureClones = textureClones;
    mesh.userData.spatial = spatial?.diagnostics ?? null;
    if (blended) blendedWorlds.set(mesh, { world, snow });
    registerTerrainNavigation(mesh, terrain);
    mesh.receiveShadow = true;
    return mesh;
}

/** Cloned materials own only their masks. The source colour/normal/roughness maps remain shared. */
export function disposeBlueprintTerrain(mesh: Mesh) {
    releaseTerrainNavigation(mesh);
    mesh.geometry.dispose();
    for (const texture of mesh.userData.textureClones ?? []) texture.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof MeshStandardMaterial) material.alphaMap?.dispose();
        material.dispose();
    }
}

/** Update only the native soil alpha map; geometry and saved geography stay unchanged. */
export function updateBlueprintWear(mesh: Mesh, weights: readonly number[]) {
    for (const _ of groundWearSteps(mesh, weights)) { /* Synchronous live-update contract. */ }
}
export async function updateBlueprintWearAsync(mesh: Mesh, weights: readonly number[],
    yieldControl: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))) {
    for (const _ of groundWearSteps(mesh, weights)) await yieldControl();
}
function* groundWearSteps(mesh: Mesh, weights: readonly number[]) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const blended = blendedWorlds.get(mesh);
    if (blended) {
        const { world, snow } = blended;
        if (weights.length !== world.terrain.heights.length) throw new Error('Ground mask does not match the terrain grid.');
        const masks = yield* groundBlendMaskSteps(world, weights, snow);
        yield* groundLayerIndexSteps(mesh.geometry, world, masks);
        refreshTerrainNavigationIndex(mesh);
        masks[0].dispose();
        for (let layer = 1; layer < materials.length; layer++) {
            const material = materials[layer] as MeshStandardMaterial;
            material.alphaMap?.dispose();
            material.alphaMap = masks[layer];
        }
        return;
    }
    const material = materials[3];
    if (!(material instanceof MeshStandardMaterial) || !(material.alphaMap instanceof DataTexture)) return;
    const texture = material.alphaMap;
    const data = texture.image.data as Uint8Array;
    if (data.length !== weights.length * 4) throw new Error('Ground mask does not match the terrain grid.');
    for (let i = 0; i < weights.length; i++) {
        const value = Math.round(Math.max(0, Math.min(1, weights[i])) * 255);
        data.set([value, value, value, 255], i * 4);
    }
    texture.needsUpdate = true;
}
