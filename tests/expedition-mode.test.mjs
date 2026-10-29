import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const spatial = loadTypeScript(new URL('../src/simulation/SpatialExpeditions.ts', import.meta.url));
const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
    navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
    settlement: { center: { x: 16, z: 64 }, harbor: null }
};
const context = { world, worldId: 'expedition-mode-fixture' };
function campaign(members = ['founder-1', 'founder-2', 'founder-3'], landscape = world, initialFood = 500) {
    let state = core.createCampaign(32, { initialFood, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false });
    state = core.initializePhysicalDiscovery(state, landscape, context.worldId);
    return core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: members });
}
const start = { type: 'StartExpedition', groupId: 'group-1' };
const goal = { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } };

test('ordinary pack prices use actual crew size and two founders cannot depart on the original 15 Food', () => {
    for (const [members, foodCost] of [[['founder-1'], 8], [['founder-1', 'founder-2'], 16],
        [['founder-1', 'founder-2', 'founder-3', 'founder-4'], 32]]) {
        const state = campaign(members);
        assert.equal(core.startExpeditionOffer(state, 'group-1', context).foodCost, foodCost);
        const prepared = core.applyCommand(state, start, context);
        assert.equal(prepared.world.spatial.missions['explore-1'].provisions.testCapacity, undefined);
        assert.equal(prepared.world.spatial.missions['explore-1'].provisions.version, 2);
    }
    const poor = campaign(['founder-1', 'founder-2'], world, 15);
    const before = core.serializeState(poor);
    assert.throws(() => core.startExpeditionOffer(poor, 'group-1', context), /16 Food/);
    assert.throws(() => core.applyCommand(poor, start, context), /16 Food/);
    assert.equal(core.serializeState(poor), before);
});

test('paid historical Prepared packs retain two Food through load and travel; subsequent starts buy eight', async () => {
    const fixture = JSON.parse(await readFile(new URL('../docs/qa/explore-pack-231/legacy-prepared.json', import.meta.url), 'utf8'));
    let state = core.reconstructState(JSON.stringify(fixture.state));
    assert.deepEqual(state, fixture.state, 'Loading never refills or relabels an already paid pack');
    spatial.assertSpatialWorld(state, fixture.context);
    const walking = core.applyCommand(state, goal, fixture.context);
    const moved = core.applyCommand(walking, { type: 'AdvanceTicks', ticks: 20 }, fixture.context);
    assert.equal(core.inspectSpatialExpeditions(moved).missions[0].supplies.activeTicksRemaining, 480);
    assert.equal(moved.stocks.food, 494);
    assert.deepEqual(core.reconstructState(core.serializeState(moved)), moved);
    const qa = core.reconstructState(JSON.stringify(fixture.qaState));
    assert.deepEqual(qa, fixture.qaState, 'Historical explicit QA packs retain their recorded marker and spending');
    assert.equal(qa.world.spatial.missions['explore-2'].provisions.version, 1);
    assert.equal(qa.world.spatial.missions['explore-2'].provisions.foodPerMember, 10);
    const qaWalking = core.applyCommand(qa, goal, fixture.context);
    const qaMoved = core.applyCommand(qaWalking, { type: 'AdvanceTicks', ticks: 20 }, fixture.context);
    assert.equal(core.inspectSpatialExpeditions(qaMoved).missions[1].supplies.activeTicksRemaining, 2480);
    assert.deepEqual(core.reconstructState(core.serializeState(qaMoved)), qaMoved);
    state = core.applyCommand(state, { type: 'CancelExpedition', groupId: 'group-1' }, fixture.context);
    state = core.applyCommand(state, start, fixture.context);
    assert.equal(state.stocks.food, 470);
    assert.equal(state.world.spatial.missions['explore-1'].provisions.foodPerMember, 2);
    assert.equal(state.world.spatial.missions['explore-2'].provisions.foodPerMember, 8);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    for (const [version, foodPerMember, testCapacity] of [[1, 8, undefined], [2, 2, undefined],
        [2, 7, undefined], [3, 8, undefined], [2, 11, true], [2, 8, false]]) {
        const corrupt = structuredClone(state);
        Object.assign(corrupt.world.spatial.missions['explore-2'].provisions,
            { version, foodPerMember, testCapacity });
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /spatial|expedition/i);
    }
});

