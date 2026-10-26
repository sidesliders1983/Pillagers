import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');

test('the session reviews and commits a communal ceremony through the same saved campaign transaction', () => {
    const session = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    const offer = session.gatheringOffer('communal_ceremony');
    assert.equal(offer.occasion, 'communal_ceremony');
    assert.equal(offer.allowed, true);
    const time = { ...session.readSnapshot().time };
    session.setRunning(true);
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds }]);
    assert.equal(session.running, true);
    assert.deepEqual(session.readSnapshot().time, time);
    assert.equal(session.readSnapshot().stocks.food, 12);
    assert.equal(session.readSnapshot().events.at(-1).details.occasion, 'communal_ceremony');
    const shared = new SharedSettlement(session);
    const restored = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(restored.session.inspectCulture().supportCount, 1);
    assert.equal(restored.session.readSnapshot().events.at(-1).details.occasion, 'communal_ceremony');
});
