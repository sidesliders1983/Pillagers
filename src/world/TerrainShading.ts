import { sampleEnvironment } from '../world-generation/EnvironmentZoning';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

export type TerrainShading = 'baseline' | 'smooth';

/** Area-weight the canonical adjacent faces once. Duplicate render vertices reuse these corners. */
export function* heightfieldNormalSteps(world: WorldBlueprint, triangles: readonly number[][]):
    Generator<void, { corners: Float64Array; rock: Float32Array; cpuMs: number; maxBatchMs: number; scratchBytes: number }> {
    const { terrain } = world;
    const corners = new Float64Array(terrain.heights.length * 3);
    const rock = new Float32Array(terrain.heights.length);
    const { columns, spacing, heights } = terrain;
    let cpuMs = 0, maxBatchMs = 0, started = performance.now();
    const recordBatch = () => {
        const elapsed = performance.now() - started;
        cpuMs += elapsed;
        maxBatchMs = Math.max(maxBatchMs, elapsed);
    };
    for (let face = 0; face < triangles.length; face++) {
        if (face > 0 && face % 2048 === 0) {
            recordBatch();
            yield;
            started = performance.now();
        }
        const [a, b, c] = triangles[face];
        const ax = a % columns, az = Math.floor(a / columns);
        const bx = (b % columns - ax) * spacing, by = heights[b] - heights[a];
        const bz = (Math.floor(b / columns) - az) * spacing;
        const cx = (c % columns - ax) * spacing, cy = heights[c] - heights[a];
        const cz = (Math.floor(c / columns) - az) * spacing;
        const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
        for (const index of triangles[face]) {
            corners[index * 3] += nx;
            corners[index * 3 + 1] += ny;
            corners[index * 3 + 2] += nz;
        }
    }
    recordBatch();
    yield;
    started = performance.now();
    for (let index = 0; index < heights.length; index++) {
        if (index > 0 && index % 4096 === 0) {
            recordBatch();
            yield;
            started = performance.now();
        }
        const x = terrain.bounds.minX + index % columns * spacing;
        const z = terrain.bounds.minZ + Math.floor(index / columns) * spacing;
        // Reuse the saved continuous exposure, rather than classifying terrain again by slope.
        const zone = sampleEnvironment(world, x, z);
        rock[index] = zone?.primary === 'bedrock' ? zone.rockExposure : 0;
        const offset = index * 3;
        const length = Math.hypot(corners[offset], corners[offset + 1], corners[offset + 2]) || 1;
        corners[offset] /= length;
        corners[offset + 1] /= length;
        corners[offset + 2] /= length;
        // The existing outside-height query is a flat deep sea. Keep that authored join hard.
        const boundary = index % columns === 0 || index % columns === columns - 1 ||
            index < columns || index >= columns * (terrain.rows - 1);
        if (world.config.preset === 'island' && boundary &&
            Math.abs(heights[index] - (world.waterLevel - 7)) < 1e-6) {
            corners[offset] = 0; corners[offset + 1] = 1; corners[offset + 2] = 0;
            rock[index] = 0;
        }
    }
    recordBatch();
    return { corners, rock, cpuMs, maxBatchMs, scratchBytes: corners.byteLength + rock.byteLength };
}
