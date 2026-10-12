import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }], baseUpkeep: 0 };
const advance = (state, ticks) => core.applyCommand(state, { type: 'AdvanceTicks', ticks });
const setFire = (state, lit) => core.applyCommand(state, { type: 'SetCampfire', lit });

test('one Material buys exactly one year of burning, independent of the calendar boundary', () => {
    const initial = advance(core.createSettlement(27, quiet), 500);
    assert.equal(core.inspectCampfire(initial).lit, false);
    assert.equal(initial.stocks.materials, 10);
    const burning = setFire(initial, true);
    assert.deepEqual(core.inspectCampfire(burning), { lit: true, fuelTicks: 1000 });
    assert.equal(burning.stocks.materials, 9);
    assert.equal(initial.stocks.materials, 10, 'commands leave their input unchanged');
    const lastTick = advance(burning, 999);
    assert.equal(core.inspectCampfire(lastTick).fuelTicks, 1);
    assert.equal(lastTick.stocks.materials, 9);
    const spent = advance(lastTick, 1);
    assert.equal(core.inspectCampfire(spent).fuelTicks, 0);
    assert.equal(spent.stocks.materials, 9, 'no advance charge at the end of a purchased year');
    const next = advance(spent, 1);
    assert.equal(core.inspectCampfire(next).fuelTicks, 999);
    assert.equal(next.stocks.materials, 8);
});


test('fuel purchases remain accounted for in the saved clan book', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const session = new GameplaySession(27);
    session.loadJSON(core.serializeState(core.createSettlement(27, quiet)));
    session.command({ type: 'SetCampfire', lit: true });
    session.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = session.book.snapshot().chapters.at(-1);
    assert.equal(chapter.facts.ledger.materials.residual, 0);
    assert.equal(chapter.facts.ledger.materials.spending, 5);
    assert.equal(chapter.facts.ledger.materials.complete, true);
});

test('extinguishing banks unused fuel across save/load, and relighting does not pay twice', () => {
    let state = advance(setFire(core.createSettlement(27, quiet), true), 321);
    state = setFire(state, false);
    const saved = core.reconstructState(core.serializeState(state));
    const off = advance(saved, 1700);
    assert.deepEqual(core.inspectCampfire(off), { lit: false, fuelTicks: 679 });
    assert.equal(off.stocks.materials, 9);
    const relit = setFire(off, true);
    assert.equal(relit.stocks.materials, 9);
    assert.deepEqual(setFire(relit, true), relit, 'repeated on is idempotent');
    assert.equal(core.inspectCampfire(advance(relit, 679)).fuelTicks, 0);
});

test('an empty stock rejects lighting and extinguishes only after prepaid fuel is used', () => {
    const empty = core.createSettlement(27, quiet);
    empty.stocks.materials = 0;
    assert.throws(() => setFire(empty, true), /requires 1 Material/);
    assert.equal(empty.campfire, undefined);
    empty.stocks.materials = 1;
    const burning = setFire(empty, true);
    const ended = advance(burning, 1001);
    assert.deepEqual(core.inspectCampfire(ended), { lit: false, fuelTicks: 0 });
    assert.equal(ended.stocks.materials, 0);
    assert.equal(ended.events.filter(e => e.type === 'CampfireFuelConsumed').length, 1);
    assert.ok(ended.events.some(e => e.type === 'CampfireChanged' && e.details.reason === 'out-of-fuel'));
});

test('chunked ticks, individual ticks and save/load replay give identical fuel and events', () => {
    const initial = setFire(core.createSettlement(27, quiet), true);
    let single = initial;
    for (let tick = 0; tick < 1001; tick++) single = advance(single, 1);
    const chunked = advance(initial, 1001);
    const restored = advance(core.reconstructState(core.serializeState(advance(initial, 487))), 514);
    assert.deepEqual(single, chunked);
    assert.deepEqual(restored, chunked);
    assert.equal(chunked.rngState, advance(core.createSettlement(27, quiet), 1001).rngState);
});

test('malformed campfire saves are rejected; legacy saves remain off without invented costs', () => {
    const initial = core.createSettlement(27, quiet);
    const legacy = core.serializeState(initial);
    assert.equal(core.serializeState(core.reconstructState(legacy)), legacy);
    for (const fire of [null, { version: 2, lit: false, fuelTicks: 0 },
        { version: 1, lit: 'yes', fuelTicks: 0 }, { version: 1, lit: true, fuelTicks: -1 },
        { version: 1, lit: true, fuelTicks: 1001 }, { version: 1, lit: true, fuelTicks: .5 }]) {
        assert.throws(() => core.reconstructState(JSON.stringify({ ...initial, campfire: fire })), /campfire save/);
    }
});
