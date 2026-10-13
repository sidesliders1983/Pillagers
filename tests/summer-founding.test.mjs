import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const summer = seed => core.createCampaign(seed, {}, {}, {}, {}, {}, {}, 'summer-800-v1');

function withoutFoundingPhase(state) {
    const copy = structuredClone(state);
    delete copy.foundingPhase;
    copy.time.tick = 0;
    for (const event of copy.events) event.time.tick = 0;
    for (const person of Object.values(copy.personas))
        for (const interval of person.occupationHistory) interval.startedAt.tick = 0;
    if (copy.world) for (const [id, clan] of Object.entries(copy.world.targetClans))
        copy.world.targetClans[id] = withoutFoundingPhase(clan);
    return copy;
}

test('explicit Summer founding starts player and independent CPU clans together without pre-simulation', () => {
    const legacy = core.createCampaign(32);
    const state = summer(32);
    assert.deepEqual(state.time, { winter: 800, tick: 500 });
    assert.equal(state.foundingPhase, 'summer-800-v1');
    assert.deepEqual(state.stocks, { food: 15, materials: 5 });
    assert.deepEqual(withoutFoundingPhase(state), legacy,
        'Only the founding phase and initial timestamps change; identity, experience, RNG and stocks stay fresh.');
    for (const clan of [state, ...Object.values(state.world.targetClans)]) {
        assert.deepEqual(clan.time, { winter: 800, tick: 500 });
        assert.ok(clan.events.every(event => event.time.winter === 800 && event.time.tick === 500));
        assert.ok(Object.values(clan.personas).every(person => person.workProgress === 0));
        for (const person of Object.values(clan.personas)) {
            const career = person.occupationHistory[0];
            assert.equal(career.startedAt.tick, 500, 'Seeded career experience gains no unplayed half-year.');
        }
    }
    assert.deepEqual(summer(32), state);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    assert.deepEqual(legacy.time, { winter: 800, tick: 0 });
});

test('session creation and restarts preserve the explicit phase and reach the first boundary after 500 ticks', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession(32, 123, true, 'summer-800-v1');
    assert.deepEqual(session.snapshot().time, { winter: 800, tick: 500 });
    assert.deepEqual(session.book.snapshot().chapters[0].checkpoint.time, session.snapshot().time);
    const initial = session.saveJSON();
    session.command({ type: 'KeepLongship', longshipId: 'founding-longship' });
    assert.deepEqual(session.snapshot().events.at(-1).time, { winter: 800, tick: 500 });
    session.command({ type: 'AdvanceTicks', ticks: 499 });
    assert.deepEqual(session.snapshot().time, { winter: 800, tick: 999 });
    assert.equal(session.snapshot().events.filter(e => e.type === 'WinterAdvanced').length, 0);
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    assert.deepEqual(session.snapshot().time, { winter: 801, tick: 0 });
    assert.equal(session.snapshot().events.filter(e => e.type === 'FoodConsumed').length, 1);
    assert.ok(Object.values(session.snapshot().world.targetClans).every(c => c.time.winter === 801 && c.time.tick === 0));
    session.command({ type: 'AdvanceTicks', ticks: 1000 });
    assert.deepEqual(session.snapshot().time, { winter: 802, tick: 0 });
    session.restartCampaign(true);
    assert.equal(session.saveJSON(), initial, 'Same founders restart directly at Summer with fresh progress.');
    session.restartCampaign(false, () => 33);
    assert.equal(session.snapshot().seed, 33);
    assert.deepEqual(session.snapshot().time, { winter: 800, tick: 500 });
    session.newCampaign(34, true);
    assert.deepEqual(session.snapshot().time, { winter: 800, tick: 500 });
    // Loading is authoritative: neither a summer session nor an opt-in may shift an old save.
    for (const ticks of [0, 123, 750]) {
        const saved = core.serializeState(core.applyCommand(core.createCampaign(32), { type: 'AdvanceTicks', ticks }));
        session.loadJSON(saved);
        assert.equal(session.saveJSON(), saved);
    }
    for (const minutes of [1, 3, 5]) {
        const clock = new GameplaySession(32, 123, false, 'summer-800-v1');
        clock.setMinutesPerWinter(minutes);
        clock.elapse(minutes * 30000);
        assert.deepEqual(clock.snapshot().time, { winter: 800, tick: 500 }, 'Loading/paused time does not count.');
        clock.setRunning(true);
        clock.elapse(minutes * 30000);
        assert.deepEqual(clock.snapshot().time, { winter: 801, tick: 0 }, 'The first half-year is not stretched.');
    }
    assert.deepEqual(new GameplaySession().snapshot().time, { winter: 800, tick: 0 });
});

