import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');

test('a new campaign freezes its factual opening and saves the same book across view handoff', () => {
    const owner = new SharedSettlement(17);
    const original = owner.session.saveJSON();
    const book = owner.session.book.snapshot();
    const opening = book.chapters[0];
    assert.equal(opening.index, 0);
    assert.equal(opening.facts.complete, true);
    assert.deepEqual(opening.facts.founders.map(p => p.name), Object.values(owner.session.snapshot().personas).map(p => p.name));
    assert.equal(opening.facts.stocks.food, 15);
    assert.equal(opening.facts.stocks.materials, 5);
    assert.equal(owner.session.saveJSON(), original, 'Narrative identity does not consume Core RNG');
    const text = opening.text;
    owner.command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    assert.equal(owner.session.book.snapshot().chapters[0].text, text);
    const restored = SharedSettlement.restore(owner.handoff('board'), 'board');
    assert.deepEqual(restored.session.book.snapshot(), owner.session.book.snapshot());
    assert.notEqual(new SharedSettlement(17).session.book.snapshot().id, book.id);
    assert.equal(new SharedSettlement(17).session.saveJSON(), original);
});

test('five completed Winters close one reconciled appendix including final-tick production and annual use', () => {
    const owner = new SharedSettlement(17);
    const before = owner.session.snapshot();
    owner.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    owner.command({ type: 'SlaughterCattle', cattleId: 'cattle-3' });
    owner.command({ type: 'BuildHouse', householdId: 'founder-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapters = owner.session.book.snapshot().chapters;
    assert.equal(chapters.length, 2);
    const chapter = chapters[1];
    assert.equal(chapter.checkpoint.time.winter, 805);
    assert.equal(chapter.checkpoint.time.tick, 0);
    assert.equal(chapter.facts.ledger.materials.otherReceipts, 20);
    assert.equal(chapter.facts.ledger.food.otherReceipts, 15);
    assert.ok(chapter.facts.ledger.materials.spending >= 10);
    const final = owner.session.snapshot();
    for (const resource of ['food', 'materials']) {
        const row = chapter.facts.ledger[resource];
        assert.equal(row.opening, before.stocks[resource]);
        assert.equal(row.closing, final.stocks[resource]);
        assert.equal(row.opening + row.production + row.otherReceipts - row.spending - row.losses, row.closing);
        assert.equal(row.complete, true);
    }
    assert.ok(chapter.sourceEventIds.includes(final.events.at(-1).id), 'checkpoint includes the completed boundary');
    owner.command({ type: 'AdvanceTicks', ticks: 0 });
    assert.equal(owner.session.book.snapshot().chapters.length, 2);
});

test('fifteen-Winter fast-forward freezes disjoint intermediate packages and rejects a rolled-back future', () => {
    const owner = new SharedSettlement(32);
    const initial = owner.session.snapshot();
    const rollback = owner.fjord.exportJSON();
    owner.command({ type: 'AdvanceTicks', ticks: 15000 });
    const finalBook = owner.session.book.snapshot();
    assert.deepEqual(finalBook.chapters.map(c => c.checkpoint.time.winter), [800, 805, 810, 815]);
    const ids = finalBook.chapters.slice(1).flatMap(c => c.sourceEventIds);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(owner.session.saveJSON(), core.serializeState(core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 15000 })));
    assert.deepEqual(finalBook.chapters[2].facts.ledger.food.opening, finalBook.chapters[1].facts.ledger.food.closing);
    const future = JSON.parse(owner.fjord.exportJSON());
    owner.importJSON(rollback);
    assert.equal(owner.session.book.snapshot().chapters.length, 1);
    future.campaign = JSON.parse(rollback).campaign;
    assert.throws(() => owner.importJSON(JSON.stringify(future)), /does not match/);
    assert.equal(owner.session.book.snapshot().chapters.length, 1, 'failed import is atomic');
    owner.importJSON(core.serializeState(core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 12000 })));
    assert.equal(owner.session.book.snapshot().chapters.length, 1, 'plain save has no retrospective flood');
    assert.equal(owner.session.book.snapshot().chapters[0].notified, true);
    assert.equal(owner.session.book.snapshot().chapters[0].facts.complete, false);
    owner.command({ type: 'AdvanceTicks', ticks: 3000 });
    const partial = owner.session.book.snapshot().chapters[1];
    assert.equal(partial.checkpoint.time.winter, 815);
    assert.equal(partial.facts.complete, false, 'observed partial history is labelled incomplete');
});

test('notification and reading are distinct and do not alter clock intent or Core state', () => {
    const owner = new SharedSettlement(17);
    owner.session.setRunning(true);
    const saved = owner.session.saveJSON();
    owner.session.book.notifyPending();
    assert.equal(owner.session.book.snapshot().chapters[0].notified, true);
    assert.equal(owner.session.book.snapshot().chapters[0].read, false);
    owner.session.book.markRead(0);
    const next = SharedSettlement.restore(owner.persist(), 'fjord');
    assert.equal(next.session.book.snapshot().chapters[0].read, true);
    assert.equal(owner.session.running, true);
    assert.equal(owner.session.saveJSON(), saved);
    owner.session.setRunning(false);
    owner.session.book.notifyPending();
    assert.equal(owner.session.running, false);
});

