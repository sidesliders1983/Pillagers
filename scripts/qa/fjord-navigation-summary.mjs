import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const root = process.argv[2] || 'docs/qa/fjord-navigation-performance';
const data = JSON.parse(await readFile(root + '/paired/results.json', 'utf8'));
assert.equal(data.failure, undefined); assert.deepEqual(data.errors, []);
assert.equal(data.runs.length, 24);
const median = values => {
    const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const distribution = values => ({ count: values.length, median: median(values), min: Math.min(...values), max: Math.max(...values) });
const cpu = run => run.spans.find(row => row.name === 'navigate').ms;
const rows = [];
for (const running of [false, true]) {
    const pairs = [];
    for (let repeat = 1; repeat <= 3; repeat++) for (let tap = 1; tap <= 2; tap++) {
        const pair = data.runs.filter(run => run.running === running && run.repeat === repeat && run.tap === tap);
        assert.equal(pair.length, 2);
        const before = pair.find(run => run.variant === 'before'), after = pair.find(run => run.variant === 'after');
        for (const run of pair) {
            assert.equal(run.sourceCommit, data.variants.find(variant => variant.label === run.variant).sourceCommit);
            assert.equal(run.canonicalReplayEqual, true); assert.deepEqual(run.placeholders, []);
            assert.ok(Math.hypot(...run.desired.map((value, axis) => value - run.nativeInputPoint[axis])) < 1e-8);
        }
        assert.ok(Math.hypot(...before.nativeInputPoint.map((value, axis) => value - after.nativeInputPoint[axis])) < 1e-8);
        if (!running) assert.equal(before.canonicalSha256, after.canonicalSha256);
        pairs.push({ repeat, tap, beforeCpuMs: cpu(before), afterCpuMs: cpu(after),
            cpuChangePercent: (cpu(after) / cpu(before) - 1) * 100,
            beforeSubmissionMs: before.firstCameraSubmissionAfterInputMs,
            afterSubmissionMs: after.firstCameraSubmissionAfterInputMs });
    }
    const b = data.runs.filter(run => run.running === running && run.variant === 'before');
    const a = data.runs.filter(run => run.running === running && run.variant === 'after');
    rows.push({ running, pairs, cpuBefore: distribution(b.map(cpu)), cpuAfter: distribution(a.map(cpu)),
        pairedCpuChangePercent: distribution(pairs.map(pair => pair.cpuChangePercent)),
        firstCameraSubmissionBefore: distribution(b.map(run => run.firstCameraSubmissionAfterInputMs)),
        firstCameraSubmissionAfter: distribution(a.map(run => run.firstCameraSubmissionAfterInputMs)),
        cameraSolverMaxMs: Math.max(...[...a, ...b].flatMap(run => run.frames.map(frame => frame.milliseconds))),
        resources: data.runs.filter(run => run.running === running).map(run => ({ variant: run.variant,
            repeat: run.repeat, tap: run.tap, ...run.renderer.memory, drawCalls: run.renderer.draw.calls })) });
}
await writeFile(root + '/summary.json', JSON.stringify({ captures: 24, variants: data.variants, rows,
    note: 'CPU handler duration and main-thread camera render submission, not physical display latency or GPU command time. Matched native points are equivalent within 1e-8m. Paused canonical bytes match; Running actual tick counts are separately replayed. Physical iOS is untested.' }, null, 2) + '\n');
console.log(JSON.stringify(rows.map(row => ({ running: row.running, cpuBefore: row.cpuBefore, cpuAfter: row.cpuAfter,
    change: row.pairedCpuChangePercent, firstBefore: row.firstCameraSubmissionBefore, firstAfter: row.firstCameraSubmissionAfter,
    cameraSolverMaxMs: row.cameraSolverMaxMs }))));
