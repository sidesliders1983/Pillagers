import { terrainGradientAt } from '../world-generation/TerrainQueries';
import { BufferGeometry, DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, ClampToEdgeWrapping } from 'three';
import { sampleEnvironment } from '../world-generation/EnvironmentZoning';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export const blendedMaterialIds = ['Ground037', 'Ground054', 'grass_path_2', 'mossy_rock', 'mossy_rock', 'mossy_rock'] as const;

/** Presentation only: normalize the saved influences, then apply the existing clearing/path wear. */
export function groundBlendWeights(world: WorldBlueprint, x: number, z: number, wear = 0): number[] {
    const zone = sampleEnvironment(world, x, z);
    if (!zone) throw new Error('Ground blending requires existing environment zoning.');
    const weights = [zone.grass, zone.sand, zone.mud, zone.rockExposure];
    const total = weights.reduce((sum, value) => sum + value, 0);
    // Underwater samples have no land influences; keep the approved sandy seabed.
    if (total === 0) return [0, 1, 0, 0];
    const worn = Math.max(0, Math.min(1, wear));
    return weights.map((value, index) => value / total * (1 - worn) + (index === 2 ? worn : 0));
}

export function createGroundBlendMasks(world: WorldBlueprint, wear = world.biomes.worn, snow = false): DataTexture[] {
    const { terrain } = world;
    const buffers = blendedMaterialIds.map(() => new Uint8Array(terrain.heights.length * 4));
    const snowEnabled = snow && world.environment!.fields.snowRetentionPotential.some(value => value > 0);
    if (snowEnabled) buffers.push(new Uint8Array(terrain.heights.length * 4));
    for (let index = 0; index < terrain.heights.length; index++) {
        const x = terrain.bounds.minX + index % terrain.columns * terrain.spacing;
        const z = terrain.bounds.minZ + Math.floor(index / terrain.columns) * terrain.spacing;
        const [grass, sand, mud, rock] = groundBlendWeights(world, x, z, wear[index]);
        const gradient = terrainGradientAt(world, x, z);
        // Native axis projections share the same rock source; blend by surface orientation.
        const sideX = gradient.x ** 4, sideZ = gradient.z ** 4;
        const total = 1 + sideX + sideZ;
        const weights = [grass, sand, mud, rock / total, rock * sideX / total, rock * sideZ / total];
        if (snowEnabled) {
            const value = Math.round(sampleEnvironment(world, x, z)!.snowRetentionPotential * 255);
            buffers[6].set([value, value, value, 255], index * 4);
        }
        let cumulative = 0;
        for (let layer = 0; layer < weights.length; layer++) {
            cumulative += weights[layer];
            // Native over-composition: raw weights as opacity would darken/misweight earlier layers.
            const alpha = cumulative > 0 ? weights[layer] / cumulative : 0;
            const value = Math.round(alpha * 255);
            buffers[layer].set([value, value, value, 255], index * 4);
        }
    }
    return buffers.map(data => {
        const texture = new DataTexture(data, terrain.columns, terrain.rows, RGBAFormat, UnsignedByteType);
        texture.channel = 1;
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    });
}

/** Keep one draw group per material, omitting only quads whose bilinear alpha is entirely zero. */
export function indexGroundLayers(geometry: BufferGeometry, world: WorldBlueprint, masks: DataTexture[]) {
    const count = geometry.getAttribute('position').count;
    const { columns, rows } = world.terrain;
    const gridVertices = (columns - 1) * (rows - 1) * 6;
    const indices: number[] = [];
    geometry.clearGroups();
    for (let layer = 0; layer < masks.length; layer++) {
        const start = indices.length;
        const data = masks[layer].image.data;
        for (let row = 0; row < rows - 1; row++) for (let col = 0; col < columns - 1; col++) {
            const sample = row * columns + col;
            // All four corners matter: the unused corner of a triangle still affects bilinear alpha.
            if (layer > 0 && [sample, sample + 1, sample + columns, sample + columns + 1]
                .every(index => data[index * 4 + 1] === 0)) continue;
            const vertex = (row * (columns - 1) + col) * 6;
            for (let offset = 0; offset < 6; offset++) indices.push(vertex + offset);
        }
        // Preserve the eight deep-sea continuation triangles with their existing clamped masks.
        for (let vertex = gridVertices; vertex < count; vertex++) indices.push(vertex);
        const length = indices.length - start;
        if (length > 0) geometry.addGroup(start, length, layer);
    }
    const previous = geometry.getIndex();
    if (previous && previous.count >= indices.length) {
        previous.array.set(indices);
        previous.needsUpdate = true;
    } else {
        // Release a superseded GPU index buffer before growing it on an occasional wear update.
        if (previous) geometry.dispose();
        geometry.setIndex(indices);
    }
    geometry.setDrawRange(0, indices.length);
}
