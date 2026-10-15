import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const campaign = (seed = 32, config = {}) => core.createCampaign(
    seed, {}, config, {}, {}, {}, {}, 'summer-800-v1', 'individual-v1');

test('individual birthdays preserve seeded Summer founders and independent CPU identities', () => {
    const old = core.createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
    const state = campaign();
    assert.equal(state.birthdayCalendar.version, 1);
    assert.deepEqual(state, campaign());
    for (const [current, legacy] of [[state, old], ...Object.keys(state.world.targetClans).map(id =>
        [state.world.targetClans[id], old.world.targetClans[id]])]) {
        assert.deepEqual(current.time, { winter: 800, tick: 500 });
        assert.deepEqual(current.stocks, legacy.stocks);
        assert.equal(current.rngState, legacy.rngState);
        const ticks = Object.values(current.personas).map(person => person.birthTick);
        assert.ok(ticks.every(tick => Number.isInteger(tick) && tick >= 0 && tick < 1000));
        assert.ok(new Set(ticks).size >= 7, 'Small founding parties should be spread through the year.');
        for (const person of Object.values(current.personas)) {
            const original = legacy.personas[person.id];
            assert.equal(core.personaAge(current, person.id), original.dna.age);
            const { birthWinter, birthTick, ...identity } = person;
            const { birthWinter: oldBirth, ...oldIdentity } = original;
            assert.deepEqual(identity, oldIdentity);
        }
    }
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});

test('calendar saves reject ambiguous dates and preserve exact legacy round trips', () => {
    const state = campaign();
    for (const corrupt of [
        s => { s.personas['founder-1'].birthTick = 1000; },
        s => { s.personas['founder-1'].birthTick = 0.5; },
        s => { s.birthdayCalendar.version = 2; },
        s => { s.personas['founder-1'].deathTick = 10; },
        s => { s.personas['founder-1'].birthWinter = 800; s.personas['founder-1'].birthTick = 501; },
    ]) {
        const invalid = structuredClone(state); corrupt(invalid);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)));
    }
    const legacy = core.serializeState(core.createCampaign(32));
    assert.equal(core.serializeState(core.reconstructState(legacy)), legacy);
});

const fertile = (overrides = {}) => {
    const state = campaign(32, { fertilityChanceBps: 10000, partnershipChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0, ...overrides });
    state.stocks.food = 10000;
    return state;
};
const step = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks });

test('selected births persist before delivery and enter the population on their real birthday tick', () => {
    const boundary = step(fertile(), 500);
    assert.equal(boundary.events.filter(event => event.type === 'ChildBorn').length, 0);
    assert.ok(boundary.birthdayCalendar.pendingBirths.length > 0);
    const due = Math.min(...boundary.birthdayCalendar.pendingBirths.map(birth => birth.dueAt.tick));
    const before = step(boundary, due - 1);
    assert.equal(Object.keys(before.personas).length, 10);
    const saved = core.serializeState(before);
    const delivered = step(core.reconstructState(saved), 1);
    assert.deepEqual(delivered, step(before, 1));
    const born = delivered.events.filter(event => event.type === 'ChildBorn');
    assert.ok(born.length > 0);
    for (const event of born) {
        const child = delivered.personas[event.personaId];
        assert.deepEqual(event.time, { winter: 801, tick: due });
        assert.equal(child.birthTick, due);
        assert.equal(core.personaAge(delivered, child.id), 0);
        assert.deepEqual(child.parentIds, event.details.parentIds);
        assert.deepEqual(child.dna, event.details.dna);
        const mother = child.parentIds[1];
        assert.equal(delivered.mechanics.people[mother].childcareUntilTick, due);
        assert.equal(delivered.mechanics.people[mother].childcareUntilWinter, 806);
    }
});

test('care continues across tick zero and releases on the exact delivery anniversary', () => {
    let state = step(fertile({ childcareWinters: 1 }), 500);
    const due = Math.min(...state.birthdayCalendar.pendingBirths.map(birth => birth.dueAt.tick));
    state = step(state, due);
    const birth = state.events.find(event => event.type === 'ChildBorn');
    const mother = birth.details.parentIds[1];
    state = step(state, 1000 - due);
    assert.deepEqual(state.time, { winter: 802, tick: 0 });
    assert.equal(core.inspectWork(state, mother).reason, 'childcare');
    state = step(state, due - 1);
    assert.equal(core.inspectWork(state, mother).reason, 'childcare');
    state = step(state, 1);
    assert.equal(core.inspectWork(state, mother).reason, null);
    assert.equal(state.mechanics.people[mother].caregiverId, null);
});