test('new expeditions take diagonal routes at the same speed and retain them through redirect, recall and save/load', () => {
    let state = core.applyCommand(campaign(['founder-1']), start, context);
    state = core.applyCommand(state, { ...goal, target: { x: 32, z: 80 } }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 8 }, context);
    const position = spatial.spatialMemberPosition(state.world.spatial.missions['explore-1'], 'founder-1');
    assert.ok(position.x > 16 && position.z > 64, 'An open diagonal target must advance in both axes');
    assert.ok(Math.abs(Math.hypot(position.x - 16, position.z - 64) - 16) < 1e-8,
        'Diagonal travel still covers two metres per tick');
    state = core.applyCommand(state, { ...goal, target: { x: 48, z: 96 } }, context);
    const saved = core.reconstructState(core.serializeState(state));
    spatial.assertSpatialWorld(saved, context);
    const returnHome = initial => core.applyCommand(core.applyCommand(initial,
        { type: 'RecallExpedition', groupId: 'group-1' }, context), { type: 'AdvanceTicks', ticks: 20 }, context);
    assert.deepEqual(returnHome(saved), returnHome(state));
    const home = spatial.spatialMemberPosition(returnHome(state).world.spatial.missions['explore-1'], 'founder-1');
    assert.ok(Math.hypot(home.x - 16, home.z - 64) < 1e-8);
});

test('an accepted route follows uphill corners without a false blocked-route return, including the way home', () => {
    const uphill = { ...world, terrain: { ...world.terrain, heights: world.terrain.heights.map((_, index) =>
        .6 * ((index % 33) * 8 + Math.floor(index / 33) * 8)) } };
    const bound = { ...context, world: uphill };
    let state = core.applyCommand(campaign(['founder-1'], uphill), start, bound);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 32, z: 80 },
        origins: { 'founder-1': { x: 17, z: 64 } } }, bound);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, bound);
    assert.equal(core.inspectSpatialExpeditions(state).missions[0].status, 'Exploring',
        'The committed cardinal route is safe even when one tick spans a corner');
    assert.equal(state.events.some(event => event.type === 'ExploreAreaReturnStarted'), false);
    const saved = core.reconstructState(core.serializeState(state));
    const returnHome = initial => core.applyCommand(core.applyCommand(initial,
        { type: 'RecallExpedition', groupId: 'group-1' }, bound), { type: 'AdvanceTicks', ticks: 20 }, bound);
    const returned = returnHome(state);
    assert.deepEqual(returnHome(saved), returned);
    assert.equal(core.inspectSpatialExpeditions(returned).missions[0].status, 'Returned');
    const home = spatial.spatialMemberPosition(returned.world.spatial.missions['explore-1'], 'founder-1');
    assert.deepEqual({ x: home.x, z: home.z }, { x: 17, z: 64 });
    assert.equal(home.moving, false);
});

test('diagonal journeys go around blocked corners and reject a saved shortcut through them', () => {
    const blocked = structuredClone(world);
    blocked.navigation.cells[8 * 33 + 3] = false; // (24, 64), beside the departure cell.
    const bound = { ...context, world: blocked };
    let state = core.applyCommand(campaign(['founder-1'], blocked), start, bound);
    state = core.applyCommand(state, { ...goal, target: { x: 32, z: 80 } }, bound);
    const mission = state.world.spatial.missions['explore-1'];
    assert.ok(mission.distance > Math.hypot(16, 16), 'The blocked corner requires a real detour');
    spatial.assertSpatialWorld(core.reconstructState(core.serializeState(state)), bound);
    const corrupt = structuredClone(state);
    corrupt.world.spatial.missions['explore-1'].memberRoutes['founder-1'] =
        [{ x: 16, z: 64 }, { x: 24, z: 72 }, { x: 32, z: 80 }];
    assert.throws(() => spatial.assertSpatialWorld(corrupt, bound), /diagonal walkability/);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, bound);
    assert.equal(core.inspectSpatialExpeditions(state).missions[0].status, 'Exploring');
});

