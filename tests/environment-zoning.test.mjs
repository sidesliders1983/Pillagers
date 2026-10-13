import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './load-source.mjs';

const request = { seed: 18, preset: 'island', environment: { version: 1 } };

test('an explicitly zoned island exposes coherent substrate and cover metadata without changing its physical terrain', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const old = generateWorld({ seed: 18, preset: 'island' });
    const zoned = generateWorld(request);
    assert.equal(zoned.environment?.version, 1);
    assert.deepEqual(zoned.terrain, old.terrain);
    assert.deepEqual(zoned.coast, old.coast);
    assert.deepEqual(zoned.settlement, old.settlement);
    assert.ok(zoned.environment.regions.length > 1);
    assert.ok(zoned.environment.fields.rockExposure.some(value => value > 0));
    assert.ok(zoned.environment.fields.forestCover.some(value => value > 0));
    assert.ok(zoned.environment.fields.snowRetentionPotential.every(value => value === 0),
        'normal climate does not imply permanent snow on a 50-60m island');
});

function terrainFixture(heightAt) {
    const { extractCoast } = load('../src/world-generation/PlanSettlement.ts');
    const terrain = { bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
        spacing: 2, columns: 33, rows: 33,
        heights: Array.from({ length: 1089 }, (_, i) => heightAt(-32 + i % 33 * 2, -32 + Math.floor(i / 33) * 2)) };
    const world = { config: { seed: 7, width: 64, depth: 64 }, waterLevel: 0, terrain };
    return { ...world, coast: extractCoast(world) };
}

test('terrain queries distinguish low cliffs from gentle highlands and climate-dependent snow retention', () => {
    const { zoneEnvironment, normalizeEnvironmentConfig, sampleEnvironment } = load('../src/world-generation/EnvironmentZoning.ts');
    const normal = normalizeEnvironmentConfig({ version: 1 });
    const lowCliff = terrainFixture(x => 5 + x * .8);
    const highland = terrainFixture(x => 55 + x * .005);
    lowCliff.environment = zoneEnvironment(lowCliff, normal);
    highland.environment = zoneEnvironment(highland, normal);
    const cliff = sampleEnvironment(lowCliff, 0, 0), gentle = sampleEnvironment(highland, 0, 0);
    assert.ok(cliff.rockExposure > .5, 'steep low coastal ground exposes bedrock');
    assert.ok(gentle.rockExposure < .3, 'elevation alone cannot strip gentle highland soil');
    assert.equal(gentle.mud, 0, 'a gentle high plateau is not automatically a swamp');
    assert.equal(gentle.snowRetentionPotential, 0);
    const cold = normalizeEnvironmentConfig({ version: 1, meanAnnualTemperatureC: -8 });
    highland.environment = zoneEnvironment(highland, cold);
    assert.ok(sampleEnvironment(highland, 0, 0).snowRetentionPotential > .2);
    const steep = terrainFixture(x => 55 + x * 2);
    steep.environment = zoneEnvironment(steep, cold);
    assert.ok(sampleEnvironment(steep, 0, 0).snowRetentionPotential < .05,
        'very steep exposed terrain retains little snow even in the cold test climate');
});

test('zoning saves preserve climate and canonical fields and reject corrupted or missing metadata', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld(request);
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    const invalid = JSON.parse(serializeWorld(world));
    invalid.blueprint.environment.fields.rockExposure[0] = 2;
    assert.throws(() => parseWorld(JSON.stringify(invalid)), /Invalid world blueprint/);
    const missing = JSON.parse(serializeWorld(world));
    delete missing.blueprint.environment;
    assert.throws(() => parseWorld(JSON.stringify(missing)), /Invalid world blueprint/);
    const old = generateWorld({ seed: 18, preset: 'island' });
    assert.deepEqual(parseWorld(serializeWorld(old)), old);
    assert.equal(old.environment, undefined);
});

test('zoned nature consumes the canonical cover field while preserving settlement and access reservations', () => {
    const { generateWorld, changeWorldConifers } = load('../src/world-generation/GenerateWorld.ts');
    const { sampleEnvironment } = load('../src/world-generation/EnvironmentZoning.ts');
    const world = generateWorld({ ...request, generatorVersion: 'fjordside-island-v0.3e' });
    assert.equal(world.validation.accepted, true, world.validation.reasons.join('; '));
    for (const tree of world.placementPlan.filter(p => p.assetId.includes('conifer'))) {
        assert.ok(sampleEnvironment(world, tree.x, tree.z).forestCover >= .4,
            'trees belong to a canonical forest-cover zone');
    }
    const index = 100 * world.terrain.columns + 100;
    const x = world.terrain.bounds.minX + 200, z = world.terrain.bounds.minZ + 200;
    assert.ok(Math.abs(world.biomes.moisture[index] - sampleEnvironment(world, x, z).moisture) < 1e-6);
    const changed = changeWorldConifers(world, 'ez-tree');
    assert.deepEqual(changed.environment, world.environment);
    assert.deepEqual(changed.siteSelection, world.siteSelection);
    assert.deepEqual(changed.rivalSite, world.rivalSite);
    assert.equal(changed.validation.accepted, true, changed.validation.reasons.join('; '));
});

test('world import rejects a region graph whose bounds no longer describe its samples', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld({ seed: 17, environment: { version: 1 } });
    const saved = JSON.parse(serializeWorld(world));
    saved.blueprint.environment.regions[0].bounds.minX += 1;
    assert.throws(() => parseWorld(JSON.stringify(saved)), /Invalid world blueprint/);
});
