import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadTypeScript } from '../../../../scripts/load-typescript.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const directory = fileURLToPath(new URL('./', import.meta.url));
const previous = resolve(directory, '../review-fixture-v2');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = path => digest(readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n'));
const frozen = readJSON(resolve(previous, 'manifest.json'));
const year = readJSON(resolve(previous, 'review-year-jump-observation.json'));
const mode = process.argv[2];
assert.ok(['--record', '--verify'].includes(mode));
assert.equal(process.argv.length, 3);

const extraSources = ['src/fjord-play/WeddingInvitationState.ts', 'src/fjord-play/WeddingInvitation.ts',
    'src/fjord-play/CulturalGatheringView.ts', 'tests/wedding-invitation.test.mjs',
    'tests/load-dom-source.mjs', 'vite.config.ts',
    'docs/qa/cultural-occasions-277/invitation-delivery/verify.mjs'];
const files = Object.fromEntries([...new Set([...Object.keys(frozen.source.normalizedFiles), ...extraSources])]
    .sort().map(path => [path, portable(path)]));
const changed = Object.entries(frozen.source.normalizedFiles)
    .filter(([path, hash]) => files[path] !== hash).map(([path]) => path).sort();
assert.deepEqual(changed, ['src/fjord-play/FjordCampaign.ts', 'src/play/SharedSettlement.ts']);
for (const [path, asset] of Object.entries(frozen.assets))
    assert.equal(digest(readFileSync(resolve(root, path))), asset.sha256, path);

const { SharedSettlement } = loadTypeScript(new URL('../../../../src/play/SharedSettlement.ts', import.meta.url));
const core = loadTypeScript(new URL('../../../../src/simulation/SimulationCore.ts', import.meta.url));
const checkpoints = [];
for (const checkpoint of frozen.checkpoints) {
    const bytes = readFileSync(resolve(previous, checkpoint.file));
    assert.equal(bytes.length, checkpoint.bytes);
    assert.equal(digest(bytes), checkpoint.sha256);
    const shared = SharedSettlement.restore(bytes.toString('utf8'), 'fjord');
    const canonical = shared.session.saveJSON();
    const expected = checkpoint.stateSHA256 ?? frozen.summary.stateSHA256;
    assert.equal(digest(canonical), expected);
    const restored = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(restored.session.saveJSON(), canonical);
    checkpoints.push({ file: checkpoint.file, fileSHA256: checkpoint.sha256,
        canonicalSHA256: expected, exactCoreRoundtrip: true });
}

const shared = SharedSettlement.restore(readFileSync(resolve(previous, 'review-before-partnership.json'), 'utf8'), 'fjord');
shared.session.command({ type: 'AdvanceWinter' });
const canonical = shared.session.saveJSON();
assert.equal(digest(canonical), year.actualYearButton.stateSHA256);
const sourceId = 'event-28';
assert.ok(shared.fjord.weddingInvitations().some(candidate => candidate.sourceEventId === sourceId));
shared.fjord.markAttentionRead([sourceId]);
assert.equal(shared.session.saveJSON(), canonical);
const restored = SharedSettlement.restore(shared.persist(), 'fjord');
assert.equal(restored.session.saveJSON(), canonical);
assert.ok(restored.fjord.weddingInvitations().some(candidate => candidate.sourceEventId === sourceId));
const offer = restored.fjord.weddingInvitationOffer(sourceId);
assert.equal(offer.allowed, true);
assert.equal(offer.foodCost, 24);
assert.equal(offer.materialsCost, 1);
assert.equal(offer.participantIds.length, 8);
const command = { type: 'SponsorGathering', occasion: 'wedding', sourceEventId: sourceId,
    expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
    quotedMaterials: offer.materialsCost, expectedParticipantIds: [...offer.participantIds] };
const expected = core.applyCommand(restored.session.readSnapshot(), command);
restored.session.commandBatch([command]);
assert.equal(restored.session.saveJSON(), core.serializeState(expected));
assert.deepEqual(restored.session.readSnapshot().stocks, { food: 14, materials: 4 });
assert.equal(restored.session.readSnapshot().campfire.lit, true);
assert.equal(restored.fjord.weddingInvitations().some(candidate => candidate.sourceEventId === sourceId), false);
const again = SharedSettlement.restore(restored.persist(), 'fjord');
assert.equal(again.session.saveJSON(), restored.session.saveJSON());
assert.equal(again.fjord.weddingInvitations().some(candidate => candidate.sourceEventId === sourceId), false);

const measured = { checkpoints, changedFromV2: changed,
    allFrozenSimulationSourcesUnchanged: true,
    yearActionSHA256: digest(canonical), readHistoryRetainsUnansweredQuestionAcrossReload: true,
    sourceId, quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
    finalStocks: { ...again.session.readSnapshot().stocks },
    finalCoreSHA256: digest(again.session.saveJSON()), fullHistoryCoreParity: true,
    receiptRemovesQuestionWithoutCoreMutation: true };
const resultPath = resolve(directory, 'qualification.json');
if (mode === '--record') {
    const result = { schemaVersion: 1, observedAt: new Date().toISOString(),
        baseHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        dirtyStatus: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
        hashConvention: 'SHA-256 of UTF-8 with CRLF normalized to LF only.',
        files, frozenV2ManifestSHA256: digest(readFileSync(resolve(previous, 'manifest.json'))), measured };
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} else {
    const recorded = readJSON(resultPath);
    assert.deepEqual(files, recorded.files);
    assert.equal(digest(readFileSync(resolve(previous, 'manifest.json'))), recorded.frozenV2ManifestSHA256);
    assert.deepEqual(measured, recorded.measured);
}
console.log(JSON.stringify({ status: 'verified-current-adapter-compatibility', ...measured }));
