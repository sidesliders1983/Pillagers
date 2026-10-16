import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const discovery = loadTypeScript(new URL('../src/simulation/ClanDiscovery.ts', import.meta.url));
const world = {
    waterLevel: -1,
    terrain: { bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 128 }, spacing: 8,
        columns: 33, rows: 17, heights: Array(561).fill(0) },
    navigation: { bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 128 }, spacing: 8,
        columns: 33, rows: 17, cells: Array(561).fill(true) },
    settlement: { center: { x: 16, z: 64 }, harbor: null },
};
const context = { world, worldId: 'spatial-fixture-v1' };
function campaign() {
    let state = core.createCampaign(32, { initialFood: 500, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    return core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coast scouts',
        memberIds: Object.keys(state.personas).slice(0, 2) });
}
const dispatch = { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } };

test('a physical group pays whole-trip provisions without revealing its destination or duplicating members', () => {
    const state = campaign();
    const before = core.serializeState(state);
    const offer = core.exploreOffer(state, dispatch.groupId, dispatch.target, context);
    assert.equal(offer.plannedTicks, 225);
    assert.equal(offer.foodCost, 4);
    assert.equal('route' in offer, false, 'An offer does not expose unknown route geometry');
    const away = core.applyCommand(state, dispatch, context);
    assert.equal(away.stocks.food, 496);
    assert.deepEqual(away.discovery, state.discovery, 'Dispatch must not reveal a planned corridor');
    assert.equal(core.inspectWork(away, 'founder-1').reason, 'expedition');
    assert.equal(core.inspectWorld(away).groups[0].status, 'Traveling');
    assert.equal(core.serializeState(state), before, 'Commands keep their input immutable');
    assert.throws(() => core.applyCommand(away, { type: 'EditExpeditionGroup', groupId: 'group-1',
        name: 'Changed', memberIds: ['founder-1'] }), /mission/i);
});
test('confirmed ticks reveal gradually and a saved journey returns identically without a renderer', () => {
    const initial = core.applyCommand(campaign(), dispatch, context);
    const targetKnowledge = state => discovery.discoveryAt(
        discovery.inspectClanDiscovery(state.discovery, state.clan.id), 216, 64);
    assert.equal(targetKnowledge(initial), 'unknown');
    const walking = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 30 }, context);
    assert.equal(targetKnowledge(walking), 'unknown');
    assert.notDeepEqual(walking.discovery, initial.discovery);
    const mission = core.inspectSpatialExpeditions(walking).missions[0];
    assert.equal(mission.position.x, 76);
    assert.equal(mission.position.z, 64);
    assert.equal(mission.status, 'Traveling');
    const arrived = core.applyCommand(walking, { type: 'AdvanceTicks', ticks: 70 }, context);
    assert.equal(core.inspectSpatialExpeditions(arrived).missions[0].status, 'Exploring');
    assert.equal(targetKnowledge(arrived), 'visible');
    const complete = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 225 }, context);
    const resumed = core.applyCommand(core.reconstructState(core.serializeState(walking)),
        { type: 'AdvanceTicks', ticks: 195 }, context);
    assert.deepEqual(resumed, complete);
    assert.equal(core.inspectSpatialExpeditions(complete).missions[0].outcome, 'Completed');
    assert.equal(core.inspectWorld(complete).groups[0].status, 'Ready');
    assert.equal(targetKnowledge(complete), 'mapped');
    assert.equal(complete.events.filter(e => e.type === 'ExploreAreaReturned').length, 1);
    assert.throws(() => core.applyCommand(walking, { type: 'AdvanceTicks', ticks: 1 }), /bound|island/i);
});
test('recall walks back without refund, while bad destinations and corrupt journeys are rejected atomically', () => {
    const initial = campaign();
    const badWorld = structuredClone(world);
    for (let row = 0; row < 17; row++) badWorld.navigation.cells[row*33+16] = false;
    const blocked = { ...context, world: badWorld };
    const saved = core.serializeState(initial);
    assert.throws(() => core.applyCommand(initial, dispatch, blocked), /route|destination/i);
    assert.equal(core.serializeState(initial), saved);
    let walking = core.applyCommand(initial, dispatch, context);
    walking = core.applyCommand(walking, { type: 'AdvanceTicks', ticks: 30 }, context);
    const food = walking.stocks.food, explored = walking.discovery.clans[walking.clan.id].explored;
    const recalled = core.applyCommand(walking, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.equal(core.inspectSpatialExpeditions(recalled).missions[0].status, 'Returning');
    assert.equal(recalled.stocks.food, food);
    const returned = core.applyCommand(recalled, { type: 'AdvanceTicks', ticks: 30 }, context);
    assert.equal(core.inspectSpatialExpeditions(returned).missions[0].outcome, 'Cancelled');
    assert.equal(returned.discovery.clans[returned.clan.id].explored, explored);
    for (const alter of [
        state => state.world.spatial.version = 9,
        state => state.world.spatial.worldId = 'another-island',
        state => state.world.spatial.policy.metresPerTick = 0,
        state => state.world.spatial.missions['explore-1'].travelled = 999999,
        state => state.world.spatial.missions['explore-1'].route[1].x = NaN,
        state => state.world.spatial.missions['explore-1'].updatedAt += 1000,
    ]) {
        const corrupt = structuredClone(walking); alter(corrupt);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /spatial|expedition/i);
    }
});
test('the shared session binds saved geography for pacing and rejects another island before committing', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(campaign()));
    session.bindPhysicalWorld(world, context.worldId);
    session.command(dispatch);
    session.setRunning(true);
    session.elapse(900);
    assert.equal(core.inspectSpatialExpeditions(session.snapshot()).missions[0].position.x, 26);
    const checkpoint = session.saveJSON();
    const restored = new GameplaySession();
    restored.loadJSON(checkpoint);
    assert.throws(() => restored.bindPhysicalWorld(world, 'wrong-island'), /world/i);
    assert.equal(restored.saveJSON(), checkpoint);
    restored.bindPhysicalWorld(world, context.worldId);
    restored.command({ type: 'AdvanceTicks', ticks: 20 });
    session.command({ type: 'AdvanceTicks', ticks: 20 });
    assert.equal(restored.saveJSON(), session.saveJSON());
});
test('land parties cannot cross canonical water or cliffs, and real deaths stop a journey without resurrection', () => {
    const initial = campaign();
    for (const obstacle of ['water', 'cliff']) {
        const blockedWorld = structuredClone(world);
        for (let row = 0; row < 17; row++) blockedWorld.terrain.heights[row*33+16] = obstacle === 'water' ? -3 : 30;
        assert.throws(() => core.applyCommand(initial, dispatch, { ...context, world: blockedWorld }), /route|destination/i);
    }
    const tampered = core.applyCommand(initial, dispatch, context);
    tampered.world.spatial.missions['explore-1'].route[1].x += 1;
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    // Internal length corruption is rejected on import before a session can advance it.
    assert.throws(() => new GameplaySession().loadJSON(JSON.stringify(tampered)), /spatial/i);
    let nearWinter = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 990 }, context);
    nearWinter.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    const departed = core.applyCommand(nearWinter, dispatch, context);
    const after = core.applyCommand(departed, { type: 'AdvanceTicks', ticks: 10 }, context);
    assert.equal(core.inspectSpatialExpeditions(after).missions[0].outcome, 'Lost');
    assert.ok(after.world.spatial.missions['explore-1'].memberIds.every(id => after.personas[id].deathWinter === 801));
    assert.deepEqual(core.reconstructState(core.serializeState(after)), after);
});
test('physical routing respects reserved homes and the middle-place footprint without flattening terrain', () => {
    const bound = { ...context, exclusions: [{ minX: 80, maxX: 120, minZ: 56, maxZ: 72 }] };
    const initial = campaign(), heights = [...world.terrain.heights];
    const away = core.applyCommand(initial, dispatch, bound);
    const route = away.world.spatial.missions['explore-1'].route;
    assert.ok(route.some(point => point.z < 56 || point.z > 72));
    assert.ok(route.every(point => point.x < 80 || point.x > 120 || point.z < 56 || point.z > 72));
    assert.deepEqual(world.terrain.heights, heights);
});