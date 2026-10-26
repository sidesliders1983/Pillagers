import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { core, lossOffered } from './helpers/contextual-support.mjs';

const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { personalChronicleEntry, projectChronicle } = load('../src/lore/Chronicle.ts');
const { attentionEvent } = load('../src/lore/AttentionHistory.ts');

function completedSupport(options) {
    const offered = lossOffered(options);
    const state = core.applyCommand(offered, { type: 'AdvanceTicks', ticks: 50 });
    const offer = state.events.find(event => event.type === 'SupportOffered');
    const accepted = state.events.find(event => event.type === 'SupportAccepted');
    const completed = state.events.find(event => event.type === 'SupportCompleted');
    assert.ok(offer && accepted && completed, 'The public campaign must complete actual support');
    const source = state.events.find(event => event.id === offer.details.sourceEventId);
    assert.equal(source.type, 'BuildingCollapsed');
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    return { session, state, offer, accepted, completed, source };
}

test('completed support names its actual helper, recipient and prior loss without rewriting the source', () => {
    const { session, state, offer, accepted, completed, source } = completedSupport();
    const family = structuredClone(session.familyTree());
    const before = session.saveJSON();
    for (const event of [offer, accepted, completed]) {
        const entry = personalChronicleEntry(event);
        assert.ok(entry, 'Every committed support phase has a factual history entry');
        assert.deepEqual(entry.sourceEventIds, [event.id]);
        for (const person of event.details.people) assert.ok(entry.text.includes(person.name));
        assert.match(entry.text, /collapse/);
        assert.doesNotMatch(entry.text, /repaired|rebuilt|gave .*Food|gave .*Materials|grateful|thank|bless|god|priest/i);
        const helper = session.personalHistory(event.details.helperId, 100).records
            .find(record => record.sourceEventId === event.id);
        const recipient = session.personalHistory(event.details.recipientId, 100).records
            .find(record => record.sourceEventId === event.id);
        assert.deepEqual(helper.roles, ['support helper']);
        assert.deepEqual(recipient.roles, ['support recipient']);
    }
    assert.match(personalChronicleEntry(offer).text, /offered support/);
    assert.match(personalChronicleEntry(accepted).text, /accepted/);
    assert.match(personalChronicleEntry(completed).text, /completed support/);
    assert.match(personalChronicleEntry(completed).text, /one shared prepared weather assessment/);
    const entries = projectChronicle(state.events).flatMap(group => group.entries);
    const collapse = entries.find(entry => entry.sourceEventIds.includes(source.id));
    assert.deepEqual(collapse.sourceEventIds, [source.id]);
    assert.match(collapse.text, /collapsed;/);
    assert.doesNotMatch(collapse.text, /offered|accepted|completed support/);
    const own = session.personalHistory(completed.details.recipientId, 100).records;
    assert.ok(own.some(record => record.sourceEventId === source.id && record.roles.includes('household resident')));
    assert.equal(attentionEvent(offer), null);
    assert.equal(attentionEvent(accepted), null);
    const notification = attentionEvent(completed);
    assert.equal(notification.category, 'life');
    assert.equal(notification.severity, 'noteworthy');
    assert.deepEqual(notification.actorIds, completed.details.participants);
    assert.deepEqual(notification.target, { kind: 'persona', id: completed.details.recipientId });
    assert.equal(session.attentionHistory().retained().filter(record =>
        record.canonicalType.startsWith('Support')).length, 1);
    assert.deepEqual(session.familyTree(), family);
    assert.equal(session.saveJSON(), before, 'Reading factual history cannot reroll or debit Core');
});

test('a delayed support passage links its real loss and offer and survives shared restore without changing published chapters', () => {
    const { planNarrative } = load('../src/lore/NarrativePlan.ts');
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const state = lossOffered();
    const offer = state.events.find(event => event.type === 'SupportOffered');
    const source = state.events.find(event => event.id === offer.details.sourceEventId);
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    const opening = structuredClone(session.book.snapshot().chapters[0]);
    session.command({ type: 'AdvanceTicks', ticks: 50 });
    const completed = session.readSnapshot().events.find(event => event.type === 'SupportCompleted');
    const accepted = session.readSnapshot().events.find(event => event.type === 'SupportAccepted');
    const plan = planNarrative(session.readSnapshot().events, state.events.length, 3);
    const thread = plan.threads.find(item => item.sourceEventIds.includes(completed.id));
    assert.ok(thread, 'Completed contextual support belongs in the social story');
    assert.equal(thread.theme, 'social');
    assert.deepEqual(thread.sourceEventIds, [accepted.id, completed.id]);
    assert.deepEqual(new Set(thread.callbackEventIds), new Set([source.id, offer.id]));
    session.command({ type: 'AdvanceTicks', ticks: 1950 });
    const chapter = session.book.snapshot().chapters.at(-1);
    const passage = chapter.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.social') &&
        part.sourceEventIds.includes(completed.id));
    assert.ok(passage, 'The completed aid reaches the next Clan Book chapter');
    for (const event of [source, offer, accepted, completed]) assert.ok(passage.sourceEventIds.includes(event.id));
    assert.match(passage.text, /collapsed;/);
    assert.match(passage.text, /offered support/);
    assert.match(passage.text, /accepted support/);
    assert.match(passage.text, /completed support/);
    assert.doesNotMatch(passage.text, /repaired|rebuilt|grateful|thank|bless|god|priest/i);
    assert.equal(chapter.facts.ledger.food.otherSpending, 0);
    assert.equal(chapter.facts.ledger.materials.otherSpending, 2, 'Two existing annual house upkeep payments remain exact');
    assert.deepEqual(session.book.snapshot().chapters[0], opening);
    const restored = SharedSettlement.restore(new SharedSettlement(session).persist(), 'fjord');
    assert.deepEqual(restored.session.book.snapshot().chapters, session.book.snapshot().chapters);
    assert.equal(restored.session.saveJSON(), session.saveJSON());
    const own = restored.session.personalHistory(completed.details.recipientId, 100).records;
    for (const event of [source, offer, accepted, completed]) {
        const record = own.find(item => item.sourceEventId === event.id);
        assert.ok(record);
        assert.equal(record.status, 'recorded');
        assert.ok(record.publications.some(publication => publication.chapterIndex === chapter.index));
    }
});

