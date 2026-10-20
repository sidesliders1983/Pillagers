import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { worldFixture } from './fixtures/wildlife-world.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { WildlifePopulation } = load('../src/wildlife/WildlifePopulation.ts');
const { validateWildlife } = load('../src/simulation/WildlifeSightings.ts');
const world = worldFixture();
const context = { world, wildlifeWorld: world, worldId: 'wildlife-sightings-fixture' };
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks }, context);
function campaign() {
    let state = core.createCampaign(32, { initialFood: 5000, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    return core.initializeWildlifeSightings(state, world, context.worldId);
}
function prepared() {
    let state = campaign();
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coast watch',
        memberIds: ['founder-1', 'founder-2'] }, context);
    return core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
}
const sightings = state => state.events.filter(event => event.type === 'WildlifeSighted');
function visit(state, point) {
    return core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: point.x, z: point.z } }, context);
}
function gullPosition(state) {
    return state.wildlife.actors.find(actor => actor.id === 'great-black-backed-gull:grounded:0').position;
}
function sighted() {
    const state = prepared();
    return advance(visit(state, gullPosition(state)), 30);
}

test('wildlife adopts real seeded instances without RNG, resources, time or invented opening sightings', () => {
    const state = campaign(), population = new WildlifePopulation(world);
    assert.deepEqual(state.wildlife.actors.map(actor => actor.id), population.actors.map(actor => actor.id));
    assert.equal(sightings(state).length, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    const baseline = structuredClone(state); delete baseline.wildlife;
    const adopted = core.initializeWildlifeSightings(baseline, world, context.worldId);
    assert.equal(adopted.rngState, baseline.rngState);
    assert.deepEqual(adopted.time, baseline.time);
    assert.deepEqual(adopted.stocks, baseline.stocks);
    assert.deepEqual(adopted.events, baseline.events);
    assert.equal(sightings(advance(prepared(), 100)).length, 0, 'Prepared rosters have not departed');
});

test('one group event captures actual witnesses; proximity and redirects do not duplicate it per member', () => {
    let state = sighted();
    const first = sightings(state).find(event => event.details.speciesId === 'great-black-backed-gull');
    assert.ok(first, 'A real grounded gull is encountered on the confirmed route');
    assert.deepEqual(first.details.witnessPersonaIds, ['founder-1', 'founder-2']);
    assert.equal(first.personaId, undefined);
    assert.equal(first.details.people.length, 2);
    assert.equal(first.details.firstForClan, true);
    assert.equal(first.details.expeditionGroupId, 'group-1');
    assert.equal(state.wildlife.firstDiscoveries['great-black-backed-gull'], first.id);
    state = advance(visit(state, { x: gullPosition(state).x, z: gullPosition(state).z + 12 }), 100);
    assert.equal(sightings(state).filter(event => event.details.speciesId === 'great-black-backed-gull').length, 1);
    assert.deepEqual(sightings(state).find(event => event.id === first.id), first);
});

test('save/load, command chunking and fast-forward reproduce exact sightings and expedition outcomes', () => {
    let initial = prepared(); initial = visit(initial, gullPosition(initial));
    const batched = advance(initial, 60);
    let stepped = initial;
    for (let tick = 0; tick < 60; tick++) stepped = advance(stepped, 1);
    assert.deepEqual(stepped, batched);
    const reloaded = core.reconstructState(core.serializeState(advance(initial, 25)));
    assert.deepEqual(advance(reloaded, 35), batched);
    const withoutWildlife = structuredClone(initial); delete withoutWildlife.wildlife;
    const baseline = advance(withoutWildlife, 60);
    for (const key of ['rngState', 'stocks', 'time']) assert.deepEqual(batched[key], baseline[key]);
    assert.deepEqual(batched.world.spatial, baseline.world.spatial);
    assert.throws(() => core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 1 }), /bound physical island/);
});

test('long absence permits a quiet new encounter; first discovery and historical witnesses stay unchanged', () => {
    let state = sighted();
    const original = sightings(state).filter(event => event.details.speciesId === 'great-black-backed-gull');
    state = advance(visit(state, { x: 40, z: 150 }), 300);
    state = advance(visit(state, gullPosition(state)), 120);
    const gulls = sightings(state).filter(event => event.details.speciesId === 'great-black-backed-gull');
    assert.ok(gulls.length > original.length);
    assert.equal(gulls.filter(event => event.details.firstForClan).length, 1);
    assert.equal(state.wildlife.firstDiscoveries['great-black-backed-gull'], original[0].id);
    assert.deepEqual(gulls[0], original[0]);
    assert.ok(new Set(sightings(state).map(event => event.details.encounterKey)).size === sightings(state).length);
});

