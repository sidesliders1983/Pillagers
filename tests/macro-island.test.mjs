import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');

function dryComponents(world) {
    const { heights, columns, rows } = world.terrain;
    const remaining = new Set(heights.flatMap((height, i) => height > world.waterLevel ? [i] : []));
    const sizes = [];
    while (remaining.size) {
        const first = remaining.values().next().value;
        const queue = [first];
        remaining.delete(first);
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor], col = cell % columns, row = Math.floor(cell / columns);
            for (const next of [col > 0 ? cell - 1 : -1, col < columns - 1 ? cell + 1 : -1,
                row > 0 ? cell - columns : -1, row < rows - 1 ? cell + columns : -1]) {
                if (remaining.delete(next)) queue.push(next);
            }
        }
        sizes.push(queue.length);
    }
    return sizes;
}

function convexCoastArea(world) {
    const points = world.coast.flatMap(({ a, b }) => [a, b]).sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const half = ordered => {
        const hull = [];
        for (const point of ordered) {
            while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
            hull.push(point);
        }
        return hull.slice(0, -1);
    };
    const hull = [...half(points), ...half([...points].reverse())];
    return Math.abs(hull.reduce((sum, point, i) => {
        const next = hull[(i + 1) % hull.length];
        return sum + point.x * next.z - next.x * point.z;
    }, 0)) / 2;
}

test('macro proposals leave final house placement to site selection', () => {
    const world = generateWorld({ seed: 17, preset: 'island' });
    assert.equal(world.settlement.buildings.length, 0);
    assert.equal(world.settlement.accessPaths.length, 1);
});

test('the island records a downhill drainage network with connected tributaries and variable main valleys', () => {
    const counts = new Set();
    for (const seed of [17, 91, 1983]) {
        const world = generateWorld({ seed, preset: 'island' });
        const geology = world.geology;
        assert.equal(geology?.model, 'rift-glacial-v1');
        const main = geology.valleys.filter(valley => valley.parentId === null);
        counts.add(main.length);
        assert.ok(main.length >= 2 && main.length <= 4);
        assert.ok(geology.valleys.some(valley => valley.parentId !== null));
        for (const valley of geology.valleys) {
            assert.ok(valley.points.length > 2);
            assert.equal(valley.floorHeights.length, valley.points.length);
            for (let i = 1; i < valley.floorHeights.length; i++) {
                assert.ok(valley.floorHeights[i] <= valley.floorHeights[i - 1]);
            }
            if (valley.parentId !== null) {
                const parent = geology.valleys.find(other => other.id === valley.parentId);
                assert.ok(parent.points.some(point => point.x === valley.points.at(-1).x &&
                    point.z === valley.points.at(-1).z));
            }
        }
        assert.ok(world.terrain.heights.filter(height => height === Math.fround(2.6)).length < 10,
            'no fixed rectangular reference-settlement height platform');
    }
    assert.ok(counts.size > 1, 'the number of main valleys varies between seeds');
});

test('island coast has substantial inlets and its high ground belongs to an extensive interior ridge', () => {
    const { createMacroQueries } = load('../src/world-generation/MacroIsland.ts');
    for (const seed of [17, 91, 1983, 42, 18, 104, 211, 512, 819, 1337]) {
        const world = generateWorld({ seed, preset: 'island' });
        const dryArea = world.terrain.heights.filter(height => height > world.waterLevel).length * 4;
        assert.ok(dryArea / convexCoastArea(world) < .85, `seed ${seed}: pronounced inlets, not an oval outline`);
        const { heights, columns, bounds, spacing } = world.terrain;
        const highest = heights.indexOf(heights.reduce((maximum, height) => Math.max(maximum, height), -Infinity));
        const peak = { x: bounds.minX + (highest % columns) * spacing,
            z: bounds.minZ + Math.floor(highest / columns) * spacing };
        assert.ok(Math.hypot(peak.x, peak.z) < world.config.width * .3, `seed ${seed}: highest relief is in the interior`);
        // Glacial fjord walls can approach a high ridge. Measure retained highland extent,
        // not an arbitrary coast buffer that would forbid the requested Icelandic landform.
        const highland = new Set([highest]), queue = [highest];
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const i = queue[cursor], col = i % columns, row = Math.floor(i / columns);
            for (const next of [col > 0 ? i-1 : -1, col < columns-1 ? i+1 : -1,
                row > 0 ? i-columns : -1, row < world.terrain.rows-1 ? i+columns : -1]) {
                if (next < 0 || highland.has(next) || heights[next] <= world.waterLevel+16) continue;
                highland.add(next);
                queue.push(next);
            }
        }
        assert.ok(highland.size * 4 >= 2500, `seed ${seed}: retained ridge, not an isolated small peak`);
    }
});

