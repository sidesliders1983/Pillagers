import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const root = process.argv[2] || 'docs/qa/fjord-runtime-improvements/170';
const plan = JSON.parse(await readFile(root + '/plan.json', 'utf8'));
const rows = [];
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
for (const variant of ['before', 'after']) {
    const data = JSON.parse(await readFile(root + '/stock-' + variant + '/stock-production.json', 'utf8'));
    assert.equal(data.failure, undefined);
    assert.deepEqual(data.errors, []);
    assert.equal(data.sourceCommit, variant === 'before' ? plan.before : plan.productionChangeCommit);
    assert.equal(data.runs.length, 3);
    for (const run of data.runs) {
        assert.equal(run.canonicalReplayEqual, true);
        assert.ok(run.actualTicksFromFixture > 10, 'Must cross the first annual boundary');
        assert.deepEqual(run.device.placeholders, []);
        assert.equal(run.sample.visibility, 'visible');
    }
    rows.push({ variant, sourceCommit: data.sourceCommit,
        frameP95Median: median(data.runs.map(run => run.sample.p95)),
        frameP99Median: median(data.runs.map(run => run.sample.p99)),
        maximumFrameMedian: median(data.runs.map(run => run.sample.max)),
        maximumFrameRange: [Math.min(...data.runs.map(run => run.sample.max)), Math.max(...data.runs.map(run => run.sample.max))],
        runs: data.runs.map(run => ({ repeat: run.repeat, actualTicksFromFixture: run.actualTicksFromFixture,
            frames: run.sample, canonicalReplayEqual: run.canonicalReplayEqual })) });
}
const result = { trials: 6, productionBridgeAbsent: true, rows,
    note: 'Unmodified normal production bundles, public controls, natural wall-clock advance, three annual transitions per source. Every exported Core matches authoritative replay of its own actual tick count; natural wall-clock runs are not exact matched-command pairs. Use the controlled 36-run matrix for paired fitting CPU/GPU attribution. Actual GPU execution time is UNKNOWN in these bridge-free confirmations.' };
await writeFile(root + '/stock-results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(rows.map(({ variant, frameP95Median, frameP99Median, maximumFrameMedian, maximumFrameRange, runs }) =>
    ({ variant, frameP95Median, frameP99Median, maximumFrameMedian, maximumFrameRange,
        actualTicks: runs.map(run => run.actualTicksFromFixture) }))));
