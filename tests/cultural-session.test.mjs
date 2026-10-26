import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');

test('a session exposes cultural sponsorship only for an explicitly configured prototype', () => {
    const ordinary = new GameplaySession(32);
    const prototype = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });

    assert.equal(ordinary.gatheringOffer().enabled, false);
    const offer = prototype.gatheringOffer();
    assert.equal(offer.enabled, true);
    assert.equal(offer.allowed, true);
    assert.equal(offer.foodCost, 3);
    assert.equal(offer.participantIds.length, 8);
    assert.equal(prototype.inspectCulture().supportCount, 0);
    assert.equal(ordinary.snapshot().culture, undefined);
});

test('a reviewed sponsorship can commit through the session management transaction without advancing time', () => {
    const session = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    session.setRunning(true);
    const time = { ...session.readSnapshot().time };
    const offer = session.gatheringOffer();
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds }]);

    assert.equal(session.readSnapshot().stocks.food, 12);
    assert.equal(session.inspectCulture().supportCount, 1);
    assert.deepEqual(session.readSnapshot().time, time);
    assert.equal(session.running, true);
});

test('save and founder replay preserve cultural rules while a replay clears earned support', () => {
    const session = new GameplaySession(32, undefined, true, 'summer-800-v1',
        undefined, undefined, { enabled: true });
    const opening = structuredClone(session.book.snapshot().chapters[0]);
    const offer = session.gatheringOffer();
    session.commandBatch([{ type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds }]);
    const restored = new GameplaySession();
    restored.loadJSON(session.saveJSON());
    assert.equal(restored.inspectCulture().supportCount, 1);
    assert.deepEqual(session.book.snapshot().chapters[0], opening);
    const beforeReplay = restored.saveJSON();
    const replay = restored.restartProposal();

    assert.equal(replay.gatheringOffer().enabled, true);
    assert.equal(replay.inspectCulture().supportCount, 0);
    assert.equal(replay.readSnapshot().stocks.food, 15);
    assert.equal(restored.saveJSON(), beforeReplay);
});

test('the Fjord scenario opts into the prototype without changing founders or ordinary defaults', () => {
    const { newFjordScenario } = load('../src/fjord-play/FjordScenario.ts');
    const ordinary = newFjordScenario(32);
    const prototype = newFjordScenario(32, true);

    assert.equal(ordinary.gatheringOffer().enabled, false);
    assert.equal(prototype.gatheringOffer().enabled, true);
    assert.deepEqual(prototype.readSnapshot().personas, ordinary.readSnapshot().personas);
    assert.equal(prototype.readSnapshot().rngState, ordinary.readSnapshot().rngState);
    assert.equal(prototype.readSnapshot().stocks.food, 15);
});

test('starting a different campaign can explicitly select culture without changing an imported campaign', () => {
    const session = new GameplaySession(32);
    const legacy = session.saveJSON();
    session.newCampaign(33, true, true, 'summer-800-v1', undefined, undefined, { enabled: true });
    assert.equal(session.gatheringOffer().enabled, true);
    assert.equal(session.readSnapshot().seed, 33);
    session.loadJSON(legacy);
    assert.equal(session.gatheringOffer().enabled, false);
    assert.equal(session.readSnapshot().culture, undefined);
});
