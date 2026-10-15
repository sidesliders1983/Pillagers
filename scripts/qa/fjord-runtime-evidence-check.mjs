import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
const originalCounts = { baseline: 24, diagnostics: 42, overhead: 12, profiles: 7, soak: 1,
    previous: 6, 'previous-boundary': 3, 'stock-production': 15 };
const preparedCounts = { baseline: 6, profiles: 4, 'previous-boundary': 3, 'stock-production': 9, soak: 1, diagnostics: 1 };
let captures = 0, replayChecks = 0;
async function checkGroup(directory, group, expected, prepared = false) {
    const data = JSON.parse(await readFile(directory + '/' + group + '.json', 'utf8'));
    assert.equal(data.runs.length, expected, directory + '/' + group + ': incomplete matrix');
    assert.equal(data.failure, undefined, group + ': failed run');
    assert.deepEqual(data.errors, [], group + ': browser errors');
    for (const fixture of data.fixtures || []) {
        const bytes = await readFile(directory + '/fixtures/' + fixture.name + '.json');
        assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256,
            group + ': frozen fixture bytes changed');
        const loaded = JSON.parse(bytes);
        loaded.target = 'fjord'; loaded.pace.running = false;
        assert.equal(createHash('sha256').update(JSON.stringify(loaded)).digest('hex'), fixture.loadedSha256,
            group + ': loaded fixture differs from frozen input');
    }
    for (const run of data.runs) {
        assert.equal(run.canonicalReplayEqual, true, group + ': Core replay mismatch');
        replayChecks++;
        if (prepared) assert.deepEqual(run.after?.placeholders || run.device?.placeholders, [], 'Real-house confirmation has placeholders');
        for (const sample of run.windows || [run.sample]) {
            captures++;
            const frames = sample.frames || sample;
            assert.ok(frames.count > 0 && frames.p50 > 0 && frames.p95 >= frames.p50 && frames.p99 >= frames.p95);
            assert.ok(frames.max >= frames.p99 - .05, group + ': rounded p99 exceeds maximum');
            assert.equal(run.before?.visibility || sample.visibility, 'visible');
            if (run.scenario.gpu !== false && group !== 'stock-production') {
                assert.equal(sample.gpuSupported, true, group + ': GPU timing unavailable');
                assert.ok(sample.gpu.count > 0, group + ': no valid GPU timings');
                assert.equal(sample.disjointQueries, 0, group + ': disjoint GPU data needs review');
            }
        }
        if (run.scenario.allPasses) {
            const native = run.after.nativeDrawCounters;
            const actual = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']
                .reduce((total, key) => total + (native[key] || 0), 0);
            assert.equal(actual, run.after.renderer.render.calls, 'Native draw count and renderer.info differ');
            assert.ok(native.shadowDrawCalls > 0 && native.useProgram > 0);
        }
    }
}
for (const [group, expected] of Object.entries(originalCounts)) await checkGroup(root, group, expected);
for (const [group, expected] of Object.entries(preparedCounts)) await checkGroup(root + '/prepared', group, expected, true);
for (const name of ['developed-810', 'boundary-810']) {
    const original = await readFile(root + '/fixtures/' + name + '.json');
    const prepared = await readFile(root + '/prepared/fixtures/' + name + '.json');
    assert.deepEqual(prepared, original, 'Real-house confirmation must retain the identical saved fixture');
}
const originalAssets = JSON.parse(await readFile(root + '/asset-manifest.json', 'utf8'));
const preparedAssets = JSON.parse(await readFile(root + '/prepared/asset-manifest.json', 'utf8'));
for (const file of originalAssets.files.filter(file => file.kind === 'production-bundle')) {
    assert.equal(preparedAssets.files.find(other => other.url === file.url)?.sha256, file.sha256,
        'The asset correction must not change the production JavaScript/CSS build');
}
const assets = JSON.parse(await readFile(root + '/prepared/asset-manifest.json', 'utf8'));
assert.ok(assets.files.length > 0);
assert.ok(assets.files.every(file => !file.missingFromTestedBuild && file.sourceAndBuiltBytesEqual), 'Prepared resources must be present and byte-verified');
const validation = JSON.parse((await readFile(root + '/validation.json', 'utf8')).trim());
const preparedValidation = JSON.parse((await readFile(root + '/prepared/validation.json', 'utf8')).trim());
const projectValidationPass = validation.buildExitCode === 0 && validation.characterValidationExitCode === 0 &&
    validation.fullTestsExitCode === 0 && validation.auditBridgeMatchesInProductionBundles === 0 &&
    preparedValidation.buildExitCode === 0 && preparedValidation.focusedTestsExitCode === 0;
console.log(JSON.stringify({ measurementIntegrityPass: true, projectValidationPass, captures, replayChecks,
    fullTestsExitCode: validation.fullTestsExitCode,
    checked: 'Complete matrices, frozen fixture bytes, real prepared models, resource hashes, quantiles, visible scheduling, non-disjoint GPU queries, native draw parity and exact Core replay',
    note: projectValidationPass ? 'All checks passed' : 'Project validation remains failed; see the inherited shader assertion. No validation was weakened.' }));
assert.equal(validation.buildExitCode, 0);
assert.equal(validation.characterValidationExitCode, 0);
assert.equal(validation.fullTestsExitCode, 0, 'Inherited full-suite failure remains visible');
assert.equal(validation.auditBridgeMatchesInProductionBundles, 0);
assert.equal(preparedValidation.buildExitCode, 0);
assert.equal(preparedValidation.focusedTestsExitCode, 0);