test('a test pack quotes and pays the chosen Food per member once and retains its extended endurance after save/load', () => {
    const initial = campaign();
    const offer = core.startExpeditionOffer(initial, 'group-1', context, 8);
    assert.equal(offer.foodPerMember, 8);
    assert.equal(offer.foodCost, 24);
    assert.equal(offer.activeTicks, 2000);
    const prepared = core.applyCommand(initial, { ...start, testFoodPerMember: 8 }, context);
    assert.equal(prepared.stocks.food, 476);
    const walking = core.applyCommand(prepared, goal, context);
    const exploring = core.applyCommand(walking, { type: 'AdvanceTicks', ticks: 600 }, context);
    const mission = core.inspectSpatialExpeditions(exploring).missions[0];
    assert.equal(mission.status, 'Exploring', 'The chosen pack must last beyond the historical 500-tick allowance');
    assert.equal(mission.supplies.activeTicksRemaining, 1400);
    assert.equal(mission.supplies.testCapacity, true);
    const restored = core.reconstructState(core.serializeState(exploring));
    assert.deepEqual(core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 20 }, context),
        core.applyCommand(exploring, { type: 'AdvanceTicks', ticks: 20 }, context));
    assert.deepEqual(restored.events.filter(event => event.type === 'ExploreAreaPrepared')
        .map(event => event.details.foodCost), [24], 'The chosen pack is purchased once');
});

test('test packs reject more than ten Food per member and invalid or unaffordable choices atomically', () => {
    const state = campaign();
    const saved = core.serializeState(state);
    for (const testFoodPerMember of [11, 0, -1, 1.5, NaN, Infinity, '8', null]) {
        assert.throws(() => core.applyCommand(state, { ...start, testFoodPerMember }, context), /whole number.*1.*10/i);
        assert.equal(core.serializeState(state), saved);
    }
    const poor = structuredClone(state);
    poor.stocks.food = 23;
    assert.throws(() => core.applyCommand(poor, { ...start, testFoodPerMember: 8 }, context), /24 Food/);
    assert.equal(poor.stocks.food, 23);
});

test('exploration supplies exclude the protected homeward allowance without changing saved rations', () => {
    let state = core.applyCommand(campaign(['founder-1']), start, context);
    state = core.applyCommand(state, goal, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, context);
    const saved = core.serializeState(state);
    const supplies = core.inspectSpatialExpeditions(state).missions[0].supplies;
    assert.equal(supplies.activeTicksRemaining, 1980);
    assert.equal(supplies.returnTicksReserved, 22, '20 ticks home plus the existing two-tick safety margin');
    assert.equal(supplies.explorationTicksRemaining, 1958);
    assert.equal(core.serializeState(state), saved, 'Projection never consumes or stores derived supplies');
    assert.deepEqual(core.inspectSpatialExpeditions(core.reconstructState(saved)).missions[0].supplies, supplies);
});

test('Start Expedition spends 24 Food for three residents once, stages without eating and cancellation never refunds confirmed spending', () => {
    const state = campaign(), saved = core.serializeState(state);
    const offer = core.startExpeditionOffer(state, 'group-1', context);
    assert.equal(offer.foodPerMember, 8);
    assert.equal(offer.foodCost, 24);
    assert.equal(offer.activeTicks, 2000);
    const prepared = core.applyCommand(state, start, context);
    assert.equal(prepared.stocks.food, 476);
    assert.equal(core.inspectSpatialExpeditions(prepared).missions[0].status, 'Prepared');
    assert.equal(spatial.expeditionModeActive(prepared), true);
    assert.equal(core.serializeState(state), saved);
    assert.throws(() => core.applyCommand(prepared, start, context), /already|active|mission/i);
    const waiting = core.applyCommand(prepared, { type: 'AdvanceTicks', ticks: 60 }, context);
    assert.deepEqual(waiting.world.spatial.missions['explore-1'].provisions,
        prepared.world.spatial.missions['explore-1'].provisions, 'Waiting at home does not eat carried rations');
    const restored = core.reconstructState(core.serializeState(waiting));
    const cancelled = core.applyCommand(restored, { type: 'CancelExpedition', groupId: 'group-1' }, context);
    assert.equal(cancelled.stocks.food, waiting.stocks.food);
    assert.equal(spatial.expeditionModeActive(cancelled), false);
    assert.throws(() => core.applyCommand(cancelled, { type: 'CancelExpedition', groupId: 'group-1' }, context), /prepared|active/i);
    const poor = structuredClone(state); poor.stocks.food = 23;
    const poorSaved = core.serializeState(poor);
    assert.throws(() => core.applyCommand(poor, start, context), /24 Food/i);
    assert.equal(core.serializeState(poor), poorSaved);
});

