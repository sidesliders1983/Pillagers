import { createNoise2D } from 'simplex-noise';
import { seededRandom } from '../config/worldConfig';
import { islandDrainage } from './IslandDrainage';
import { gentlerSettlementGeneratorVersion, discoverySettlementGeneratorVersion } from './SettlementSites';
import { gentlerIslandGeneratorVersion } from './WorldBlueprint';
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
    // The rift system can be compact, elongated or offset/branched. These are
    // accumulation zones, not coastline lobes: drainage cuts their combined field later.
    const elongation = random();
    const length = 190 + elongation * 240;
    const width = 250 - elongation * 80;
    const systemCount = 1 + Math.floor(random() * 3);
    const angle = random() * Math.PI * 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const position = (u: number, v: number): Point2 => ({
        x: u * c - v * s, z: u * s + v * c
    });
    const rifts = [{
        a: position(-length * .52, -15 + random() * 30),
        b: position(length * .48, -25 + random() * 50), width
    }];
    for (let i = 1; i < systemCount; i++) {
        const pivot = (-.3 + random() * .6) * length;
        const heading = (random() < .5 ? -1 : 1) * (.3 + random() * .75);
        const branchLength = length * (.4 + random() * .35);
        const side = (random() < .5 ? -1 : 1) * width * (.45 + random() * .4);
        rifts.push({
            a: position(pivot - Math.cos(heading) * branchLength * .5,
                side - Math.sin(heading) * branchLength * .5),
            b: position(pivot + Math.cos(heading) * branchLength * .5,
                side + Math.sin(heading) * branchLength * .5),
            width: width * (.6 + random() * .3)
        });
    }
    const heights: number[] = [];
    const columns = config.width / 2 + 1, rows = config.depth / 2 + 1;
    for (let z = -config.depth / 2; z <= config.depth / 2; z += 2) {
        for (let x = -config.width / 2; x <= config.width / 2; x += 2) {
            const warpX = x + noise(x * .0065, z * .0065) * 25;
            const warpZ = z + noise(x * .0057 + 7, z * .0057) * 20;
            const deposits = rifts.map(rift => {
                const distance = segmentSample(warpX, warpZ, rift.a, rift.b).distance;
                return smooth(1 - distance / rift.width);
            });
            const strongestDeposit = Math.max(...deposits);
            const overlappingDeposits = deposits.reduce((sum, deposit) => sum + deposit, 0) - strongestDeposit;
            const lava = strongestDeposit + .12 * overlappingDeposits;
            // Broad bedrock variation changes the surviving ridge height along its axis.
            const rolling = noise(x * .006, z * .006) * 15 + noise(x * .015, z * .012) * 4;
            const edge = smooth(Math.min((config.width / 2 - Math.abs(x)) / 24,
                (config.depth / 2 - Math.abs(z)) / 24));
            heights.push(Math.fround(waterLevel - 7 + edge * (lava * 61 + rolling * smooth(lava))));
        }
    }
    const terrain = { columns, rows, spacing: 2, heights,
        bounds: { minX: -config.width / 2, maxX: config.width / 2,
            minZ: -config.depth / 2, maxZ: config.depth / 2 } } satisfies TerrainField;
    const valleys = islandDrainage(terrain, waterLevel, random);
    // Erosion lowers a common heightfield. No individual mountain or inlet shapes are added.
    for (let i = 0; i < heights.length; i++) {
        const x = terrain.bounds.minX + i % columns * 2;
        const z = terrain.bounds.minZ + Math.floor(i / columns) * 2;
        let height = heights[i];
        const resistance = (noise(x * .009 + 13, z * .009 - 5) + 1) / 2;
        const floorFraction = .42 + resistance * .2;
        for (const valley of valleys) {
            // Every segment contributes a continuous erosion envelope. Choosing
            // only the closest segment makes valley bends jump between floor heights.
            for (let j = 1; j < valley.points.length; j++) {
                const sample = segmentSample(x, z, valley.points[j - 1], valley.points[j]);
                const width = valley.widths[j - 1] + sample.t *
                    (valley.widths[j] - valley.widths[j - 1]);
                const asymmetricWidth = width * (sample.side < 0 ?
                    .8 + resistance * .3 : 1.15 - resistance * .2);
                if (sample.distance >= asymmetricWidth) continue;
                const floor = valley.floorHeights[j - 1] + sample.t *
                    (valley.floorHeights[j] - valley.floorHeights[j - 1]);
                const crossSection = smooth((sample.distance / asymmetricWidth - floorFraction) /
                    (1 - floorFraction));
                height = Math.min(height, floor + Math.max(0, heights[i] - floor) * crossSection);
            }
        }
        // Unequal coastal weathering/deposition: a broad spatial field changes
        // the strength and vertical reach of lowland shaping. It never reads sites.
        const elevation = height - waterLevel;
        const erodedBasin = smooth((heights[i] - height) / 12);
        const exposure = smooth((noise(x * .006 - 19, z * .006 + 23) + .08) / .55) *
            (1 - .85 * erodedBasin);
        const coastalScale = .04 + .2 * exposure;
        const shelfHeight = 14 + 10 * (1 - exposure);
        const transition = 26 + 18 * exposure;
        // Depositional benches rise gently above the immediate shore. Their
        // elevation varies with the same broad field, rather than compressing
        // every coast into a near-sea-level apron.
        const bench = (2.5 + 2 * (1 - exposure)) * smooth(elevation / 16);
        const lowland = elevation <= 0 ? elevation : bench + elevation *
            (coastalScale + (1 - coastalScale) * smooth((elevation - shelfHeight) / transition));
        heights[i] = Math.fround(waterLevel + (lowland > 6.2 ?
            6.2 + (lowland - 6.2) * config.relief : lowland));
    }
    // Short-range slope weathering removes drainage-cell scallops and abrupt
    // seams between erosion envelopes. The 2m field and sea border are retained.
    for (let pass = 0; pass < 8; pass++) {
        const previous = [...heights];
        for (let row = 1; row < rows - 1; row++) {
            for (let col = 1; col < columns - 1; col++) {
                const i = row * columns + col;
                heights[i] = Math.fround((4 * previous[i] +
                    2 * (previous[i - 1] + previous[i + 1] + previous[i - columns] + previous[i + columns]) +
                    previous[i - columns - 1] + previous[i - columns + 1] +
                    previous[i + columns - 1] + previous[i + columns + 1]) / 16);
            }
        }
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
    if (config.generatorVersion === gentlerIslandGeneratorVersion ||
        config.generatorVersion === gentlerSettlementGeneratorVersion ||
        config.generatorVersion === discoverySettlementGeneratorVersion) {
        softenHighlands(terrain, waterLevel, noise);
    }
    const geology: IslandGeology = { model: 'rift-glacial-v1', rifts, valleys };
    return { heights, geology };
}

