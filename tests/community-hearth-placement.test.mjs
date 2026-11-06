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
    inspectCommunityHearthPlacement, findCommunityHearthPlacement,
    pathTouchesCommunityHearth } = load('../src/fjord-play/CommunityHearthPlacement.ts');
const { communityHearthContains, communityHearthOverlapsPlot, communityHearthGeometry } = load('../src/fjord-play/CommunityHearthGeometry.ts');
const { communityHearthProfiles } = load('../src/fjord-play/CommunityHearthProfiles.ts');
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

function at(transform, point) {
    return {
        x: transform.x + transform.scale * (point.x * Math.cos(transform.rotation) + point.z * Math.sin(transform.rotation)),
        z: transform.z + transform.scale * (-point.x * Math.sin(transform.rotation) + point.z * Math.cos(transform.rotation)),
    };
}
function includes(bounds, point) {
    return point.x >= bounds.minX && point.x <= bounds.maxX && point.z >= bounds.minZ && point.z <= bounds.maxZ;
}
function contextFor(adapter) {
    const view = adapter.project();
    return { world: adapter.blueprint, worldId: geographyIdentity(adapter.blueprint),
        plots: Object.values(view.layout.plots),
        paths: view.ground.paths.filter(path => path.from !== 'community-hearth').map(path => path.points) };
}
function assertCentered(view, originalFire, tier) {
    assert.equal(view.campfire.id, originalFire.id);
    for (const key of ['x', 'y', 'z']) assert.equal(view.campfire.transform[key], originalFire.transform[key]);
    assert.equal(view.campfire.transform.scale, tier === 1 ? .65 : .495);
    const site = view.communityHearthSite;
    assert.ok(site, view.communityHearthStatus?.reason ?? 'The corrected structure must be visible');
    assert.equal(site.tier, tier);
    assert.equal(site.placement.x, originalFire.transform.x);
    assert.equal(site.placement.z, originalFire.transform.z);
    const socket = at(site.transform, communityHearthProfiles[tier].fireAnchor);
    assert.ok(Math.hypot(socket.x - originalFire.transform.x, socket.z - originalFire.transform.z) < 1e-9,
        'The real model-local fire socket maps to the existing world fire');
    assert.ok(site.occupancy.length > 0);
    for (const obstacle of site.occupancy)
        assert.equal(communityHearthContains(obstacle, socket), false, 'The fire socket is open, not a solid model box');
    const court = at(site.transform, tier === 1 ? { x: 0, z: .8 } : { x: -.75, z: 4.5 });
    assert.ok(site.occupancy.every(obstacle => !communityHearthContains(obstacle, court)),
        'The open Shelter interior / Hall forecourt remains traversable');
}

test('both corrected models share the exact world fire and only local support footprints', () => {
    const adapter = campaign();
    const geography = JSON.stringify(adapter.blueprint);
    const initial = adapter.project();
    adapter.session.command({ type: 'EnableCommunityHearth' });
    adapter.session.command({ type: 'SetCampfire', lit: true });
    const fuel = adapter.session.snapshot().campfire;
    const first = upgrade(adapter);
    const second = upgrade(adapter);
    assertCentered(first, initial.campfire, 1);
    assertCentered(second, initial.campfire, 2);
    assert.deepEqual(first.communityHearthSite.placement, second.communityHearthSite.placement);
    assert.deepEqual(first.communityHearthSite.reservation, second.communityHearthSite.reservation);
    assert.deepEqual(second.layout.plots, initial.layout.plots);
    assert.deepEqual(adapter.session.snapshot().campfire, fuel);
    assert.equal(JSON.stringify(adapter.blueprint), geography);
    assert.equal(second.ground.plots.some(plot => plot.id === 'community-hearth'), false,
        'An upgrade must not paint or grade a rectangular household plot');
    for (const view of [first, second]) {
        const site = view.communityHearthSite;
        const support = communityHearthSupport(adapter.blueprint, site.placement, site.tier);
        assert.deepEqual(support, site.support);
        assert.ok(support.high - support.low <= .6);
        assert.ok(support.floor >= support.high);
        assert.ok(site.supports.length > 1, 'Ground contacts are separate local feet, not one full slab');
        assert.ok(site.supports.every(part => Number.isFinite(part.base) && part.top >= part.base));
        assert.ok(site.supports.every(part => !includes(part.bounds, communityHearthProfiles[site.tier].fireAnchor)),
            'Support does not cover the existing fire or its open ground');
        const supportArea = site.supports.reduce((total, part) => total +
            (part.bounds.maxX - part.bounds.minX) * (part.bounds.maxZ - part.bounds.minZ) * site.transform.scale ** 2, 0);
        assert.ok(supportArea < site.envelope.halfWidth * site.envelope.halfDepth * 4 * .75,
            'Local support area stays materially smaller than the authored envelope');
        for (const plot of Object.values(view.layout.plots))
            assert.ok(site.reservedFootprints.every(footprint => !communityHearthOverlapsPlot(footprint, plot, 1)));
        const path = view.ground.paths.find(path => path.from === 'community-hearth');
        assert.ok(path?.points.length > 2, 'The fire keeps a real dry outdoor approach');
        const surface = createBlueprintSurface(adapter.blueprint);
        for (const point of path.points) {
            assert.ok(surface.surfaceHeightAt(point.x, point.z) > adapter.blueprint.waterLevel + .2);
            assert.ok(surface.slopeAt(point.x, point.z) <= .55);
            assert.ok(site.occupancy.every(obstacle => !communityHearthContains(obstacle, point, .4)));
        }
    }
});

