import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 352, z: 128 },
        bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 16384 }
};
const worldId = 'island-clans-fixture';

test('a fresh physical campaign binds exactly one real rival before discovery without changing the player RNG or stocks', () => {
    const initial = core.createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
    const before = core.serializeState(initial);
    const state = core.initializeIslandClans(initial, world, worldId);
    assert.equal(state.world.version, 2);
    assert.deepEqual(Object.keys(state.world.targetClans), ['island-rival']);
    assert.deepEqual(state.world.island, { version: 1, worldId, siteId: 'rival-pocket-1',
        clanId: 'island-rival', foundedAt: 800500 });
    const rival = state.world.targetClans['island-rival'];
    assert.equal(rival.clan.id, 'island-rival');
    assert.equal(rival.world, undefined, 'The target uses the existing domestic Core, without a nested world');
    assert.equal(Object.keys(rival.personas).length, 10);
    assert.equal(Object.keys(rival.landing.cattle).length, 3);
    assert.ok(Object.keys(rival.personas).every(id => id.startsWith('island-rival:')));
    assert.deepEqual(rival.time, state.time);
    assert.notEqual(rival.seed, state.seed);
    assert.equal(state.rngState, initial.rngState);
    assert.deepEqual(state.stocks, initial.stocks);
    assert.deepEqual(state.personas, initial.personas);
    assert.equal(core.serializeState(initial), before, 'Binding is atomic and does not mutate the input');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    assert.deepEqual(core.initializeIslandClans(state, world, worldId), state, 'Binding is idempotent, never respawns');
    assert.deepEqual(core.inspectWorld(state).regions, [], 'Physical sites cannot masquerade as directional legacy regions');
    assert.equal(JSON.stringify(core.inspectWorld(state)).includes('island-rival'), false, 'Unknown rival identity stays private');
});


test('the unseen rival advances through the same domestic Core with independent entropy and exact save/replay', () => {
    const state = core.initializeIslandClans(core.createCampaign(91), world, worldId);
    const before = state.world.targetClans['island-rival'];
    const expected = core.applyCommand(before, { type: 'AdvanceTicks', ticks: 1200 });
    const advanced = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1200 });
    assert.deepEqual(advanced.world.targetClans['island-rival'], expected);
    assert.notDeepEqual(expected.stocks, before.stocks);
    assert.ok(expected.events.some(event => event.type === 'ResourceProduced'));
    const resumed = core.reconstructState(core.serializeState(core.applyCommand(state,
        { type: 'AdvanceTicks', ticks: 417 })));
    assert.deepEqual(core.applyCommand(resumed, { type: 'AdvanceTicks', ticks: 783 }), advanced);
    const legacy = core.applyCommand(core.createCampaign(91), { type: 'AdvanceTicks', ticks: 1200 });
    for (const field of ['time', 'rngState', 'stocks', 'personas', 'households', 'events'])
        assert.deepEqual(advanced[field], legacy[field], 'CPU geography cannot affect player ' + field);
    const privateView = JSON.stringify(core.inspectWorld(advanced));
    assert.equal(privateView.includes(before.clan.name), false);
    assert.equal(privateView.includes(Object.values(before.personas)[0].name), false);
});


