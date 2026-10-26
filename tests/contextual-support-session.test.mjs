import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load-source.mjs';
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');

test('restarting a legacy cultural campaign preserves the absence of contextual support', () => {
    const saved = JSON.parse(readFileSync(new URL('../docs/qa/cultural-occasions-277/review-fixture-v2/review-before-partnership.json', import.meta.url), 'utf8'));
    const session = new GameplaySession();
    session.loadJSON(JSON.stringify(saved.fjord.campaign));
    assert.equal(session.readSnapshot().contextualSupport, undefined);
    assert.equal(session.inspectCulture().enabled, true);
    const before = session.saveJSON();
    const replay = session.restartProposal();
    assert.equal(replay.readSnapshot().contextualSupport, undefined);
    assert.equal(session.saveJSON(), before);
});

test('fresh sessions accept explicit support configuration and preserve it through founder replay', () => {
    const options = { offerBps: 0, acceptanceBps: 0, resolutionTicks: 50 };
    const session = new GameplaySession(17, undefined, true, 'summer-800-v1', undefined, undefined,
        { enabled: true }, options);
    assert.equal(session.readSnapshot().contextualSupport.config.offerBps, 0);
    assert.equal(session.readSnapshot().contextualSupport.config.acceptanceBps, 0);
    assert.equal(session.readSnapshot().contextualSupport.config.resolutionTicks, 50);
    const restored = new GameplaySession();
    restored.loadJSON(session.saveJSON());
    assert.deepEqual(restored.readSnapshot().contextualSupport.config, session.readSnapshot().contextualSupport.config);
    const replay = restored.restartProposal();
    assert.deepEqual(replay.readSnapshot().contextualSupport.config, session.readSnapshot().contextualSupport.config);
    session.newCampaign(18, true, true, 'summer-800-v1', undefined, undefined,
        { enabled: true }, { enabled: false });
    assert.equal(session.readSnapshot().contextualSupport, undefined);
});
