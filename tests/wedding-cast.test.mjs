import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { weddingCast } = load('../src/fjord-play/WeddingCast.ts');

function wedding() {
    const text = readFileSync(new URL('../docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json', import.meta.url), 'utf8');
    const shared = SharedSettlement.restore(text, 'fjord');
    const session = shared.session;
    const choice = core.weddingCandidates(session.snapshot()).find(item => item.allowed);
    assert.ok(choice);
    const offer = session.gatheringOffer('wedding', choice.sourceEventId);
    session.command({ type: 'SponsorGathering', occasion: 'wedding', sourceEventId: choice.sourceEventId,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        quotedMaterials: offer.materialsCost, expectedParticipantIds: offer.participantIds });
    return session.snapshot();
}

test('a real wedding casts its couple, oldest eligible recorded guest and three distinct musicians without changing Core', () => {
    const state = wedding();
    const saved = core.serializeState(state);
    const event = state.events.find(item => item.id === state.culture.lastGatheringEventId);
    const cast = weddingCast(state, event);
    assert.equal(cast.filter(item => item.role === 'couple').length, 2);
    assert.deepEqual(cast.filter(item => item.role === 'couple').map(item => item.id).sort(), [...event.details.spouseIds].sort());
    const guests = event.details.people.filter(person => !event.details.spouseIds.includes(person.id));
    const oldest = guests.slice().sort((a, b) => b.age - a.age || a.id.localeCompare(b.id))[0];
    assert.equal(cast.find(item => item.role === 'officiant').id, oldest.id);
    assert.deepEqual(cast.filter(item => item.role === 'musician').map(item => item.instrument), ['wedding-lyre', 'wedding-flute', 'wedding-frame-drum']);
    assert.equal(new Set(cast.map(item => item.id)).size, cast.length);
    assert.ok(cast.every(item => event.details.participants.includes(item.id)));
    assert.equal(core.serializeState(state), saved);
    assert.deepEqual(weddingCast(core.reconstructState(saved), event), cast);
});
