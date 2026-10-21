import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { marineWorld } from './fixtures/marine-world.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { WildlifePopulation } = load('../src/wildlife/WildlifePopulation.ts');
const { WildlifeHistoryIndex } = load('../src/lore/WildlifeHistory.ts');
const { projectPersonalHistory } = load('../src/lore/PersonalHistory.ts');
const { wildlifeAttentionAdapter } = load('../src/lore/WildlifeAttention.ts');
const world = marineWorld();
world.settlement.center = { x: -40, z: 330 };
world.settlement.harbor = { x: -80, z: 330 };
const context = { world, wildlifeWorld: world, worldId: 'marine-sightings-fixture' };
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks }, context);
const sightings = state => state.events.filter(event => event.type === 'WildlifeSighted'
    && event.details.speciesId === 'humpback-whale');

function watching() {
    let state = core.createCampaign(32, { initialFood: 5000, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state = core.initializeWildlifeSightings(state, world, context.worldId);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Whale watch',
        memberIds: ['founder-1', 'founder-2'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: -72, z: 338 } }, context);
    return advance(state, 35);
}

function surfaceFixture(state, stage = 'surface', species = 'humpback-whale') {
    const actor = state.wildlife.actors.find(actor => actor.id.startsWith(species + ':'));
    const population = new WildlifePopulation(world);
    const variant = population.actors.find(candidate => candidate.id === actor.id).variant;
    const routes = population.marineRoutes.get(actor.id);
    const routeIndex = routes.findIndex(route => route.from.z > 300 && Math.abs(route.to.x - route.from.x) < 1);
    assert.ok(routeIndex >= 0);
    const route = routes[routeIndex], orca = species === 'orca';
    const elapsed = stage === 'surface' ? orca ? 20 : 25 : stage === 'submerged' ? orca ? 48 : 60 : 0;
    actor.marine = { elapsed, cooldown: stage === 'absent' ? 100 : 0,
        cycle: 0, routeIndex, special: false };
    actor.state = stage;
    const progress = elapsed * variant.speed / route.length;
    actor.position = { x: route.from.x + (route.to.x - route.from.x) * progress,
        y: stage === 'surface' ? orca ? -.45 : -1.15 : orca ? -2.4 : -3.3,
        z: route.from.z + (route.to.z - route.from.z) * progress };
    return state;
}

test('surfaced whales produce one real group sighting, Clan Book discovery and individual witnesses', () => {
    const opening = surfaceFixture(watching());
    const state = advance(opening, 10);
    const found = sightings(state);
    assert.equal(found.length, 1);
    assert.equal(found[0].details.firstForClan, true);
    assert.match(wildlifeAttentionAdapter(found[0]).shortText, /Whale watch sighted a humpback whale/);
    assert.equal(wildlifeAttentionAdapter(found[0]).severity, 'noteworthy');
    assert.deepEqual(found[0].details.witnessPersonaIds, ['founder-1', 'founder-2']);
    const history = new WildlifeHistoryIndex();
    history.append(state.events, state.clan.id);
    assert.equal(history.species('humpback-whale').label, 'Humpback whale');
    assert.ok(history.group('group-1').some(record => record.eventId === found[0].id));
    for (const id of ['founder-1', 'founder-2']) assert.ok(projectPersonalHistory(state, id).records
        .some(record => record.sourceEventId === found[0].id));
    assert.ok(!projectPersonalHistory(state, 'founder-3').records
        .some(record => record.sourceEventId === found[0].id));
    assert.deepEqual(advance(core.reconstructState(core.serializeState(opening)), 10), state);
    let stepped = opening;
    for (let tick = 0; tick < 10; tick++) stepped = advance(stepped, 1);
    assert.deepEqual(stepped, state);
    assert.equal(sightings(advance(state, 40)).length, 1, 'Continued proximity does not spam discoveries');
});

test('absent and fully submerged whales produce no sighting even in explored nearby water', () => {
    for (const species of ['orca', 'humpback-whale']) for (const stage of ['absent', 'submerged']) {
        const state = advance(surfaceFixture(watching(), stage, species), 10);
        assert.equal(state.events.filter(event => event.type === 'WildlifeSighted'
            && event.details.speciesId === species).length, 0);
        assert.equal(state.wildlife.firstDiscoveries[species], undefined);
    }
});

test('orca sightings use the same first discovery, notification and real witness history', () => {
    const state = advance(surfaceFixture(watching(), 'surface', 'orca'), 10);
    const found = state.events.filter(event => event.type === 'WildlifeSighted' && event.details.speciesId === 'orca');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].details.witnessPersonaIds, ['founder-1', 'founder-2']);
    assert.equal(found[0].details.firstForClan, true);
    assert.match(wildlifeAttentionAdapter(found[0]).shortText, /sighted an orca/);
    const index = new WildlifeHistoryIndex();
    index.append(state.events, state.clan.id);
    assert.equal(index.species('orca').label, 'Orca');
    assert.ok(projectPersonalHistory(state, 'founder-1').records
        .some(record => record.sourceEventId === found[0].id));
});

test('old resident-only saves adopt future visits once without changing existing motion or history', () => {
    const state = watching();
    state.wildlife.version = 1;
    state.wildlife.actors = state.wildlife.actors.filter(actor => !actor.marine);
    const original = structuredClone(state);
    const restored = core.reconstructState(core.serializeState(state));
    const adopted = core.initializeWildlifeSightings(restored, world, context.worldId);
    assert.equal(adopted.wildlife.version, 2);
    assert.deepEqual(adopted.wildlife.actors.filter(actor => !actor.marine), original.wildlife.actors);
    assert.deepEqual(adopted.events, original.events);
    assert.deepEqual(adopted.rngState, original.rngState);
    assert.equal(adopted.wildlife.actors.filter(actor => actor.marine).length, 2);
    assert.deepEqual(core.initializeWildlifeSightings(adopted, world, context.worldId), adopted);
    assert.deepEqual(state, original, 'Upgrade does not mutate the input save');
});

test('invalid encounter clocks and states are rejected on save import', () => {
    const opening = surfaceFixture(watching());
    for (const corrupt of [actor => actor.marine.routeIndex = 7,
        actor => actor.marine.elapsed = -1, actor => actor.marine.cooldown = Infinity,
        actor => actor.marine.special = 'yes', actor => delete actor.marine]) {
        const state = structuredClone(opening);
        corrupt(state.wildlife.actors.find(actor => actor.marine));
        assert.throws(() => core.reconstructState(JSON.stringify(state)), /wildlife/);
    }
});