test('invalid populations, forged witness attribution, duplicate first claims and rebound worlds are rejected', () => {
    const state = sighted();
    const invalid = change => { const saved = structuredClone(state); change(saved); return JSON.stringify(saved); };
    assert.throws(() => core.reconstructState(invalid(s => s.wildlife.actors[0].position.x = null)), /wildlife/);
    assert.throws(() => core.reconstructState(invalid(s => s.wildlife.nextEncounter++)), /history/);
    assert.throws(() => core.reconstructState(invalid(s => sightings(s)[0].details.witnessPersonaIds.push('invented-person'))), /sighting/);
    assert.throws(() => core.reconstructState(invalid(s => sightings(s)[0].personaId = 'founder-1')), /sighting/);
    assert.throws(() => core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, { ...context, worldId: 'different' }));
    const missing = structuredClone(state); missing.wildlife.actors.pop();
    assert.throws(() => advance(missing, 1), /population/);
    validateWildlife(state);
});

test('species, group and personal projections share one event and preserve historical participant names', () => {
    const { WildlifeHistoryIndex, wildlifeSightingText } = load('../src/lore/WildlifeHistory.ts');
    const { projectPersonalHistory } = load('../src/lore/PersonalHistory.ts');
    const { projectChronicle } = load('../src/lore/Chronicle.ts');
    const state = sighted(), index = new WildlifeHistoryIndex();
    index.append(state.events, state.clan.id);
    const first = sightings(state)[0], recorded = structuredClone(first);
    assert.ok(index.species(first.details.speciesId));
    assert.equal(index.species('lynx'), null, 'Unrecorded species reveal neither a label nor a location');
    assert.equal(index.group('never-existing-group').length, 0);
    assert.ok(index.unread([]).some(item => item.first.eventId === first.id));
    assert.ok(!index.unread([first.id]).some(item => item.first.eventId === first.id));
    for (const id of first.details.witnessPersonaIds) {
        const personal = projectPersonalHistory(state, id);
        const entry = personal.records.find(record => record.sourceEventId === first.id);
        assert.deepEqual(entry.roles, ['expedition witness']);
        assert.match(entry.text, /Participated in Coast watch/);
    }
    assert.ok(!projectPersonalHistory(state, 'founder-3').records.some(record => record.kind === 'WildlifeSighted'));
    const witness = first.details.witnessPersonaIds[0];
    state.personas[witness].name = 'Renamed later';
    state.personas[witness].deathWinter = state.time.winter;
    state.personaArchive ??= {}; state.personaArchive[witness] = state.personas[witness];
    delete state.personas[witness];
    delete state.world.groups['group-1'];
    assert.deepEqual(index.encounter(first.id).people, recorded.details.people);
    assert.ok(projectPersonalHistory(state, witness).records.some(record => record.sourceEventId === first.id));
    assert.ok(index.group('group-1').length, 'Dissolved groups retain a historical encounter');
    assert.match(wildlifeSightingText(first), /sighted/);
    assert.ok(projectChronicle(state.events).flatMap(year => year.entries).some(entry => entry.sourceEventIds.includes(first.id)));
});

test('an incremental long-history index scans appended events once and keeps pages bounded', () => {
    const { WildlifeHistoryIndex } = load('../src/lore/WildlifeHistory.ts');
    const state = sighted(), first = sightings(state)[0];
    const history = Array.from({ length: 50000 }, (_, i) => ({ id: 'event-' + (i + 1),
        type: i % 20 === 0 ? 'WildlifeSighted' : 'RoutineFixture', time: first.time,
        ...(i % 20 === 0 ? { details: { ...first.details, firstForClan: i === 0 } } : {}) }));
    const index = new WildlifeHistoryIndex(); index.append(history, state.clan.id);
    const before = index.inspect();
    for (let frame = 0; frame < 1000; frame++) {
        index.append(history, state.clan.id);
        index.unread([]);
    }
    assert.deepEqual(index.inspect(), before);
    assert.equal(before.examined, 50000);
    assert.equal(index.species(first.details.speciesId).encounters.length, 20);
    assert.equal(index.group(first.details.expeditionGroupId).length, 5);
    assert.equal(index.pageFor('event-1'), 2480);
    const lastPage = index.species(first.details.speciesId, index.pageFor('event-1'));
    assert.ok(lastPage.encounters.some(record => record.eventId === 'event-1'));
    assert.throws(() => index.species(first.details.speciesId, -1), /page/);
});


