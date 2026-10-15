import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = process.argv.slice(2).find(argument => !argument.startsWith('--')) || 'docs/qa/fjord-runtime-improvements/169';
const load = async path => {
    const data = JSON.parse(await readFile(root + '/' + path, 'utf8'));
    assert.equal(data.failure, undefined); assert.deepEqual(data.errors, []);
    return data;
};
const plan = JSON.parse(await readFile(root + '/plan.json', 'utf8'));
const firstBefore = await load('investigation/identity.json');
const finalMode = process.argv.includes('--final');
const firstAfter = await load(finalMode ? 'final-r1.json' : 'confirmation/optimized.json');
const finalAfters = finalMode ? [firstAfter.runs[0], (await load('final-r2.json')).runs[0], (await load('final-r3.json')).runs[0]] : null;
const remaining = await load('paired.json');
const runs = [...firstBefore.runs, ...firstAfter.runs, ...remaining.runs];
for (const data of [firstBefore, firstAfter, remaining]) {
    assert.equal(data.failure, undefined); assert.deepEqual(data.errors, []);
}
const pairs = [];
const span = (window, name) => window.spans[name + '.inclusive'];
const delta = (run, metric) => run.after.motion[metric] - run.before.motion[metric];
for (let index = 0; index < 3; index++) {
    const pair = index === 0 ? [firstBefore.runs[0], firstAfter.runs[0]] :
        remaining.runs.filter(run => run.scenario.soak && run.repeat === index);
    assert.equal(pair.length, 2);
    const before = pair.find(run => run.variant === 'before');
    const after = finalAfters?.[index] ?? pair.find(run => run.variant === 'after');
    assert.equal(before.sourceCommit, plan.before);
    assert.equal(after.sourceCommit, finalMode ? plan.finalAfter : plan.after);
    assert.equal(before.canonicalSha256, after.canonicalSha256);
    assert.equal(before.checkpointSha256, after.checkpointSha256);
    for (const run of [before, after]) {
        assert.equal(run.actualTicksFromFixture, 1666);
        assert.equal(run.windows.length, 10);
        assert.equal(run.canonicalReplayEqual, true);
        assert.deepEqual(run.after.placeholders, []);
        for (const window of run.windows) {
            assert.equal(window.routeOverflow, 0);
            assert.equal(window.motion.bodyOverlaps, 0);
            assert.equal(window.motion.outOfZone, 0);
            assert.ok(window.gpu.count > 0);
            assert.equal(window.disjointQueries, 0);
        }
    }
    const worstLate = before.windows.map((window, i) => ({ i, cpu: span(window, 'motion.route')?.total || 0 }))
        .filter(row => row.i >= 5).sort((a, b) => b.cpu - a.cpu).slice(0, 3).map(row => row.i);
    const total = (run, indices) => indices.reduce((sum, i) => sum + (span(run.windows[i], 'motion.route')?.total || 0), 0);
    const stats = run => ({
        lateRouteMs: total(run, worstLate), finalThreeRouteMs: total(run, [7, 8, 9]),
        worstMotionP99: Math.max(...run.windows.map(window => span(window, 'motion.advance').p99)),
        worstRouteMs: Math.max(...run.windows.map(window => span(window, 'motion.route')?.max || 0)),
        framesOver50: run.windows.reduce((sum, window) => sum + window.frames.over50, 0),
        frameCount: run.windows.reduce((sum, window) => sum + window.frames.count, 0),
        fractionOver50: run.windows.reduce((sum, window) => sum + window.frames.over50, 0) /
            run.windows.reduce((sum, window) => sum + window.frames.count, 0),
        worstFrameP95: Math.max(...run.windows.map(window => window.frames.p95)),
        worstFrameP99: Math.max(...run.windows.map(window => window.frames.p99)),
        longTaskMs: run.windows.reduce((sum, window) => sum + window.longTasks.total, 0),
        gpuMean: run.windows.reduce((sum, window) => sum + window.gpu.total, 0) /
            run.windows.reduce((sum, window) => sum + window.gpu.count, 0),
        activeSeconds: delta(run, 'activeSeconds'),
        visitsStarted: delta(run, 'visitsStarted'), occupationArrivals: delta(run, 'occupationArrivals'),
        homeArrivals: delta(run, 'homeArrivals'), activitiesCompleted: delta(run, 'activitiesCompleted'),
        distanceWalked: delta(run, 'distanceWalked'),
        routeAttempts: delta(run, 'routeAttempts'), rejectedRoutes: delta(run, 'rejectedRoutes'),
        routeNodes: delta(run, 'routeNodes'), failedRouteReuse: delta(run, 'failedRouteReuse') || 0,
        homeTrailReuse: delta(run, 'homeTrailReuse') || 0, retainedHomeWaypoints: run.after.motion.retainedHomeWaypoints ?? null,
        occupationArrivalsPerActiveMinute: delta(run, 'occupationArrivals') / delta(run, 'activeSeconds') * 60,
        homeArrivalsPerActiveMinute: delta(run, 'homeArrivals') / delta(run, 'activeSeconds') * 60,
        heapWindows: run.windows.map(window => window.heap.used),
    });
    const b = stats(before), a = stats(after);
    pairs.push({ trial: index + 1, profiled: index === 0, beforeSource: before.sourceCommit,
        afterSource: after.sourceCommit, worstLateIndicesChosenFromBaseline: worstLate, before: b, after: a,
        routeCpuChangePercent: (a.lateRouteMs / b.lateRouteMs - 1) * 100,
        gpuChangePercent: (a.gpuMean / b.gpuMean - 1) * 100 });
}
const controls = remaining.runs.filter(run => !run.scenario.soak);
for (const run of controls) {
    assert.equal(run.canonicalReplayEqual, true);
    assert.deepEqual(run.after.placeholders, []);
    assert.equal(run.after.motion.bodyOverlaps, 0);
    assert.equal(run.after.motion.outOfZone, 0);
    const pair = controls.find(other => other.repeat === run.repeat && other.variant !== run.variant &&
        JSON.stringify(other.scenario) === JSON.stringify(run.scenario));
    assert.equal(run.canonicalSha256, pair.canonicalSha256);
    assert.equal(run.checkpointSha256, pair.checkpointSha256);
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const finalControls = finalMode ? (await load('final-controls.json')).runs : [];
for (const run of finalControls) {
    const before = controls.find(other => other.repeat === 1 && other.variant === 'before' &&
        JSON.stringify(other.scenario) === JSON.stringify(run.scenario));
    assert.ok(before);
    assert.equal(run.sourceCommit, plan.finalAfter);
    assert.equal(run.canonicalReplayEqual, true);
    assert.equal(run.canonicalSha256, before.canonicalSha256);
    assert.equal(run.checkpointSha256, before.checkpointSha256);
    for (const window of run.windows) {
        assert.ok(window.gpu.count > 0);
        assert.equal(window.disjointQueries, 0);
    }
    assert.deepEqual(run.after.placeholders, []);
    assert.equal(run.after.motion.bodyOverlaps, 0); assert.equal(run.after.motion.outOfZone, 0);
}
for (const file of ['investigation/identity.json', 'confirmation/optimized.json', 'paired.json',
    ...(finalMode ? ['final-r1.json', 'final-r2.json', 'final-r3.json', 'final-controls.json'] : [])]) {
    for (const fixture of (await load(file)).fixtures) {
        const bytes = await readFile(plan.fixtureRoot + '/' + fixture.name + '.json');
        assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
    }
}
const result = { finalMode, pairs, controls, finalControls, medianRouteCpuChangePercent: median(pairs.map(pair => pair.routeCpuChangePercent)),
    medianGpuChangePercent: median(pairs.map(pair => pair.gpuChangePercent)),
    gates: { allRouteReductionAtLeast80Percent: pairs.every(pair => pair.routeCpuChangePercent <= -80),
        allMotionP99Below25Ms: pairs.every(pair => pair.after.worstMotionP99 < 25),
        medianOccupationArrivalRateNoWorse: median(pairs.map(pair => pair.after.occupationArrivalsPerActiveMinute)) >= median(pairs.map(pair => pair.before.occupationArrivalsPerActiveMinute)),
        medianHomeArrivalRateNoWorse: median(pairs.map(pair => pair.after.homeArrivalsPerActiveMinute)) >= median(pairs.map(pair => pair.before.homeArrivalsPerActiveMinute)) },
    note: 'Inclusive main-thread wall spans are not cycle counters. First pair has identical native CPU sampling; other pairs are unprofiled. Three late windows are selected from the baseline and the same indices are compared. Presentation randomness is independent from Core but wall-clock motion can differ; report arrivals per active minute, not an assertion of identical positions. GPU execution is a measured negative control, not JS submission.' };
await writeFile(root + (finalMode ? '/results.json' : '/queue-only-results.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ pairs, medianRouteCpuChangePercent: result.medianRouteCpuChangePercent, gates: result.gates }));
