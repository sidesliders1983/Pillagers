import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from '../../../scripts/load-typescript.mjs';
import {
    core, directory, digest, endpoint, initialCommands, occupationCommands,
    readJSON, root, sourceIdentity, writeJSON,
} from './cohort-v4.mjs';

const mode = process.argv[2];
assert.equal(process.argv.length, 3);
assert.ok(['--generate', '--verify', '--replay'].includes(mode));
const fixtureFile = fileURLToPath(import.meta.url);
const extraEntries = [
    'src/fjord-play/FjordScenario.ts', 'src/fjord-play/BakedCampaignIsland.ts',
    'src/play/SharedSettlement.ts', relative(root, fixtureFile).replaceAll('\\', '/'),
];
const { newFjordScenario } = loadTypeScript(new URL('../../../src/fjord-play/FjordScenario.ts', import.meta.url));
const { loadBakedCampaignIsland } = loadTypeScript(new URL('../../../src/fjord-play/BakedCampaignIsland.ts', import.meta.url));
const { currentIslandVersion } = loadTypeScript(new URL('../../../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../../src/play/SharedSettlement.ts', import.meta.url));
const manifestPath = join(directory, 'review-manifest-v1.json');
const assets = new Map();

function identity() {
    return { source: sourceIdentity(extraEntries),
        runnerSHA256: digest(readFileSync(fixtureFile)),
        cohortSummarySHA256: digest(readFileSync(join(directory, 'summary-v4.json'))) };
}
function assertIdentity(expected) {
    const actual = identity();
    actual.source.head = expected.source.head;
    assert.deepEqual(actual, expected, 'Preserve review evidence when its source changes.');
}
if (mode === '--verify') {
    const manifest = readJSON(manifestPath);
    assertIdentity(manifest.identity);
    for (const artifact of [...manifest.artifacts, ...manifest.assets])
        assert.equal(digest(readFileSync(join(root, artifact.path))), artifact.sha256);
    for (const artifact of manifest.artifacts.filter(item => item.checkpoint)) {
        const text = readFileSync(join(root, artifact.path), 'utf8');
        const restored = SharedSettlement.restore(text, 'fjord');
        assert.equal(digest(core.serializeState(restored.session.snapshot())), artifact.coreSHA256);
        assert.equal(restored.session.pacing().running, false);
    }
    console.log(JSON.stringify({ status: 'review-verified', seed: manifest.seed }));
    process.exit(0);
}

const before = identity();
const summary = readJSON(join(directory, 'summary-v4.json'));
assert.ok(summary.representative, 'The bounded normal cohort must first yield a real contribution.');
const seed = summary.representative.seed;
const expectedCompletion = summary.representative.event;
await loadBakedCampaignIsland(seed, undefined, undefined, async url => {
    const path = resolve(root, 'public', '.' + String(url).split('?')[0]);
    assert.ok(path.startsWith(resolve(root, 'public') + sep));
    const bytes = readFileSync(path);
    assets.set(relative(root, path).replaceAll('\\', '/'), {
        path: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes),
    });
    return new Response(bytes);
});
const session = newFjordScenario(seed, true);
if (mode === '--replay') {
    const prior = readJSON(manifestPath);
    assertIdentity(prior.identity);
    session.book.restore(prior.initialBook, session.snapshot());
}
const initialBook = session.book.save(session.snapshot());
const shared = new SharedSettlement(session, undefined, true, currentIslandVersion);
shared.fjord.enableDiscovery();
assert.equal(session.readSnapshot().world.version, 2);
assert.ok(session.readSnapshot().discovery);
assert.deepEqual(session.readSnapshot().stocks, { food: 15, materials: 5 });
assert.deepEqual(session.readSnapshot().contextualSupport.config, {
    enabled: true, offerBps: 1000, acceptanceBps: 5000, resolutionTicks: 50, candidateBudget: 128,
});
const initialRules = {
    landing: session.readSnapshot().landing.config,
    mechanics: session.readSnapshot().mechanics.config,
    livestock: session.readSnapshot().landing.livestock,
    weather: session.readSnapshot().weather.config,
    social: session.readSnapshot().social.config,
    culture: session.readSnapshot().culture.config,
    support: session.readSnapshot().contextualSupport.config,
};
const commands = [];
const transactions = [];
const checkpoints = [];
let beforeLoss;
let offered;
let completed;
let afterWeather;
function checkpoint(label) {
    session.setRunning(false);
    session.book.notifyPending();
    const text = shared.persist();
    const serialized = core.serializeState(session.snapshot());
    const restored = SharedSettlement.restore(text, 'fjord');
    assert.equal(core.serializeState(restored.session.snapshot()), serialized);
    return { label, text, commandCount: commands.length,
        time: { ...session.readSnapshot().time }, stocks: { ...session.readSnapshot().stocks },
        coreSHA256: digest(serialized), checkpointSHA256: digest(text),
        bank: core.inspectCulture(session.readSnapshot()) };
}
function commit(command) {
    const stocksBefore = { ...session.readSnapshot().stocks };
    commands.push(structuredClone(command));
    session.command(command);
    if (command.type !== 'AdvanceTicks') transactions.push({
        commandIndex: commands.length - 1, command, time: { ...session.readSnapshot().time },
        stocksBefore, stocksAfter: { ...session.readSnapshot().stocks },
        foodDelta: session.readSnapshot().stocks.food - stocksBefore.food,
        materialsDelta: session.readSnapshot().stocks.materials - stocksBefore.materials,
    });
}
for (const command of initialCommands(session.readSnapshot())) commit(command);
for (let year = 0; year < 10; year++) {
    for (const command of occupationCommands(session.readSnapshot())) commit(command);
    commit({ type: 'AdvanceTicks', ticks: 499 });
    const candidateBefore = checkpoint('before-annual-loss');
    const beforeOffset = session.readSnapshot().events.length;
    commit({ type: 'AdvanceTicks', ticks: 1 });
    const newEvents = session.readSnapshot().events.slice(beforeOffset);
    const candidateOffered = newEvents.some(event => event.type === 'SupportOffered') ?
        checkpoint('offered') : undefined;
    commit({ type: 'AdvanceTicks', ticks: 49 });
    commit({ type: 'AdvanceTicks', ticks: 1 });
    const actual = session.readSnapshot().events.slice(beforeOffset)
        .find(event => event.type === 'SupportCompleted' && event.details.supportContribution === 1);
    if (actual && !completed) {
        assert.deepEqual(actual.time, expectedCompletion.time,
            'Physical replay must retain the selected normal completion timing.');
        assert.deepEqual(actual.details.people, expectedCompletion.details.people,
            'Physical replay must retain the selected actual parties.');
        beforeLoss = candidateBefore;
        offered = candidateOffered;
        completed = checkpoint('completed');
        assert.equal(completed.bank.supportCount, 1);
        const alert = shared.fjord.attentionView().records.find(record => record.eventId === actual.id);
        assert.equal(alert?.read, false, 'Completed actual help remains reviewable as unread attention.');
    }
    commit({ type: 'AdvanceTicks', ticks: 450 });
    const application = session.readSnapshot().events.slice(beforeOffset).find(event =>
        event.type === 'CultureWeatherSupportApplied' && completed &&
        event.details.sourceEventIds.includes(session.readSnapshot().events.find(item =>
            item.type === 'SupportCompleted' && item.details.supportContribution === 1).id));
    if (application && !afterWeather) afterWeather = checkpoint('after-weather-use');
}
assert.ok(beforeLoss && offered && completed,
    'The first cohort representative must also qualify in the true Fjord replay; do not silently shop for another.');
