import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('a prepared founding session becomes the playable campaign without rerolling its Core or book', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const proposal = new GameplaySession(32, 917, true, 'summer-800-v1');
    const core = proposal.saveJSON();
    const book = proposal.book.save(proposal.snapshot());
    const shared = new SharedSettlement(proposal);
    assert.strictEqual(shared.session, proposal, 'Reuse the prepared session instead of composing another opening.');
    assert.equal(shared.session.saveJSON(), core);
    assert.deepEqual(shared.session.book.save(shared.session.snapshot()), book);
    const restored = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(restored.session.saveJSON(), core);
    assert.deepEqual(restored.session.book.save(restored.session.snapshot()), book);
    assert.deepEqual(restored.session.snapshot().time, { winter: 800, tick: 500 });
});
