import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const { campaignIslandCatalog } = loadTypeScript(new URL('../src/fjord-play/BakedIslandCatalog.ts', import.meta.url));
const { planOreSites, planMiningSites } = loadTypeScript(new URL('../src/world-generation/OreSites.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../src/world-generation/TerrainQueries.ts', import.meta.url));
const { siteRoutes } = loadTypeScript(new URL('../src/world-generation/SiteNavigation.ts', import.meta.url));

function island(seed) {
    const entry = campaignIslandCatalog.entries.find(e => e.version === 'island-pool-v3' && e.seed === seed);
    return JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url))).toString('utf8')).world;
}

test('canonical rocky geography yields bounded deterministic exterior ore sites with real land access', () => {
    const world = island(18), before = JSON.stringify(world);
    const plan = planOreSites(world);
    assert.equal(plan.version, 1);
    assert.ok(plan.sites.length > 0 && plan.sites.length <= 4);
    assert.deepEqual(planOreSites(world), plan);
    assert.equal(JSON.stringify(world), before, 'Planning does not mutate stored geography or discoveries');
    const surface = createBlueprintSurface(world), route = siteRoutes(world.navigation, world.settlement.center);
    const ids = new Set();
    for (const site of plan.sites) {
        assert.equal(site.ore, 'iron');
        assert.equal(site.appearance, 'rock-outcrop');
        assert.ok(!ids.has(site.id)); ids.add(site.id);
        assert.ok(Number.isSafeInteger(site.initialUnits) && site.initialUnits >= 32 && site.initialUnits <= 96);
        assert.ok(route(site.approach).length > 0, 'An exterior approach is reachable on the canonical navigation grid');
        assert.ok(surface.slopeAt(site.approach.x, site.approach.z) <= .55);
        assert.ok(site.position.y >= world.waterLevel + 8);
        for (const bounds of [world.settlement.bounds, world.rivalSite.bounds])
            assert.ok(site.approach.x < bounds.minX - 20 || site.approach.x > bounds.maxX + 20 ||
                site.approach.z < bounds.minZ - 20 || site.approach.z > bounds.maxZ + 20);
    }
});

test('wet lowlands reuse canonical moisture and drainage without terrain changes or ore in every wet patch', () => {
    const world = island(18), before = JSON.stringify(world);
    const plan = planMiningSites(world);
    assert.equal(plan.version, 2);
    assert.ok(plan.wetLowlands.patches.length > 0 && plan.wetLowlands.patches.length <= 4);
    assert.deepEqual(planMiningSites(world), plan);
    assert.equal(JSON.stringify(world), before);
    const cells = new Set(), env = world.environment;
    for (const patch of plan.wetLowlands.patches) {
        assert.ok(patch.cells.length >= 4 && patch.cells.length <= 16);
        assert.ok(patch.drainageValleyId && world.geology.valleys.some(v => v.id === patch.drainageValleyId));
        for (const cell of patch.cells) {
            assert.ok(!cells.has(cell)); cells.add(cell);
            assert.ok(env.fields.moisture[cell] >= .6);
            assert.ok(env.fields.mud[cell] >= .22);
            assert.ok(env.fields.slope[cell] <= .12);
        }
    }
    const bog = plan.sites.filter(site => site.appearance === 'bog-iron');
    assert.ok(bog.length < plan.wetLowlands.patches.length);
    assert.ok(bog.length <= 2);
    assert.deepEqual(plan.sites.filter(site => site.appearance === 'rock-outcrop'), planOreSites(world).sites);
});

test('v2 wetland worlds round-trip and reject altered cells, source links or added reserves', () => {
    const {serializeWorld, parseWorld} = loadTypeScript(new URL('../src/world-generation/WorldSave.ts', import.meta.url));
    const {generateWorld} = loadTypeScript(new URL('../src/world-generation/GenerateWorld.ts', import.meta.url));
    const source = generateWorld({seed: 101, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r3',
        environment: {version: 1}, conifers: 'ez-tree'});
    const world = {...source, oreSites: planMiningSites(source)};
    const text = serializeWorld(world);
    assert.deepEqual(parseWorld(text), world);
    for (const change of [
        plan => plan.wetLowlands.patches[0].cells[0]++,
        plan => plan.sites.find(site => site.appearance === 'bog-iron').wetLowlandId = 'another-patch',
        plan => plan.sites.find(site => site.appearance === 'bog-iron').initialUnits++,
    ]) {
        const saved = JSON.parse(text); change(saved.blueprint.oreSites);
        assert.throws(() => parseWorld(JSON.stringify(saved)), /ore|wet|world/i);
    }
    const legacy = {...source, oreSites: planOreSites(source)};
    assert.deepEqual(parseWorld(serializeWorld(legacy)), legacy, 'Rock-only v1 saves keep the exact historical proposal');
});