checkpoints.push(beforeLoss, offered, completed);
if (afterWeather) checkpoints.push(afterWeather);
const final = endpoint(session.snapshot());
const timelineTypes = new Set([
    'BuildingCollapsed', 'SupportOffered', 'SupportAccepted', 'SupportCompleted',
    'SupportDeclined', 'SupportEnded', 'CultureWeatherSupportApplied',
    'WinterWeatherDetermined', 'PersonaDied',
]);
const timeline = session.readSnapshot().events.filter(event => timelineTypes.has(event.type));
assertIdentity(before);
const outcome = {
    seed, initialBook, initialRules, commands, transactions,
    actualEndpoint: final, timeline,
    sourceDifference: 'Current physical two-clan Fjord island and discovery are initialized through SharedSettlement. The normal cohort uses the ordinary Core legacy graph. Neither replay edits canonical saves or disables CPU autonomy.',
    comparisonToCoreCohort: {
        completionTimeMatched: true, partiesMatched: true,
        cohortCompletedEvent: expectedCompletion,
        actualCompletedEvent: timeline.find(event =>
            event.type === 'SupportCompleted' && event.details.supportContribution === 1),
    },
    checkpointSummaries: checkpoints.map(({ text, ...details }) => details),
    noRepairOrResourceTransfer: true,
    allActualHelpWithinTenYearBound: true,
    hasActualLaterWeatherUse: !!afterWeather,
    physicalRouteClaimed: false,
};
if (mode === '--replay') {
    const manifest = readJSON(manifestPath);
    assert.deepEqual(outcome, manifest.outcome);
    for (const item of checkpoints) {
        const artifact = manifest.artifacts.find(entry => entry.label === item.label);
        assert.equal(digest(item.text), artifact.sha256);
    }
    console.log(JSON.stringify({ status: 'review-exact-replay-matched', seed,
        completed: completed.time, weatherUse: afterWeather?.time ?? null }));
} else {
    const artifacts = [];
    for (const item of checkpoints) {
        const file = 'review-' + item.label + '-v1.json';
        const path = join(directory, file);
        writeFileSync(path, item.text, { flag: 'wx' });
        artifacts.push({
            path: relative(root, path).replaceAll('\\', '/'), label: item.label, checkpoint: true,
            bytes: Buffer.byteLength(item.text), sha256: digest(item.text), coreSHA256: item.coreSHA256,
        });
    }
    const replayPath = join(directory, 'review-replay-v1.json');
    writeJSON(replayPath, outcome);
    artifacts.push({ path: relative(root, replayPath).replaceAll('\\', '/'),
        bytes: readFileSync(replayPath).length, sha256: digest(readFileSync(replayPath)) });
    writeJSON(manifestPath, { schemaVersion: 1, createdAt: new Date().toISOString(),
        identity: before, seed, assets: [...assets.values()], artifacts, initialBook, outcome });
    console.log(JSON.stringify({ status: 'review-saved', seed,
        completed: completed.time, weatherUse: afterWeather?.time ?? null, artifacts }));
}

