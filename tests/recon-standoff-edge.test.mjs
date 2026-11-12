import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const bounds = { minX: 0, maxX: 320, minZ: 0, maxZ: 256 };
const certain = { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
    casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };

function fixture({ coast = false, narrow = false, unknown = false, compact = false } = {}) {
    const rivalX = unknown ? 240 : 160;
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 41, rows: 33, heights: Array(1353).fill(0) },
        navigation: { bounds, spacing: 8, columns: 41, rows: 33, cells: Array(1353).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'recon-edge-rival', center: { x: rivalX, z: 128 },
            bounds: { minX: rivalX - (compact ? 8 : 16), maxX: rivalX + (compact ? 8 : 16),
                minZ: compact ? 120 : 112, maxZ: compact ? 136 : 144 },
            foundations: [], buildableArea: 1024 } };
    for (let row = 0; row < 33; row++) {
        if ((coast || narrow) && row * 8 < 112 || narrow && row * 8 > 144) {
            for (let col = 0; col < 41; col++) {
                world.navigation.cells[row * 41 + col] = false;
                world.terrain.heights[row * 41 + col] = -2;
            }
        }
    }
    if (compact) for (let col = 23; col < 41; col++) world.navigation.cells[18 * 41 + col] = false;
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0 }, { enabled: false }, certain), world, 'recon-edge-fixture');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x, z = 116, rowSpacing = 8) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 4, z: z + Math.floor(index / 4) * rowSpacing }]));
    const context = { world, worldId: 'recon-edge-fixture', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: { minX: 32, maxX: 104, minZ: 96, maxZ: 160 }, homes: homes(state, compact ? 80 : 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center,
            bounds: world.rivalSite.bounds, homes: homes(rival, rivalX - (compact ? 4 : 12), compact ? 124 : 116, compact ? 4 : 8) } ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Perimeter scouts',
        memberIds: ['founder-1'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: unknown ? { x: 208, z: 64 } : { x: 112, z: 128 } }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: unknown ? 100 : 40 }, context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: unknown ? 100 : 40 }, context);
    assert.equal(core.inspectIslandMissions(state).sites.length, unknown ? 0 : 1);
    return { state, context };
}

test('a coastal Recon truthfully quotes a partial arc and walks only reachable land before returning', () => {
    const { state: initial, context } = fixture({ coast: true });
    const target = { kind: 'site', siteId: 'recon-edge-rival' };
    const offer = core.islandMissionOffer(initial, 'group-1', target, 'Recon', [], context);
    assert.equal(offer.foodCost, 2);
    assert.equal(offer.duration, 250);
    assert.equal(offer.observationRoute.coverage, 'partial');
    assert.ok(offer.observationRoute.coverageDegrees >= 90 && offer.observationRoute.coverageDegrees < 360);
    let state = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context);
    for (let tick = 0; tick < 250; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
        const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
        assert.ok(mission.position.z >= 112, 'No coastline shortcut through water');
    }
    const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(mission.status, 'Returned');
    assert.equal(mission.recon.reachedViewpoints, offer.observationRoute.viewpointCount);
    assert.equal(mission.result.success, true);
});

test('no useful safe viewpoint refuses both quote and dispatch without Food, time or RNG changes', () => {
    const { state, context } = fixture({ narrow: true });
    const before = core.serializeState(state), target = { kind: 'site', siteId: 'recon-edge-rival' };
    assert.throws(() => core.islandMissionOffer(state, 'group-1', target, 'Recon', [], context),
        /No safe observation route fits this mission/);
    assert.throws(() => core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context), /No safe observation route fits this mission/);
    assert.equal(core.serializeState(state), before);
});

test('a mapped-area quote is identical when only unseen enemy layout and inventory change', () => {
    const { state, context } = fixture({ unknown: true });
    const target = { kind: 'area', position: { x: 208, z: 120 } };
    const before = core.serializeState(state);
    const offer = core.islandMissionOffer(state, 'group-1', target, 'Recon', [], context);
    const hiddenWorld = structuredClone(context.world);
    hiddenWorld.rivalSite.bounds = { minX: 160, maxX: 312, minZ: 16, maxZ: 240 };
    const hiddenContext = { ...context, world: hiddenWorld,
        exclusions: [{ minX: 198, maxX: 230, minZ: 108, maxZ: 148 }] };
    const hiddenState = structuredClone(state);
    hiddenState.world.targetClans['island-rival'].stocks.food += 500;
    hiddenState.world.targetClans['island-rival'].stocks.materials += 500;
    assert.deepEqual(core.islandMissionOffer(hiddenState, 'group-1', target, 'Recon', [], hiddenContext), offer,
        'Unseen bounds, buildings and stocks cannot tune a route or its public quote');
    const departed = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context);
    assert.equal(Object.values(departed.world.spatial.missions).at(-1).task.recon.protectedBounds, null);
    assert.equal(core.inspectIslandMissions(state).sites.length, 0);
    assert.equal(core.serializeState(state), before);
});