test('the birthday enables work and updates cached family cards without an annual policy roll', () => {
    const { FamilyTreeIndex } = load('../src/lore/FamilyTree.ts');
    const state = fertile();
    const person = state.personas['founder-1'];
    person.birthWinter = 784; person.birthTick = 501;
    person.occupation = null; person.occupationHistory = [];
    const index = new FamilyTreeIndex();
    assert.equal(core.personaAge(state, person.id), 15);
    assert.equal(index.read(state).nodes.find(node => node.id === person.id).age, 15);
    assert.throws(() => core.applyCommand(state, { type: 'AssignOccupation', personaId: person.id, occupation: 'farmer' }));
    const birthday = step(state, 1);
    assert.equal(core.personaAge(birthday, person.id), 16);
    assert.equal(index.read(birthday).nodes.find(node => node.id === person.id).age, 16);
    const assigned = core.applyCommand(birthday, { type: 'AssignOccupation', personaId: person.id, occupation: 'farmer' });
    assert.equal(core.inspectWork(assigned, person.id).reason, null);
    assert.equal(birthday.events.filter(event => ['WinterAdvanced', 'FoodConsumed', 'PersonaDied'].includes(event.type)).length, 0);
});

test('expedition death freezes completed age at the exact midyear death tick', () => {
    const state = fertile();
    const id = 'founder-1';
    state.personas[id].birthWinter = 768; state.personas[id].birthTick = 501;
    state.world.config.durations.Recon = 1;
    state.world.config.casualtyBps.Recon = 10000;
    const group = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: [id] });
    const away = core.applyCommand(group, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
    const dead = step(away, 1);
    assert.equal(dead.personas[id].deathTick, 501);
    assert.equal(core.personaAge(dead, id), 32);
    assert.equal(core.personaAge(step(dead, 1000), id), 32);
    const event = dead.events.find(event => event.type === 'PersonaDied' && event.personaId === id);
    assert.deepEqual(event.time, { winter: 800, tick: 501 });
    assert.equal(event.details.age, 32);
});

test('a pending maternal delivery follows actual clan transfer and keeps the recorded father', () => {
    let state = fertile();
    for (const target of Object.values(state.world.targetClans)) target.stocks.food = 10000;
    state.world.config.durations.Recon = 1; state.world.config.durations.Pillage = 1;
    state.world.config.successBps.Recon = 10000; state.world.config.successBps.Pillage = 10000;
    state.world.config.casualtyBps.Recon = 0; state.world.config.casualtyBps.Pillage = 0;
    state = step(state, 500);
    const mother = 'cpu-west:founder-1';
    state.world.targetClans['cpu-west'].personas[mother].birthWinter = 770;
    state.world.targetClans['cpu-west'].personas[mother].birthTick = 500;
    const plan = state.world.targetClans['cpu-west'].birthdayCalendar.pendingBirths.find(birth => birth.motherId === mother);
    assert.equal(plan.dueAt.tick, 547);
    const member = Object.values(state.personas).find(person => person.dna.sex === 'male').id;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: [member] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Recon' });
    state = step(state, 1);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Pillage', priorities: ['People'] });
    state = step(state, 1);
    assert.ok(state.personas[mother]);
    assert.ok(state.birthdayCalendar.pendingBirths.some(birth => birth.motherId === mother));
    assert.equal(state.world.targetClans['cpu-west'].birthdayCalendar.pendingBirths.some(birth => birth.motherId === mother), false);
    state = step(core.reconstructState(core.serializeState(state)), 545);
    const born = state.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(mother));
    assert.deepEqual(born.time, { winter: 801, tick: 547 });
    assert.deepEqual(state.personas[born.personaId].parentIds, [plan.fatherId, mother]);
    assert.ok(state.personaArchive[plan.fatherId]);
    const { projectFamilyTree } = load('../src/lore/FamilyTree.ts');
    assert.equal(projectFamilyTree(state.world.targetClans['cpu-west']).nodes.find(node => node.id === mother).age, 30);
    assert.equal(core.personaAge(state.world.targetClans['cpu-west'],mother),30);
});

test('a mother away at the due date gives birth on return without a second Food or fertility check', () => {
    let state = step(fertile(), 500);
    const plan = [...state.birthdayCalendar.pendingBirths].sort((a, b) => a.dueAt.tick - b.dueAt.tick)[0];
    state.world.config.durations.Recon = plan.dueAt.tick + 3;
    state.world.config.casualtyBps.Recon = 0;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Travellers', memberIds: [plan.motherId] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
    state.stocks.food = 0;
    state = step(state, plan.dueAt.tick);
    assert.equal(state.events.some(event => event.type === 'ChildBorn' && event.details.parentIds.includes(plan.motherId)), false);
    state = step(core.reconstructState(core.serializeState(state)), 3);
    const birth = state.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(plan.motherId));
    assert.deepEqual(birth.time, { winter: 801, tick: plan.dueAt.tick + 3 });
    assert.equal(state.personas[birth.personaId].birthTick, birth.time.tick);
    assert.deepEqual(state.personas[birth.personaId].dna, plan.dna);
});