test('later homes and paths preserve the centered structure and an exact upgraded save', () => {
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
    const view = restored.project();
    for (const path of view.ground.paths.filter(path => path.from !== 'community-hearth'))
        assert.equal(pathTouchesCommunityHearth(path.points, view.communityHearthSite.occupancy, 1.5), false,
            'A later home path cannot pass through walls or posts');
});

test('an older v1 island keeps its exact geography and working fire when the centered site cannot fit', () => {
    const adapter = campaign(18, 'island-pool-v1');
    const geography = JSON.stringify(adapter.blueprint);
    const prior = adapter.exportJSON();
    const restored = new FjordCampaign(new GameplaySession(32), 'legacy', prior);
    const fire = restored.project().campfire;
    restored.session.command({ type: 'EnableCommunityHearth' });
    const beforeOffer = restored.session.saveJSON();
    const offer = restored.communityHearthPlacement();
    assert.equal(offer.available, false);
    assert.match(offer.reason, /No legal space/);
    assert.equal(offer.placement, undefined);
    assert.equal(restored.session.saveJSON(), beforeOffer);
    assert.deepEqual(restored.project().campfire, fire);
    assert.equal(JSON.stringify(restored.blueprint), geography);
    const saved = restored.exportJSON();
    assert.equal(JSON.parse(saved).island.version, 'island-pool-v1');
    assert.equal(new FjordCampaign(new GameplaySession(1), 'legacy', saved).exportJSON(), saved);
});

test('a real detached draft receipt loads at the same fire and remains the exact second-upgrade quote', () => {
    const adapter = campaign();
    const oldSave = JSON.parse(adapter.exportJSON());
    const originalFire = adapter.project().campfire;
    const originalWorld = JSON.stringify(adapter.blueprint);
    // Reproduce the paid receipt in run-1793961468406/shelter-checkpoint.json through the public Core.
    const historical = { x: -20, z: -74, rotation: Math.PI,
        worldId: 'fjordside-island-v0.3e-r3:88:bb64c9d8' };
    assert.equal(geographyIdentity(adapter.blueprint), historical.worldId);
    adapter.session.command({ type: 'EnableCommunityHearth' });
    adapter.session.command({ type: 'SetCampfire', lit: true });
    adapter.session.command({ type: 'UpgradeCommunityHearth', expectedTier: 0,
        quotedMaterials: 15, placement: historical });
    oldSave.campaign = adapter.session.snapshot();
    delete oldSave.narrative;
    const originalCore = core.serializeState(oldSave.campaign);
    const restored = new FjordCampaign(new GameplaySession(32), 'legacy', JSON.stringify(oldSave));
    assert.equal(core.serializeState(restored.session.snapshot()), originalCore);
    assert.equal(JSON.stringify(restored.blueprint), originalWorld);
    const first = restored.project();
    assert.equal(first.communityHearthStatus.legacy, true);
    assertCentered(first, originalFire, 1);
    assert.deepEqual(restored.communityHearthPlacement().placement, historical,
        'The Core quote echoes the immutable paid placement, not the corrected render transform');
    const fuel = restored.session.snapshot().campfire;
    const oldReceipt = restored.session.snapshot().events.find(event => event.type === 'CommunityHearthUpgraded');
    const second = upgrade(restored);
    assertCentered(second, originalFire, 2);
    assert.deepEqual(second.communityHearthSite.placement, first.communityHearthSite.placement);
    assert.deepEqual(restored.session.snapshot().campfire, fuel);
    assert.deepEqual(restored.session.snapshot().events.find(event => event.id === oldReceipt.id), oldReceipt);
    assert.deepEqual(restored.session.snapshot().communityHearth.placement, historical);
    const saved = restored.exportJSON();
    const roundTrip = new FjordCampaign(new GameplaySession(2), 'legacy', saved);
    assert.equal(roundTrip.exportJSON(), saved);
    assertCentered(roundTrip.project(), originalFire, 2);
});