test('the real rival founding population fits its reserved site with tents, livestock and a campfire, without authored demo houses', () => {
    const { projectRivalSettlement } = loadTypeScript(new URL('../src/fjord-play/RivalSettlement.ts', import.meta.url));
    const landscape = { ...world, config: { seed: 32 } };
    const state = core.initializeIslandClans(core.createCampaign(32), landscape, worldId);
    const target = state.world.targetClans['island-rival'], saved = core.serializeState(state);
    const projection = projectRivalSettlement(target, landscape);
    assert.equal(projection.entities.filter(entity => entity.kind === 'household').length,
        Object.values(target.households).filter(home => home.memberIds.length).length);
    assert.equal(projection.entities.filter(entity => entity.kind === 'building').length, 0);
    assert.equal(projection.entities.filter(entity => entity.kind === 'cattle').length, 3);
    assert.equal(projection.entities.filter(entity => entity.kind === 'campfire').length, 1);
    assert.equal(projection.entities.filter(entity => entity.kind === 'longship').length, 0,
        'No ship may be invented on a reserve without a validated harbor');
    assert.ok(projection.entities.every(entity => entity.transform), projection.diagnostics.join('\n'));
    for (const entity of projection.entities) {
        const p = entity.transform;
        assert.ok(p.x > world.rivalSite.bounds.minX && p.x < world.rivalSite.bounds.maxX);
        assert.ok(p.z > world.rivalSite.bounds.minZ && p.z < world.rivalSite.bounds.maxZ);
    }
    assert.deepEqual(projectRivalSettlement(target, landscape, projection.layout), projection);
    assert.equal(core.serializeState(state), saved, 'Layout creation changes no simulation, resource or RNG');
});


test('ten separate founding tent households fit the actual curated island-7 rival reserve without dropping residents', () => {
    const { createCampaignIsland } = loadTypeScript(new URL('../src/fjord-play/CampaignIsland.ts', import.meta.url));
    const { projectRivalSettlement } = loadTypeScript(new URL('../src/fjord-play/RivalSettlement.ts', import.meta.url));
    const landscape = createCampaignIsland(7), heights = [...landscape.terrain.heights];
    const state = core.initializeIslandClans(core.createCampaign(7, {}, {}, {}, {}, {}, {}, 'summer-800-v1'),
        landscape, 'island-seven');
    const rival = state.world.targetClans['island-rival'];
    assert.equal(Object.keys(rival.households).length, 10);
    const view = projectRivalSettlement(rival, landscape);
    assert.deepEqual(view.entities.filter(entity => !entity.transform).map(entity => entity.selectionKey), []);
    assert.deepEqual(landscape.terrain.heights, heights, 'No compensating terrain grading or second heightfield');
});


test('the player sees no hidden rival information and only currently observed anonymous actors, while mapped geography persists', () => {
    const { inspectRivalSettlement } = loadTypeScript(new URL('../src/fjord-play/RivalSettlement.ts', import.meta.url));
    const landscape = { ...world, config: { seed: 32 } };
    let state = core.initializeIslandClans(core.createCampaign(32), landscape, worldId);
    const initial = inspectRivalSettlement(state, landscape);
    assert.deepEqual(initial, { known: false, currentlyObserved: false, entities: [], ground: { plots: [], paths: [] } });
    const context = { world: landscape, worldId };
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: landscape.rivalSite.center }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 140 }, context);
    const observed = inspectRivalSettlement(state, landscape);
    assert.equal(observed.known, true);
    assert.equal(observed.currentlyObserved, true);
    assert.ok(observed.entities.some(entity => entity.kind === 'persona'));
    for (const entity of observed.entities.filter(entity => entity.kind === 'persona')) {
        assert.deepEqual(entity.dna.traits, { physicality: .5, agility: .5, intelligence: .5, cunning: .5, temperament: .5 },
            'Render DNA is a neutral presentation surrogate, never live enemy gameplay traits');
        assert.ok(entity.visualProfile, 'The actual visible body/motion profile is retained separately');
    }
    const text = JSON.stringify(observed), target = state.world.targetClans['island-rival'];
    assert.equal(text.includes(target.clan.name), false);
    for (const person of Object.values(target.personas)) assert.equal(text.includes(person.name), false);
    for (const field of ['stocks', 'households', 'families', 'events', 'parentIds', 'workProgress'])
        assert.equal(text.includes('"' + field + '"'), false, 'Observed appearance does not disclose ' + field);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 140 }, context);
    const mapped = inspectRivalSettlement(state, landscape);
    assert.equal(mapped.known, true);
    assert.equal(mapped.currentlyObserved, false);
    assert.deepEqual(mapped.entities, []);
    const hiddenChange = structuredClone(state);
    hiddenChange.world.targetClans['island-rival'].stocks.food += 100;
    Object.values(hiddenChange.world.targetClans['island-rival'].personas)[0].name = 'Unobserved secret';
    assert.deepEqual(inspectRivalSettlement(hiddenChange, landscape), mapped,
        'Live unseen rival changes cannot refresh player information');
    assert.deepEqual(inspectRivalSettlement(core.reconstructState(core.serializeState(state)), landscape), mapped);
});


