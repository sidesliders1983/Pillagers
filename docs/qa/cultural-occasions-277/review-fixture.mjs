import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from '../../../scripts/load-typescript.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = dirname(fileURLToPath(import.meta.url));
const searchPath = join(directory, 'review-fixture-search.json');
const campaignPath = join(directory, 'review-wedding-campaign.json');
const manifestPath = join(directory, 'review-fixture-manifest.json');
const digest = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => digest(JSON.stringify(value));
const require = createRequire(import.meta.url);
const ts = require('typescript');
const core = loadTypeScript(new URL('../../../src/simulation/SimulationCore.ts', import.meta.url));
const { newFjordScenario } = loadTypeScript(new URL('../../../src/fjord-play/FjordScenario.ts', import.meta.url));
const { loadBakedCampaignIsland } = loadTypeScript(new URL('../../../src/fjord-play/BakedCampaignIsland.ts', import.meta.url));
const { currentIslandVersion } = loadTypeScript(new URL('../../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../../src/play/SharedSettlement.ts', import.meta.url));
const mode = process.argv[2];
assert.ok(['--search', '--freeze', '--verify', '--replay'].includes(mode),
    'Use --search, --freeze after source approval, --verify, or --replay');
assert.equal(process.argv.length, 3);
const searchPolicy = { seeds: [1, 2, 3, 4, 5], maximumTicksPerCampaign: 5000,
    selection: 'First valid uncelebrated wedding by seed, next annual boundary, then canonical candidate order.',
    domesticPolicy: 'At founding only, assign all currently available adults to farmer through real commands.',
    sourceFactory: 'newFjordScenario(seed, true)', phase: 'Summer800 tick500',
    forbidden: ['rule overrides', 'free stocks', 'synthetic events', 'forced outcomes', 'existing celebration'] };

