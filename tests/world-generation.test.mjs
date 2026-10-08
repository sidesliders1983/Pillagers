import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');

test('a seed and generator version reproduce the landscape, while another seed changes its geography', () => {
    const first = generateWorld({ seed: 17, preset: 'fjord' });
    const repeated = generateWorld({ seed: 17, preset: 'fjord' });
    const other = generateWorld({ seed: 91, preset: 'fjord' });

    assert.equal(first.config.seed, 17);
    assert.equal(first.config.generatorVersion, 'fjordside-v0.1');
    assert.equal(JSON.stringify(first), JSON.stringify(repeated));
    assert.notDeepEqual(first.terrain.heights, other.terrain.heights);
    assert.ok(Object.isFrozen(first.terrain.heights));
});

test('ground snapping and water depth sample the actual generated terrain triangles', async () => {
    const { createBlueprintSurface, createBlueprintTerrain } = load('../src/world/BlueprintTerrain.ts');
    const { waterDepthAt } = load('../src/world/FjordWater.ts');
    const { Raycaster, Vector3 } = await import('three');
    const world = generateWorld({ seed: 17, preset: 'fjord' });
    const surface = createBlueprintSurface(world);
    const mesh = createBlueprintTerrain(world);
    mesh.updateMatrixWorld(true);
    for (const [x, z] of [[13.7, 18.4], [-48.5, 12.9], [37.2, 72.1], [-12.4, -25.3]]) {
        const hit = new Raycaster(new Vector3(x, 100, z), new Vector3(0, -1, 0))
            .intersectObject(mesh)[0];
        assert.ok(hit);
        assert.ok(Math.abs(surface.surfaceHeightAt(x, z) - hit.point.y) < 0.00001);
        assert.ok(Math.abs(waterDepthAt(x, z, world.waterLevel, surface.surfaceHeightAt) -
            (world.waterLevel - hit.point.y)) < 0.00001);
    }
    mesh.geometry.dispose();
    mesh.material.dispose();
});

test('each proof world reserves the authored settlement and connects every building to a dry coast approach', () => {
    const { createBlueprintSurface } = load('../src/world/BlueprintTerrain.ts');
    for (const seed of [17, 91]) {
        const world = generateWorld({ seed, preset: 'fjord' });
        assert.equal(world.validation.accepted, true, JSON.stringify(world.validation));
        assert.equal(world.settlement.buildings.length, 6);
        assert.equal(world.validation.connectedBuildings, 6);
        assert.ok(world.validation.connectedArea >= 1500);
        assert.ok(world.validation.maximumFoundationSlope <= .12);
        assert.ok(world.validation.minimumFoundationElevation >= .25);
        const surface = createBlueprintSurface(world);
        for (const route of world.settlement.accessPaths) {
            assert.ok(route.length >= 2);
            for (const p of route) {
                assert.ok(surface.surfaceHeightAt(p.x, p.z) >= world.waterLevel + .2);
                assert.ok(surface.slopeAt(p.x, p.z) <= .55);
            }
        }
        assert.ok(world.coast.length > 20, 'A bent fjord has a real shoreline contour');
    }
});

test('approved nature is planned in dry biomes and kept outside authored parcels and access paths', () => {
    const { createBlueprintSurface } = load('../src/world/BlueprintTerrain.ts');
    const { buildingDistance } = load('../src/world/SettlementLayout.ts');
    const { natureAssetIds } = load('../src/config/NatureAssets.ts');
    const world = generateWorld({ seed: 17, preset: 'fjord' });
    const surface = createBlueprintSurface(world);
    assert.ok(world.placementPlan.length > 150);
    for (const placement of world.placementPlan) {
        assert.ok(natureAssetIds.includes(placement.assetId));
        assert.ok(Math.abs(placement.y - surface.surfaceHeightAt(placement.x, placement.z)) < .00001);
        assert.ok(placement.y >= world.waterLevel + .15);
        assert.ok(world.settlement.buildings.every(b =>
            buildingDistance(placement.x, placement.z, b) >= placement.clearance));
        assert.ok(world.settlement.accessPaths.every(route => route.every(p =>
            Math.hypot(p.x-placement.x, p.z-placement.z) > placement.clearance + .65)));
    }
    assert.ok(world.biomes.coverage.forest > 0);
    assert.ok(world.biomes.coverage.rock > 0);
});

