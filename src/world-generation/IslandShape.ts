import { createNoise2D } from 'simplex-noise';
import { seededRandom } from '../config/worldConfig';
import { islandDrainage } from './IslandDrainage';
import type { IslandGeology, Point2, TerrainField, WorldGenerationConfig } from './WorldBlueprint';

const smooth = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
};
function segmentSample(x: number, z: number, a: Point2, b: Point2) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return { t, distance: Math.hypot(x - a.x - dx * t, z - a.z - dz * t),
        side: Math.sign(dx * (z - a.z) - dz * (x - a.x)) };
}

/** Bounded volcanic accumulation, drainage-driven erosion, then marine/lowland shaping. */
export function islandTerrain(config: WorldGenerationConfig, waterLevel: number) {
    const random = seededRandom(config.seed ^ 0x317c2);
    const noise = createNoise2D(seededRandom(config.seed ^ 0x5a82));
    const angle = random() * Math.PI, c = Math.cos(angle), s = Math.sin(angle);
    const position = (u: number, v: number): Point2 => ({ x: (u * c - v * s) * 1.4, z: (u * s + v * c) * 1.4 });
    const rifts = [
        { a: position(-92 - random() * 30, -15), b: position(75 + random() * 35, 5), width: (145 + random() * 16) * 1.4 },
        { a: position(-65 + random() * 30, 20), b: position(65 + random() * 40, 65), width: (106 + random() * 22) * 1.4 }
    ];
    const heights: number[] = [];
    const columns = config.width / 2 + 1, rows = config.depth / 2 + 1;
    for (let z = -config.depth / 2; z <= config.depth / 2; z += 2) {
        for (let x = -config.width / 2; x <= config.width / 2; x += 2) {
            const warpX = x + noise(x * .0065, z * .0065) * 25;
            const warpZ = z + noise(x * .0057 + 7, z * .0057) * 20;
            const deposits = rifts.map(rift => {
                const distance = segmentSample(warpX, warpZ, rift.a, rift.b).distance;
                return smooth((1 - distance / rift.width) / .8);
            });
            const lava = Math.max(...deposits) + .12 * Math.min(...deposits);
            const rolling = noise(x * .01, z * .01) * 9 + noise(x * .021, z * .019) * 2;
            const edge = smooth(Math.min((config.width / 2 - Math.abs(x)) / 24,
                (config.depth / 2 - Math.abs(z)) / 24));
            heights.push(Math.fround(waterLevel - 7 + edge * (lava * 61 + rolling * smooth(lava))));
        }
    }
    const terrain: TerrainField = { columns, rows, spacing: 2, heights,
        bounds: { minX: -config.width / 2, maxX: config.width / 2,
            minZ: -config.depth / 2, maxZ: config.depth / 2 } };
    const valleys = islandDrainage(terrain, waterLevel, random);
    // Erosion lowers a common heightfield. No individual mountain or inlet shapes are added.
    for (let i = 0; i < heights.length; i++) {
        const x = terrain.bounds.minX + i % columns * 2;
        const z = terrain.bounds.minZ + Math.floor(i / columns) * 2;
        let height = heights[i];
        for (const valley of valleys) {
            let nearest = Infinity, floor = height, width = 1, side = 1;
            for (let j = 1; j < valley.points.length; j++) {
                const sample = segmentSample(x, z, valley.points[j - 1], valley.points[j]);
                if (sample.distance >= nearest) continue;
                nearest = sample.distance;
                side = sample.side;
                width = valley.widths[j - 1] + sample.t * (valley.widths[j] - valley.widths[j - 1]);
                floor = valley.floorHeights[j - 1] + sample.t *
                    (valley.floorHeights[j] - valley.floorHeights[j - 1]);
            }
            const asymmetricWidth = width * (side < 0 ? .91 : 1.08);
            const crossSection = smooth((nearest / asymmetricWidth - .4) / .6);
            height = Math.min(height, floor + Math.max(0, heights[i] - floor) * crossSection);
        }
        // Coastal benches and depositional lowlands follow elevation, never a settlement rectangle.
        const elevation = height - waterLevel;
        const rise = Math.max(0, elevation - 20);
        const lowland = elevation <= 0 ? elevation : elevation <= 20 ? elevation * .06 :
            elevation < 40 ? 1.2 + .06 * rise + .03225 * rise * rise :
                15.3 + (elevation - 40) * 1.35;
        heights[i] = Math.fround(waterLevel + (lowland > 6.2 ?
            6.2 + (lowland - 6.2) * config.relief : lowland));
    }
    // Marine abrasion removes tiny detached remnants; larger fragmentation is rejected by validation.
    const visited = new Uint8Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
        if (visited[i] || heights[i] <= waterLevel) continue;
        const queue = [i];
        visited[i] = 1;
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor], col = cell % columns, row = Math.floor(cell / columns);
            for (const next of [col > 0 ? cell-1 : -1, col < columns-1 ? cell+1 : -1,
                row > 0 ? cell-columns : -1, row < rows-1 ? cell+columns : -1]) {
                if (next < 0 || visited[next] || heights[next] <= waterLevel) continue;
                visited[next] = 1;
                queue.push(next);
            }
        }
        if (queue.length * 4 <= 256) {
            for (const cell of queue) heights[cell] = Math.fround(waterLevel - 1.5);
        }
    }
    const geology: IslandGeology = { model: 'rift-glacial-v1', rifts, valleys };
    return { heights, geology };
}
