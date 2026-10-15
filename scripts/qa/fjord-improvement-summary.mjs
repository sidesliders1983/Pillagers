import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = process.argv[2] || 'docs/qa/fjord-runtime-improvements/168';
const plan = JSON.parse(await readFile(directory + '/plan.json', 'utf8'));
const data = JSON.parse(await readFile(directory + '/paired.json', 'utf8'));
assert.equal(data.failure, undefined);
assert.deepEqual(data.errors, []);
assert.equal(data.runs.length, plan.repeats * plan.scenarios.length * 2, 'Incomplete paired matrix');
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const span = (run, name) => run.windows[0].spans[name + '.inclusive'];
const statistics = values => ({ median: median(values), min: Math.min(...values), max: Math.max(...values) });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const fixture of data.fixtures) {
    const bytes = await readFile(plan.fixtureRoot + '/' + fixture.name + '.json');
    assert.equal(sha(bytes), fixture.sha256, 'Frozen input changed');
}
let exactPairs = 0;
for (const scenario of plan.scenarios) for (let repeat = 1; repeat <= plan.repeats; repeat++) {
    const pair = data.runs.filter(run => JSON.stringify(run.scenario) === JSON.stringify(scenario) && run.repeat === repeat);
    assert.equal(pair.length, 2);
    assert.deepEqual(pair.map(run => run.variant).sort(), ['after', 'before']);
    for (const run of pair) {
        assert.equal(run.canonicalReplayEqual, true);
        assert.deepEqual(run.after.placeholders, []);
        assert.equal(run.before.visibility, 'visible');
        assert.equal(run.sourceCommit, plan[run.variant]);
        for (const window of run.windows) {
            assert.equal(window.gpuSupported, true);
            assert.ok(window.gpu.count > 0);
            assert.equal(window.disjointQueries, 0);
        }
    }
    if (scenario.commands || !scenario.running) {
        assert.equal(pair[0].canonicalSha256, pair[1].canonicalSha256, 'Matched commands must produce identical Core bytes');
        assert.equal(pair[0].checkpointSha256, pair[1].checkpointSha256, 'Matched commands must preserve exact campaign/narrative/save bytes');
        if (scenario.commands) for (const run of pair)
            assert.equal(run.actualTicksFromFixture, scenario.commands * (scenario.ticksPerCommand || 3));
        exactPairs++;
    }
}
const rows = plan.scenarios.map(scenario => {
    const variants = Object.fromEntries(['before', 'after'].map(variant => {
        const runs = data.runs.filter(run => run.variant === variant && JSON.stringify(run.scenario) === JSON.stringify(scenario));
        const withSpan = (name, field) => runs.map(run => span(run, name)?.[field]).filter(Number.isFinite);
        const stats = values => values.length ? statistics(values) : null;
        return [variant, { refreshMean: stats(withSpan('ui.refresh', 'mean')), refreshP95: stats(withSpan('ui.refresh', 'p95')),
            snapshotCalls: stats(withSpan('session.snapshot', 'count')), projectCalls: stats(withSpan('campaign.project', 'count')),
            persistCalls: stats(withSpan('shared.persist', 'count')), gpuMean: stats(runs.map(run => run.windows[0].gpu.mean)),
            frameP50: stats(runs.map(run => run.windows[0].frames.p50)), frameP95: stats(runs.map(run => run.windows[0].frames.p95)),
            frameP99: stats(runs.map(run => run.windows[0].frames.p99)), frameMax: stats(runs.map(run => run.windows[0].frames.max)),
            longTasks: stats(runs.map(run => run.windows[0].longTasks.count)), longTaskTotal: stats(runs.map(run => run.windows[0].longTasks.total)),
            processedTicksIncludingWarmup: stats(runs.map(run => run.actualTicksFromFixture)),
            captureTicks: stats(runs.map(run => (run.after.time.winter - run.before.time.winter) * 1000 + run.after.time.tick - run.before.time.tick)), durationMs: stats(runs.map(run => run.windows[0].durationMs)),
            coreBytes: stats(runs.map(run => run.canonicalSaveBytes)),
            renderer: runs.map(run => run.after.renderer), sceneCounts: runs.map(run => run.after.counts) }];
    }));
    const pairedChanges = {};
    const accessors = { refreshMean: run => span(run, 'ui.refresh')?.mean,
        gpuMean: run => run.windows[0].gpu.mean, frameP95: run => run.windows[0].frames.p95,
        longTaskTotal: run => run.windows[0].longTasks.total };
    for (const [name, read] of Object.entries(accessors)) {
        const changes = [];
        for (let repeat = 1; repeat <= plan.repeats; repeat++) {
            const pair = data.runs.filter(run => run.repeat === repeat &&
                JSON.stringify(run.scenario) === JSON.stringify(scenario));
            const before = read(pair.find(run => run.variant === 'before'));
            const after = read(pair.find(run => run.variant === 'after'));
            if (Number.isFinite(before) && before > 0 && Number.isFinite(after)) changes.push((after / before - 1) * 100);
        }
        pairedChanges[name] = changes.length ? statistics(changes) : null;
    }
    return { scenario, ...variants, pairedChangePercent: pairedChanges,
        changePercent: Object.fromEntries(Object.entries(pairedChanges).map(([name, stats]) => [name, stats?.median ?? null])) };
});
const developed = rows.find(row => row.scenario.fixture === 'developed-810' && row.scenario.commands && !row.scenario.cameraPath && !row.scenario.selected);
const result = { issue: plan.issue, before: plan.before, after: plan.after, trials: data.runs.length,
    exactCoreAndCheckpointPairs: exactPairs, allCanonicalReplaysPass: true,
    gates: { refreshMeanReductionAtLeast40Percent: developed.changePercent.refreshMean <= -40,
        allDevelopedRefreshP95Below50Ms: developed.after.refreshP95.max < 50 }, rows,
    note: 'CPU means are synchronous inclusive main-thread wall spans, not cycle counters. Native FPS/GC evidence and unchanged production controls are separate. GPU command query time is distinct from renderer JavaScript submission. Natural pacing has different achieved ticks; captureTicks excludes the separately recorded warmup ticks; scheduled cases compare exact identical commands/saves.' };
