import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const directory = resolve(process.argv[2] ?? 'scratch/mining-223/new-islands-v4');
const read = path => readFileSync(resolve(directory, path));
const json = path => JSON.parse(read(path));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = json('manifest.json');
assert.equal(manifest.status, 'complete');
assert.equal(manifest.selected.length, 12);
assert.equal(new Set(manifest.selected.map(row => row.seed)).size, 12);
const protocolKeys = ['version', 'qaOnly', 'target', 'start', 'end', 'existingPool', 'concurrency',
    'timeoutMs', 'maxHeapMiB', 'generatorInputs', 'executionInputs', 'miningTrial', 'accessProbe',
    'pierSha256', 'routeProbeSha256', 'candidateRunnerSha256', 'coordinatorSha256'];
if (manifest.version >= 4) protocolKeys.splice(5, 0, 'sourceSelectionProtocol', 'seeds');
assert.equal(sha256(JSON.stringify(Object.fromEntries(protocolKeys.map(key => [key, manifest[key]])))),
    manifest.protocolSha256, 'Protocol identity');
for (const [path, hash] of Object.entries(manifest.executionInputs))
    assert.equal(sha256(read('frozen-source/' + path)), hash, 'Frozen executable source: ' + path);
for (const [field, file] of [['routeProbeSha256', 'mining-route-probe.mjs'],
    ['candidateRunnerSha256', 'mining-island-candidate.mjs'], ['coordinatorSha256', 'export-mining-islands.mjs']])
    assert.equal(sha256(read('frozen-source/scripts/qa/' + file)), manifest[field], 'Frozen runner: ' + file);
const statuses = {}, results = readdirSync(resolve(directory, 'results')).filter(file => file.endsWith('.json'));
assert.equal(results.length, manifest.completed);
for (const file of results) {
    const result = json('results/' + file);
    assert.equal(result.protocolSha256, manifest.protocolSha256);
    statuses[result.status] = (statuses[result.status] ?? 0) + 1;
}
assert.deepEqual(readdirSync(resolve(directory, 'exports')).sort(), manifest.selected.map(row => row.filename).sort());
const exports = [];
for (const selected of manifest.selected) {
    assert.ok(!manifest.existingPool.includes(selected.seed));
    const bytes = read('exports/' + selected.filename), expanded = gunzipSync(bytes), payload = JSON.parse(expanded);
    assert.equal(bytes.length, selected.bytes);
    assert.equal(sha256(bytes), selected.sha256);
    assert.equal(expanded.length, selected.jsonBytes);
    assert.equal(sha256(expanded), selected.canonicalSha256);
    assert.equal(payload.world.config.seed, selected.seed);
    assert.equal(payload.format, 'fjordside-mining-island-candidate-v1');
    assert.equal(payload.qaOnly, true);
    const result = json('results/' + selected.seed + '.json');
    assert.equal(result.status, 'qualified-export');
    assert.equal(result.pierSha256, manifest.pierSha256);
    assert.equal(result.proof.expeditionFoodCharged, 8);
    assert.ok(result.proof.ironOre > 0);
    exports.push({seed: selected.seed, bytes: bytes.length, sites: payload.world.oreSites.sites.length,
        initialUnits: payload.world.oreSites.sites.reduce((sum, site) => sum + site.initialUnits, 0),
        wetPatches: payload.world.oreSites.wetLowlands?.patches.length ?? 0, bogSites: payload.world.oreSites.sites.filter(site => site.appearance === 'bog-iron').length,
        proofSource: result.proof.source ?? 'rock-outcrop', foodCharged: result.proof.expeditionFoodCharged, provenOre: result.proof.ironOre});
}
const attemptStatuses = {};
for (const recovery of manifest.recoveries ?? []) {
    assert.equal(sha256(read('frozen-source/scripts/qa/retry-mining-resource-limited.mjs')), recovery.runnerSha256);
    const original = json('attempts/' + recovery.seed + '/' + (recovery.attempt - 1) + '.json');
    assert.equal(original.protocolSha256, manifest.protocolSha256);
    assert.equal(original.status, 'resource-limited');
    attemptStatuses[original.status] = (attemptStatuses[original.status] ?? 0) + 1;
}
const changedSinceMeasurement = Object.entries(manifest.executionInputs).filter(([path, hash]) =>
    sha256(readFileSync(path)) !== hash).map(([path]) => path);
const report = {status: 'verified', protocolSha256: manifest.protocolSha256, baseCommit: manifest.baseCommit,
    frozenExecutableSources: Object.keys(manifest.executionInputs).length,
    tested: results.length, statuses, earlierAttempts: attemptStatuses, changedSinceMeasurement, exports};
writeFileSync(resolve(directory, 'integrity.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