test('physical sighting eligibility rejects unknown terrain, distance and an intervening ridge', () => {
    const { canSightWildlife } = load('../src/simulation/WildlifeSightings.ts');
    const { inspectClanDiscovery, createClanDiscovery } = load('../src/simulation/ClanDiscovery.ts');
    const flat = structuredClone(world);
    flat.terrain.heights.fill(2);
    const observer = { x: 0, z: 0 }, animal = { x: 24, y: 2, z: 0 };
    const discovery = createClanDiscovery(flat, 'eligibility', 'clan',
        [{ id: 'actual-group', kind: 'expedition', ...observer }], 800000);
    const view = inspectClanDiscovery(discovery, 'clan');
    assert.equal(canSightWildlife(flat, view, observer, animal, 1.7), true);
    assert.equal(canSightWildlife(flat, { ...view, explored: '0'.repeat(view.explored.length),
        visible: '0'.repeat(view.visible.length) }, observer, animal, 1.7), false);
    assert.equal(canSightWildlife(flat, view, observer, { ...animal, x: 33 }, 1.7), false);
    const ridge = structuredClone(flat);
    for (let row = 0; row < ridge.terrain.rows; row++) ridge.terrain.heights[row * 201 + 103] = 20;
    assert.equal(canSightWildlife(ridge, view, observer, animal, 1.7), false,
        'Previously mapped terrain does not allow looking through a ridge');
});

test('separate real groups receive distinct encounters; returned parties stop observing', () => {
    let state = sighted();
    const first = structuredClone(sightings(state)[0]);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Second watch', memberIds: ['founder-3'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-2' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-2', target: gullPosition(state) }, context);
    state = advance(state, 40);
    const second = sightings(state).find(event => event.details.expeditionGroupId === 'group-2' &&
        event.details.speciesId === first.details.speciesId);
    assert.ok(second);
    assert.deepEqual(second.details.witnessPersonaIds, ['founder-3']);
    assert.equal(second.details.firstForClan, false);
    assert.notEqual(second.details.encounterKey, first.details.encounterKey);
    for (const groupId of ['group-1', 'group-2'])
        state = core.applyCommand(state, { type: 'RecallExpedition', groupId }, context);
    state = advance(state, 100);
    assert.ok(Object.values(state.world.spatial.missions).every(mission => mission.status === 'Returned'));
    const count = sightings(state).length;
    assert.equal(sightings(advance(state, 300)).length, count);
    assert.deepEqual(sightings(state).find(event => event.id === first.id), first);
});


test('later roster edits and actual mortality cannot replace the original historical witnesses', () => {
    let state = sighted();
    const original = structuredClone(sightings(state)[0]);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
    state = advance(state, 100);
    state = core.applyCommand(state, { type: 'EditExpeditionGroup', groupId: 'group-1',
        name: 'New coast watch', memberIds: ['founder-3'] }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = advance(visit(state, gullPosition(state)), 50);
    const later = sightings(state).find(event => event.details.groupName === 'New coast watch' &&
        event.details.speciesId === original.details.speciesId);
    assert.ok(later);
    assert.deepEqual(later.details.witnessPersonaIds, ['founder-3']);
    assert.deepEqual(sightings(state).find(event => event.id === original.id), original);
    // Explicit mortality test fixture; the real annual resolver performs the deaths.
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    state = advance(state, state.ticksPerWinter - state.time.tick);
    assert.ok(original.details.witnessPersonaIds.every(id => state.personas[id]?.deathWinter !== null));
    const { projectPersonalHistory } = load('../src/lore/PersonalHistory.ts');
    assert.ok(projectPersonalHistory(state, original.details.witnessPersonaIds[0]).records
        .some(record => record.sourceEventId === original.id));
    assert.deepEqual(sightings(core.reconstructState(core.serializeState(state)))
        .find(event => event.id === original.id), original);
});
