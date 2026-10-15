import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from './load-source.mjs';
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const core = load('../src/simulation/SimulationCore.ts');

test('revision reads are deeply immutable isolated copies; public snapshots stay independently owned', () => {
    const session = new GameplaySession(32, 166);
    const first = session.readSnapshot();
    assert.equal(session.readSnapshot(), first);
    assert.ok(Object.isFrozen(first.events));
    assert.ok(Object.isFrozen(first.personas['founder-1'].dna));
    assert.throws(() => { first.stocks.food = -1; }, TypeError);
    assert.throws(() => first.events.push({}), TypeError);
    const owned = session.snapshot();
    owned.personas['founder-1'].dna.age = 99;
    owned.events.length = 0;
    assert.deepEqual(first, session.snapshot());
    const before = session.saveJSON();
    const revision = session.revision;
    assert.throws(() => session.command({ type: 'AssignOccupation', personaId: 'missing', occupation: 'farmer' }));
    assert.equal(session.revision, revision);
    assert.equal(session.readSnapshot(), first);
    assert.equal(session.saveJSON(), before);
    session.command({ type: 'AdvanceTicks', ticks: 3 });
    assert.equal(session.revision, revision + 1);
    assert.notEqual(session.readSnapshot(), first);
    assert.deepEqual(session.snapshot(), core.applyCommand(first, { type: 'AdvanceTicks', ticks: 3 }));
    session.loadJSON(before);
    assert.notEqual(session.readSnapshot(), first);
    assert.equal(session.saveJSON(), before);
});

test('projection reads invalidate for state, mooring, layout and campaign replacement without freezing adapter ownership', () => {
    const shared = new SharedSettlement(32, 166);
    const view = shared.fjord.readProjection();
    assert.equal(shared.fjord.readProjection(), view);
    assert.ok(Object.isFrozen(view.entities[0]));
    assert.throws(() => { view.layout.mooring.x++; }, TypeError);
    shared.select({ kind: 'persona', id: 'founder-1' });
    assert.equal(shared.fjord.readProjection(), view, 'selection is a separate change domain');
    shared.fjord.setMooring({ ...shared.fjord.layout.mooring, x: shared.fjord.layout.mooring.x + 1 });
    const moved = shared.fjord.readProjection();
    assert.notEqual(moved, view);
    assert.equal(moved.layout.mooring.x, view.layout.mooring.x + 1);
    shared.command({ type: 'AdvanceTicks', ticks: 1 });
    const advanced = shared.fjord.readProjection();
    assert.notEqual(advanced, moved);
    assert.equal(advanced.time.tick, 1);
    const exported = shared.fjord.exportJSON();
    shared.importJSON(exported);
    assert.notEqual(shared.fjord.readProjection(), advanced);
    assert.equal(shared.fjord.exportJSON(), exported);
});

test('cached command eligibility remains exactly authoritative after commands, imports, replacement and rejected probes', () => {
    const shared = new SharedSettlement(32, 166);
    const commands = [
        { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' },
        { type: 'AssignOccupation', personaId: 'missing', occupation: 'farmer' },
        { type: 'HouseHousehold', householdId: 'founder-1' },
        { type: 'AdvanceTicks', ticks: 1 },
    ];
    for (const advance of [0, 1, 499, 500]) {
        shared.command({ type: 'AdvanceTicks', ticks: advance });
        for (const command of commands) {
            let expected;
            try { core.applyCommand(shared.session.snapshot(), command); expected = { allowed: true, reason: '' }; }
            catch (error) { expected = { allowed: false, reason: error.message }; }
            assert.deepEqual(shared.availability(command), expected);
            const owned = shared.availability(command);
            owned.allowed = !owned.allowed;
            assert.deepEqual(shared.availability(command), expected, 'caller cannot corrupt a cached status');
        }
    }
    const save = shared.persist();
    shared.importJSON(shared.fjord.exportJSON());
    assert.equal(shared.persist(), save);
    shared.newCampaign(17, true);
    assert.equal(shared.session.readSnapshot().seed, 17);
    shared.restart(true, false);
    assert.equal(shared.session.readSnapshot().weather.config.enabled, false);
});

test('developed saves and frozen chapters retain exact Core output through annual/checkpoint commands and handoffs', async () => {
    const fixture = await readFile(new URL('../docs/qa/fjord-runtime-performance/fixtures/developed-810.json', import.meta.url), 'utf8');
    let shared = SharedSettlement.restore(fixture, 'fjord');
    let reference = shared.session.snapshot();
    for (const ticks of [3, 497, 1000, 4000]) {
        shared.command({ type: 'AdvanceTicks', ticks });
        reference = core.applyCommand(reference, { type: 'AdvanceTicks', ticks });
        assert.equal(shared.session.saveJSON(), core.serializeState(reference));
        const save = shared.fjord.exportJSON();
        shared.importJSON(save);
        assert.equal(shared.fjord.exportJSON(), save);
        const book = shared.session.book.save(shared.session.readSnapshot());
        const handoff = shared.handoff('board');
        shared = SharedSettlement.restore(handoff, 'board');
        assert.deepEqual(shared.session.book.save(shared.session.readSnapshot()), book);
        assert.equal(shared.session.saveJSON(), core.serializeState(reference));
    }
});
