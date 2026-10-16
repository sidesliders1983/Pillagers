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
    // Route-topology corruption is rejected on import before a session can advance it.
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
test('a completed exploration keeps exact Food spending in the shared saved Clan Book', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession(); session.loadJSON(core.serializeState(campaign()));
    session.bindPhysicalWorld(world, context.worldId);
    session.command(dispatch);
    session.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = session.book.snapshot().chapters.at(-1);
    assert.equal(chapter.facts.ledger.food.residual, 0);
    assert.equal(chapter.facts.ledger.food.complete, true);
    assert.ok(chapter.facts.ledger.transactions.some(row => row.purpose === 'ExploreAreaDeparted' && row.units === 4));
    const restored = new GameplaySession(); restored.loadJSON(session.saveJSON());
    restored.bindPhysicalWorld(world, context.worldId);
    restored.book.restore(session.book.save(session.snapshot()), restored.snapshot());
    assert.deepEqual(restored.book.snapshot(), session.book.snapshot());
});

test('exploration groups start empty with numbered names and recruit selected residents through Core', () => {
    let state = campaign();
    state = core.applyCommand(state, { type: 'CreateExplorationGroup' }, context);
    state = core.applyCommand(state, { type: 'CreateExplorationGroup' }, context);
    assert.equal(core.inspectWorld(state).groups[1].name, 'Group 2');
    assert.equal(core.inspectWorld(state).groups[2].name, 'Group 3');
    assert.equal(core.inspectWorld(state).groups[1].status, 'Unavailable');
    assert.throws(() => core.exploreOffer(state, 'group-2', dispatch.target, context), /members/i);
    state = core.applyCommand(state, { type: 'SetExplorationMember', groupId: 'group-2',
        personaId: 'founder-3', included: true }, context);
    assert.deepEqual(state.world.groups['group-2'].memberIds, ['founder-3']);
    assert.equal(core.inspectWorld(state).groups[1].status, 'Ready');
    assert.throws(() => core.applyCommand(state, { type: 'SetExplorationMember', groupId: 'group-3',
        personaId: 'founder-3', included: true }, context), /eligible|group/i);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    state = core.applyCommand(state, { type: 'SetExplorationMember', groupId: 'group-2',
        personaId: 'founder-3', included: false }, context);
    assert.equal(core.inspectWorld(state).groups[1].status, 'Unavailable');
});


test('members depart from their own exact positions, wait for the group and recall along their own saved routes', () => {
    const { spatialMemberPosition } = loadTypeScript(new URL('../src/simulation/SpatialExpeditions.ts', import.meta.url));
    const origins = { 'founder-1': { x: 18, z: 65 }, 'founder-2': { x: 80, z: 32 } };
    let state = core.applyCommand(campaign(), { ...dispatch, origins }, context);
    let mission = state.world.spatial.missions['explore-1'];
    for (const [id, origin] of Object.entries(origins)) {
        const point = spatialMemberPosition(mission, id);
        assert.equal(point.x, origin.x); assert.equal(point.z, origin.z);
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
    mission = state.world.spatial.missions['explore-1'];
    for (const [id, origin] of Object.entries(origins)) {
        const point = spatialMemberPosition(mission, id);
        assert.ok(Math.hypot(point.x-origin.x, point.z-origin.z) <= 20.001);
        assert.ok(Math.hypot(point.x-origin.x, point.z-origin.z) > 10);
    }
    const saved = core.serializeState(state);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
    mission = state.world.spatial.missions['explore-1'];
    assert.equal(mission.status, 'Returned');
    for (const [id, origin] of Object.entries(origins)) {
        const point = spatialMemberPosition(mission, id);
        assert.equal(point.x, origin.x); assert.equal(point.z, origin.z);
    }
    let restored = core.reconstructState(saved);
    restored = core.applyCommand(restored, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    restored = core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 10 }, context);
    assert.deepEqual(restored, state);
    assert.throws(() => core.applyCommand(campaign(), { ...dispatch,
        origins: { ...origins, 'founder-1': { x: -100, z: 40 } } }, context), /departure|origin|island/i);
});


test('saved individual routes reject diagonal shortcuts and inconsistent journey lengths', () => {
    const state = core.applyCommand(campaign(), { ...dispatch, origins: {
        'founder-1': { x: 18, z: 65 }, 'founder-2': { x: 80, z: 32 } } }, context);
    const corrupt = structuredClone(state);
    corrupt.world.spatial.missions['explore-1'].memberRoutes['founder-2'][2].x += .5;
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /spatial|route/i);
});


test('touch destinations near a blocked cell resolve to nearby safe ground before confirmation', () => {
    const landscape = structuredClone(world);
    landscape.navigation.cells[8*33+27] = false; // The tap rounds onto an unavailable cell on otherwise dry ground.
    const bound = { ...context, world: landscape };
    const state = campaign(), saved = core.serializeState(state);
    const offer = core.exploreOffer(state, 'group-1', { x: 216, z: 64 }, bound);
    assert.deepEqual(offer.target, { x: 216, z: 56 });
    assert.equal(offer.adjusted, true);
    assert.equal(core.serializeState(state), saved, 'Preview neither spends Food nor reveals terrain');
    const dispatched = core.applyCommand(state, dispatch, bound);
    assert.deepEqual(dispatched.world.spatial.missions['explore-1'].target, offer.target);
    assert.deepEqual(dispatched.world.spatial.missions['explore-1'].route.at(-1), offer.target);
    assert.deepEqual(dispatched.discovery, state.discovery);
});


test('nearby target correction never jumps across a water channel or steep ridge', () => {
    for (const barrier of [-4, 8]) {
        const landscape = structuredClone(world);
        landscape.terrain = { bounds: { ...world.terrain.bounds }, spacing: 1, columns: 257, rows: 129,
            heights: Array(257*129).fill(0) };
        for (let x=215;x<=217;x++) landscape.terrain.heights[60*257+x]=barrier;
        // The only navigation candidate within 8m lies on the other side of the barrier.
        for (const [x,z] of [[216,64],[208,64],[224,64],[216,72]])
            landscape.navigation.cells[z/8*33+x/8]=false;
        const state=campaign(), saved=core.serializeState(state);
        assert.throws(() => core.exploreOffer(state,'group-1',{x:216,z:64},{...context,world:landscape}),
            /no safe destination nearby/i);
        assert.equal(core.serializeState(state),saved);
    }
});