test('lifecycle identities remain historical and legacy event data stays explicitly partial', () => {
    const owner = new SharedSettlement(17);
    const state = core.createCampaign(17, {}, { mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }, { enabled: false });
    owner.importJSON(core.serializeState(state));
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const chapter = owner.session.book.snapshot().chapters[1];
    assert.equal(chapter.facts.demographics.filter(e => e.type === 'PersonaDied').length, 10);
    assert.ok(chapter.text.includes('died'));
    for (const death of chapter.facts.demographics.filter(e => e.type === 'PersonaDied')) {
        assert.equal(death.details.name, state.personas[death.personaId].name);
        assert.equal(death.details.cause, undefined, 'Narration does not infer an unrecorded cause');
    }
    const incomplete = core.createCampaign(17);
    incomplete.events.push({ id: 'event-' + (incomplete.events.length + 1), time: { ...incomplete.time },
        type: 'ResourceProduced', details: { resource: 'food' } });
    // The unsupported quantity belongs to the observed interval, after the opening cursor.
    const recorded = new SharedSettlement(17);
    const envelope = JSON.parse(recorded.fjord.exportJSON());
    envelope.campaign = incomplete;
    delete envelope.narrative;
    recorded.importJSON(JSON.stringify(envelope));
    // Legacy history remains explicitly partial rather than assuming missing facts are zero.
    assert.equal(recorded.session.book.snapshot().chapters[0].facts.complete, false);
});

test('corrupt narrative facts are rejected before replacing the active campaign', () => {
    const owner = new SharedSettlement(17);
    const saved = owner.session.saveJSON();
    const invalid = JSON.parse(owner.fjord.exportJSON());
    invalid.narrative.chapters[0].facts = {};
    assert.throws(() => owner.importJSON(JSON.stringify(invalid)), /Clan Book/);
    assert.equal(owner.session.saveJSON(), saved);
});

test('paid upkeep, upgrades and expedition provisions reconcile separately from recovered cargo and refunds', () => {
    const owner = new SharedSettlement(32);
    const initial = core.createCampaign(32, { initialFood: 400, initialMaterials: 1000,
        cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
            casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } });
    owner.importJSON(core.serializeState(initial));
    owner.command({ type: 'BuildHouse', householdId: 'founder-1' });
    owner.command({ type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' });
    owner.command({ type: 'UpgradeBuilding', buildingId: 'house-1' });
    const region = Object.values(initial.world.regions).find(r => r.targetClanId && !r.requiresShip);
    owner.command({ type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: ['founder-1'] });
    owner.command({ type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
    owner.command({ type: 'AdvanceTicks', ticks: 250 });
    owner.command({ type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Pillage', priorities: ['Food'] });
    owner.command({ type: 'AdvanceTicks', ticks: 4750 });
    const first = owner.session.book.snapshot().chapters[1].facts.ledger;
    assert.equal(first.food.otherReceipts, 10);
    assert.equal(first.food.consumption, 115);
    assert.equal(first.food.otherSpending, 7);
    assert.equal(first.food.spending, 122, '115 annual Food plus 2 Recon and 5 Pillage provisions');
    assert.equal(first.materials.spending, 25, '10 house + 5 upgrade + five paid upkeep rounds at 2');
    assert.equal(first.food.complete, true);
    assert.equal(first.materials.complete, true);
    owner.command({ type: 'SalvageBuilding', buildingId: 'house-1' });
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    assert.equal(owner.session.book.snapshot().chapters[2].facts.ledger.materials.otherReceipts, 7);
});

test('unmet Food need is recorded without counting it as consumption or spending', () => {
    const owner = new SharedSettlement(17);
    const profiles = Object.fromEntries(Object.entries(core.defaultWeatherConfig.profiles).map(([name, profile]) =>
        [name, { ...profile, probabilityBps: name === 'Harsh' ? 10000 : 0, tentMortalityBps: 0, exposedCattleMortalityBps: 0 }]));
    owner.importJSON(core.serializeState(core.createCampaign(17, { initialFood: 0, initialMaterials: 0,
        cattleBirthChanceBps: 0, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: true, profiles })));
    owner.command({ type: 'AdvanceTicks', ticks: 5000 });
    const row = owner.session.book.snapshot().chapters[1].facts.ledger.food;
    assert.equal(row.production, 0);
    assert.equal(row.spending, 0);
    assert.equal(row.closing, 0);
    assert.equal(row.unmetNeed, 175, 'five annual rounds of 30 resident Food plus 5 cattle Food');
    assert.equal(row.complete, true);
});