test('a mapped-area click outside a known parcel remains a valid investigation centre', () => {
    const { state, context } = fixture();
    const target = { kind: 'area', position: { x: 128, z: 128 } };
    const offer = core.islandMissionOffer(state, 'group-1', target, 'Recon', [], context);
    assert.deepEqual(offer.target, target.position);
    assert.ok(offer.observationRoute.viewpointCount >= 2);
    const departed = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context);
    assert.deepEqual(Object.values(departed.world.spatial.missions).at(-1).task.target.position, target.position);
});

test('a known site hidden behind terrain refuses useless observation before charging', () => {
    const { state, context } = fixture();
    const occluded = structuredClone(context.world);
    for (let row = 15; row <= 17; row++) for (let col = 19; col <= 21; col++) {
        if (row === 16 && col === 20) continue;
        occluded.terrain.heights[row * 41 + col] = 8;
    }
    const blockedContext = { ...context, world: occluded };
    const before = core.serializeState(state), target = { kind: 'site', siteId: 'recon-edge-rival' };
    assert.throws(() => core.islandMissionOffer(state, 'group-1', target, 'Recon', [], blockedContext),
        /No safe observation route fits this mission/);
    assert.throws(() => core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, blockedContext), /No safe observation route fits this mission/);
    assert.equal(core.serializeState(state), before);
});

test('nearby area protection does not enable Surveillance or Pillage on area targets', () => {
    const { state: initial, context } = fixture();
    let state = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'recon-edge-rival' }, mission: 'Recon' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
    assert.ok(core.inspectIslandMissions(state).sites[0].knowledge.settlementName);
    const before = core.serializeState(state), target = { kind: 'area', position: { x: 128, z: 128 } };
    for (const mission of ['Surveillance', 'Pillage']) {
        const priorities = mission === 'Pillage' ? ['Food'] : [];
        assert.throws(() => core.islandMissionOffer(state, 'group-1', target, mission, priorities, context),
            /discovered.*clan/i);
        assert.throws(() => core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
            target, mission, priorities }, context), /discovered.*clan/i);
    }
    assert.equal(core.serializeState(state), before);
});

test('an initially unknown settlement first seen en route is avoided before the scout enters its parcel', () => {
    const { state: initial, context } = fixture({ unknown: true });
    const target = { kind: 'area', position: { x: 208, z: 120 } };
    let state = core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context);
    assert.equal(Object.values(state.world.spatial.missions).at(-1).task.recon.protectedBounds, null,
        'The proposal did not consult a hidden settlement');
    assert.equal(state.stocks.food, initial.stocks.food - 2, 'Dispatch charges exactly once');
    let firstSighting = null;
    for (let tick = 0; tick < 250; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
        const site = core.inspectIslandMissions(state).sites[0];
        if (site && firstSighting === null) firstSighting = site.sourceEventId;
        const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
        const point = mission.position;
        if (firstSighting) assert.ok(point.x < 216 || point.x > 264 || point.z < 104 || point.z > 152,
            'Actual new sighting protects the known parcel before its next crossed edge');
    }
    assert.ok(firstSighting, 'The unchanged terrain yields a real on-route sighting');
    const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(mission.status, 'Returned');
    assert.equal(mission.outcome, 'Cancelled');
    assert.equal(mission.result.discovery, null);
    const departures = state.events.filter(event => event.type === 'ExpeditionDeparted' &&
        event.details?.missionId === mission.id);
    assert.equal(departures.length, 1);
    assert.equal(departures[0].details.foodCost, 2);
    assert.equal(Object.values(state.world.spatial.missions).at(-1).foodCost, 2);
});

test('a blocked perimeter sector does not produce an opposite-side detour that retraces the circuit', () => {
    const { state, context } = fixture({ compact: true });
    const target = { kind: 'site', siteId: 'recon-edge-rival' };
    let offer;
    try {
        offer = core.islandMissionOffer(state, 'group-1', target, 'Recon', [], context);
    } catch (error) {
        assert.match(String(error), /No safe observation route fits this mission/);
        return;
    }
    assert.ok(offer.observationRoute.coverageDegrees >= 45);
    const departed = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, context);
    const mission = Object.values(departed.world.spatial.missions).at(-1);
    const approachEndsAt = mission.task.recon.viewpoints[0].distance;
    const route = mission.task.recon.outwardRoutes['founder-1'];
    const seen = new Set();
    let distance = 0;
    for (let index = 1; index < route.length; index++) {
        const a = route[index - 1], b = route[index];
        distance += Math.hypot(b.x - a.x, b.z - a.z);
        if (distance <= approachEndsAt + 1e-6) continue;
        const from = `${a.x}:${a.z}`, to = `${b.x}:${b.z}`;
        assert.equal(seen.has(`${to}>${from}`), false,
            'The observation circuit cannot undo its own path to reach the opposite side of a blocked sector');
        seen.add(`${from}>${to}`);
    }
});
