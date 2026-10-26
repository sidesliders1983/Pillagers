import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { personalChronicleEntry } = load('../src/lore/Chronicle.ts');
const { attentionEvent } = load('../src/lore/AttentionHistory.ts');

function commit(session, occasion, sourceEventId) {
    const offer = session.gatheringOffer(occasion, sourceEventId);
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds, ...(sourceEventId ? { sourceEventId } : {}) }]);
    return session.readSnapshot().events.at(-1);
}

test('a communal ceremony is a neutral factual record of actual attendees and paid Food', () => {
    const session = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    const event = commit(session, 'communal_ceremony');
    const entry = personalChronicleEntry(event);
    assert.ok(entry, 'The real ceremony must have its own readable factual history');
    assert.match(entry.text, /communal ceremony/);
    assert.match(entry.text, /3 Food/);
    assert.doesNotMatch(entry.text, /god|priest|bless|divine|saved|sacrifice/i);
    assert.deepEqual(entry.sourceEventIds, [event.id]);
    assert.equal(attentionEvent(event).severity, 'ambient');
    for (const person of event.details.people) {
        assert.ok(entry.text.includes(person.name));
        assert.ok(session.personalHistory(person.id).records.some(record => record.sourceEventId === event.id));
    }
});

function weddingSession() {
    let state = core.createCampaign(32, { foundingCoupleChanceBps: 0 }, {
        partnershipChanceBps: 10000, fertilityChanceBps: 0, careerReviewWinters: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
    state = core.advanceWinter(state);
    const source = state.events.find(event => event.type === 'PartnershipFormed');
    assert.ok(source);
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    return { session, source };
}

test('a wedding remembers the actual partners and guests without rewriting the family relationship', () => {
    const { session, source } = weddingSession();
    const family = structuredClone(session.familyTree());
    const event = commit(session, 'wedding', source.id);
    const entry = personalChronicleEntry(event);
    assert.ok(entry, 'A real wedding celebration must have a readable factual record');
    assert.match(entry.text, /held a wedding celebration/);
    assert.match(entry.text, /3 Food/);
    assert.doesNotMatch(entry.text, /became partners|formed a partnership|bless|god|priest/i);
    assert.deepEqual(entry.sourceEventIds, [event.id]);
    assert.equal(event.details.sourceEventId, source.id);
    assert.equal(attentionEvent(event).severity, 'ambient');
    for (const person of event.details.people) {
        assert.ok(entry.text.includes(person.name));
        const own = session.personalHistory(person.id, 100).records;
        const celebration = own.find(record => record.sourceEventId === event.id);
        assert.ok(celebration);
        assert.deepEqual(celebration.roles, event.details.spouseIds.includes(person.id) ?
            ['celebrated partner'] : ['wedding guest']);
        if (event.details.spouseIds.includes(person.id))
            assert.ok(own.some(record => record.sourceEventId === source.id && record.roles.includes('partner')));
    }
    assert.deepEqual(session.familyTree(), family);
});

test('a delayed wedding passage links back to its real partnership without absorbing unrelated social facts', () => {
    const { planNarrative } = load('../src/lore/NarrativePlan.ts');
    const { session, source } = weddingSession();
    const event = commit(session, 'wedding', source.id);
    const events = session.readSnapshot().events;
    const plan = planNarrative(events, events.length - 1, 3);
    const thread = plan.threads.find(item => item.sourceEventIds.includes(event.id));
    assert.ok(thread);
    assert.deepEqual(thread.callbackEventIds, [source.id]);
    assert.equal(thread.theme, 'social');
    assert.deepEqual(plan.callbackEventIds, [source.id]);
});

test('both occasions reach the next Clan Book chapter with exact costs and immutable restored publications', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { session, source } = weddingSession();
    const opening = structuredClone(session.book.snapshot().chapters[0]);
    const wedding = commit(session, 'wedding', source.id);
    const ceremony = commit(session, 'communal_ceremony');
    session.command({ type: 'AdvanceTicks', ticks: 4000 });
    const chapter = session.book.snapshot().chapters.at(-1);
    assert.equal(chapter.facts.ledger.food.complete, true);
    assert.equal(chapter.facts.ledger.food.otherSpending, 6);
    const social = chapter.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.social'));
    assert.ok(social);
    assert.ok(social.sourceEventIds.includes(wedding.id));
    assert.ok(social.sourceEventIds.includes(ceremony.id));
    assert.ok(social.sourceEventIds.includes(source.id));
    assert.match(social.text, /wedding celebration/);
    assert.match(social.text, /communal ceremony/);
    assert.doesNotMatch(social.text, /3 Food|\b80[0-9]\b|bless|god|priest/i);
    assert.deepEqual(session.book.snapshot().chapters[0], opening);
    const restored = SharedSettlement.restore(new SharedSettlement(session).persist(), 'fjord');
    assert.deepEqual(restored.session.book.snapshot().chapters, session.book.snapshot().chapters);
    assert.deepEqual(restored.session.readSnapshot().events.find(event => event.id === source.id), source);
    const own = restored.session.personalHistory(wedding.details.spouseIds[0], 100).records;
    const record = own.find(item => item.sourceEventId === wedding.id);
    assert.equal(record.status, 'recorded');
    assert.deepEqual(record.roles, ['celebrated partner']);
    assert.ok(record.publications.some(publication => publication.chapterIndex === chapter.index));
});