function sourceIdentity() {
    const files = new Set(['package.json', 'pnpm-lock.yaml', 'scripts/load-typescript.mjs',
        relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/')]);
    const visit = file => {
        const path = relative(root, file).replaceAll('\\', '/');
        if (files.has(path)) return;
        files.add(path);
        for (const entry of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
            if (!entry.fileName.startsWith('.')) continue;
            let dependency = resolve(dirname(file), entry.fileName);
            if (!existsSync(dependency)) dependency += '.ts';
            assert.ok(existsSync(dependency), 'Missing source dependency: ' + dependency);
            visit(dependency);
        }
    };
    for (const path of ['src/simulation/SimulationCore.ts', 'src/fjord-play/FjordScenario.ts',
        'src/fjord-play/BakedCampaignIsland.ts', 'src/play/SharedSettlement.ts']) visit(join(root, path));
    const entries = [...files].sort().map(path => {
        const bytes = readFileSync(join(root, path));
        const text = bytes.toString('utf8');
        assert.ok(Buffer.from(text, 'utf8').equals(bytes), 'Source must be valid UTF-8: ' + path);
        return { path, worktree: digest(bytes), normalized: digest(text.replaceAll('\r\n', '\n')) };
    });
    const hashes = Object.fromEntries(entries.map(entry => [entry.path, entry.worktree]));
    const normalizedFiles = Object.fromEntries(entries.map(entry => [entry.path, entry.normalized]));
    return { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        dirtyStatus: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
        node: process.version, typescript: ts.version,
        hashConvention: { portable: 'SHA-256 of valid UTF-8 text with CRLF changed to LF only; preserve BOM, whitespace and Unicode.',
            worktree: 'files/fingerprint identify exact host-specific bytes; do not require them to match another platform.' },
        files: hashes, fingerprint: jsonHash(hashes), normalizedFiles,
        normalizedFingerprint: jsonHash(normalizedFiles) };
}
const sourceBefore = sourceIdentity();
const usedAssets = new Map();
async function start(seed, openingBook) {
    await loadBakedCampaignIsland(seed, undefined, undefined, async url => {
        const path = resolve(root, 'public', '.' + String(url).split('?')[0]);
        assert.ok(path.startsWith(resolve(root, 'public') + '/'.replace('/', process.platform === 'win32' ? '\\' : '/')));
        const bytes = readFileSync(path);
        usedAssets.set(relative(root, path).replaceAll('\\', '/'), { bytes: bytes.length, sha256: digest(bytes) });
        return new Response(bytes);
    });
    const session = newFjordScenario(seed, true);
    assert.deepEqual(session.readSnapshot().time, { winter: 800, tick: 500 });
    assert.deepEqual(session.readSnapshot().stocks, { food: 15, materials: 5 });
    if (openingBook) session.book.restore(openingBook, session.snapshot());
    const initialBook = session.book.save(session.snapshot());
    const initialRules = { landing: session.readSnapshot().landing.config,
        mechanics: session.readSnapshot().mechanics.config, weather: session.readSnapshot().weather.config,
        social: session.readSnapshot().social.config, culture: session.readSnapshot().culture.config,
        livestock: session.readSnapshot().landing.livestock };
    const shared = new SharedSettlement(session, undefined, true, currentIslandVersion);
    shared.fjord.enableDiscovery();
    assert.equal(session.readSnapshot().world.version, 2);
    assert.ok(session.readSnapshot().discovery);
    return { shared, session, initialBook, initialRules };
}
function inspect(session) {
    const state = session.readSnapshot();
    const candidates = core.weddingCandidates(state);
    return { time: { ...state.time }, food: state.stocks.food,
        candidateReasons: candidates.map(candidate => ({ sourceEventId: candidate.sourceEventId,
            allowed: candidate.allowed, reason: candidate.reason })),
        candidate: candidates.find(candidate => candidate.allowed) };
}
function summarize(session, candidate) {
    const state = session.readSnapshot();
    const source = state.events.find(event => event.id === candidate.sourceEventId);
    assert.equal(source.type, 'PartnershipFormed');
    const offer = core.gatheringOffer(state, 'wedding', source.id);
    assert.equal(offer.allowed, true);
    assert.ok(offer.spouseIds.every(id => offer.participantIds.includes(id)));
    assert.equal(state.events.filter(event => event.type === 'CulturalGatheringHeld').length, 0);
    assert.equal(core.inspectCulture(state).supportCount, 0);
    assert.ok(state.stocks.food >= 3);
    const elapsedTicks = (state.time.winter - source.time.winter) * 1000 + state.time.tick - source.time.tick;
    assert.ok(elapsedTicks >= 0 && elapsedTicks < 1000);
    return { time: { ...state.time }, stocks: { ...state.stocks }, source,
        spouseIds: offer.spouseIds, spouses: candidate.spouses, elapsedTicks,
        quotedFood: offer.foodCost, participantIds: offer.participantIds,
        stateSHA256: digest(core.serializeState(state)), rulesUnmodified: true,
        physicalWorldBound: true, discoveryBound: true, noPreviousGathering: true };
}
function presentation(shared) {
    shared.session.setRunning(false);
    shared.session.book.notifyPending();
    shared.select({ kind: 'campfire', id: 'settlement-campfire' });
    return shared.persist();
}
const writeJSON = (path, value, exclusive = false) => writeFileSync(path,
    JSON.stringify(value, null, 2) + '\n', exclusive ? { flag: 'wx' } : undefined);

if (mode === '--search') {
    assert.ok(!existsSync(searchPath) && !existsSync(campaignPath) && !existsSync(manifestPath),
        'Preserve an existing bounded search instead of silently searching again');
    const attempts = [];
    let winner;
    for (const seed of searchPolicy.seeds) {
        const run = await start(seed);
        const commands = [];
        const observations = [];
        for (const person of core.availableCulturalParticipants(run.session.readSnapshot())) {
            const command = { type: 'AssignOccupation', personaId: person.id, occupation: 'farmer' };
            commands.push(command); run.session.command(command);
        }
        let elapsed = 0;
        while (elapsed < searchPolicy.maximumTicksPerCampaign) {
            const ticks = Math.min(1000 - run.session.readSnapshot().time.tick,
                searchPolicy.maximumTicksPerCampaign - elapsed);
            const command = { type: 'AdvanceTicks', ticks };
            commands.push(command); run.session.command(command); elapsed += ticks;
            const observation = inspect(run.session);
            observations.push({ ...observation, candidate: undefined });
            if (!observation.candidate) continue;
            const summary = summarize(run.session, observation.candidate);
            const text = presentation(run.shared);
            assert.ok(Buffer.byteLength(text) < 2 * 1024 * 1024, 'Keep the import fixture compact');
            writeFileSync(campaignPath, text, { flag: 'wx' });
            winner = { seed, commands, initialBook: run.initialBook, initialRules: run.initialRules,
                summary, campaignBytes: Buffer.byteLength(text), campaignSHA256: digest(text) };
            break;
        }
        attempts.push({ seed, commands, elapsedTicks: elapsed, observations,
            result: winner ? 'usable-wedding' : 'no-current-valid-wedding-within-bound' });
        if (winner) break;
    }
    const sourceAfter = sourceIdentity();
    writeJSON(searchPath, { schemaVersion: 1, status: 'provisional-source-not-frozen', searchPolicy,
        sourceBefore, sourceAfter, sourceChangedDuringSearch: sourceBefore.fingerprint !== sourceAfter.fingerprint,
        assets: Object.fromEntries(usedAssets), attempts, winner: winner ?? null }, true);
    console.log(JSON.stringify({ status: winner ? 'provisional-fixture-found' : 'no-fixture-within-bound',
        searchedSeeds: attempts.map(attempt => attempt.seed), winner: winner ? {
            seed: winner.seed, time: winner.summary.time, food: winner.summary.stocks.food,
            sourceEventId: winner.summary.source.id, spouses: winner.summary.spouses,
            campaignBytes: winner.campaignBytes } : null }, null, 2));
} else {
    const search = JSON.parse(readFileSync(searchPath, 'utf8'));
    assert.ok(search.winner, 'The bounded search found no fixture; do not tweak the rules');
    if (mode === '--verify') {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        assert.equal(manifest.source.normalizedFingerprint, sourceBefore.normalizedFingerprint);
        assert.equal(manifest.campaignSHA256, digest(readFileSync(campaignPath)));
        assert.equal(manifest.searchNormalizedSHA256, digest(readFileSync(searchPath, 'utf8').replaceAll('\r\n', '\n')));
        for (const [path, asset] of Object.entries(manifest.assets))
            assert.equal(digest(readFileSync(join(root, path))), asset.sha256);
        console.log('Verified frozen source, prepared assets, search and import fixture without simulation.');
    } else {
        if (mode === '--freeze') assert.ok(!existsSync(manifestPath), 'Preserve the existing freeze');
        const run = await start(search.winner.seed, search.winner.initialBook);
        for (const command of search.winner.commands) run.session.command(command);
        const candidate = core.weddingCandidates(run.session.readSnapshot()).find(candidate =>
            candidate.sourceEventId === search.winner.summary.source.id);
        assert.ok(candidate?.allowed);
        const summary = summarize(run.session, candidate);
        assert.deepEqual(summary, search.winner.summary, 'The same recorded normal campaign must reproduce');
        const text = presentation(run.shared);
        const restored = SharedSettlement.restore(text, 'fjord');
        assert.equal(digest(core.serializeState(restored.session.readSnapshot())), summary.stateSHA256);
        assert.equal(core.gatheringOffer(restored.session.readSnapshot(), 'wedding', summary.source.id).allowed, true);
        assert.equal(restored.session.running, false);
        const sourceAfter = sourceIdentity();
        assert.equal(sourceAfter.fingerprint, sourceBefore.fingerprint, 'Source changed during final reproduction');
        if (mode === '--freeze') {
            assert.equal(digest(text), digest(readFileSync(campaignPath)), 'Retain the original import fixture unchanged');
            writeJSON(manifestPath, { schemaVersion: 1, status: 'frozen', frozenAt: new Date().toISOString(),
                source: sourceAfter, searchPolicy, searchSHA256: digest(readFileSync(searchPath)),
                searchNormalizedSHA256: digest(readFileSync(searchPath, 'utf8').replaceAll('\r\n', '\n')),
                artifactHashConvention: 'searchSHA256 is the retained host-byte artifact; searchNormalizedSHA256 compares UTF-8 CRLF-to-LF text portably. Campaign JSON is LF-pinned and compared byte-for-byte.',
                assets: Object.fromEntries(usedAssets), campaignBytes: Buffer.byteLength(text),
                campaignSHA256: digest(text), commandsSHA256: jsonHash(search.winner.commands), summary,
                savedOpeningBookReused: 'Original public BookSave restored before physical initialization; independent random book identity does not alter Core.',
                importRoundtrip: true, noRulesOrStateEdited: true });
            console.log(JSON.stringify({ status: 'frozen', campaignBytes: Buffer.byteLength(text),
                sourceFingerprint: sourceAfter.normalizedFingerprint, stateSHA256: summary.stateSHA256 }));
        } else {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
            assert.equal(manifest.source.normalizedFingerprint, sourceBefore.normalizedFingerprint);
            assert.equal(digest(text), manifest.campaignSHA256);
            console.log('Exact normal public-command Core and persisted campaign replay matched.');
        }
    }
}