test('an occupied center returns an honest blocked offer without relocating the fire or changing Core', () => {
    const adapter = campaign();
    const before = adapter.session.saveJSON(), fire = adapter.project().campfire;
    const context = contextFor(adapter);
    const occupied = { ...fire.transform, halfWidth: 15, halfDepth: 15 };
    const offer = findCommunityHearthPlacement({ ...context, plots: [...context.plots, occupied] });
    assert.equal(offer.available, false);
    assert.match(offer.reason, /No legal space/);
    assert.equal(offer.placement, undefined);
    assert.equal(adapter.session.saveJSON(), before);
    assert.deepEqual(adapter.project().campfire, fire);
});

test('saved geography, authored shore routes, mineral approaches and wet cells remain placement blockers', () => {
    const adapter = campaign();
    const placement = adapter.communityHearthPlacement().placement;
    assert.ok(placement);
    const context = contextFor(adapter);
    assert.equal(inspectCommunityHearthPlacement(context, { ...placement, worldId: 'another-island' }).available, false);
    assert.equal(inspectCommunityHearthPlacement(context, { ...placement, x: placement.x + 2 }).available, false,
        'New structures cannot choose a detached spot');
    const reservation = communityHearthReservation(adapter.blueprint, placement);
    const plan = campaignIslandPlan(adapter.blueprint);
    const wall = communityHearthGeometry(adapter.blueprint, placement, 2).occupancy
        .toSorted((a, b) => b.halfWidth * b.halfDepth - a.halfWidth * a.halfDepth)[0];
    const route = [{ x: wall.x - .25, z: wall.z }, { x: wall.x + .25, z: wall.z }];
    assert.ok(route.every(point => Math.hypot(point.x - placement.x, point.z - placement.z) > 5 &&
        communityHearthContains(wall, point)), 'The authored route crosses real walls outside the terminal clearing');
    const routeWorld = { ...adapter.blueprint, settlement: { ...adapter.blueprint.settlement,
        accessPaths: [...adapter.blueprint.settlement.accessPaths, route] } };
    adoptCampaignIsland(adapter.session.readSnapshot().seed, routeWorld, plan, plan.recipe);
    assert.match(inspectCommunityHearthPlacement({ ...context, world: routeWorld }, placement).reason,
        /paths|shore access/);
    const minedWorld = { ...adapter.blueprint, oreSites: { sites: [
        { position: { ...placement, y: 0 }, approach: { x: placement.x + 3, z: placement.z } },
    ] } };
    adoptCampaignIsland(adapter.session.readSnapshot().seed, minedWorld, plan, plan.recipe);
    assert.match(inspectCommunityHearthPlacement({ ...context, world: minedWorld }, placement).reason, /mineral deposits/);
    const environment = adapter.blueprint.environment;
    const column = Math.round((placement.x - adapter.blueprint.terrain.bounds.minX) / environment.spacing);
    const row = Math.round((placement.z - adapter.blueprint.terrain.bounds.minZ) / environment.spacing);
    const wetWorld = { ...adapter.blueprint, oreSites: { sites: [],
        wetLowlands: { patches: [{ cells: [row * environment.columns + column] }] } } };
    adoptCampaignIsland(adapter.session.readSnapshot().seed, wetWorld, plan, plan.recipe);
    assert.match(inspectCommunityHearthPlacement({ ...context, world: wetWorld }, placement).reason, /wet lowland/);
    assert.equal(inspectCommunityHearthPlacement({ ...context, plots: [...context.plots, reservation] }, placement).available, false);
    assert.ok(communityHearthAccess(context, placement).length);
});

test('forged world bindings and detached poses are rejected atomically without trusting rewritten receipts', () => {
    const adapter = campaign();
    adapter.session.command({ type: 'EnableCommunityHearth' });
    upgrade(adapter);
    const saved = adapter.exportJSON();
    const fire = adapter.project().campfire.transform;
    for (const placement of [
        { x: fire.x + 2, z: fire.z, rotation: 0, worldId: geographyIdentity(adapter.blueprint) },
        { x: fire.x, z: fire.z, rotation: 0, worldId: 'another-island' },
        { x: fire.x + 1000, z: fire.z, rotation: -Math.PI / 2, worldId: geographyIdentity(adapter.blueprint) },
    ]) {
        const corrupt = JSON.parse(saved);
        corrupt.campaign.communityHearth.placement = placement;
        for (const event of corrupt.campaign.events)
            if (event.type === 'CommunityHearthUpgraded') event.details.placement = placement;
        delete corrupt.narrative;
        assert.throws(() => adapter.importJSON(JSON.stringify(corrupt)), /Community Hearth placement|historical|island/i);
        assert.equal(adapter.exportJSON(), saved);
    }
});