test('maternal death cancels a saved plan explicitly; paternal death retains established parentage', () => {
    for (const who of ['motherId', 'fatherId']) {
        let state = step(fertile(), 500);
        const plan = [...state.birthdayCalendar.pendingBirths].sort((a, b) => b.dueAt.tick - a.dueAt.tick)[0];
        state.world.config.durations.Recon = 1; state.world.config.casualtyBps.Recon = 10000;
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: [plan[who]] });
        state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
        state = step(state, 1);
        if (who === 'motherId') {
            assert.ok(state.events.some(event => event.type === 'BirthPlanCancelled' && event.personaId === plan.motherId));
            assert.equal(state.birthdayCalendar.pendingBirths.some(birth => birth.motherId === plan.motherId), false);
        }
        state = step(state, plan.dueAt.tick - 1);
        const birth = state.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(plan.motherId));
        if (who === 'motherId') assert.equal(birth, undefined);
        else assert.deepEqual(state.personas[birth.personaId].parentIds, [plan.fatherId, plan.motherId]);
    }
});

test('pending deliveries reject malformed dates, parent references and inherited genetics', () => {
    const state = step(fertile(), 500);
    for (const corrupt of [
        birth => { birth.dueAt.tick = 0; },
        birth => { birth.dueAt.tick = 1000; },
        birth => { birth.selectedAt.tick = 1; },
        birth => { birth.motherId = 'missing'; },
        birth => { birth.fatherId = birth.motherId; },
        birth => { birth.dna.age = 20; },
        birth => { birth.dna.traits.physicality = 99; },
        birth => { birth.dominantLegacy.temperament = 'missing'; },
    ]) {
        const invalid = structuredClone(state);
        corrupt(invalid.birthdayCalendar.pendingBirths[0]);
        assert.throws(() => core.reconstructState(JSON.stringify(invalid)));
    }
    const duplicate = structuredClone(state);
    duplicate.birthdayCalendar.pendingBirths.push(duplicate.birthdayCalendar.pendingBirths[0]);
    assert.throws(() => core.reconstructState(JSON.stringify(duplicate)));
});

test('explicit calendar mode survives campaign restart and new game; legacy imports stay legacy', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession(32, 123, true, 'summer-800-v1', 'individual-v1');
    assert.equal(session.snapshot().birthdayCalendar.version, 1);
    const founders = session.snapshot().personas;
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    session.restartCampaign(true);
    assert.deepEqual(session.snapshot().personas, founders);
    session.newCampaign(33, false);
    assert.equal(session.snapshot().birthdayCalendar.version, 1);
    const legacy = core.serializeState(core.createCampaign(32));
    session.loadJSON(legacy);
    assert.equal(session.saveJSON(), legacy);
    session.restartCampaign(true);
    assert.equal(session.snapshot().birthdayCalendar, undefined);
    session.newCampaign(34, false, true, 'summer-800-v1', 'individual-v1');
    assert.equal(session.snapshot().birthdayCalendar.version, 1);
});

test('colliding birthdays, deliveries, deaths and CPU clans replay identically across all batch sizes', () => {
    const initial = fertile({ mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 35, chanceBps: 10000 }] });
    for (const id of ['founder-1', 'founder-2']) {
        const person = initial.personas[id];
        person.birthTick = 501; person.birthWinter = 799 - person.dna.age;
    }
    const before = ['founder-1', 'founder-2'].map(id => core.personaAge(initial, id));
    const birthday = step(initial, 1);
    assert.deepEqual(['founder-1', 'founder-2'].map(id => core.personaAge(birthday, id)), before.map(age => age + 1));
    const whole = step(initial, 2500);
    let singles = initial;
    for (let i = 0; i < 2500; i++) singles = step(singles, 1);
    let mixed = initial;
    for (const ticks of [1, 3, 500, 1000, 996]) mixed = core.reconstructState(core.serializeState(step(mixed, ticks)));
    assert.deepEqual(whole, singles);
    assert.deepEqual(mixed, whole);
    assert.deepEqual(whole.time, { winter: 803, tick: 0 });
    assert.ok(whole.events.some(event => event.type === 'ChildBorn' && event.time.tick > 0));
    assert.ok(whole.events.some(event => event.type === 'PersonaDied'));
    assert.equal(whole.events.filter(event => event.type === 'FoodConsumed').length, 3);
    for (const clan of Object.values(whole.world.targetClans)) assert.deepEqual(clan.time, whole.time);
});

