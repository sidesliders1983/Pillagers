import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from '../../../../scripts/load-typescript.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const directory = dirname(fileURLToPath(import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
const search = JSON.parse(readFileSync(join(directory, 'search.json'), 'utf8'));
const checkpoint = readFileSync(join(directory, search.winner.beforePartnership.file), 'utf8');
assert.equal(digest(checkpoint), search.winner.beforePartnership.sha256);
const output = join(directory, 'review-year-jump-observation.json');
const verify = process.argv[2] === '--verify';
assert.ok(process.argv.length === (verify ? 3 : 2));
if (!verify) assert.ok(!existsSync(output), 'Preserve the existing one-year observation');
const sourceFiles = Object.keys(search.sourceAfter.normalizedFiles).sort();
const sourceIdentity = () => Object.fromEntries(sourceFiles.map(path => [path,
    digest(readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n'))]));
const sourceBefore = sourceIdentity();
const core = loadTypeScript(new URL('../../../../src/simulation/SimulationCore.ts', import.meta.url));
const { loadBakedCampaignIsland } = loadTypeScript(new URL('../../../../src/fjord-play/BakedCampaignIsland.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../../../src/play/SharedSettlement.ts', import.meta.url));
const assets = {};
await loadBakedCampaignIsland(search.winner.seed, undefined, undefined, async url => {
    const path = resolve(root, 'public', '.' + String(url).split('?')[0]);
    assert.ok(path.startsWith(resolve(root, 'public') + sep));
    const bytes = readFileSync(path);
    assets[relative(root, path).replaceAll('\\', '/')] = { bytes: bytes.length, sha256: digest(bytes) };
    return new Response(bytes);
});
const run = command => {
    const shared = SharedSettlement.restore(checkpoint, 'fjord');
    assert.equal(shared.session.running, false);
    assert.ok(!shared.session.readSnapshot().events.some(event => event.id === 'event-28'));
    shared.session.command(command);
    const state = shared.session.readSnapshot();
    const source = state.events.find(event => event.id === 'event-28');
    const offer = core.gatheringOffer(state, 'wedding', source.id);
    const elapsedTicks = (state.time.winter - source.time.winter) * state.ticksPerWinter +
        state.time.tick - source.time.tick;
    return {
        command, time: { ...state.time }, stocks: { ...state.stocks }, source,
        elapsedTicks, offer: {
            allowed: offer.allowed, reason: offer.reason, foodCost: offer.foodCost,
            materialsCost: offer.materialsCost, requiresCampfire: offer.requiresCampfire,
            participantIds: offer.participantIds, spouseIds: offer.spouseIds,
        },
        bothSpousesAvailable: offer.spouseIds.every(id =>
            core.availableCulturalParticipants(state).some(person => person.id === id)),
        sourceAttention: shared.fjord.attentionView().records.find(record => record.eventId === source.id),
        stateSHA256: digest(core.serializeState(state)), stillPaused: !shared.session.running,
        gatheringCount: state.events.filter(event => event.type === 'CulturalGatheringHeld').length,
    };
};
// The requested exact tick command and the real UI button are checked from separate identical restores.
const tickAdvance = run({ type: 'AdvanceTicks', ticks: 1000 });
const actualYearButton = run({ type: 'AdvanceWinter' });
assert.equal(tickAdvance.stateSHA256, actualYearButton.stateSHA256);
assert.deepEqual(tickAdvance.time, { winter: 801, tick: 950 });
assert.equal(tickAdvance.source.type, 'PartnershipFormed');
assert.equal(tickAdvance.elapsedTicks, 950);
assert.equal(tickAdvance.offer.allowed, true);
assert.equal(tickAdvance.offer.foodCost, 24);
assert.equal(tickAdvance.offer.materialsCost, 1);
assert.equal(tickAdvance.bothSpousesAvailable, true);
assert.equal(tickAdvance.sourceAttention.read, false);
assert.equal(tickAdvance.gatheringCount, 0);
assert.deepEqual(sourceIdentity(), sourceBefore, 'Source changed during the bounded check');
const result = {
    schemaVersion: 1, status: 'actual-one-year-action-eligible',
    checkpoint: search.winner.beforePartnership,
    tickAdvance, actualYearButton,
    source: {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        hashConvention: 'SHA-256 of valid UTF-8 with CRLF changed to LF only; raw checkpoint bytes are exact.',
        normalizedFingerprint: digest(JSON.stringify(sourceBefore)),
        matchesBoundedSearchDependencies: JSON.stringify(sourceBefore) === JSON.stringify(search.sourceAfter.normalizedFiles),
        helperNormalizedSHA256: digest(readFileSync(fileURLToPath(import.meta.url), 'utf8').replaceAll('\r\n', '\n')),
    },
    assets,
    limitations: 'Headless real public actions/import only; fresh rendered invitation and owner device review remain separate.',
};
if (verify) assert.deepEqual(result, JSON.parse(readFileSync(output, 'utf8')));
else writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ verified: verify, status: result.status, time: tickAdvance.time,
    stocks: tickAdvance.stocks, elapsedTicks: tickAdvance.elapsedTicks,
    quotedFood: tickAdvance.offer.foodCost, quotedMaterials: tickAdvance.offer.materialsCost,
    bothSpousesAvailable: tickAdvance.bothSpousesAvailable, sourceUnread: !tickAdvance.sourceAttention.read,
    tickAndActualYearButtonCoreEqual: true, stateSHA256: tickAdvance.stateSHA256 }));
