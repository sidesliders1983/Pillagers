import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { load } from './load-source.mjs';

const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { adoptCampaignIsland, campaignIslandPlan } = load('../src/fjord-play/CampaignIsland.ts');
const fixture = readFileSync('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8');

test('saved island restores through asynchronous preparation without changing Core, book, layout or fractional pace', async () => {
    const saved = JSON.parse(fixture);
    let prepared = 0;
    const restored = await SharedSettlement.restoreAsync(fixture, 'fjord', async metadata => {
        prepared++;
        assert.equal(metadata.seed, 32);
        assert.deepEqual(metadata.time, { winter: 810, tick: 500 });
        assert.deepEqual(metadata.island, saved.fjord.island);
        const worker = new Worker(new URL('./fixtures/generation-worker.mjs', import.meta.url));
        const result = await new Promise((resolve, reject) => {
            worker.on('error', reject);
            worker.on('message', message => {
                if (message.type === 'error') reject(new Error(message.message));
                if (message.type === 'result') resolve(message.result);
            });
            worker.postMessage({ kind: 'campaign', seed: metadata.seed });
        }).finally(() => worker.terminate());
        adoptCampaignIsland(metadata.seed, result.world, result.plan);
    });
    assert.equal(prepared, 1);
    assert.deepEqual(restored.session.snapshot(), saved.fjord.campaign);
    assert.deepEqual(restored.fjord.exportData().narrative, saved.fjord.narrative);
    assert.deepEqual(restored.fjord.layout, saved.fjord.layout);
    assert.deepEqual(campaignIslandPlan(restored.fjord.blueprint).recipe, saved.fjord.island);
    assert.equal(restored.session.running, false, 'A restored campaign waits for Start; it never catches up offline');
    assert.deepEqual(restored.session.pacing(), { ...saved.pace, running: false });
});

test('missing or damaged active storage offers recoverable saves without replacing their raw data', () => {
    const { readRecoverySources, resumeCheckpointKey } = load('../src/play/SettlementRecovery.ts');
    const session = new Map([['pillagers.fjord-play.active.v1', '{damaged']]);
    const local = new Map([[resumeCheckpointKey, fixture]]);
    const sources = readRecoverySources(key => session.get(key) ?? null, key => local.get(key) ?? null);
    assert.equal(sources.active, null);
    assert.equal(sources.requiresChoice, true);
    assert.equal(sources.candidates.length, 1);
    assert.equal(sources.candidates[0].text, fixture);
    assert.equal(sources.candidates[0].metadata.time.winter, 810);
    assert.deepEqual(sources.damaged, [{ source: 'Active session', text: '{damaged' }]);
    assert.equal(session.get('pillagers.fjord-play.active.v1'), '{damaged');
    assert.equal(local.get(resumeCheckpointKey), fixture);
    session.clear();
    const missing = readRecoverySources(key => session.get(key) ?? null, key => local.get(key) ?? null);
    assert.equal(missing.requiresChoice, true);
    assert.equal(missing.candidates[0].text, fixture);
    assert.equal(readRecoverySources(() => null, () => null).requiresChoice, false, 'Only a genuinely fresh start needs no recovery choice');
});

test('incomplete shared saves are rejected rather than constructing an unrelated default campaign', () => {
    const malformed = JSON.stringify({ sharedVersion: 1, pace: { running: false, minutesPerWinter: 3, fractionalTicks: 0 } });
    assert.throws(() => SharedSettlement.restore(malformed, 'fjord'), /missing|invalid|campaign/i);
});

test('resume checkpoints preserve presentation controls and camera independently of Core', () => {
    const campaign = new SharedSettlement(32);
    const before = campaign.session.saveJSON();
    const presentation = { quality: 'standard', effects: 'normal', camera: { position: [28, 31, -32], target: [0, 1, 0] } };
    campaign.setPresentation(presentation);
    const restored = SharedSettlement.restore(campaign.persist(), 'fjord');
    assert.deepEqual(restored.presentation, presentation);
    assert.equal(restored.session.saveJSON(), before);
    const old = JSON.parse(campaign.persist());
    delete old.presentation;
    assert.equal(SharedSettlement.restore(JSON.stringify(old), 'fjord').presentation, undefined);
    assert.throws(() => campaign.setPresentation({ ...presentation, camera: { ...presentation.camera, position: [Infinity, 1, 2] } }), /presentation|camera/i);
    assert.throws(() => campaign.setPresentation({ ...presentation, camera: { position: [0, 1, 0], target: [0, 1, 0] } }), /camera/i);
    assert.deepEqual(campaign.presentation, presentation, 'Invalid presentation cannot replace the last valid controls');
});

test('invalid pacing or island identity is rejected before expensive restoration begins', async () => {
    for (const corrupt of [saved => { saved.pace.minutesPerWinter = 0; }, saved => { saved.fjord.island.seed = 999; }]) {
        const saved = JSON.parse(fixture);
        corrupt(saved);
        let preparationCalls = 0;
        await assert.rejects(SharedSettlement.restoreAsync(JSON.stringify(saved), 'fjord', async () => { preparationCalls++; }),
            /pacing|island|recipe/i);
        assert.equal(preparationCalls, 0, 'Invalid metadata cannot start geography work');
    }
});

test('explicit legacy view handoff retains its pace and full saved terrain through the asynchronous restore route', async () => {
    const original = new SharedSettlement(32);
    original.command({ type: 'AdvanceTicks', ticks: 1350 });
    original.select({ kind: 'persona', id: 'founder-2' });
    original.session.setMinutesPerWinter(1);
    original.session.setRunning(true);
    original.session.elapse(30);
    const handoff = original.handoff('fjord');
    const before = JSON.parse(handoff);
    const restored = await SharedSettlement.restoreAsync(handoff, 'fjord', async metadata => {
        assert.equal(metadata.island, undefined, 'Old saved terrain never requests an island regeneration');
        assert.deepEqual(metadata.time, before.fjord.campaign.time);
    });
    assert.deepEqual(restored.session.pacing(), before.pace);
    assert.deepEqual(restored.fjord.blueprint, before.fjord.blueprint);
    assert.deepEqual(restored.selection, before.fjord.selection);
    assert.deepEqual(restored.session.snapshot(), before.fjord.campaign);
});

test('manual canonical data remains a recovery choice when its scenery sidecar cannot be used', () => {
    const { readRecoverySources } = load('../src/play/SettlementRecovery.ts');
    const saved = JSON.parse(fixture).fjord;
    saved.layout.mooring.x = 'damaged';
    const canonical = JSON.stringify(saved.campaign);
    const local = new Map([['pillagers.gameplay-lab.v1', canonical], ['pillagers.fjord-play.v1', JSON.stringify(saved)]]);
    const sources = readRecoverySources(() => null, key => local.get(key) ?? null);
    assert.ok(sources.candidates.some(candidate => candidate.source === 'Local campaign data only' && candidate.text === canonical));
    assert.equal(local.get('pillagers.gameplay-lab.v1'), canonical);
});