test('the frozen Saga opening records summer and the first partial-year interval has complete accounting', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const { ClanBook } = load('../src/lore/ClanBook.ts');
    const session = new GameplaySession(32, 123, true, 'summer-800-v1');
    const opening = session.book.snapshot().chapters[0];
    assert.deepEqual(opening.facts.arrival, { season: 'Summer', winter: 800, tick: 500 });
    assert.match(opening.text, /summer/i);
    assert.doesNotMatch(opening.text, /Winter 800|800/);
    session.command({ type: 'AdvanceTicks', ticks: 4500 });
    const first = session.book.snapshot().chapters[1];
    assert.deepEqual(first.checkpoint.time, { winter: 805, tick: 0 });
    assert.deepEqual(first.facts.period, { from: { winter: 800, tick: 500 }, through: { winter: 805, tick: 0 } });
    assert.equal(first.facts.complete, true, 'The shorter opening interval is fully observed, not missing history.');
    for (const resource of ['food', 'materials']) {
        const ledger = first.facts.ledger[resource];
        assert.equal(ledger.complete, true);
        assert.equal(ledger.opening + ledger.production + ledger.otherReceipts - ledger.spending - ledger.losses, ledger.closing);
    }
    assert.equal(session.book.snapshot().chapters[0].text, opening.text);
    const bookSave = session.book.save(session.snapshot());
    const restored = new ClanBook(session.snapshot(), false);
    restored.restore(bookSave, session.snapshot());
    assert.deepEqual(restored.snapshot(), session.book.snapshot());
    const invalid = structuredClone(bookSave);
    invalid.chapters[0].facts.arrival.tick = 0;
    assert.throws(() => restored.restore(invalid, session.snapshot()), /Clan Book/);
    // The session enables social events explicitly, as before; compare the same rule set.
    const expected = core.applyCommand(core.createCampaign(32, {}, {}, {}, {}, { enabled: true }, {}, 'summer-800-v1'), { type: 'AdvanceTicks', ticks: 4500 });
    assert.equal(core.serializeState(expected), session.saveJSON());
});

test('shared Fjord campaigns keep Summer through handoff, new game and both restarts without shifting imports', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const shared = new SharedSettlement(32, 123, true, 'legacy', 'summer-800-v1');
    assert.deepEqual(shared.session.snapshot().time, { winter: 800, tick: 500 });
    const start = shared.session.saveJSON();
    const opening = shared.session.book.snapshot();
    const board = SharedSettlement.restore(shared.handoff('board'), 'board');
    const fjord = SharedSettlement.restore(board.handoff('fjord'), 'fjord');
    assert.equal(fjord.session.saveJSON(), start);
    assert.deepEqual(fjord.session.book.snapshot(), opening);
    fjord.restart(true);
    assert.deepEqual(fjord.session.snapshot().time, { winter: 800, tick: 500 });
    assert.equal(fjord.session.saveJSON(), start);
    fjord.restart(false);
    assert.notEqual(fjord.session.snapshot().seed, 32);
    assert.deepEqual(fjord.session.snapshot().time, { winter: 800, tick: 500 });
    fjord.newCampaign(42, true);
    assert.deepEqual(fjord.session.snapshot().time, { winter: 800, tick: 500 });
    const legacy = new SharedSettlement(32, 123);
    const legacySave = legacy.fjord.exportJSON();
    fjord.importJSON(legacySave);
    assert.equal(fjord.fjord.exportJSON(), legacySave);
    assert.deepEqual(fjord.session.snapshot().time, { winter: 800, tick: 0 });
    // An explicit new/restart choice can opt in after loading an old campaign.
    fjord.restart(true, true, 'summer-800-v1');
    assert.deepEqual(fjord.session.snapshot().time, { winter: 800, tick: 500 });
    assert.deepEqual(fjord.fjord.blueprint, legacy.fjord.blueprint);
});
