import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './load-source.mjs';

function ridgeWorld() {
    const columns = 17;
    return {
        waterLevel: -1,
        terrain: {
            bounds: { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
            spacing: 2, columns, rows: columns,
            heights: Array.from({ length: columns * columns }, (_, i) =>
                i % columns === 8 ? 12 : 0),
        },
    };
}

test('starting sightlines distinguish terrain-hidden, exposed and elevated views of a rival site', () => {
    const { traceTerrainSightline } = load('../src/world-generation/SettlementVisibility.ts');
    const world = ridgeWorld();
    const target = { x: 12, y: 8, z: 0 };
    const hidden = traceTerrainSightline(world, { x: -12, y: 1.7, z: 0 }, target);
    assert.equal(hidden.visible, false);
    assert.ok(hidden.blocker.x > -2 && hidden.blocker.x < 2);
    assert.equal(traceTerrainSightline(world, { x: -12, y: 30, z: 0 }, target).visible, true);
    const flat = structuredClone(world);
    flat.terrain.heights.fill(0);
    assert.equal(traceTerrainSightline(flat, { x: -12, y: 1.7, z: 0 }, target).visible, true);
});

test('a hidden centre cannot hide an exposed edge of the reserved footprint', () => {
    const { inspectSiteVisibility } = load('../src/world-generation/SettlementVisibility.ts');
    const world = ridgeWorld();
    world.terrain.heights = world.terrain.heights.map((height, i) =>
        Math.abs(Math.floor(i / 17) - 8) <= 1 ? height : 0);
    const views = [{ id: 'landing-eye', x: -12, y: 1.7, z: 0 }];
    const result = inspectSiteVisibility(world, views, [{ x: 12, z: 0 }, { x: 12, z: 12 }], 8);
    assert.equal(result.hidden, false);
    assert.equal(result.exposedRays, 1);
    assert.equal(result.rays.length, 2);
    assert.equal(result.rays[0].visible, false);
    assert.equal(result.rays[1].visible, true);
    assert.equal(result.rays[1].viewpointId, 'landing-eye');
});

test('an explicit placement version reserves buildable player and hidden rival sites without spawning a clan', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    assert.equal(world.validation.accepted, true, world.validation.reasons.join('; '));
    assert.equal(world.siteSelection.version, 1);
    assert.equal(world.rivalSite.version, 1);
    assert.equal(world.settlement.buildings.length, 6);
    assert.equal(world.rivalSite.foundations.length, 6);
    assert.equal(world.rivalSite.buildings, undefined, 'rival footprints are spatial proof, not a spawned village');
    assert.ok(world.siteSelection.selected.centerDistance >= 160);
    assert.ok(world.siteSelection.selected.bufferDistance >= 40);
    assert.ok(world.siteSelection.selected.routeLength >= 240);
    assert.ok(world.siteSelection.visibility.rays.length > 0);
    assert.equal(world.siteSelection.visibility.exposedRays, 0);
    assert.ok(world.siteSelection.candidates.length > 2);
    assert.ok(world.siteSelection.pairs.some(pair => pair.reasons.length > 0));
    assert.equal(world.personas, undefined);
});

test('reserved foundations and the route to the rival remain clear in the final scenery-aware grid', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { buildingDistance } = load('../src/world/SettlementLayout.ts');
    const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    const nav = world.navigation;
    for (const point of world.siteSelection.connection) {
        const index = Math.round(point.z - nav.bounds.minZ) * nav.columns + Math.round(point.x - nav.bounds.minX);
        assert.equal(nav.cells[index], true, `connection obstructed at ${point.x},${point.z}`);
    }
    for (const asset of world.placementPlan) {
        for (const foundation of world.rivalSite.foundations) {
            assert.ok(buildingDistance(asset.x, asset.z, foundation) >= asset.clearance,
                'the rival reservation cannot contain a conflicting natural asset');
        }
    }
});