test('prepared groups depart from actual origins and redirects/recall reuse their reserved pack without new charges', () => {
    const prepared = core.applyCommand(campaign(), start, context);
    const offer = core.exploreOffer(prepared, 'group-1', goal.target, context);
    assert.equal(offer.foodCost, 0, 'Destinations have no separate Food quote');
    assert.equal('plannedTicks' in offer, false);
    const origins = { 'founder-1': { x: 18, z: 65 }, 'founder-2': { x: 24, z: 64 }, 'founder-3': { x: 32, z: 64 } };
    let state = core.applyCommand(prepared, { ...goal, origins }, context);
    assert.equal(state.stocks.food, 476);
    assert.deepEqual(state.world.spatial.missions['explore-1'].memberRoutes['founder-1'][0], origins['founder-1']);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
    const before = core.serializeState(state), supplies = structuredClone(state.world.spatial.missions['explore-1'].provisions);
    const position = spatial.spatialMemberPosition(state.world.spatial.missions['explore-1'], 'founder-1');
    assert.throws(() => core.applyCommand(state, { ...goal, target: { x: 9999, z: 0 } }, context), /land|island/i);
    assert.equal(core.serializeState(state), before);
    const awayWithNoHomeFood = structuredClone(state); awayWithNoHomeFood.stocks.food = 0;
    const redirected = core.applyCommand(awayWithNoHomeFood, { ...goal, target: { x: 160, z: 96 } }, context);
    assert.equal(redirected.stocks.food, 0, 'An away group needs no new home Food to redirect');
    assert.deepEqual(redirected.world.spatial.missions['explore-1'].provisions, supplies);
    const moved = spatial.spatialMemberPosition(redirected.world.spatial.missions['explore-1'], 'founder-1');
    assert.equal(moved.x, position.x); assert.equal(moved.z, position.z);
    const recalled = core.applyCommand(redirected, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.equal(recalled.stocks.food, 0);
    assert.deepEqual(recalled.world.spatial.missions['explore-1'].provisions, supplies);
    spatial.assertSpatialWorld(core.reconstructState(core.serializeState(recalled)), context);
    assert.throws(() => core.applyCommand(campaign(), goal, context), /Start Expedition/i);
});

test('early physical homecoming discards unused Food without refunds or a second stock charge', () => {
    let state = core.applyCommand(campaign(), start, context);
    state = core.applyCommand(state, goal, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, context);
    const pack = core.inspectSpatialExpeditions(state).missions[0].supplies;
    assert.equal(pack.activeTicksRemaining, 1980);
    assert.equal(pack.unopenedFood, 21);
    assert.equal(state.stocks.food, 476, 'Eating uses carried Food, not home stock');
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    const halfway = core.reconstructState(core.serializeState(state));
    const returned = core.applyCommand(halfway, { type: 'AdvanceTicks', ticks: 20 }, context);
    assert.equal(returned.world.spatial.missions['explore-1'].status, 'Returned');
    assert.equal(returned.stocks.food, 476, 'The confirmed 24-Food cost is final, including unused rations');
    const discarded = returned.events.filter(e => e.type === 'ExploreAreaSuppliesDiscarded');
    assert.equal(discarded.length, 1); assert.equal(discarded[0].details.units, 21);
    assert.equal(returned.events.some(e => e.type === 'ExploreAreaSuppliesReturned'), false);
    assert.equal(returned.events.filter(e => e.type === 'ExploreAreaSuppliesConsumed')
        .reduce((sum, e) => sum + e.details.units, 0), 3);
    const later = core.applyCommand(returned, { type: 'AdvanceTicks', ticks: 10 }, context);
    assert.equal(later.stocks.food, 476);
});

test('a short test pack triggers conservative return on the reached trail before rations run out', () => {
    const wideBounds = { ...bounds, maxX: 1024 };
    const wideWorld = { ...world,
        terrain: { bounds: wideBounds, spacing: 8, columns: 129, rows: 17, heights: Array(2193).fill(0) },
        navigation: { bounds: wideBounds, spacing: 8, columns: 129, rows: 17, cells: Array(2193).fill(true) } };
    const bound = { ...context, world: wideWorld };
    let state = core.applyCommand(campaign(['founder-1'], wideWorld), { ...start, testFoodPerMember: 2 }, bound);
    state = core.applyCommand(state, { ...goal, target: { x: 904, z: 64 } }, bound);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 300 }, bound);
    const mission = state.world.spatial.missions['explore-1'];
    assert.equal(mission.status, 'Returning');
    const returning = core.inspectSpatialExpeditions(state).missions[0];
    assert.equal(returning.returnReason, 'low-supplies');
    assert.equal(returning.supplies.explorationTicksRemaining, 0,
        'Protected homeward supplies must not appear as available exploration time');
    assert.ok(spatial.spatialMemberPosition(mission, 'founder-1').x < 904, 'An unaffordable distance is never fabricated');
    assert.ok(core.inspectSpatialExpeditions(state).missions[0].supplies.activeTicksRemaining >=
        Math.ceil(mission.travelled / 2), 'Remaining endurance covers the confirmed return');
    const saved = core.reconstructState(core.serializeState(state));
    spatial.assertSpatialWorld(saved, bound);
    const returned = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 200 }, bound);
    assert.deepEqual(core.applyCommand(saved, { type: 'AdvanceTicks', ticks: 200 }, bound), returned);
    assert.equal(returned.world.spatial.missions['explore-1'].status, 'Returned');
    assert.equal(core.inspectSpatialExpeditions(returned).missions[0].supplies.consumedFood, 2);
    assert.equal(core.inspectSpatialExpeditions(returned).missions[0].supplies.discardedFood, 0);
    assert.equal(returned.events.filter(e => e.type === 'ExploreAreaPrepared').reduce((sum, e) => sum + e.details.foodCost, 0), 2);
    assert.equal(spatial.spatialMemberPosition(returned.world.spatial.missions['explore-1'], 'founder-1').x, 16);
});