test('the explicit island version produces one landmass inside a complete sea border', () => {
    const world = generateWorld({ seed: 17, preset: 'island' });
    assert.equal(world.config.generatorVersion, 'fjordside-island-v0.3b');
    assert.equal(world.config.width, 800);
    assert.equal(world.config.depth, 800);
    assert.ok(dryComponents(world)[0] * 4 > 50_000, 'room for two full settlements and intervening landscape');
    const { heights, columns, rows } = world.terrain;
    assert.equal(dryComponents(world).length, 1, 'no detached ghost land or disconnected headlands');
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
        if (row < 3 || col < 3 || row >= rows - 3 || col >= columns - 3) {
            assert.ok(heights[row * columns + col] < world.waterLevel - .1, 'sea surrounds every edge');
        }
    }
    assert.ok(heights.reduce((maximum, height) => Math.max(maximum, height), -Infinity) > world.waterLevel + 18, 'readable highland relief');
    assert.ok(world.coast.length > 100, 'complete physical coastline');
});

test('ten requested seeds expose distinct macro regions and separated dry site candidates', () => {
    const { createMacroQueries, inspectMacroIsland } = load('../src/world-generation/MacroIsland.ts');
    const signatures = new Set();
    for (const seed of [17, 91, 1983, 42, 18, 104, 211, 512, 819, 1337]) {
        const world = generateWorld({ seed, preset: 'island' });
        const inspect = inspectMacroIsland(world);
        assert.equal(world.config.seed, seed);
        assert.equal(inspect.accepted, true, JSON.stringify({ seed, reasons: inspect.reasons }));
        assert.equal(dryComponents(world).length, 1);
        assert.ok(inspect.regions.lowland > 100 && inspect.regions.highland > 20);
        assert.equal(inspect.sitePair.length, 2);
        const [first, second] = inspect.sitePair;
        assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= 120);
        const queries = createMacroQueries(world);
        const separation = inspect.terrainSeparation;
        assert.equal(separation?.kind, 'ridgeline', 'distance alone does not separate two settlement regions');
        assert.ok(separation.width >= 12 && separation.heightAboveSites >= 8,
            'a broad elevated terrain barrier separates the two natural pockets');
        assert.ok(separation.connection.length > 2, 'a measured safe terrain connection remains');
        const crest = queries.sample(separation.crest.x, separation.crest.z);
        assert.ok(crest.height >= Math.max(queries.sample(first.x, first.z).height,
            queries.sample(second.x, second.z).height) + 8);
        for (let i = 0; i < separation.connection.length; i++) {
            const point = separation.connection[i];
            const physical = queries.sample(point.x, point.z);
            assert.ok(physical.height >= world.waterLevel + .2 && physical.slope <= .55);
            if (i) {
                const previous = separation.connection[i - 1];
                assert.equal(Math.hypot(point.x - previous.x, point.z - previous.z), 2);
                const middle = queries.sample((point.x + previous.x) / 2, (point.z + previous.z) / 2);
                assert.ok(middle.height >= world.waterLevel + .2 && middle.slope <= .55);
            }
        }
        for (const site of inspect.sitePair) {
            assert.ok(site.area >= 3000, 'natural usable lowland area, without a rectangular platform');
            assert.equal(site.area, site.cells.length * 4);
            assert.ok(site.shoreDistance <= 65, 'plausible coast access at both candidate sites');
            for (const point of site.cells) {
                const sample = queries.sample(point.x, point.z);
                assert.ok(sample.height >= world.waterLevel + .25);
                assert.ok(sample.slope <= .12);
                assert.equal(sample.waterDepth, 0);
            }
        }
        signatures.add(JSON.stringify(world.coast));
        assert.deepEqual(inspectMacroIsland(generateWorld({ seed, preset: 'island' })), inspect);
    }
    assert.equal(signatures.size, 10);
});

test('distance and scenery cannot qualify a flat island as separate settlement compartments', () => {
    const { inspectMacroIsland } = load('../src/world-generation/MacroIsland.ts');
    const flat = structuredClone(generateWorld({ seed: 17, preset: 'island' }));
    // A stored-world proposal with the same coast and scenery but no interior relief.
    flat.terrain.heights = flat.terrain.heights.map(height => Math.min(height, flat.waterLevel + 3));
    const inspected = inspectMacroIsland(flat);
    assert.ok(inspected.candidates.some(first => inspected.candidates.some(second =>
        Math.hypot(first.x - second.x, first.z - second.z) >= 120)));
    assert.equal(inspected.terrainSeparation, null);
    assert.equal(inspected.sitePair.length, 0);
    assert.ok(inspected.reasons.some(reason => reason.includes('terrain barrier')));
});

test('regular radial peninsulas are rejected even with terrain relief', () => {
    const { inspectMacroIsland } = load('../src/world-generation/MacroIsland.ts');
    const { extractCoast } = load('../src/world-generation/PlanSettlement.ts');
    const world = structuredClone(generateWorld({ seed: 17, preset: 'island' }));
    const { terrain } = world;
    terrain.heights = terrain.heights.map((_, i) => {
        const x = terrain.bounds.minX + i % terrain.columns * 2;
        const z = terrain.bounds.minZ + Math.floor(i / terrain.columns) * 2;
        const radius = 160 + 60 * Math.cos(Math.atan2(z,x) * 5);
        return Math.hypot(x,z) < radius ? 22 : -7;
    });
    world.coast = extractCoast(world);
    const inspection = inspectMacroIsland(world);
    assert.ok(inspection.reasons.some(reason => reason.includes('radial symmetry')));
});