test('the shared Fjord campaign creates, saves and restores one rival without exposing or resetting it', () => {
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const shared = new SharedSettlement(7, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const before = shared.session.saveJSON();
    assert.equal(shared.session.readSnapshot().world.version, 2);
    assert.equal(Object.keys(shared.session.readSnapshot().world.targetClans).length, 1);
    assert.equal(shared.fjord.readProjection().rival.known, false);
    const saved = shared.persist();
    assert.ok(JSON.parse(saved).fjord.rivalLayout, 'The established presentation layout survives reload');
    const restored = SharedSettlement.restore(saved, 'fjord');
    assert.equal(restored.session.saveJSON(), before);
    assert.deepEqual(restored.fjord.readProjection().rival, shared.fjord.readProjection().rival);
    const bad = JSON.parse(saved);
    const plot = Object.values(bad.fjord.rivalLayout.plots)[0];
    plot.x = 1000000;
    assert.throws(() => restored.importJSON(JSON.stringify(bad.fjord)), /rival|layout|support|bound/i);
    assert.equal(restored.session.saveJSON(), before, 'A corrupt rival layout cannot replace the running campaign');
});


test('invalid or mismatched rival sites and old campaigns are rejected without changing canonical saves', () => {
    const initial = core.createCampaign(32), before = core.serializeState(initial);
    assert.throws(() => core.initializeIslandClans(initial, { ...world, rivalSite: undefined }, worldId), /rival site/i);
    const blocked = structuredClone(world);
    blocked.navigation.cells[16 * 65 + 44] = false;
    assert.throws(() => core.initializeIslandClans(initial, blocked, worldId), /rival site|walkable/i);
    assert.equal(core.serializeState(initial), before);
    const legacy = core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 1 });
    assert.throws(() => core.initializeIslandClans(legacy, world, worldId), /fresh campaign/i);
    assert.equal(legacy.world.version, 1);
    assert.equal(Object.keys(legacy.world.regions).length, 4);
    const state = core.initializeIslandClans(initial, world, worldId);
    assert.throws(() => core.initializeIslandClans(state, world, 'another-island'), /matching physical/i);
    const corrupt = structuredClone(state); corrupt.world.island.clanId = 'cpu-east';
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /physical island clans/i);
});


test('a real exploration order respects the rival campfire footprint as well as the player settlement', () => {
    const { SharedSettlement } = loadTypeScript(new URL('../src/play/SharedSettlement.ts', import.meta.url));
    const shared = new SharedSettlement(17, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const center = shared.fjord.blueprint.rivalSite.center;
    const origin = shared.fjord.readProjection().entities.find(entity => entity.kind === 'persona' && entity.id === 'founder-1').transform;
    shared.session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    shared.session.command({ type: 'StartExpedition', groupId: 'group-1' });
    shared.session.command({ type: 'ExploreArea', groupId: 'group-1', target: center,
        origins: { 'founder-1': { x: origin.x, z: origin.z } } });
    const destination = core.inspectSpatialExpeditions(shared.session.readSnapshot()).missions[0].target;
    assert.ok(Math.hypot(destination.x - center.x, destination.z - center.z) > 4.4,
        'A destination is corrected to safe ground instead of putting the scout in the physical campfire');
});