test('an actually blocked return is terminal and factual, without a teleport, refund or restored work availability', () => {
    let state = core.applyCommand(campaign(['founder-1']), start, context);
    state = core.applyCommand(state, goal, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    const blocked = structuredClone(world);
    blocked.navigation.cells[8 * 33 + 3] = false;
    const result = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, { ...context, world: blocked });
    assert.equal(result.world.spatial.missions['explore-1'].status, 'Stranded');
    assert.equal(spatial.expeditionModeActive(result), false);
    assert.equal(result.stocks.food, 492);
    assert.equal(core.inspectWork(result, 'founder-1').reason, 'expedition');
    assert.ok(result.events.some(e => e.type === 'ExploreAreaStranded'));
    assert.equal(result.events.some(e => e.type === 'ExploreAreaReturned'), false);
    assert.deepEqual(core.reconstructState(core.serializeState(result)), result);
});

test('Expedition Mode preserves the normal session preference and pause across overlapping groups and saved staging', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(campaign())); session.bindPhysicalWorld(world, context.worldId);
    session.setMinutesPerWinter(5);
    session.command(start);
    assert.equal(session.running, false, 'Starting never unpauses');
    assert.equal(session.expeditionMode, true);
    assert.equal(session.effectiveMinutesPerWinter, 10);
    assert.equal(session.pacing().minutesPerWinter, 5, 'Saved preference is not overwritten by the override');
    const paused = session.saveJSON(); session.elapse(120000); assert.equal(session.saveJSON(), paused);
    session.setRunning(true); session.elapse(600);
    assert.equal(session.snapshot().time.tick, 1);
    session.setRunning(false);
    session.command({ type: 'CreateExpeditionGroup', name: 'Group 2', memberIds: ['founder-4'] });
    session.command({ type: 'StartExpedition', groupId: 'group-2' });
    session.command({ type: 'CancelExpedition', groupId: 'group-1' });
    assert.equal(session.expeditionMode, true);
    const restored = new GameplaySession(); restored.loadJSON(session.saveJSON());
    restored.restorePacing({ ...session.pacing(), running: false }); restored.bindPhysicalWorld(world, context.worldId);
    assert.equal(restored.effectiveMinutesPerWinter, 10);
    restored.command({ type: 'CancelExpedition', groupId: 'group-2' });
    assert.equal(restored.effectiveMinutesPerWinter, 5);
    assert.equal(restored.running, false);
    restored.setRunning(true); restored.elapse(300);
    assert.equal(restored.snapshot().time.tick, 2, 'The restored 5-minute pace applies immediately');
});

