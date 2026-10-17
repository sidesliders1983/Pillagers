import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const { GameplaySession } = loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts', import.meta.url));
const { proposeWork, previewWork } = loadTypeScript(new URL('../src/fjord-play/WorkPlan.ts', import.meta.url));
const { occupationIds, landingSummary, applyCommand } = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));

function funded() {
    const session = new GameplaySession(32);
    const ship = Object.keys(session.snapshot().landing.longships)[0];
    session.command({ type: 'SalvageLongship', longshipId: ship });
    const home = Object.values(session.snapshot().households).find(h => h.memberIds.length > 0);
    return { session, householdId: home.id };
}

test('all canonical occupations use the same real task without assigning other residents or cattle', () => {
    for (const role of occupationIds) {
        const { session, householdId } = funded();
        const before = session.snapshot();
        const draft = proposeWork(before, householdId, role);
        const plan = previewWork(before, draft);
        assert.deepEqual(session.snapshot(), before, 'preview must be read-only');
        session.commandBatch(plan.commands);
        const after = session.snapshot();
        assert.deepEqual(after, plan.state);
        assert.equal(after.personas[draft.workerId].occupation, role);
        for (const person of Object.values(before.personas).filter(p => p.id !== draft.workerId)) {
            assert.equal(after.personas[person.id].occupation, person.occupation);
            assert.equal(after.mechanics.people[person.id].occupationLocked, before.mechanics.people[person.id].occupationLocked);
        }
        assert.deepEqual(after.landing.cattle, before.landing.cattle);
        assert.equal(after.time.tick, before.time.tick);
        assert.equal(after.rngState, before.rngState);
    }
});
test('ordinary housing preserves independent work, specialization and animal choices', () => {
    const { session, householdId } = funded();
    const before = session.snapshot();
    const command = { type: 'BuildHouse', householdId };
    session.commandBatch([command]);
    assert.deepEqual(session.snapshot(), applyCommand(before, command));
    assert.equal(Object.values(session.snapshot().buildings)[0].specialization, null);
    for (const id of Object.keys(before.personas)) {
        assert.equal(session.snapshot().personas[id].occupation, before.personas[id].occupation);
    }
    assert.deepEqual(session.snapshot().landing.cattle, before.landing.cattle);
});
test('the optional farmyard task commits the house, farmer and three selected cattle together', () => {
    const { session, householdId } = funded();
    const before = session.snapshot();
    const draft = proposeWork(before, householdId, 'farmer', 'farmyard');
    assert.equal(draft.cattleIds.length, 3);
    const plan = previewWork(before, draft);
    session.commandBatch(plan.commands);
    const yard = landingSummary(session.snapshot()).farmyards[0];
    assert.equal(yard.occupants, 3);
    assert.equal(session.snapshot().stocks.materials, before.stocks.materials - before.mechanics.config.houseCost);
    assert.deepEqual(session.snapshot(), plan.state);
    const next = previewWork(session.snapshot(), proposeWork(session.snapshot(), householdId, 'farmer', 'farmyard'));
    assert.equal(next.materials, 0, 'reuse the existing home');
    assert.equal(next.commands.some(c => c.type === 'AssignOccupation'), false, 'keep the suitable farmer career');
});
test('a final-command failure leaves state, history, revision, trend and book untouched', () => {
    const { session, householdId } = funded();
    const draft = proposeWork(session.snapshot(), householdId, 'farmer', 'farmyard');
    const plan = previewWork(session.snapshot(), draft);
    const before = session.saveJSON(), revision = session.revision, trend = { ...session.trend }, book = session.book;
    assert.throws(() => session.commandBatch([...plan.commands,
        { type: 'AssignCattle', cattleId: 'missing-animal', farmyardId: plan.buildingId }]));
    assert.equal(session.saveJSON(), before);
    assert.equal(session.revision, revision);
    assert.deepEqual(session.trend, trend);
    assert.equal(session.book, book);
    assert.throws(() => session.commandBatch([{ type: 'AdvanceWinter' }]), /unsupported/);
    assert.equal(session.saveJSON(), before);
});
test('work without new housing is possible; changing the last farmer explicitly reports shelter loss', () => {
    const { session, householdId } = funded();
    const tentPlan = proposeWork(session.snapshot(), householdId, 'smith');
    tentPlan.buildHouse = false;
    const withoutHome = previewWork(session.snapshot(), tentPlan);
    assert.equal(withoutHome.materials, 0);
    assert.equal(withoutHome.commands.some(c => c.type === 'SpecializeBuilding'), false);
    session.commandBatch(previewWork(session.snapshot(), proposeWork(session.snapshot(), householdId, 'farmer', 'farmyard')).commands);
    const farmer = Object.values(session.snapshot().personas).find(p => p.occupation === 'farmer');
    const draft = proposeWork(session.snapshot(), householdId, 'smith');
    draft.workerId = farmer.id;
    const plan = previewWork(session.snapshot(), draft);
    assert.equal(plan.unsheltered.length, 3);
    const old = session.saveJSON();
    assert.equal(old, session.saveJSON());
    assert.equal(landingSummary(session.snapshot()).farmyards[0].occupants, 3);
});