test('placement saves retain reservations and bounded local grading without reshaping old worlds', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const old = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3b-r2' });
    const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    assert.deepEqual(generateWorld(world.config), world);
    assert.deepEqual(parseWorld(serializeWorld(old)), old);
    assert.equal(old.rivalSite, undefined);
    const surface = createBlueprintSurface(world);
    let changed = 0;
    world.terrain.heights.forEach((height, i) => {
        const difference = Math.abs(height - old.terrain.heights[i]);
        assert.ok(difference <= .600001, 'grading stays within the approved 0.6m limit');
        if (difference > 1e-6) changed++;
    });
    assert.ok(changed > 0 && changed < 2500, 'individual foundations, not a settlement-wide platform');
    for (const building of world.settlement.buildings) {
        for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
            const dx = u * building.halfWidth, dz = v * building.halfDepth;
            const x = building.x + dx * Math.cos(building.rotation) + dz * Math.sin(building.rotation);
            const z = building.z - dx * Math.sin(building.rotation) + dz * Math.cos(building.rotation);
            assert.ok(Math.abs(surface.surfaceHeightAt(x, z) - building.elevation) < 1e-5);
        }
    }
    const wrongCompartment = JSON.parse(serializeWorld(world));
    wrongCompartment.blueprint.siteSelection.candidates[0].compartmentId = 'missing-compartment';
    assert.throws(() => parseWorld(JSON.stringify(wrongCompartment)), /Invalid world blueprint/);
    const impossibleSearch = JSON.parse(serializeWorld(world));
    impossibleSearch.blueprint.siteSelection.candidates[0].fitSearch.maximumPlaced = 7;
    assert.throws(() => parseWorld(JSON.stringify(impossibleSearch)), /Invalid world blueprint/);
    const corrupted = JSON.parse(serializeWorld(world));
    corrupted.blueprint.rivalSite.center = structuredClone(world.settlement.center);
    assert.throws(() => parseWorld(JSON.stringify(corrupted)), /Invalid world blueprint/);
});

test('changing conifer assets preserves reservations, graded terrain and house obstacles', () => {
    const { generateWorld, changeWorldConifers } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    const changed = changeWorldConifers(world, 'ez-tree');
    assert.deepEqual(changed.siteSelection, world.siteSelection);
    assert.deepEqual(changed.rivalSite, world.rivalSite);
    assert.deepEqual(changed.terrain, world.terrain);
    assert.equal(changed.validation.accepted, true, changed.validation.reasons.join('; '));
    for (const b of [...changed.settlement.buildings, ...changed.rivalSite.foundations]) {
        const nav = changed.navigation;
        const index = Math.round(b.z - nav.bounds.minZ) * nav.columns + Math.round(b.x - nav.bounds.minX);
        assert.equal(nav.cells[index], false, 'reserved foundations remain obstacles');
    }
    assert.deepEqual(parseWorld(serializeWorld(changed)), changed);
});

test('the selected coastal landing includes measured water clearance for the authored longship', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    const berth = world.siteSelection.harborBerth;
    assert.ok(berth, 'a dry coastal approach alone is not a usable longship berth');
    assert.ok(berth.halfLength * 2 >= 14.47);
    assert.ok(berth.halfBeam * 2 >= 3.48);
    const surface = createBlueprintSurface(world);
    for (let u = -berth.halfBeam; u <= berth.halfBeam; u += .5) {
        for (let v = -berth.halfLength; v <= berth.halfLength; v += .5) {
            const x = berth.center.x + u * Math.cos(berth.rotation) + v * Math.sin(berth.rotation);
            const z = berth.center.z - u * Math.sin(berth.rotation) + v * Math.cos(berth.rotation);
            assert.ok(world.waterLevel - surface.surfaceHeightAt(x, z) >= .5);
        }
    }
});

test('impossible placement rules reject transparently without reseeding or inventing a rival', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const request = { seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e',
        siteRules: { minimumCenterDistance: 1000 } };
    const world = generateWorld(request);
    assert.equal(world.config.seed, 18);
    assert.equal(world.validation.accepted, false);
    assert.equal(world.rivalSite, undefined);
    assert.equal(world.siteSelection.selected, null);
    assert.ok(world.siteSelection.pairs.every(pair => pair.reasons.includes('Centers are too close.')));
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    assert.deepEqual(generateWorld(world.config), world);
});