test('the Clan Book reconciles upfront spending, carried consumption and discarded Food without double spending', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession(); session.loadJSON(core.serializeState(campaign()));
    session.bindPhysicalWorld(world, context.worldId);
    session.command(start); session.command(goal); session.command({ type: 'AdvanceTicks', ticks: 20 });
    session.command({ type: 'RecallExpedition', groupId: 'group-1' });
    session.command({ type: 'AdvanceTicks', ticks: 4980 });
    const facts = session.book.snapshot().chapters.at(-1).facts;
    assert.equal(facts.ledger.food.residual, 0);
    assert.equal(facts.ledger.food.complete, true);
    assert.equal(facts.ledger.provisions.reserved, 24);
    assert.equal(facts.ledger.provisions.consumed, 3);
    assert.equal(facts.ledger.provisions.discarded, 21);
    assert.equal(facts.ledger.provisions.lost, 0);
    const returned = core.reconstructState(session.saveJSON());
    assert.deepEqual(returned, session.snapshot());
});

test('prepared cancellation creates no fictitious journey and terminal losses cannot recover carried Food', () => {
    const prepared = core.applyCommand(campaign(['founder-1']), start, context);
    const cancelled = core.applyCommand(prepared, { type: 'CancelExpedition', groupId: 'group-1' }, context);
    assert.equal(cancelled.events.some(e => e.type === 'ExploreAreaReturned'), false);
    assert.equal(cancelled.events.some(e => e.type === 'ExploreAreaCancelled'), true);
    let nearYear = core.applyCommand(campaign(['founder-1']), { type: 'AdvanceTicks', ticks: 990 }, context);
    nearYear.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    nearYear = core.applyCommand(nearYear, start, context);
    nearYear = core.applyCommand(nearYear, goal, context);
    const lost = core.applyCommand(nearYear, { type: 'AdvanceTicks', ticks: 10 }, context);
    assert.equal(spatial.expeditionModeActive(lost), false);
    const supplies = core.inspectSpatialExpeditions(lost).missions[0].supplies;
    assert.equal(supplies.consumedFood, 1);
    assert.equal(supplies.lostFood, 7);
    assert.equal(supplies.discardedFood, 0);
    const corrupt = structuredClone(prepared);
    corrupt.world.spatial.missions['explore-1'].provisions.members['founder-1'].food++;
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /spatial|expedition/i);
});

test('physical return keeps the override for another prepared group and restores normal pace inside an elapsed batch', () => {
    const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
    const session = new GameplaySession(); session.loadJSON(core.serializeState(campaign(['founder-1'])));
    session.bindPhysicalWorld(world, context.worldId); session.setMinutesPerWinter(5);
    session.command(start);
    session.command({ ...goal, target: { x: 40, z: 64 } });
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    session.command({ type: 'RecallExpedition', groupId: 'group-1' });
    session.setRunning(true); session.elapse(900);
    assert.equal(session.snapshot().time.tick, 3, '600 ms returns home, then the normal 300 ms tick applies');
    assert.equal(session.expeditionMode, false);
    assert.equal(session.effectiveMinutesPerWinter, 5);
    assert.equal(session.snapshot().stocks.food, 492, 'The unopened remainder is never refunded');
    session.setRunning(false);
    session.command({ type: 'CreateExpeditionGroup', name: 'Group 2', memberIds: ['founder-2'] });
    session.command({ type: 'StartExpedition', groupId: 'group-2' });
    session.command(start);
    session.command({ ...goal, target: { x: 40, z: 64 } });
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    session.command({ type: 'RecallExpedition', groupId: 'group-1' });
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    assert.equal(session.expeditionMode, true, 'Another prepared group keeps the mode after the physical return');
    session.command({ type: 'CancelExpedition', groupId: 'group-2' });
    assert.equal(session.effectiveMinutesPerWinter, 5);
    assert.equal(session.running, false);
});