test('a child appears outside at the fifth birthday and visual DNA changes only at real birthdays', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createSettlement(32, { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state.time.tick = 500;
    state.birthdayCalendar = { version: 1, pendingBirths: [] };
    state.personas.astrid.birthWinter = 795; state.personas.astrid.birthTick = 501;
    const world = generateWorld({ seed: 32 });
    const layout = createFjordLayout(world);
    const view = state => projectFjordSettlement(state, world, layout).entities.find(entity => entity.id === 'astrid');
    const original = view(state);
    assert.equal(original.status.age, 4); assert.equal(original.transform, null);
    const arrived = view(step(state, 1));
    assert.equal(arrived.status.age, 5); assert.ok(arrived.transform);
    assert.equal(arrived.transform.scale, 0.5875);
    assert.deepEqual(view(step(state, 2)).dna, arrived.dna);
    assert.equal(state.personas.astrid.dna.age, 0);
});

test('delivery releases a pregnant helper from another care group before starting her own care', () => {
    let state = step(fertile(), 500);
    const plans = [...state.birthdayCalendar.pendingBirths].sort((a,b)=>a.dueAt.tick-b.dueAt.tick);
    const first = plans[0], later = plans.at(-1);
    assert.notEqual(first.motherId, later.motherId);
    state = step(state, first.dueAt.tick);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: later.motherId, occupation: null });
    state = core.applyCommand(state, { type: 'AssignCaregiver', motherId: first.motherId, caregiverId: later.motherId });
    state = step(state, later.dueAt.tick-first.dueAt.tick);
    assert.equal(state.mechanics.people[first.motherId].caregiverId, null);
    assert.equal(core.inspectWork(state,later.motherId).reason,'childcare');
});

test('a legacy receiving clan can retain a foreign delivery without changing its annual birth policy', () => {
    let state = fertile();
    delete state.birthdayCalendar;
    for (const person of Object.values(state.personas)) delete person.birthTick;
    for (const target of Object.values(state.world.targetClans)) target.stocks.food = 10000;
    Object.assign(state.world.config.durations, { Recon: 1, Pillage: 1 });
    Object.assign(state.world.config.successBps, { Recon: 10000, Pillage: 10000 });
    Object.assign(state.world.config.casualtyBps, { Recon: 0, Pillage: 0 });
    state = step(state, 500);
    const mother = 'cpu-west:founder-1';
    const member = Object.values(state.personas).find(person => person.dna.sex === 'male').id;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: [member] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Recon' });
    state = step(state, 1);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Pillage', priorities: ['People'] });
    state = step(state, 1);
    assert.equal(state.birthdayCalendar.birthPolicy, 'annual');
    assert.equal(state.personas['founder-1'].birthTick, undefined);
    state = step(core.reconstructState(core.serializeState(state)), 545);
    const child = state.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(mother));
    assert.deepEqual(child.time, { winter: 801, tick: 547 });
    assert.equal(state.events.some(event => event.type === 'BirthScheduled'), false);
});

test('maternal clan transfer ends exact care immediately when the children remain behind', () => {
    let state = fertile();
    for (const target of Object.values(state.world.targetClans)) target.stocks.food = 10000;
    Object.assign(state.world.config.durations, { Recon: 1, Pillage: 1 });
    Object.assign(state.world.config.successBps, { Recon: 10000, Pillage: 10000 });
    Object.assign(state.world.config.casualtyBps, { Recon: 0, Pillage: 0 });
    state = step(state, 500);
    const mother = 'cpu-west:founder-1';
    state = step(state, 547);
    assert.ok(state.world.targetClans['cpu-west'].events.some(event =>
        event.type === 'ChildBorn' && event.details.parentIds.includes(mother)));
    state = step(state, 453); // Next year, before the former care endpoint's within-year tick.
    const member = Object.values(state.personas).find(person => person.dna.sex === 'male').id;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: [member] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Recon' });
    state = step(state, 1);
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-west', mission: 'Pillage', priorities: ['People'] });
    state = step(state, 1);
    const care = state.mechanics.people[mother];
    assert.ok(care);
    assert.deepEqual({ winter: care.childcareUntilWinter, tick: care.childcareUntilTick }, state.time);
    assert.notEqual(core.inspectWork(state, mother).reason, 'childcare');
});
