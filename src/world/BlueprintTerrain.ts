import {
    BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Color,
    Texture, DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping,
} from 'three';
import { regionalGroundConfig } from '../config/RegionalGroundConfig';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { terrainTriangles } from '../world-generation/TerrainQueries';
export { createBlueprintSurface } from '../world-generation/TerrainQueries';
export type { TerrainSurface } from '../world-generation/TerrainQueries';

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

export function createBlueprintTerrain(world: WorldBlueprint,
    sources?: ReadonlyMap<string, MeshStandardMaterial>, overlay = 'none', wear?: readonly number[]) {
    const positions: number[] = [];
    const sourceUvs: number[] = [];
    const maskUvs: number[] = [];
    const colors: number[] = [];
    const { terrain } = world;
    // Independent source repeats are applied through native texture transforms.
    const repeat = regionalGroundConfig.sources.Ground037.repeatMeters;
    for (const triangle of terrainTriangles(terrain)) {
        for (const index of triangle) {
            const column = index % terrain.columns;
            const row = Math.floor(index / terrain.columns);
            const x = terrain.bounds.minX + column * terrain.spacing;
            const z = terrain.bounds.minZ + row * terrain.spacing;
            positions.push(x, terrain.heights[index], z);
            sourceUvs.push(x / repeat, -z / repeat);
            maskUvs.push((column + .5) / terrain.columns, (row + .5) / terrain.rows);
            const colour = new Color();
            if (overlay === 'biomes') {
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
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(sourceUvs, 2));
    geometry.setAttribute('uv1', new Float32BufferAttribute(maskUvs, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const textureClones: Texture[] = [];
    const material = sources && overlay === 'none' ? materialIds.map((id, layer) => {
        const source = sources.get(id);
        if (!source) throw new Error('Missing required approved ground material: ' + id);
        const copy = source.clone();
        const scale = repeat / regionalGroundConfig.sources[id].repeatMeters;
        if (scale !== 1) {
            for (const property of ['map', 'normalMap', 'roughnessMap'] as const) {
                const original = copy[property];
                if (!original) continue;
                const texture = original.clone();
                texture.repeat.set(scale, scale);
                texture.needsUpdate = true;
                copy[property] = texture;
                textureClones.push(texture);
            }
        }
        if (layer > 0) {
            copy.alphaMap = layerMask(world, layer, wear);
            copy.transparent = true;
            copy.depthWrite = false;
            copy.polygonOffset = true;
            copy.polygonOffsetFactor = -layer;
            copy.polygonOffsetUnits = -layer;
        }
        geometry.addGroup(0, positions.length / 3, layer);
        return copy;
    }) : new MeshStandardMaterial({ roughness: 1, flatShading: true, vertexColors: true });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Generated canonical terrain';
    mesh.userData.textureClones = textureClones;
    mesh.receiveShadow = true;
    return mesh;
}

/** Cloned materials own only their masks. The source colour/normal/roughness maps remain shared. */
export function disposeBlueprintTerrain(mesh: Mesh) {
    mesh.geometry.dispose();
    for (const texture of mesh.userData.textureClones ?? []) texture.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof MeshStandardMaterial) material.alphaMap?.dispose();
        material.dispose();
    }
}

/** Update only the native soil alpha map; geometry and saved geography stay unchanged. */
export function updateBlueprintWear(mesh: Mesh, weights: readonly number[]) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
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
