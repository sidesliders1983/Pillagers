import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const bounds = { minX: 0, maxX: 320, minZ: 0, maxZ: 256 };
const certain = { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
    casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };

function fixture({ adopt = true, scout = true, biome } = {}) {
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 41, rows: 33, heights: Array(1353).fill(0) },
        navigation: { bounds, spacing: 8, columns: 41, rows: 33, cells: Array(1353).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'recon-rival', center: { x: 160, z: 128 },
            bounds: { minX: 144, maxX: 176, minZ: 112, maxZ: 144 }, foundations: [], buildableArea: 1024 } };
    if (biome) world.biomes = { cells: Array(1353).fill(biome), waterDistance: Array(1353).fill(10) };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0 }, { enabled: false }, certain), world, 'recon-standoff-fixture');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 4, z: 116 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId: 'recon-standoff-fixture', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: { minX: 32, maxX: 104, minZ: 96, maxZ: 160 }, homes: homes(state, 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center,
            bounds: world.rivalSite.bounds, homes: homes(rival, 148) } ] };
    if (adopt) state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Outer watch',
        memberIds: ['founder-1'] }, context);
    if (!scout) return { state, context };
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 112, z: 128 } }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 40 }, context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 40 }, context);
    assert.equal(core.inspectIslandMissions(state).sites[0]?.id, 'recon-rival');
    return { state, context };
}

function outsideProtected(point) {
    return point.x < 136 || point.x > 184 || point.z < 104 || point.z > 152;
}

test('new Recon quotes a broad outside itinerary and keeps its entire reached path outside the known parcel', () => {
    const setup = fixture(), target = { kind: 'site', siteId: 'recon-rival' };
    const before = core.serializeState(setup.state);
    const offer = core.islandMissionOffer(setup.state, 'group-1', target, 'Recon', [], setup.context);
    assert.equal(offer.foodCost, 2);
    assert.equal(offer.duration, 250);
    assert.ok(offer.observationRoute?.coverageDegrees >= 180, 'A target click investigates an outer arc');
    assert.equal(core.serializeState(setup.state), before, 'A quote is read-only');
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, setup.context);
    const mission = Object.values(state.world.spatial.missions).at(-1);
    assert.deepEqual(mission.task.target.position, setup.context.world.rivalSite.center);
    for (const route of [...Object.values(mission.memberRoutes), ...Object.values(mission.returnRoutes)]) {
        for (let i = 1; i < route.length; i++) {
            const a = route[i - 1], b = route[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4));
            for (let step = 0; step <= steps; step++) assert.ok(outsideProtected({
                x: a.x + (b.x - a.x) * step / steps,
                z: a.z + (b.z - a.z) * step / steps,
            }), 'Every approach, connecting and homeward edge respects the protected parcel');
        }
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    const returned = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(returned.status, 'Returned');
    assert.equal(returned.result.discovery.settlementName, state.world.targetClans['island-rival'].clan.name);
    assert.ok(returned.recon.reachedViewpoints >= 3);
});

test('waypoint evidence is dated from reached witnesses and survives mid-arc and mid-return save/load', () => {
    const setup = fixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'recon-rival' }, mission: 'Recon' }, setup.context);
    let checkpoint;
    for (let tick = 0; tick < 100; tick++) {
        const previous = Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length;
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const mission = Object.values(state.world.spatial.missions).at(-1);
        if (mission.task.recon.samples.length > previous) {
            const sample = mission.task.recon.samples.at(-1);
            const actual = core.inspectSpatialExpeditions(state).missions.at(-1).position;
            assert.deepEqual(sample.witnesses['founder-1'], { x: actual.x, z: actual.z });
            assert.equal(sample.tick, state.time.winter * state.ticksPerWinter + state.time.tick);
            assert.ok(state.events.some(event => event.id === sample.sourceEventId && event.type === 'IslandMissionVisited'));
            if (mission.task.recon.samples.length === 2) { checkpoint = state; break; }
        }
    }
    assert.ok(checkpoint, 'At least two actual viewpoints have been reached before checkpointing');
    const continuous = core.applyCommand(checkpoint, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    const midReturn = core.applyCommand(core.reconstructState(core.serializeState(checkpoint)),
        { type: 'AdvanceTicks', ticks: 130 }, setup.context);
    const split = core.applyCommand(core.reconstructState(core.serializeState(midReturn)),
        { type: 'AdvanceTicks', ticks: 120 }, setup.context);
    assert.equal(core.serializeState(split), core.serializeState(continuous));
    const report = core.inspectSpatialExpeditions(split).missions.at(-1);
    const task = Object.values(split.world.spatial.missions).at(-1).task;
    assert.equal(report.status, 'Returned');
    assert.equal(report.result.discovery.observedAt, task.observation.observedAt);
    assert.ok(report.result.discovery.observedAt < report.returnedAt, 'Homecoming does not refresh remote knowledge');
    assert.equal(split.events.filter(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === report.id).length, 1);
});

