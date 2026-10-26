import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { personalChronicleEntry } = load('../src/lore/Chronicle.ts');
const { attentionEvent } = load('../src/lore/AttentionHistory.ts');

function heldGathering() {
    const session = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    const offer = session.gatheringOffer();
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds }]);
    const event = session.readSnapshot().events.find(item => item.type === 'CulturalGatheringHeld');
    return { session, offer, event };
}

test('a paid gathering has one factual low-noise source record and only actual attendee histories', () => {
    const { session, offer, event } = heldGathering();
    const entry = personalChronicleEntry(event);
    assert.ok(entry, 'A real gathering must have a readable Chronicle entry');
    assert.match(entry.text, /3 Food/);
    assert.match(entry.text, /storytelling/);
    assert.ok(entry.text.includes(offer.participants[0].name));
    assert.deepEqual(entry.sourceEventIds, [event.id]);
    const attention = attentionEvent(event);
    assert.ok(attention);
    assert.equal(attention.severity, 'ambient');
    assert.deepEqual(attention.actorIds, offer.participantIds);
    const own = session.personalHistory(offer.participantIds[0]).records.find(record => record.sourceEventId === event.id);
    assert.ok(own);
    assert.deepEqual(own.roles, ['gathering participant']);
    const absent = Object.keys(session.readSnapshot().personas).find(id => !offer.participantIds.includes(id));
    assert.ok(absent);
    assert.equal(session.personalHistory(absent).records.some(record => record.sourceEventId === event.id), false);
});

test('a real weather support assessment is factual history without a claim that anyone was saved', () => {
    const core = load('../src/simulation/SimulationCore.ts');
    const weather = structuredClone(core.defaultWeatherConfig);
    for (const kind of core.weatherClasses)
        weather.profiles[kind].probabilityBps = kind === 'Severe' ? 10000 : 0;
    const state = core.createCampaign(1, { foundingCoupleChanceBps: 0 },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 },
        weather, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    const offer = session.gatheringOffer();
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds }]);
    session.command({ type: 'AdvanceWinter' });
    const event = session.readSnapshot().events.find(item => item.type === 'CultureWeatherSupportApplied');
    assert.ok(event);
    const entry = personalChronicleEntry(event);
    assert.ok(entry, 'The applied risk modifier must remain readable');
    assert.match(entry.text, /Severe/);
    assert.match(entry.text, /weather.exposure risk/);
    assert.doesNotMatch(entry.text, /saved|survived|prevented|brave|faith/i);
    assert.equal(attentionEvent(event).severity, 'ambient');
    const id = event.details.participants[0];
    const record = session.personalHistory(id).records.find(item => item.sourceEventId === event.id);
    assert.ok(record);
    assert.deepEqual(record.roles, ['weather support recipient']);
});

test('a five-Winter chapter accounts for the paid gathering and preserves published text across full campaign restore', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { session, event } = heldGathering();
    const opening = structuredClone(session.book.snapshot().chapters[0]);
    session.command({ type: 'AdvanceTicks', ticks: 4500 });
    const chapter = session.book.snapshot().chapters.at(-1);
    assert.equal(chapter.facts.ledger.food.complete, true);
    assert.equal(chapter.facts.ledger.food.otherSpending, 3);
    const paragraph = chapter.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.social') && part.sourceEventIds.includes(event.id));
    assert.ok(paragraph, 'The real cultural event must reach the Clan Book narrative');
    assert.match(paragraph.text, /gathered for storytelling/);
    assert.doesNotMatch(paragraph.text, /3 Food/);
    assert.deepEqual(session.book.snapshot().chapters[0], opening);
    const shared = new SharedSettlement(session);
    const saved = shared.persist();
    const restored = SharedSettlement.restore(saved, 'fjord');
    assert.deepEqual(restored.session.book.snapshot().chapters, session.book.snapshot().chapters);
    assert.equal(restored.session.personalHistory(event.details.participants[0]).records
        .some(record => record.sourceEventId === event.id && record.status === 'recorded'), true);
});
