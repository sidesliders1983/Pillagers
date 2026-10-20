import { load } from '../load-source.mjs';
const { freezeBlueprint } = load('../src/world-generation/WorldBlueprint.ts');
export function worldFixture(seed = 213) {
    const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
    const heights = [], cells = [], biomes = [], moisture = [], forest = [], rock = [];
    for (let z = -400; z <= 400; z += 4)
        for (let x = -400; x <= 400; x += 4) {
            const height = x < -92 ? -3 : (x + 80) * .25;
            heights.push(height);
            cells.push(height > .2);
            biomes.push(height < 0 ? 'water' : x < -60 ? 'shore' : x < 70 ? 'forest' : 'rock');
            moisture.push(.8);
            forest.push(x > -60 && x < 70 ? .7 : 0);
            rock.push(x > 70 || x < -60 ? .6 : .1);
        }
    const terrain = { bounds, spacing: 4, columns: 201, rows: 201, heights };
    return freezeBlueprint({
        config: { seed, width: 800, depth: 800 }, waterLevel: 0, terrain,
        navigation: { ...terrain, heights: undefined, cells },
        coast: [{ a: { x: -80, z: -400 }, b: { x: -80, z: 400 } }],
        settlement: { center: { x: -40, z: 0 }, harbor: { x: -80, z: 0 }, buildings: [], accessPaths: [], bounds },
        biomes: { cells: biomes, moisture, waterDistance: heights.map(h => Math.abs(h) * 4), worn: heights.map(() => 0), coverage: {} },
        environment: { spacing: 4, columns: 201, rows: 201, fields: { forestCover: forest, moisture, rockExposure: rock } },
        placementPlan: [],
    });
}
