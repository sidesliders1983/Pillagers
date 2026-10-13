import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './load-source.mjs';

function fixture(heights = [1, 3, 1, 1, 5, 1, 1, 1, 1]) {
    const bounds = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
    const field = value => Array(4).fill(value);
    return {
        config: { seed: 7 }, waterLevel: 0,
        terrain: { bounds, spacing: 2, columns: 3, rows: 3, heights },
        navigation: { bounds, spacing: 1, columns: 5, rows: 5, cells: Array(25).fill(true) },
        settlement: { center: { x: 2, z: 2 }, bounds, buildings: [], accessPaths: [], harbor: null },
        placementPlan: [],
        biomes: { cells: Array(9).fill('grass') },
        environment: { version: 1, spacing: 4, columns: 2, rows: 2,
            primary: field('grass'), regionIds: field(0), fields: {
                grass: field(.6), sand: field(.1), mud: field(.1), rockExposure: field(.2),
                slope: field(.3), aspect: field(2), moisture: field(.7), shelter: field(.8),
                forestCover: field(.4), snowRetentionPotential: field(0),
            } },
    };
}

test('spatial queries reuse navigation cells and zoning but measure the rendered terrain triangle', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture(), before = JSON.stringify(world);
    const query = createWorldSpatialQueries(world);
    const point = query.sample(.5, .5);
    assert.equal(point.cell.id, 'spatial-v1:1:1');
    assert.equal(point.cell.index, 6);
    assert.deepEqual(point.cell.bounds, { minX: .5, maxX: 1.5, minZ: .5, maxZ: 1.5 });
    assert.equal(point.surface.height, 1.5);
    assert.equal(point.surface.slope, 1);
    assert.equal(point.surface.slopeDegrees, 45);
    assert.equal(point.surface.aspectDegrees, 270);
    assert.equal(point.zone.primary, 'grass');
    assert.equal(point.zone.forestCover, .4);
    assert.equal(point.zone.rockExposure, .2);
    assert.equal(point.zone.snowRetentionPotential, 0);
    assert.equal(query.cell(6).surface.height, 2);
    assert.equal(query.sample(-.01, 0), null);
    assert.equal(query.cell(-1), null);
    assert.equal(query.cell(25), null);
    assert.throws(() => query.sample(NaN, 0), /finite/);
    assert.equal(query.sample(4, 4).cell.index, 24);
    assert.deepEqual(query.sample(4, 4).cell.bounds,
        { minX: 3.5, maxX: 4, minZ: 3.5, maxZ: 4 });
    assert.equal(JSON.stringify(world), before, 'querying never extends or changes a saved world');
    assert.equal(createWorldSpatialQueries(fixture(Array(9).fill(1))).sample(1, 1).surface.aspectDegrees, null);
});

test('buildability explains terrain and reservations independently of walkability and substrate', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture(Array(9).fill(1));
    world.settlement.bounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    world.settlement.buildings = [{ id: 'home', x: 1, z: 1, halfWidth: .2, halfDepth: .2, rotation: Math.PI / 4 }];
    world.settlement.accessPaths = [[{ x: 0, z: 3 }, { x: 2, z: 3 }]];
    world.rivalSite = { bounds: { minX: 3, maxX: 4, minZ: 0, maxZ: 1 }, foundations: [] };
    world.siteSelection = { buffers: [{ minX: 0, maxX: 1.5, minZ: 0, maxZ: 1.5 }],
        connection: [], harborBerth: null };
    const query = createWorldSpatialQueries(world);
    const home = query.sample(1, 1);
    assert.equal(home.buildability.terrainSuitable, true);
    assert.equal(home.buildability.available, false);
    assert.ok(home.buildability.reasons.includes('player-foundation'));
    assert.ok(query.sample(1.4, 1.4).buildability.reasons.includes('neutral-buffer'));
    assert.ok(query.sample(3.5, .5).buildability.reasons.includes('rival-site'));
    const path = query.sample(1.5, 3);
    assert.equal(path.movement.traversable, true);
    assert.equal(path.buildability.available, false);
    assert.ok(path.buildability.reasons.includes('access-path'));
    world.environment.primary.fill('bedrock');
    world.environment.fields.snowRetentionPotential.fill(1);
    const open = createWorldSpatialQueries(world).sample(2.8, 1.8);
    assert.equal(open.zone.primary, 'bedrock');
    assert.equal(open.movement.traversable, true, 'rock and snow metadata cannot forbid movement');
    assert.equal(open.buildability.available, true);
    world.navigation.cells[13] = false;
    assert.equal(createWorldSpatialQueries(world).sample(2.8, 1.8).movement.traversable, false);
});