test('recall on approach and after three viewpoints returns only along reached ground without publishing partial intel', () => {
    for (const sampleCount of [0, 3]) {
        const setup = fixture();
        let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
            target: { kind: 'site', siteId: 'recon-rival' }, mission: 'Recon' }, setup.context);
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3 }, setup.context);
        while (Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length < sampleCount)
            state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const beforeRecall = core.inspectSpatialExpeditions(state).missions.at(-1).position;
        const receipts = Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length;
        const foodBeforeRecall = state.stocks.food;
        state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
        const turning = core.inspectSpatialExpeditions(state).missions.at(-1).position;
        assert.equal(turning.x, beforeRecall.x);
        assert.equal(turning.z, beforeRecall.z);
        assert.equal(state.stocks.food, foodBeforeRecall, 'Recall gives no refund');
        state = core.applyCommand(core.reconstructState(core.serializeState(state)),
            { type: 'AdvanceTicks', ticks: 250 }, setup.context);
        const mission = Object.values(state.world.spatial.missions).at(-1);
        const returned = core.inspectSpatialExpeditions(state).missions.at(-1);
        assert.equal(returned.status, 'Returned');
        assert.equal(returned.outcome, 'Cancelled');
        assert.equal(returned.result.discovery, null);
        assert.equal(mission.task.recon.samples.length, receipts, 'Return does not reroll or add observations');
        assert.equal(core.inspectIslandMissions(state).sites[0].knowledge, null);
        const home = mission.homeOrigins['founder-1'];
        assert.equal(returned.position.x, home.x);
        assert.equal(returned.position.z, home.z);
    }
});

test('portable validation rejects altered Recon witness, progress and source-event references', () => {
    const setup = fixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'recon-rival' }, mission: 'Recon' }, setup.context);
    while (!Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const alterations = [
        recon => recon.reachedViewpoints++,
        recon => recon.samples[0].witnesses['founder-1'].x += 8,
        recon => recon.samples[0].sourceEventId = 'invented-observation',
        recon => recon.viewpoints[0].distance = -1,
        recon => recon.coverageDegrees = 720,
        recon => recon.viewpoints.at(-1).distance += 8,
        recon => recon.viewpoints[1].position.x += 8,
    ];
    for (const alter of alterations) {
        const copy = core.reconstructState(core.serializeState(state));
        alter(Object.values(copy.world.spatial.missions).at(-1).task.recon);
        assert.throws(() => core.reconstructState(JSON.stringify(copy)), /invalid.*Recon/i);
    }
});


test('optional Surveillance reuses a short observation arc and publishes only its dated returned evidence', () => {
    const setup = fixture(), target = { kind: 'site', siteId: 'recon-rival' };
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Recon' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    assert.equal(core.islandMissionOffer(state, 'group-1', target, 'Pillage', ['Food'], setup.context).foodCost, 5,
        'Recon remains sufficient; Surveillance is optional');
    const offer = core.islandMissionOffer(state, 'group-1', target, 'Surveillance', [], setup.context);
    assert.equal(offer.foodCost, 4);
    assert.equal(offer.duration, 400);
    assert.ok(offer.observationRoute.viewpointCount <= 3);
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target, mission: 'Surveillance' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 400 }, setup.context);
    const report = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(report.result.discovery.level, 'Surveyed');
    assert.equal(report.result.discovery.resistance, 'Medium');
    assert.ok(report.result.discovery.observedAt < report.returnedAt);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('adopting awareness preserves an already dispatched direct Recon route and its historical resolution', () => {
    const setup = fixture({ adopt: false, scout: false });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: { x: 112, z: 128 } }, mission: 'Recon' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, setup.context);
    const original = JSON.stringify(state.world.spatial);
    state = core.initializeTerritorialAwareness(state, setup.context, { ambientRadius: 0 });
    assert.equal(JSON.stringify(state.world.spatial), original);
    const mission = Object.values(state.world.spatial.missions).at(-1);
    assert.equal(mission.task.recon, undefined);
    assert.equal(mission.territoryVersion, undefined);
    state = core.applyCommand(core.reconstructState(core.serializeState(state)),
        { type: 'AdvanceTicks', ticks: 240 }, setup.context);
    const returned = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(returned.status, 'Returned');
    assert.equal(returned.result.success, true);
    assert.equal(returned.recon, undefined);
});

test('a newly blocked return is explicitly Stranded without a fabricated homecoming or new observation', () => {
    const setup = fixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'recon-rival' }, mission: 'Recon' }, setup.context);
    while (!Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    const mission = Object.values(state.world.spatial.missions).at(-1);
    const [a, b] = mission.memberRoutes['founder-1'];
    const length = Math.hypot(b.x - a.x, b.z - a.z), ratio = Math.min(.5, 2 / length);
    const barrier = { x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio };
    const context = { ...setup.context, exclusions: [{ minX: barrier.x - .1, maxX: barrier.x + .1,
        minZ: barrier.z - .1, maxZ: barrier.z + .1 }] };
    const before = core.inspectSpatialExpeditions(state).missions.at(-1).position;
    const samples = mission.task.recon.samples.length;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
    const stranded = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(stranded.status, 'Stranded');
    assert.equal(stranded.position.x, before.x);
    assert.equal(stranded.position.z, before.z);
    assert.equal(stranded.result, null);
    assert.equal(Object.values(state.world.spatial.missions).at(-1).task.recon.samples.length, samples);
    assert.equal(state.events.filter(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === stranded.id).length, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('reached Recon evidence retains the existing blueprint terrain label', () => {
    const setup = fixture({ biome: 'forest' });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: 'recon-rival' }, mission: 'Recon' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    assert.equal(core.inspectSpatialExpeditions(state).missions.at(-1).result.discovery.terrain, 'Forest');
});
