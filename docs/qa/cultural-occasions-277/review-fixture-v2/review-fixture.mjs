import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from '../../../../scripts/load-typescript.mjs';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const directory = dirname(fileURLToPath(import.meta.url));
const pathFor = name => join(directory, name);
const digest = value => createHash('sha256').update(value).digest('hex');
const jsonHash = value => digest(JSON.stringify(value));
const normalized = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const writeJSON = (name, value) => writeFileSync(pathFor(name),
    JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const readJSON = name => JSON.parse(readFileSync(pathFor(name), 'utf8'));
const ts = createRequire(import.meta.url)('typescript');
const core = loadTypeScript(new URL('../../../../src/simulation/SimulationCore.ts', import.meta.url));
const { newFjordScenario } = loadTypeScript(new URL('../../../../src/fjord-play/FjordScenario.ts', import.meta.url));
const { loadBakedCampaignIsland } = loadTypeScript(new URL('../../../../src/fjord-play/BakedCampaignIsland.ts', import.meta.url));
const { currentIslandVersion } = loadTypeScript(new URL('../../../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../../../src/play/SharedSettlement.ts', import.meta.url));
const policy = readJSON('policy.json');
const mode = process.argv[2];
assert.ok(['--search', '--freeze', '--verify', '--replay'].includes(mode));
assert.equal(process.argv.length, 3);
assert.equal(policy.status, 'frozen-before-search');

function sourceIdentity() {
    const files = new Set(['package.json', 'pnpm-lock.yaml', 'scripts/load-typescript.mjs',
        relative(root, fileURLToPath(import.meta.url)).replaceAll('\\', '/'),
        relative(root, pathFor('policy.json')).replaceAll('\\', '/')]);
    const visit = file => {
        const path = relative(root, file).replaceAll('\\', '/');
        if (files.has(path)) return;
        files.add(path);
        for (const imported of ts.preProcessFile(readFileSync(file, 'utf8')).importedFiles) {
            if (!imported.fileName.startsWith('.')) continue;
            let dependency = resolve(dirname(file), imported.fileName);
            if (!existsSync(dependency)) dependency += '.ts';
            assert.ok(existsSync(dependency), 'Missing dependency: ' + dependency);
            visit(dependency);
        }
    };
    for (const file of ['src/simulation/SimulationCore.ts', 'src/fjord-play/FjordScenario.ts',
        'src/fjord-play/BakedCampaignIsland.ts', 'src/play/SharedSettlement.ts']) visit(join(root, file));
    const entries = [...files].sort().map(path => {
        const bytes = readFileSync(join(root, path));
        const text = bytes.toString('utf8');
        assert.ok(Buffer.from(text, 'utf8').equals(bytes), 'Invalid UTF-8: ' + path);
        return { path, worktree: digest(bytes), portable: digest(text.replaceAll('\r\n', '\n')) };
    });
    const hashes = Object.fromEntries(entries.map(entry => [entry.path, entry.worktree]));
    const portable = Object.fromEntries(entries.map(entry => [entry.path, entry.portable]));
    return {
        head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        dirtyStatus: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
        node: process.version, typescript: ts.version,
        scope: 'Actual Core, Fjord factory, baked-island loader and SharedSettlement transitive local dependencies; rendered UI is separate owner QA.',
        hashConvention: {
            portable: 'SHA-256 of valid UTF-8 text with CRLF changed to LF only; preserve BOM, whitespace and Unicode.',
            worktree: 'Exact host-specific bytes; do not require these to match a different platform.',
        },
        files: hashes, fingerprint: jsonHash(hashes), normalizedFiles: portable,
        normalizedFingerprint: jsonHash(portable),
    };
}
const sourceBefore = sourceIdentity();
const assets = new Map();
async function start(seed, openingBook) {
    await loadBakedCampaignIsland(seed, undefined, undefined, async url => {
        const path = resolve(root, 'public', '.' + String(url).split('?')[0]);
        assert.ok(path.startsWith(resolve(root, 'public') + sep));
        const bytes = readFileSync(path);
        assets.set(relative(root, path).replaceAll('\\', '/'), { bytes: bytes.length, sha256: digest(bytes) });
        return new Response(bytes);
    });
    const session = newFjordScenario(seed, true);
    const state = session.readSnapshot();
    assert.deepEqual(state.time, policy.initialPhase);
    assert.deepEqual(state.stocks, policy.initialStocks);
    if (openingBook) session.book.restore(openingBook, session.snapshot());
    const initialBook = session.book.save(session.snapshot());
    const initialRules = {
        landing: state.landing.config, mechanics: state.mechanics.config,
        weather: state.weather.config, social: state.social.config,
        culture: state.culture.config, livestock: state.landing.livestock,
    };
    // Construct Attention before any time advances; do not manufacture an unread source later.
    const shared = new SharedSettlement(session, undefined, true, currentIslandVersion);
    shared.fjord.enableDiscovery();
    shared.select({ kind: 'campfire', id: 'settlement-campfire' });
    assert.equal(session.readSnapshot().world.version, 2);
    assert.ok(session.readSnapshot().discovery);
    return { session, shared, initialBook, initialRules };
}
function checkpoint(shared) {
    shared.session.setRunning(false);
    // Suppress old chapter popups only; this does not acknowledge Attention or spend resources.
    shared.session.book.notifyPending();
    return shared.persist();
}
function inspect(run) {
    const state = run.session.readSnapshot();
    const candidates = core.weddingCandidates(state);
    return {
        time: { ...state.time }, stocks: { ...state.stocks },
        candidates: candidates.map(candidate => {
            const offer = core.gatheringOffer(state, 'wedding', candidate.sourceEventId);
            return { sourceEventId: candidate.sourceEventId, allowed: offer.allowed,
                reason: offer.reason, foodCost: offer.foodCost, materialsCost: offer.materialsCost,
                participantCount: offer.participantIds.length };
        }),
        candidate: candidates.find(candidate =>
            core.gatheringOffer(state, 'wedding', candidate.sourceEventId).allowed),
    };
}
function summarize(run, candidate) {
    const state = run.session.readSnapshot();
    const source = state.events.find(event => event.id === candidate.sourceEventId);
    const offer = core.gatheringOffer(state, 'wedding', source.id);
    assert.equal(source.type, 'PartnershipFormed');
    assert.equal(offer.allowed, true);
    assert.equal(offer.foodCost, 3 * offer.participantIds.length);
    assert.equal(offer.requiresCampfire, true);
    assert.ok(state.stocks.food >= offer.foodCost && state.stocks.materials >= offer.materialsCost);
    assert.ok(offer.spouseIds.every(id => offer.participantIds.includes(id)));
    assert.equal(state.events.filter(event => event.type === 'CulturalGatheringHeld').length, 0);
    assert.equal(core.inspectCulture(state).supportCount, 0);
    const elapsedTicks = (state.time.winter - source.time.winter) * 1000 + state.time.tick - source.time.tick;
    assert.ok(elapsedTicks >= 0 && elapsedTicks < 1000);
    const attention = run.shared.fjord.attentionView().records.find(record => record.eventId === source.id);
    assert.equal(attention?.read, false);
    return {
        time: { ...state.time }, stocks: { ...state.stocks }, source,
        spouseIds: offer.spouseIds, spouses: candidate.spouses, elapsedTicks,
        quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        requiresCampfire: offer.requiresCampfire, participantIds: offer.participantIds,
        stateSHA256: digest(core.serializeState(state)), attentionSourceUnread: true,
        rulesUnmodified: true, physicalWorldBound: true, discoveryBound: true,
        noPreviousGathering: true,
    };
}
function writeCheckpoint(name, text) {
    assert.ok(Buffer.byteLength(text) < 2 * 1024 * 1024, 'Checkpoint must stay compact');
    writeFileSync(pathFor(name), text, { flag: 'wx' });
    return { file: name, bytes: Buffer.byteLength(text), sha256: digest(text) };
}

if (mode === '--search') {
    assert.ok(!existsSync(pathFor('search.json')) && !existsSync(pathFor('policy-freeze.json')),
        'Preserve prior search evidence rather than silently searching again');
    writeJSON('policy-freeze.json', {
        schemaVersion: 1, frozenAt: new Date().toISOString(), policy,
        policyNormalizedSHA256: digest(normalized(pathFor('policy.json'))),
        runnerNormalizedSHA256: digest(normalized(fileURLToPath(import.meta.url))),
        source: sourceBefore,
    });
    const attempts = [];
    let winner;
    for (const seed of policy.seeds) {
        const run = await start(seed);
        const commands = [];
        const observations = [];
        const preSources = new Map();
        for (const person of core.availableCulturalParticipants(run.session.readSnapshot())) {
            const command = { type: 'AssignOccupation', personaId: person.id, occupation: 'farmer' };
            commands.push(command);
            run.session.command(command);
        }
        let elapsed = 0;
        while (elapsed < policy.maximumCanonicalTicksPerCampaign) {
            const beforeText = checkpoint(run.shared);
            const beforeState = run.session.readSnapshot();
            const beforeCommands = commands.length;
            const command = { type: 'AdvanceTicks', ticks: Math.min(policy.observationIntervalTicks,
                policy.maximumCanonicalTicksPerCampaign - elapsed) };
            commands.push(command);
            run.session.command(command);
            elapsed += command.ticks;
            const state = run.session.readSnapshot();
            for (const event of state.events.slice(beforeState.events.length)) {
                if (event.type === 'PartnershipFormed') preSources.set(event.id, {
                    text: beforeText, commandCount: beforeCommands,
                    time: beforeState.time, stateSHA256: digest(core.serializeState(beforeState)),
                    nextCommand: command, actualSource: event,
                });
            }
            const observation = inspect(run);
            observations.push({ ...observation, candidate: undefined });
            if (!observation.candidate) continue;
            const summary = summarize(run, observation.candidate);
            const prior = preSources.get(summary.source.id);
            assert.ok(prior, 'The actual source must have a retained pre-event checkpoint');
            const preRestored = SharedSettlement.restore(prior.text, 'fjord');
            assert.ok(!preRestored.session.readSnapshot().events.some(event => event.id === summary.source.id));
            const campaign = writeCheckpoint('review-wedding-campaign.json', checkpoint(run.shared));
            const preCampaign = writeCheckpoint('review-before-partnership.json', prior.text);
            winner = {
                seed, commands, initialBook: run.initialBook, initialRules: run.initialRules,
                summary, campaign, beforePartnership: {
                    ...preCampaign, commandCount: prior.commandCount, time: prior.time,
                    stateSHA256: prior.stateSHA256, nextCommand: prior.nextCommand,
                    sourceEventId: summary.source.id,
                },
                physicalQualification: 'Pending actual production native gait demonstration; affordability is not rendered/device acceptance.',
            };
            break;
        }
        attempts.push({ seed, commands, elapsedTicks: elapsed, observations,
            result: winner ? 'affordable-normal-wedding' : 'no-affordable-wedding-within-bound' });
        console.log(JSON.stringify({ seed, elapsedTicks: elapsed, result: attempts.at(-1).result }));
        if (winner) break;
    }
    const sourceAfter = sourceIdentity();
    writeJSON('search.json', {
        schemaVersion: 1, status: 'provisional-source-not-finally-frozen',
        policySHA256: digest(normalized(pathFor('policy.json'))), sourceBefore, sourceAfter,
        sourceChangedDuringSearch: sourceBefore.normalizedFingerprint !== sourceAfter.normalizedFingerprint,
        assets: Object.fromEntries(assets), attempts, winner: winner ?? null,
    });
    console.log(JSON.stringify({ status: winner ? 'affordable-checkpoints-found' : 'no-fixture-within-bound',
        seeds: attempts.map(attempt => attempt.seed), summary: winner?.summary,
        campaign: winner?.campaign, beforePartnership: winner?.beforePartnership }, null, 2));
} else {
    const search = readJSON('search.json');
    assert.ok(search.winner, 'The bounded search found no affordable fixture');
    for (const item of [search.winner.campaign, search.winner.beforePartnership])
        assert.equal(digest(readFileSync(pathFor(item.file))), item.sha256);
    if (mode === '--verify') {
        const manifest = readJSON('manifest.json');
        assert.equal(manifest.source.normalizedFingerprint, sourceBefore.normalizedFingerprint);
        assert.equal(manifest.searchNormalizedSHA256, digest(normalized(pathFor('search.json'))));
        for (const [path, asset] of Object.entries(manifest.assets))
            assert.equal(digest(readFileSync(join(root, path))), asset.sha256);
        console.log('Verified portable source, assets, policy, search and both unchanged checkpoints.');
    } else {
        if (mode === '--freeze') assert.ok(!existsSync(pathFor('manifest.json')), 'Keep the existing freeze');
        const run = await start(search.winner.seed, search.winner.initialBook);
        let reproducedBefore;
        for (let index = 0; index < search.winner.commands.length; index++) {
            if (search.winner.commands[index].type === 'AdvanceTicks') {
                const text = checkpoint(run.shared);
                if (index === search.winner.beforePartnership.commandCount) reproducedBefore = text;
            }
            run.session.command(search.winner.commands[index]);
        }
        const candidate = core.weddingCandidates(run.session.readSnapshot()).find(candidate =>
            candidate.sourceEventId === search.winner.summary.source.id);
        const summary = summarize(run, candidate);
        assert.deepEqual(summary, search.winner.summary);
        assert.equal(digest(reproducedBefore), search.winner.beforePartnership.sha256);
        const text = checkpoint(run.shared);
        assert.equal(digest(text), search.winner.campaign.sha256);
        const restored = SharedSettlement.restore(text, 'fjord');
        assert.equal(digest(core.serializeState(restored.session.readSnapshot())), summary.stateSHA256);
        assert.equal(restored.session.running, false);
        assert.equal(restored.fjord.attentionView().records.find(record =>
            record.eventId === summary.source.id)?.read, false);
        const before = SharedSettlement.restore(reproducedBefore, 'fjord');
        before.session.command(search.winner.beforePartnership.nextCommand);
        assert.ok(before.session.readSnapshot().events.some(event => event.id === summary.source.id &&
            event.type === 'PartnershipFormed'));
        assert.equal(before.fjord.attentionView().records.find(record =>
            record.eventId === summary.source.id)?.read, false);
        const sourceAfter = sourceIdentity();
        assert.equal(sourceAfter.normalizedFingerprint, sourceBefore.normalizedFingerprint,
            'Source changed during replay; retry the same recorded commands after implementation settles');
        if (mode === '--freeze') writeJSON('manifest.json', {
            schemaVersion: 1, status: 'frozen-affordability-and-import-evidence',
            frozenAt: new Date().toISOString(), source: sourceAfter,
            searchNormalizedSHA256: digest(normalized(pathFor('search.json'))),
            policyNormalizedSHA256: digest(normalized(pathFor('policy.json'))),
            assets: search.assets, checkpoints: [search.winner.campaign, search.winner.beforePartnership],
            commandsSHA256: jsonHash(search.winner.commands), summary,
            importRoundtrip: true, preSourceReplaysRealUnreadPartnership: true,
            physicalQualification: search.winner.physicalQualification,
        });
        console.log(JSON.stringify({ status: mode === '--freeze' ? 'frozen' : 'exact-public-command-replay-matched',
            seed: search.winner.seed, time: summary.time, quotedFood: summary.quotedFood,
            quotedMaterials: summary.quotedMaterials, stateSHA256: summary.stateSHA256 }));
    }
}
