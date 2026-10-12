import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { populationEngine } from './population-engine.mjs';

const root = 'docs/qa/population-continuity';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = file => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const current = populationEngine().identity;
const permittedHooks = new Set([current.hookHash, digest(source(root + '/pilot/diagnostic-source.txt'))]);
function load(folder, file) {
    const manifest = JSON.parse(readFileSync(`${root}/${folder}/manifest.json`));
    const entry = manifest.observations.find(row => row.file === file);
    assert.ok(entry, `Missing observation: ${folder}/${file}`);
    const bytes = readFileSync(`${root}/${folder}/${file}`);
    assert.equal(digest(bytes), entry.sha256, `Modified raw evidence: ${file}`);
    const result = JSON.parse(gunzipSync(bytes));
    assert.equal(result.identity.sourceHash, current.sourceHash, 'Simulation sources changed; rerun the study');
    assert.ok(permittedHooks.has(result.identity.hookHash), 'Unknown diagnostic version');
    return result;
}

const replay = JSON.parse(readFileSync(`${root}/replay/manifest.json`));
const results = [];
for (const row of replay.observations) {
    const folder = ['control30', 'baseline15', 'human-reserve', 'mortality'].includes(row.candidate)
        ? 'pilot' : row.candidate === 'combined' ? 'combined' : 'herd-feedback';
    const before = load(folder, row.file), after = load('replay', row.file);
    for (const key of ['finalStateHash', 'annual', 'decisions', 'commands', 'founders', 'descendants',
        'mothers', 'ruleConfiguration', 'founderHash', 'status']) {
        assert.deepEqual(after[key], before[key], `${row.candidate}: ${key}`);
    }
    results.push({ candidate: row.candidate, seed: row.seed, saveAt: 40, passed: true,
        finalStateHash: after.finalStateHash,
        diagnosticHashChanged: before.identity.hookHash !== after.identity.hookHash });
}

const configs = [];
for (const folder of ['pilot', 'management', 'herd-feedback', 'combined']) {
    const manifest = JSON.parse(readFileSync(`${root}/${folder}/manifest.json`));
    assert.ok(manifest.finishedAt);
    for (const row of manifest.observations) {
        // These committed cohorts completed. Larger future studies must report limits separately.
        assert.ok(['complete', 'extinct'].includes(row.status));
        const result = load(folder, row.file);
        assert.ok(result.annual.every(annual => (annual.traceDropped ?? 0) === 0));
        configs.push(result);
    }
}
for (const seed of [1, 2, 3, 7, 17, 32, 41, 78]) {
    const old = configs.find(row => row.candidate === 'control30' && row.seed === seed);
    const current = configs.find(row => row.candidate === 'baseline15' && row.policy === 'passive' && row.seed === seed);
    assert.equal(old.founderHash, current.founderHash);
    const expected = structuredClone(old.ruleConfiguration);
    expected.landing.initialFood = 15;
    assert.deepEqual(current.ruleConfiguration, expected);
}
const files = ['population-engine.mjs', 'population-scenario.mjs', 'food-policy.mjs',
    'run-population-study.mjs', 'summarize-population-study.mjs'];
const hashes = Object.fromEntries(files.map(file => [file, digest(source(`scripts/qa/${file}`))]));
const previous = JSON.parse(readFileSync(`${root}/verification.json`));
assert.deepEqual(hashes, previous.studySourceHashes, 'Study implementation changed; rerun and review the evidence');
writeFileSync(`${root}/verification.json`, JSON.stringify({ passed: true, completeCohortRuns: configs.length,
    replayRuns: results.length, openingPairs: 8, rowsDropped: 0, studySourceHashes: hashes, replay: results }, null, 2) + '\n');
console.log(JSON.stringify({ runs: configs.length, replays: results.length, passed: true }));
