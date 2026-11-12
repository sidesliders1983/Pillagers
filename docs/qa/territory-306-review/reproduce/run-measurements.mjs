import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('./', import.meta.url));
const label = process.env.PROFILE_LABEL || 'pilot-7cdc';
const sourceRoot = process.env.PROFILE_SOURCE_ROOT || process.cwd();
assert.ok(sourceRoot);
const prepared = JSON.parse(await readFile(join(directory, label + '-scenario-report.json'), 'utf8'));
const selected = process.env.PROFILE_PILOT ? prepared.scenarios.slice(0, 1) : prepared.scenarios;
const report = { status: 'running', label, source: prepared.pin,
    methodology: 'Same-source disabled/adopted comparator; identical progressed public save, biology/economy/RNG/world/groups and accepted member routes at dispatch. One fresh --expose-gc Node process per variant.20 warmup,250 measured ordinary ticks, no Winter boundary.',
    contextControl: prepared.scenarios.some(scenario => !!scenario.physicalContextFile),
    scenarios: [], blockers: prepared.blockers };
for (const scenario of selected) {
    const measured = {};
    for (const variant of ['disabled', 'enabled']) {
        const fixtureFile = join(directory, scenario.files[variant].file);
        const outputFile = join(directory, label + '-population-' + scenario.threshold + '-groups-' + scenario.groups + '-' + variant + '-measure.json');
        await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['--expose-gc', join(directory, 'measure-core-child.mjs'), sourceRoot,
                fixtureFile, outputFile, '250', '20',
                ...(scenario.physicalContextFile ? [join(directory, scenario.physicalContextFile)] : [])], { cwd: sourceRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
            child.stdout.on('data', bytes => process.stdout.write(bytes));
            child.stderr.on('data', bytes => process.stderr.write(bytes));
            child.on('error', reject);
            child.on('exit', code => code === 0 ? resolve() : reject(new Error('Measurement child failed: ' + code)));
        });
        measured[variant] = JSON.parse(await readFile(outputFile, 'utf8'));
    }
    const off = measured.disabled, on = measured.enabled;
    assert.deepEqual(on.startTime, off.startTime);
    assert.equal(on.contextSha256, off.contextSha256, 'Physical geometry and exclusions match');
    assert.equal(on.startRNGState, off.startRNGState, 'Same initial domestic RNG');
    assert.deepEqual(on.startMissions, off.startMissions, 'Same accepted member routes and initial progress');
    assert.deepEqual(on.endMissions, off.endMissions, 'Same reached member routes and progress');
    const cohorts = rows => rows.map(({ events, ...cohort }) => cohort);
    assert.deepEqual(cohorts(on.startPopulation), cohorts(off.startPopulation));
    const summary = { threshold: scenario.threshold, groups: scenario.groups, measured,
        delta: { p50Milliseconds: on.milliseconds.p50 - off.milliseconds.p50,
            p95Milliseconds: on.milliseconds.p95 - off.milliseconds.p95,
            p95Ratio: on.milliseconds.p95 / off.milliseconds.p95,
            postGCHeapBytes: on.memoryAfter.heapUsed - off.memoryAfter.heapUsed,
            postGCRSSBytes: on.memoryAfter.rss - off.memoryAfter.rss,
            serializedStartBytes: on.serialized.startBytes - off.serialized.startBytes,
            serializedEndBytes: on.serialized.endBytes - off.serialized.endBytes } };
    report.scenarios.push(summary);
    await writeFile(join(directory, label + '-performance.json'), JSON.stringify(report, null, 2));
}
report.status = report.scenarios.length ? 'passed' : 'blocked';
await writeFile(join(directory, label + '-performance.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, label, cases: report.scenarios.length }));