/** Lower the existing eroded ridges; never change the coast or add mountain shapes. */
function softenHighlands(terrain: TerrainField & { heights: number[] }, waterLevel: number,
    noise: (x: number, z: number) => number) {
    const { heights } = terrain;
    const lowlandLimit = waterLevel + 6.2;
    const shoulderHeight = 12;
    for (let i = 0; i < heights.length; i++) {
        const excess = heights[i] - lowlandLimit;
        if (excess <= 0) continue;
        const x = terrain.bounds.minX + i % terrain.columns * terrain.spacing;
        const z = terrain.bounds.minZ + Math.floor(i / terrain.columns) * terrain.spacing;
        // Reuse the bedrock noise stream. Broad variation leaves unequal surviving
        // crests along a ridge; there are no additional peaks or stored fields.
        const retained = .4 + .18 * (noise(x * .004 + 17, z * .004 - 11) + 1) / 2;
        const t = Math.min(1, excess / shoulderHeight);
        // Integral of 1 - smoothstep: slope starts at 1 at the lowland edge and
        // falls continuously to retained. No clipped plateau or hard elevation seam.
        const shoulder = shoulderHeight * (t - t ** 3 + t ** 4 / 2);
        heights[i] = Math.fround(lowlandLimit + retained * excess + (1 - retained) * shoulder);
    }
}