test('the final scenery-aware navigation reports the measured connected clearing', () => {
    const world = generateWorld({ seed: 17 });
    const nav = world.navigation;
    const index = p => Math.round(p.z-nav.bounds.minZ)*nav.columns + Math.round(p.x-nav.bounds.minX);
    const queue = [index(world.settlement.center)], visited = new Set(queue);
    for (let cursor=0; cursor<queue.length; cursor++) {
        const i=queue[cursor], col=i%nav.columns, row=Math.floor(i/nav.columns);
        for (const next of [col>0?i-1:-1, col<nav.columns-1?i+1:-1,
            row>0?i-nav.columns:-1, row<nav.rows-1?i+nav.columns:-1]) {
            if (next>=0 && nav.cells[next] && !visited.has(next)) { visited.add(next); queue.push(next); }
        }
    }
    const b=world.settlement.bounds;
    const measured=queue.filter(i => {
        const x=nav.bounds.minX+i%nav.columns, z=nav.bounds.minZ+Math.floor(i/nav.columns);
        return x>=b.minX && x<=b.maxX && z>=b.minZ && z<=b.maxZ;
    }).length;
    assert.equal(world.validation.connectedArea, measured);
    for (const route of world.settlement.accessPaths) for (const p of route) {
        assert.ok(nav.cells[index(p)] && visited.has(index(p)), 'Final roads remain reachable after props');
    }
});

test('saved blueprints retain their authoritative geometry and reject unknown versions or corrupt fields', () => {
    const { serializeWorld, parseWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld({ seed: 91, preset: 'rocky-inlet' });
    const saved = serializeWorld(world);
    assert.deepEqual(parseWorld(saved), world);
    assert.ok(Object.isFrozen(parseWorld(saved).placementPlan));
    const future = JSON.parse(saved);
    future.blueprint.config.generatorVersion = 'fjordside-v99';
    assert.throws(() => parseWorld(JSON.stringify(future)), /Unsupported generator version/);
    const corrupt = JSON.parse(saved);
    corrupt.blueprint.terrain.heights.pop();
    assert.throws(() => parseWorld(JSON.stringify(corrupt)), /Invalid world blueprint/);
});

test('ten fixed review seeds retain their identity and generate distinct, buildable geography', () => {
    const { reviewSeeds } = load('../src/world-generation/ReviewSeeds.ts');
    const signatures = new Set();
    for (const config of reviewSeeds) {
        const world = generateWorld(config);
        assert.equal(world.config.seed, config.seed);
        assert.equal(world.config.preset, config.preset);
        assert.equal(world.validation.accepted, true, JSON.stringify({ config, validation: world.validation }));
        assert.ok(world.biomes.coverage.water > 500 && world.biomes.coverage.rock > 50);
        signatures.add(JSON.stringify(world.terrain.heights));
    }
    assert.equal(signatures.size, 10);
});

test('steep coast slopes use the approved rock biome instead of a vertical sandy beach', () => {
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const world = generateWorld({ seed: 17 });
    const surface = createBlueprintSurface(world);
    let checked = 0;
    for (let row=1; row<world.terrain.rows-1; row++) for (let col=1; col<world.terrain.columns-1; col++) {
        const i=row*world.terrain.columns+col;
        const x=-90+col*2, z=-90+row*2;
        if (world.terrain.heights[i] > world.waterLevel && world.biomes.waterDistance[i] < 4 &&
            surface.slopeAt(x,z) > .48) {
            assert.equal(world.biomes.cells[i], 'rock');
            checked++;
        }
    }
    assert.ok(checked > 10);
});

test('nature clearance covers source geometry relative to its authored ground anchor', async () => {
    const { NodeIO, getBounds } = await import('@gltf-transform/core');
    const { readFile } = await import('node:fs/promises');
    const manifest = JSON.parse(await readFile('public/nature/kaykit-v1/manifest.json', 'utf8'));
    const world = generateWorld({ seed: 17 });
    const io = new NodeIO();
    for (const [id, entry] of Object.entries(manifest.assets)) {
        const doc = await io.read('public/nature/kaykit-v1/' + entry.file);
        const { min, max } = getBounds(doc.getRoot().listScenes()[0]);
        const radius = Math.hypot(Math.max(Math.abs(min[0]),Math.abs(max[0])),
            Math.max(Math.abs(min[2]),Math.abs(max[2])));
        for(const placement of world.placementPlan.filter(p => p.assetId===id)) {
            assert.ok(placement.clearance >= radius*placement.scale+.24999, id+' must include off-centre source bounds');
        }
    }
});
