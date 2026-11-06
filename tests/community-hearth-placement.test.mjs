import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { FjordCampaign } = load('../src/fjord-play/FjordCampaign.ts');
const { adoptCampaignIsland, campaignIslandPlan, islandRecipe } = load('../src/fjord-play/CampaignIsland.ts');
const { communityHearthSupport, communityHearthAccess, communityHearthReservation,
    inspectCommunityHearthPlacement, overlapsCommunityHearth } = load('../src/fjord-play/CommunityHearthPlacement.ts');
const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
const { geographyIdentity } = load('../src/fjord-play/FjordProjection.ts');

function campaign(geography = 88, version = 'island-pool-v3') {
    const directory = new URL('../public/game-assets/islands/', import.meta.url);
    const file = readdirSync(directory).find(name => name.startsWith(version + '-' + geography + '-'));
    const { world, plan } = JSON.parse(gunzipSync(readFileSync(new URL(file, directory))));
    let seed = 0;
    while (islandRecipe(seed, version).seed !== geography) seed++;
    adoptCampaignIsland(seed, world, plan, plan.recipe);
    const session = new GameplaySession(seed);
    session.loadJSON(core.serializeState(core.createCampaign(seed, { initialMaterials: 1000 })));
    return new FjordCampaign(session, version);
}

function upgrade(adapter) {
    const current = core.inspectCommunityHearth(adapter.session.readSnapshot());
    const offer = adapter.communityHearthPlacement();
    assert.equal(offer.available, true, offer.reason ?? 'A real site is required');
    adapter.session.command({ type: 'UpgradeCommunityHearth', expectedTier: current.tier,
        quotedMaterials: current.upgradeMaterials, placement: offer.placement });
    return adapter.project();
}

test('the real approved island supports both authored tiers with one unaltered fire and bounded visible footing', () => {
    const adapter = campaign();
    const geography = JSON.stringify(adapter.blueprint);
    const initial = adapter.project();
    adapter.session.command({ type: 'EnableCommunityHearth' });
    adapter.session.command({ type: 'SetCampfire', lit: true });
    const fuel = adapter.session.snapshot().campfire;
    const first = upgrade(adapter);
    const second = upgrade(adapter);
    assert.deepEqual(second.campfire, initial.campfire);
    assert.deepEqual(first.communityHearthSite.placement, second.communityHearthSite.placement);
    assert.deepEqual(first.communityHearthSite.reservation, second.communityHearthSite.reservation);
    assert.deepEqual(second.layout.plots, initial.layout.plots);
    assert.deepEqual(adapter.session.snapshot().campfire, fuel);
    assert.equal(JSON.stringify(adapter.blueprint), geography);
    const support = communityHearthSupport(adapter.blueprint, second.communityHearthSite.placement);
    assert.ok(support.high - support.low > .15, 'This real fixture exercises the visible stone footing');
    assert.ok(support.high - support.low <= .6);
    assert.ok(support.floor >= support.high);
    for (const plot of Object.values(second.layout.plots))
        assert.equal(overlapsCommunityHearth(plot, second.communityHearthSite.reservation, 1), false);
    const path = second.ground.paths.find(path => path.from === 'community-hearth');
    assert.ok(path.points.length > 2, 'The paid site has a real walkable outdoor approach');
    const surface = createBlueprintSurface(adapter.blueprint);
    for (const point of path.points) {
        assert.ok(surface.surfaceHeightAt(point.x, point.z) > adapter.blueprint.waterLevel + .2);
        assert.ok(surface.slopeAt(point.x, point.z) <= .55);
    }
});

test('later home construction and its paths retain a valid exact Community Hearth save', () => {
    const adapter = campaign();
    adapter.session.command({ type: 'EnableCommunityHearth' });
    const initial = upgrade(adapter);
    for (const householdId of Object.keys(adapter.session.snapshot().households).slice(0, 4)) {
        adapter.session.command({ type: 'BuildHouse', householdId });
        adapter.project();
    }
    assert.equal(adapter.communityHearthPlacement().available, true);
    assert.deepEqual(adapter.project().communityHearthSite.placement, initial.communityHearthSite.placement);
    const saved = adapter.exportJSON();
    const restored = new FjordCampaign(new GameplaySession(32), 'legacy', saved);
    assert.equal(restored.exportJSON(), saved);
    const reserve = restored.project().communityHearthSite.reservation;
    for (const path of restored.project().ground.paths.filter(path => path.from !== 'community-hearth'))
        for (const point of path.points)
            assert.equal(overlapsCommunityHearth(reserve, { ...point, halfWidth: 1.5, halfDepth: 1.5 }), false);
});