await writeFile(directory + '/results.json', JSON.stringify(result, null, 2) + '\n');
const n = value => value == null ? 'UNKNOWN' : value.toFixed(1);
const lines = ['# Issue ' + plan.issue + ' — measured campaign-read optimization', '',
    'Before: `' + plan.before + '`. After: `' + plan.after + '`. Historical audit #166 remains unchanged.', '',
    'Three alternating paired trials per scenario, actual owner house models, zero placeholders, Low quality/effects, DPR 1, Edge/Intel HD 630. Five-second warmup, nominal twenty-second capture. Scheduled cases commit exactly 40 AdvanceTicks(3) commands at 500 ms deadlines; the QA-only clock guard prevents additional canonical commands. Paused and natural-clock controls are labelled separately. Before/after columns are medians of per-trial metrics; percent columns are medians of within-pair changes (ratios and medians need not commute under host drift). Full ranges/raw windows are in [results.json](results.json) and [paired.json](paired.json).', '',
    'All ' + data.runs.length + ' browser replays pass. ' + exactPairs + ' pairs also have identical complete Core and campaign/narrative/save hashes; scheduled cases process exactly 120 ticks on each build. Actual GPU query samples are non-disjoint. Host power/thermal limitations remain those of the audit; viewport tests do not establish physical mobile performance.', '',
    '| Scenario | Refresh mean before → after ms | Refresh p95 before → after ms | Paired CPU change | Frame p95 before → after ms | GPU mean before → after ms | Paired GPU change |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const row of rows) lines.push('| ' + JSON.stringify(row.scenario) + ' | ' + n(row.before.refreshMean?.median) + ' → ' + n(row.after.refreshMean?.median) +
    ' | ' + n(row.before.refreshP95?.median) + ' → ' + n(row.after.refreshP95?.median) + ' | ' + n(row.changePercent.refreshMean) + '% | ' +
    n(row.before.frameP95.median) + ' → ' + n(row.after.frameP95.median) + ' | ' + n(row.before.gpuMean.median) + ' → ' + n(row.after.gpuMean.median) +
    ' | ' + n(row.changePercent.gpuMean) + '% |');
lines.push('', 'Negative GPU change means a lower observed command interval. The crowd frame-time outliers and late host-wide GPU timing shift remain visible in the raw pair ranges; no universal frame-rate gain is claimed from #168 alone. Route-specific stalls are addressed separately in #169. UI work does not remove the fixed GPU load; small deltas under host drift are not a GPU optimization claim.', '',
    'The public snapshot still clones. Internal readSnapshot creates one isolated deeply frozen snapshot per committed revision, and readProjection caches a detached frozen presentation model. Core commands/import/restart/replacement invalidate it; rejected commands retain the previous valid read. Selection, playback and fractional pacing serialize their current values on every scheduled/explicit save. Canonical serializeState validation is retained once per immutable revision. Availability probes still call authoritative applyCommand, with bounded per-revision reuse of identical finite-JSON commands; no alternative eligibility rules were introduced.', '',
    'Remaining copies: one complete snapshot per new revision consumed by the UI; independent public snapshots on request; one small detached projection per changed canonical/layout/geography input; existing narrative and import/handoff ownership copies. Scheduled persistence is retained, and the matching save hashes include narrative publication/read flags, layout, selection and pacing.', '',
    'Validation: TypeScript/production build and 50 focused tests pass, including four new read/caching/eligibility/exact-save tests. The inherited original-Human skin shader test remains tracked separately; no assertion is weakened. Current-head full suite/character validation/CI and final production-bundle isolation are recorded in the combined implementation handoff.', '',
    'Rollback: revert the #168 source commits as one slice; no save migration or gameplay-rule change is required. Layout/geometry/rendering source and default visual policies are unchanged. Owner review precedes merge.');
await writeFile(directory + '/report.md', lines.join('\n') + '\n');
console.log(JSON.stringify({ issue: plan.issue, trials: data.runs.length, exactPairs, gates: result.gates, developedCPUChangePercent: developed.changePercent.refreshMean }));
