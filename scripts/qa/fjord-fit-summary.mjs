import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = process.argv[2] || 'docs/qa/fjord-runtime-improvements/170';
const plan = JSON.parse(await readFile(root + '/plan.json', 'utf8'));
const data = JSON.parse(await readFile(root + '/paired.json', 'utf8'));
assert.equal(data.failure, undefined); assert.deepEqual(data.errors, []);
assert.equal(data.runs.length, plan.scenarios.length * plan.repeats * 2);
for (const fixture of data.fixtures) {
    const bytes = await readFile(root + '/fixtures/' + fixture.name + '.json');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) });
const span = (run, name) => run.windows[0].spans[name + '.inclusive'];
const rows = [];
for (const scenario of plan.scenarios) {
    const pairs = [];
    for (let repeat = 1; repeat <= plan.repeats; repeat++) {
        const pair = data.runs.filter(run => run.repeat === repeat && JSON.stringify(run.scenario) === JSON.stringify(scenario));
        assert.equal(pair.length, 2);
        const before = pair.find(run => run.variant === 'before'), after = pair.find(run => run.variant === 'after');
        assert.equal(before.canonicalSha256, after.canonicalSha256);
        assert.equal(before.checkpointSha256, after.checkpointSha256);
        for (const run of pair) {
            assert.equal(run.sourceCommit, plan[run.variant]);
            assert.equal(run.canonicalReplayEqual, true);
            assert.deepEqual(run.after.placeholders, []);
            assert.ok(run.windows[0].gpu.count > 0); assert.equal(run.windows[0].disjointQueries, 0);
            assert.equal(run.after.motion.bodyOverlaps, 0); assert.equal(run.after.motion.outOfZone, 0);
        }
        const read = run => ({ refit: span(run, 'modules.refit') || { count: 0, total: 0, max: 0, p95: 0 },
            applyDNA: span(run, 'human.applyDNA') || null,
            modelFits: run.windows[0].modelFits,
            dependencyKey: span(run, 'human.neutralFitSignature') || null,
            bounds: span(run, 'bounds.setFromObject') || null,
            modelReconcile: span(run, 'models.reconcile') || null,
            scene: run.windows[0].spans['scene.syncAsyncWall'] || null,
            frames: run.windows[0].frames, gpu: run.windows[0].gpu,
            longTasks: run.windows[0].longTasks, heap: run.windows[0].heap,
            renderer: run.after.renderer, fitsBefore: run.before.humanFits, fitsAfter: run.after.humanFits,
            actualTicks: run.actualTicksFromFixture });
        const b = read(before), a = read(after);
        pairs.push({ repeat, before: b, after: a,
            refitChangePercent: b.refit.total ? (a.refit.total / b.refit.total - 1) * 100 : null,
            gpuChangePercent: (a.gpu.mean / b.gpu.mean - 1) * 100,
            firstBoundaryBelow500Ms: a.frames.max < 500 });
    }
    rows.push({ scenario, pairs,
        refitCpuChange: pairs[0].refitChangePercent == null ? null : summary(pairs.map(pair => pair.refitChangePercent)),
        gpuChange: summary(pairs.map(pair => pair.gpuChangePercent)),
        frameP95Before: summary(pairs.map(pair => pair.before.frames.p95)),
        frameP95After: summary(pairs.map(pair => pair.after.frames.p95)),
        frameMaxBefore: summary(pairs.map(pair => pair.before.frames.max)),
        frameMaxAfter: summary(pairs.map(pair => pair.after.frames.max)) });
}
const boundaries = rows.filter(row => row.scenario.fixture.includes('boundary'));
const result = { before: plan.before, after: plan.after, trials: data.runs.length, exactCoreAndCheckpointPairs: data.runs.length / 2,
    gates: { everyBoundaryRefitReductionAtLeast70Percent: boundaries.every(row => row.refitCpuChange.max <= -70),
        everyBoundaryFrameBelow500Ms: boundaries.every(row => row.frameMaxAfter.max < 500) }, rows,
    note: 'Synchronous inclusive fitting spans overlap applyDNA/model/scene/native sampled stacks; never sum them. Fixed integer schedules approximate the selected year pace and match exact commands across sources. Actual GPU query time is independent from JS render submission. Heap snapshots include shared scene resources and GC phase, not an allocation rate or physical mobile measurement.' };
await writeFile(root + '/results.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ trials: result.trials, gates: result.gates,
    rows: rows.map(row => ({ scenario: row.scenario, refit: row.refitCpuChange, gpu: row.gpuChange, maxFrame: row.frameMaxAfter })) }));
