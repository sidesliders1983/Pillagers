import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const core = load('../src/simulation/SimulationCore.ts');

test('a restart proposal reproduces original founders and rules without changing the saved campaign', () => {
    const original = core.createCampaign(32, { initialFood: 120, foundingCoupleChanceBps: 10000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false }, {},
        { enabled: true }, {}, 'summer-800-v1');
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(original));
    session.command({ type: 'AdvanceTicks', ticks: 4000 });
    session.setRunning(true);
    const before = session.saveJSON();
    const proposal = session.restartProposal();
    assert.equal(session.saveJSON(), before);
    assert.equal(session.running, true);
    assert.deepEqual(proposal.snapshot(), original);
    assert.equal(proposal.running, false);
    assert.equal(proposal.book.snapshot().chapters.length, 1);

    const changed = JSON.parse(before);
    changed.personas['founder-1'].name = 'Legacy identity';
    session.loadJSON(JSON.stringify(changed));
    const legacy = session.saveJSON();
    assert.throws(() => session.restartProposal(), /original founders/i);
    assert.equal(session.saveJSON(), legacy);
});

test('a prepared founder replay retains its visible founding chapter and read state without old Attention', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const owner = new SharedSettlement(32);
    owner.session.command({ type: 'AdvanceTicks', ticks: 3500 });
    owner.select({ kind: 'persona', id: 'founder-1' });
    const blueprint = owner.fjord.blueprint;
    const proposal = owner.session.restartProposal();
    const opening = proposal.book.snapshot().chapters[0];
    proposal.book.notifyPending();
    owner.restart(true, undefined, undefined, proposal);
    assert.deepEqual(owner.session.book.snapshot().chapters[0], { ...opening, notified: true });
    assert.equal(owner.session.book.snapshot().chapters.length, 1);
    assert.deepEqual(owner.fjord.blueprint, blueprint);
    assert.equal(owner.selection, null);
    assert.deepEqual(owner.fjord.attentionSave().readIds, []);
});