test('submerged terrain cannot acquire a rival reservation or artificial settlement platform', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { planIslandSettlements } = load('../src/world-generation/PlanIslandSettlements.ts');
    const source = structuredClone(generateWorld({ seed: 18, preset: 'island' }));
    source.terrain.heights.fill(source.waterLevel - 1);
    const result = planIslandSettlements(source);
    assert.equal(result.validation.accepted, false);
    assert.equal(result.siteSelection.candidates.length, 0);
    assert.equal(result.rivalSite, undefined);
    assert.deepEqual(result.terrain, source.terrain);
});

test('an exposed low island is rejected for visibility even when distance limits are permissive', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { planIslandSettlements } = load('../src/world-generation/PlanIslandSettlements.ts');
    const source = structuredClone(generateWorld({ seed: 18, preset: 'island' }));
    source.config.siteRules = { minimumCenterDistance: 0, minimumBufferDistance: 0,
        minimumLandingRoute: 0, maximumFoundationAdjustment: .6, rivalRoofHeight: 8,
        maximumCandidates: 4 };
    source.terrain.heights = source.terrain.heights.map(height => Math.min(height, 3));
    const result = planIslandSettlements(source);
    assert.equal(result.validation.accepted, false);
    assert.equal(result.rivalSite, undefined);
    const exposed = result.siteSelection.pairs.filter(pair => pair.exposedRays > 0);
    assert.ok(exposed.length > 0, 'at least one viable pair reaches the visibility check');
    for (const pair of exposed) {
        assert.ok(pair.reasons.some(reason => reason.includes('visible')));
        assert.ok(pair.score < 0, 'exposure is penalized independently of distance');
    }
});

test('placement search represents distinct natural compartments before spending its candidate budget', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const world = generateWorld({ seed: 42, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    const selection = world.siteSelection;
    assert.ok(selection.compartments?.length >= 2, 'separate terrain pockets need separate coverage');
    for (const compartment of selection.compartments) {
        assert.ok(compartment.area > 0);
        assert.ok(compartment.eligibleAnchors >= compartment.candidateIds.length);
        assert.ok(compartment.candidateIds.length > 0 || compartment.reasons.length > 0);
        for (const id of compartment.candidateIds) {
            assert.equal(selection.candidates.find(c => c.id === id)?.compartmentId, compartment.id);
        }
    }
    const represented = new Set(selection.candidates.map(c => c.compartmentId));
    assert.ok(represented.size >= 2);
    assert.ok(selection.candidates.length <= selection.rules.maximumCandidates);
});

test('six-parcel search tries alternative orientations and layouts within the original footprint and grading limits', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { buildings } = load('../src/world/SettlementLayout.ts');
    const world = generateWorld({ seed: 17, preset: 'island', generatorVersion: 'fjordside-island-v0.3e' });
    const fit = world.siteSelection.candidates.find(c => c.foundations.length === 6);
    assert.ok(fit, 'the original single greedy layout missed viable natural space');
    assert.ok(fit.fitSearch.attempts > 0 && fit.fitSearch.attempts <= 12);
    assert.ok(fit.fitSearch.orientationCount > 1);
    assert.equal(fit.fitSearch.maximumPlaced, 6);
    for (const foundation of fit.foundations) {
        const source = buildings.find(b => b.key === foundation.key);
        assert.equal(foundation.halfWidth, source.halfWidth);
        assert.equal(foundation.halfDepth, source.halfDepth);
        assert.ok(foundation.adjustment <= .6);
        assert.ok(foundation.naturalSlope <= .12);
    }
});

test('a rejected visibility query can stop at its first exposed roof sample while accepted evidence stays complete', () => {
    const { inspectSiteVisibility } = load('../src/world-generation/SettlementVisibility.ts');
    const world = ridgeWorld();
    world.terrain.heights.fill(0);
    const viewpoints = [{ id: 'landing-eye', x: -12, y: 1.7, z: 0 }];
    const footprint = [{ x: 12, z: 0 }, { x: 12, z: 8 }];
    const rejected = inspectSiteVisibility(world, viewpoints, footprint, 8, true);
    assert.equal(rejected.hidden, false);
    assert.equal(rejected.rays.length, 1);
    assert.equal(inspectSiteVisibility(world, viewpoints, footprint, 8).rays.length, 2);
    const hidden = inspectSiteVisibility(ridgeWorld(), viewpoints, footprint, 8, true);
    assert.equal(hidden.hidden, true);
    assert.equal(hidden.rays.length, 2);
});