test('departed members produce neither Food nor Materials until their actual homecoming', () => {
    const members = ['founder-1', 'founder-2'];
    let state = campaign(members);
    for (const [index, personaId] of members.entries())
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId,
            occupation: index === 0 ? 'fisher' : 'woodworker' }, context);
    state = core.applyCommand(state, start, context);
    const preparedFrom = state.events.length;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 }, context);
    assert.ok(state.events.slice(preparedFrom).some(event => event.type === 'ResourceProduced' &&
        members.includes(event.personaId)), 'Prepared members still work at home');
    const progress = members.map(id => state.personas[id].workProgress);
    state = core.applyCommand(state, { ...goal, target: { x: 96, z: 64 } }, context);
    const departure = state.events.length;
    const advanceAway = ticks => {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks }, context);
        assert.deepEqual(members.map(id => state.personas[id].workProgress), progress,
            'Away members cannot accumulate work progress toward a later award');
        assert.deepEqual(state.events.slice(departure).filter(event => event.type === 'ResourceProduced' &&
            members.includes(event.personaId)), []);
    };
    assert.equal(state.world.spatial.missions['explore-1'].status, 'Traveling');
    advanceAway(40);
    assert.equal(state.world.spatial.missions['explore-1'].status, 'Exploring');
    advanceAway(50);
    state = core.reconstructState(core.serializeState(state));
    assert.deepEqual(members.map(id => core.inspectWork(state, id).reason), ['expedition', 'expedition']);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.equal(state.world.spatial.missions['explore-1'].status, 'Returning');
    advanceAway(40);
    assert.equal(state.world.spatial.missions['explore-1'].status, 'Returned');
    const homecoming = state.events.length;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 }, context);
    const resumed = state.events.slice(homecoming).filter(event => event.type === 'ResourceProduced');
    assert.ok(resumed.some(event => event.personaId === members[0] && event.details.resource === 'food'));
    assert.ok(resumed.some(event => event.personaId === members[1] && event.details.resource === 'materials'));
});


test('returned expedition groups disband without deleting their history or reusing their identity', () => {
    let state = campaign(['founder-1', 'founder-2']);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Other crew', memberIds: ['founder-3'] });
    state = core.applyCommand(state, start, context);
    const packed = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, { type: 'DisbandExpeditionGroup', groupId: 'group-1' }, context), /home|mission|active/i);
    assert.equal(core.serializeState(state), packed);
    state = core.applyCommand(state, goal, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    assert.throws(() => core.applyCommand(state, { type: 'DisbandExpeditionGroup', groupId: 'group-1' }, context), /home|mission|active/i);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 30 }, context);
    const mission = structuredClone(state.world.spatial.missions['explore-1']);
    assert.equal(mission.status, 'Returned');
    const before = core.serializeState(state), other = structuredClone(state.world.groups['group-2']);
    const disbanded = core.applyCommand(state, { type: 'DisbandExpeditionGroup', groupId: 'group-1' }, context);
    assert.equal(disbanded.world.groups['group-1'], undefined);
    assert.deepEqual(disbanded.world.groups['group-2'], other);
    assert.deepEqual(disbanded.world.spatial.missions['explore-1'], mission);
    assert.deepEqual(disbanded.stocks, state.stocks);
    assert.equal(disbanded.rngState, state.rngState);
    assert.equal(disbanded.events.at(-1).type, 'ExpeditionGroupDisbanded');
    assert.equal(core.serializeState(state), before);
    assert.deepEqual(core.applyCommand(disbanded, { type: 'DisbandExpeditionGroup', groupId: 'group-1' }), disbanded);
    const restored = core.reconstructState(core.serializeState(disbanded));
    spatial.assertSpatialWorld(restored, context);
    let next = core.applyCommand(restored, { type: 'CreateExplorationGroup' }, context);
    assert.ok(next.world.groups['group-3']);
    assert.deepEqual(next.world.groups['group-2'], other);
    next = core.applyCommand(next, { type: 'SetExplorationMember', groupId: 'group-3', personaId: 'founder-1', included: true }, context);
    assert.deepEqual(next.world.groups['group-3'].memberIds, ['founder-1']);
    assert.deepEqual(core.reconstructState(core.serializeState(next)), next);
});