test('an older v1 island recipe upgrades at its saved geography without recipe regeneration', () => {
    const adapter = campaign(18, 'island-pool-v1');
    const geography = JSON.stringify(adapter.blueprint);
    const prior = adapter.exportJSON();
    const restored = new FjordCampaign(new GameplaySession(32), 'legacy', prior);
    restored.session.command({ type: 'EnableCommunityHearth' });
    upgrade(restored);
    assert.equal(JSON.stringify(restored.blueprint), geography);
    const saved = restored.exportJSON();
    assert.equal(JSON.parse(saved).island.version, 'island-pool-v1');
    assert.equal(new FjordCampaign(new GameplaySession(1), 'legacy', saved).exportJSON(), saved);
});

test('an occupied current island and an occupied legacy pocket retain a working campfire with an honest blocked reason', () => {
    const blocked = campaign(101);
    const legacy = new FjordCampaign(new GameplaySession(17));
    for (const adapter of [blocked, legacy]) {
        const before = adapter.session.saveJSON();
        const fire = adapter.project().campfire;
        const offer = adapter.communityHearthPlacement();
        assert.equal(offer.available, false);
        assert.match(offer.reason, /No legal space/);
        assert.equal(offer.placement, undefined);
        assert.equal(adapter.session.saveJSON(), before);
        assert.deepEqual(adapter.project().campfire, fire);
        const saved = adapter.exportJSON();
        assert.equal(new FjordCampaign(new GameplaySession(1), 'legacy', saved).exportJSON(), saved);
    }
});

test('saved geography, existing routes, mineral approaches and wet cells are real placement blockers', () => {
    const adapter = campaign();
    const view = adapter.project();
    const placement = adapter.communityHearthPlacement().placement;
    assert.ok(placement);
    const context = { world: adapter.blueprint, worldId: geographyIdentity(adapter.blueprint),
        plots: Object.values(view.layout.plots), paths: [] };
    assert.equal(inspectCommunityHearthPlacement(context, { ...placement, worldId: 'another-island' }).available, false);
    assert.equal(inspectCommunityHearthPlacement(context, { ...placement, rotation: placement.rotation + .2 }).available, false);
    assert.equal(inspectCommunityHearthPlacement({ ...context, paths: [[
        { x: placement.x - 30, z: placement.z }, { x: placement.x + 30, z: placement.z },
    ]] }, placement).available, false);
    const minedWorld = { ...adapter.blueprint, oreSites: { sites: [
        { position: { ...placement, y: 0 }, approach: { x: placement.x + 3, z: placement.z } },
    ] } };
    const plan = campaignIslandPlan(adapter.blueprint);
    adoptCampaignIsland(adapter.session.readSnapshot().seed, minedWorld, plan, plan.recipe);
    assert.match(inspectCommunityHearthPlacement({ ...context, world: minedWorld }, placement).reason, /mineral deposits/);
    const environment = adapter.blueprint.environment;
    const column = Math.round((placement.x - adapter.blueprint.terrain.bounds.minX) / environment.spacing);
    const row = Math.round((placement.z - adapter.blueprint.terrain.bounds.minZ) / environment.spacing);
    const wetWorld = { ...adapter.blueprint, oreSites: { sites: [],
        wetLowlands: { patches: [{ cells: [row * environment.columns + column] }] } } };
    adoptCampaignIsland(adapter.session.readSnapshot().seed, wetWorld, plan, plan.recipe);
    assert.match(inspectCommunityHearthPlacement({ ...context, world: wetWorld }, placement).reason, /wet lowland/);
    const reservation = communityHearthReservation(adapter.blueprint, placement);
    assert.equal(inspectCommunityHearthPlacement({ ...context, plots: [...context.plots, reservation] }, placement).available, false);
    assert.ok(communityHearthAccess(context, placement).length);
});

test('a forged saved community structure inside the outdoor court is rejected before replacing the live campaign', () => {
    const adapter = campaign();
    adapter.session.command({ type: 'EnableCommunityHearth' });
    upgrade(adapter);
    const saved = adapter.exportJSON(), corrupt = JSON.parse(saved);
    const fire = adapter.project().campfire.transform;
    const placement = { x: fire.x, z: fire.z, rotation: 0, worldId: geographyIdentity(adapter.blueprint) };
    corrupt.campaign.communityHearth.placement = placement;
    for (const event of corrupt.campaign.events)
        if (event.type === 'CommunityHearthUpgraded') event.details.placement = placement;
    delete corrupt.narrative;
    assert.throws(() => adapter.importJSON(JSON.stringify(corrupt)), /Community Hearth placement|court/i);
    assert.equal(adapter.exportJSON(), saved);
});