test('spatial queries preserve old and zoned saves, resident steering and final route validation', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const { blueprintMovement } = load('../src/world/BlueprintMovement.ts');
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    for (const environment of [undefined, { version: 1 }]) {
        const world = generateWorld({ seed: 17, environment });
        const before = serializeWorld(world);
        const query = createWorldSpatialQueries(world);
        const restored = createWorldSpatialQueries(parseWorld(before));
        const movement = blueprintMovement(world);
        assert.equal(query.storage.serializedBytes, 0);
        assert.ok(query.storage.references < world.navigation.cells.length);
        assert.deepEqual(query.navigationReport(), restored.navigationReport());
        assert.equal(query.navigationReport().accepted, world.validation.accepted);
        for (let i = 0; i < world.navigation.cells.length; i += 137) {
            const cell = query.cell(i);
            assert.deepEqual(cell, restored.cell(i));
            assert.equal(cell.movement.traversable, movement.walkable(cell.position.x, cell.position.z));
            if (!environment) assert.equal(cell.zone, null, 'old worlds are never silently zoned');
        }
        assert.equal(serializeWorld(world), before);
    }
});

test('shoreline ties and coarse zone edges do not override the physical surface', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture([-.1, .3, .7, -.1, .3, .7, -.1, .3, .7]);
    world.environment.primary.fill('water');
    const query = createWorldSpatialQueries(world);
    assert.equal(query.sample(.5, 1).surface.water, true);
    const dry = query.sample(2, 1);
    assert.equal(dry.surface.water, false);
    assert.equal(dry.zone.primary, 'water', 'preserve canonical 4m ground membership');
    assert.equal(dry.zoneWaterMismatch, true, 'report a coarse coast edge instead of inventing another classifier');
    assert.equal(dry.movement.traversable, true);
    assert.ok(Math.abs(dry.surface.slope - .2) < 1e-12);
    assert.ok(dry.buildability.reasons.includes('foundation-slope'));
    const flat = fixture(Array(9).fill(.2));
    assert.equal(createWorldSpatialQueries(flat).sample(2, 2).movement.traversable, false,
        'retain resident steering strict water clearance at exactly 0.2m');
    const terrace = fixture([1, 1, 9, 1, 1, 9, 1, 1, 9]);
    assert.equal(createWorldSpatialQueries(terrace).sample(.5, .5).surface.slope, 0);
    assert.equal(createWorldSpatialQueries(terrace).sample(2.5, 1).surface.slope, 4);
});

test('harbor approaches and rival foundations remain reserved even when terrain is suitable', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture(Array(9).fill(1));
    world.settlement.harbor = { x: 0, z: 1 };
    world.siteSelection = { buffers: [], connection: [{ x: 2, z: 2 }, { x: 2, z: 4 }],
        harborBerth: { center: { x: 4, z: 1 }, rotation: Math.PI / 2, halfBeam: .1, halfLength: .2 } };
    world.rivalSite = { bounds: { minX: 2, maxX: 4, minZ: 2, maxZ: 4 }, foundations: [
        { id: 'rival-home', x: 3, z: 3, halfWidth: .2, halfDepth: .4, rotation: Math.PI / 4 },
    ] };
    const query = createWorldSpatialQueries(world);
    assert.ok(query.sample(1.5, 1).buildability.reasons.includes('harbor-approach'));
    assert.ok(query.sample(4, 1).buildability.reasons.includes('harbor-berth'));
    assert.ok(query.sample(2, 2.5).buildability.reasons.includes('rival-connection'));
    assert.ok(query.sample(3, 3).buildability.reasons.includes('rival-foundation'));
});

test('a saved navigation exclusion cannot become an available building point', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture(Array(9).fill(1));
    world.settlement.bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    world.navigation.cells[12] = false;
    const point = createWorldSpatialQueries(world).sample(2, 2);
    assert.equal(point.buildability.terrainSuitable, true);
    assert.equal(point.buildability.available, false);
    assert.ok(point.buildability.reasons.includes('navigation-blocked'));
});

test('a narrow ridge cannot masquerade as flat building terrain through averaged slope', () => {
    const { createWorldSpatialQueries } = load('../src/world-generation/WorldSpatialQueries.ts');
    const world = fixture([1, 3, 1, 1, 3, 1, 1, 3, 1]);
    world.settlement.bounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const point = createWorldSpatialQueries(world).sample(2, 2);
    assert.equal(point.placementSlope, 0, 'the inherited symmetric placement probe cancels at this ridge');
    assert.equal(point.surface.slope, 1);
    assert.equal(point.buildability.terrainSuitable, false);
    assert.equal(point.buildability.available, false);
    assert.equal(point.movement.traversable, true, 'this data-only slice preserves resident steering rules');
});