test('declined and unavailable support offers remain factual attempts without completed-aid notifications', () => {
    const { planNarrative } = load('../src/lore/NarrativePlan.ts');
    const declined = core.applyCommand(lossOffered({ support: { acceptanceBps: 0 } }),
        { type: 'AdvanceTicks', ticks: 50 });
    let unavailable = lossOffered();
    const offer = unavailable.events.find(event => event.type === 'SupportOffered');
    unavailable = core.applyCommand(unavailable, { type: 'CreateExpeditionGroup', name: 'Away',
        memberIds: [offer.details.helperId] });
    unavailable = core.applyCommand(unavailable, { type: 'DispatchExpedition', groupId: 'group-1',
        regionId: 'region-east', mission: 'Recon' });
    unavailable = core.applyCommand(unavailable, { type: 'AdvanceTicks', ticks: 50 });
    for (const [state, kind, wording] of [
        [declined, 'SupportDeclined', /declined/],
        [unavailable, 'SupportEnded', /unavailable/],
    ]) {
        const event = state.events.find(item => item.type === kind);
        assert.ok(event);
        const entry = personalChronicleEntry(event);
        assert.ok(entry, 'An unsuccessful offer keeps its actual terminal history');
        assert.match(entry.text, wording);
        assert.deepEqual(entry.sourceEventIds, [event.id]);
        assert.doesNotMatch(entry.text, /completed support|assessment was added|repaired|rebuilt|grateful|thank|bless/i);
        for (const person of event.details.people) assert.ok(entry.text.includes(person.name));
        assert.equal(attentionEvent(event), null);
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(state));
        assert.deepEqual(session.personalHistory(event.details.helperId, 100).records
            .find(record => record.sourceEventId === event.id).roles, ['support helper']);
        assert.deepEqual(session.personalHistory(event.details.recipientId, 100).records
            .find(record => record.sourceEventId === event.id).roles, ['support recipient']);
        const plan = planNarrative(state.events, state.events.indexOf(event), 3);
        const thread = plan.threads.find(item => item.sourceEventIds.includes(event.id));
        assert.ok(thread);
        assert.deepEqual(new Set(thread.callbackEventIds),
            new Set([event.details.sourceEventId, event.details.offeredEventId]));
    }
});

test('support completed at shared capacity records the aid without claiming another prepared assessment', () => {
    let state = lossOffered();
    for (let count = 0; count < 2; count++) {
        const quote = core.gatheringOffer(state);
        assert.equal(quote.allowed, true);
        state = core.applyCommand(state, { type: 'SponsorGathering', occasion: quote.occasion,
            expectedSequence: quote.expectedSequence, quotedFood: quote.foodCost,
            expectedParticipantIds: quote.participantIds });
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 50 });
    const completed = state.events.find(event => event.type === 'SupportCompleted');
    assert.equal(completed.details.supportContribution, 0);
    assert.equal(completed.details.supportBefore, 2);
    assert.equal(completed.details.supportAfter, 2);
    const entry = personalChronicleEntry(completed);
    assert.match(entry.text, /completed support/);
    assert.match(entry.text, /already at capacity/);
    assert.doesNotMatch(entry.text, /assessment was added|repaired|gave .*Food|gave .*Materials/i);
    assert.ok(attentionEvent(completed), 'Completed aid has one factual notification even when the bank is full');
    assert.equal(core.inspectCulture(state).sourceEventIds.includes(completed.id), false);
});

test('an actual later weather assessment links back to completed aid, acceptance, offer and housing loss', () => {
    const { planNarrative } = load('../src/lore/NarrativePlan.ts');
    const { session, offer, accepted, completed, source } = completedSupport();
    const previousEnd = session.readSnapshot().events.length;
    session.command({ type: 'AdvanceWinter' });
    const state = session.readSnapshot();
    const applied = state.events.find(event => event.type === 'CultureWeatherSupportApplied' &&
        event.details.sourceEventIds.includes(completed.id));
    assert.ok(applied, 'The next actual Severe assessment uses this completed support');
    assert.deepEqual(personalChronicleEntry(applied).sourceEventIds, [applied.id]);
    const plan = planNarrative(state.events, previousEnd, 3);
    const thread = plan.threads.find(item => item.sourceEventIds.includes(applied.id));
    assert.ok(thread);
    assert.deepEqual(new Set(thread.callbackEventIds), new Set([source.id, offer.id, accepted.id, completed.id]));
    session.command({ type: 'AdvanceWinter' });
    const chapter = session.book.snapshot().chapters.at(-1);
    const passage = chapter.paragraphs.find(part => part.templateId.startsWith('clan-book.thread.social') &&
        part.sourceEventIds.includes(applied.id));
    assert.ok(passage);
    for (const event of [source, offer, accepted, completed]) assert.ok(passage.sourceEventIds.includes(event.id));
    assert.match(passage.text, /accepted support/);
    assert.match(passage.text, /completed support/);
    assert.match(passage.text, /reduced assessed weather.exposure risk/);
    assert.doesNotMatch(passage.text, /saved|prevented|repaired|grateful|thank|bless/i);
});