test('old seeds and stored geography stay unchanged; island saves explicitly retain their version', async () => {
    const { createHash } = await import('node:crypto');
    const { serializeWorld, parseWorld } = load('../src/world-generation/WorldSave.ts');
    const { changeWorldConifers } = load('../src/world-generation/GenerateWorld.ts');
    const originalHashes = {
        fjord: 'bf769ce150758f20dfc03c365996fe12558edf8066d4d29f4864a577843524bd',
        'coastal-valley': '1e4cb7cc7805484d50b382b1f562a9f9cd09883a6318f5a3360b3704a2200f55',
        'rocky-inlet': '82771a2b21e5c7a8f0fc86e744ac9432c50832e08e9b19fa1936193d625438d6'
    };
    for (const [preset, hash] of Object.entries(originalHashes)) {
        const old = generateWorld({ seed: 17, preset });
        assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'), hash);
        assert.deepEqual(parseWorld(serializeWorld(old)), old);
    }
    const island = generateWorld({ seed: 17, preset: 'island' });
    assert.deepEqual(parseWorld(serializeWorld(island)), island);
    assert.deepEqual(generateWorld(island.config), island);
    assert.deepEqual(changeWorldConifers(island, 'ez-tree').terrain, island.terrain);
    const wrongVersion = JSON.parse(serializeWorld(island));
    wrongVersion.blueprint.config.generatorVersion = 'fjordside-v0.1';
    assert.throws(() => parseWorld(JSON.stringify(wrongVersion)), /Unsupported generator version/);
});

test('island imports validate the stored drainage evidence without regenerating geography', () => {
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld({ seed: 17, preset: 'island' });
    const saved = JSON.parse(serializeWorld(world));
    saved.blueprint.geology.valleys[0].points[0].x = 9000;
    assert.throws(() => parseWorld(JSON.stringify(saved)), /Invalid world blueprint/);
    delete saved.blueprint.geology;
    assert.throws(() => parseWorld(JSON.stringify(saved)), /Invalid world blueprint/);
});

test('candidate footprints have a traversable terrain corridor to the actual coastline', () => {
    const { createMacroQueries, inspectMacroIsland } = load('../src/world-generation/MacroIsland.ts');
    const world = generateWorld({ seed: 17, preset: 'island' });
    const queries = createMacroQueries(world);
    for (const site of inspectMacroIsland(world).sitePair) {
        assert.ok(site.approach?.length > 2, 'coast access is measured, not inferred from distance');
        for (let i = 0; i < site.approach.length; i++) {
            const point = site.approach[i];
            const sample = queries.sample(point.x, point.z);
            assert.ok(sample.height >= world.waterLevel + .2 && sample.slope <= .55);
            if (i) {
                const previous = site.approach[i - 1];
                assert.equal(Math.hypot(point.x - previous.x, point.z - previous.z), 2);
                const midpoint = queries.sample((point.x + previous.x) / 2, (point.z + previous.z) / 2);
                assert.ok(midpoint.height >= world.waterLevel + .2 && midpoint.slope <= .55);
            }
        }
        const last = site.approach.at(-1);
        assert.ok(queries.sample(last.x, last.z).shoreDistance <= 2);
    }
});

test('unsuitable requested island configurations return named rejection reasons without reseeding', () => {
    const world = generateWorld({ seed: 73, preset: 'island', relief: 1.5 });
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    assert.deepEqual(parseWorld(serializeWorld(world)), world, 'a rejected high-relief proposal remains inspectable after import');
    assert.equal(world.config.seed, 73);
    assert.equal(world.config.relief, 1.5);
    assert.equal(world.validation.accepted, false);
    assert.ok(world.validation.reasons.some(reason => reason.includes('connected island')));
    assert.deepEqual(world, generateWorld(world.config));
});

test('island coast and query samples lie on the same rendered triangles, including shore crossings', async () => {
    const { createMacroQueries } = load('../src/world-generation/MacroIsland.ts');
    const { createBlueprintTerrain } = load('../src/world/BlueprintTerrain.ts');
    const { Raycaster, Vector3 } = await import('three');
    const world = generateWorld({ seed: 17, preset: 'island' });
    const query = createMacroQueries(world);
    const mesh = createBlueprintTerrain(world);
    mesh.updateMatrixWorld(true);
    for (const point of world.coast.flatMap(segment => [segment.a, segment.b])) {
        assert.ok(Math.abs(query.sample(point.x, point.z).height - world.waterLevel) < 1e-6);
    }
    for (const [x, z] of [[0.7, -32.4], [43.2, 36.7], [-69.4, -16.1], [84.2, 73.1], [550, 0]]) {
        const hit = new Raycaster(new Vector3(x, 100, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
        assert.ok(hit);
        assert.ok(Math.abs(hit.point.y - query.sample(x, z).height) < 1e-5);
    }
    mesh.geometry.dispose();
    mesh.material.dispose();
});
