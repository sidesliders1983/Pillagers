import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
const read = async name => {
    try { return JSON.parse(await readFile(root + '/' + name + '.json', 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const range = values => {
    const valid = values.filter(Number.isFinite);
    return valid.length ? { min: Math.min(...valid), max: Math.max(...valid),
        mean: valid.reduce((a, b) => a + b) / valid.length } : null;
};
const format = value => Number.isFinite(value) ? value.toFixed(1) : 'UNKNOWN';
const formatRange = value => !value ? 'UNKNOWN' : value.min === value.max ? format(value.min) : `${format(value.min)}–${format(value.max)}`;
const span = (window, name) => window.spans?.[name + '.inclusive'];
function summaries(runs, stock = false) {
    const groups = new Map();
    for (const run of runs || []) {
        const key = JSON.stringify(run.scenario);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(run);
    }
    return [...groups.values()].map(group => {
        const windows = group.flatMap(run => stock ? [run.sample] : run.windows);
        return { scenario: group[0].scenario, repeats: group.length,
            p50: range(windows.map(w => stock ? w.p50 : w.frames.p50)),
            p95: range(windows.map(w => stock ? w.p95 : w.frames.p95)),
            p99: range(windows.map(w => stock ? w.p99 : w.frames.p99)),
            fps: range(windows.map(w => w.fps)), gpuMean: range(windows.map(w => w.gpu?.mean)),
            longTasks: range(windows.map(w => w.longTasks.count)),
            refreshMean: range(windows.map(w => span(w, 'ui.refresh')?.mean)),
            snapshotTotalMs: range(windows.map(w => span(w, 'session.snapshot')?.total)),
            motionMean: range(windows.map(w => span(w, 'motion.advance')?.mean)),
            routeMax: range(windows.map(w => span(w, 'motion.route')?.max)),
            submitMean: range(windows.map(w => span(w, 'render.submit')?.mean)),
            commandMax: range(windows.map(w => span(w, 'session.command')?.max)),
            replayEqual: group.every(run => run.canonicalReplayEqual),
            errors: group.some(run => run.failure) };
    });
}
const data = {};
for (const group of ['baseline', 'diagnostics', 'overhead', 'profiles', 'soak', 'previous', 'previous-boundary', 'stock-production', 'prepared/baseline', 'prepared/profiles', 'prepared/previous-boundary', 'prepared/stock-production', 'prepared/soak', 'prepared/diagnostics'])
    data[group] = await read(group);
const summarizeSoak = runs => runs?.map(run => ({
    before: { time: run.before.time, residents: run.before.residents, cattle: run.before.cattle },
    after: { time: run.after.time, residents: run.after.residents, cattle: run.after.cattle },
    replayEqual: run.canonicalReplayEqual,
    windows: run.windows.map(window => ({ durationMs: window.durationMs, frame: window.frames,
        gpu: window.gpu, heap: window.heap, longTasks: window.longTasks,
        refresh: span(window, 'ui.refresh'), route: span(window, 'motion.route'),
        motion: span(window, 'motion.advance'), command: span(window, 'session.command') }))
}));
const index = { assetEnvironment: 'Original series uses generated-house placeholders; prepared series requires the owner house models and zero placeholders.', sourceCommit: data.baseline?.sourceCommit, generatedAt: new Date().toISOString(), units: 'milliseconds unless explicitly stated',
    baseline: summaries(data.baseline?.runs), diagnostics: summaries([...(data.diagnostics?.runs || []), ...(data.profiles?.runs.filter(run => run.scenario.coldQuality) || [])]),
    overhead: summaries(data.overhead?.runs), previous: summaries([...(data.previous?.runs || []), ...(data['previous-boundary']?.runs || [])]),
    production: summaries(data['stock-production']?.runs, true),
    profileEvidence: [['', data.profiles], ['prepared/', data['prepared/profiles']]].flatMap(([prefix, group]) =>
        group?.runs.filter(run => run.cpuProfile).map(run => ({ scenario: run.scenario,
            cpuPath: prefix + run.cpuProfile.path, durationMs: run.cpuProfile.durationMs,
            tracePath: prefix + run.trace.path, nativeSummaryPath: prefix + 'native-summary.json' })) || []),
    soak: summarizeSoak(data.soak?.runs),
    prepared: {
        baseline: summaries(data['prepared/baseline']?.runs),
        production: summaries(data['prepared/stock-production']?.runs, true),
        native: summaries(data['prepared/profiles']?.runs),
        previousBoundary: summaries(data['prepared/previous-boundary']?.runs),
        soak: summarizeSoak(data['prepared/soak']?.runs),
        counters: data['prepared/diagnostics']?.runs.map(run => ({ path: 'prepared/diagnostics.json',
            scenario: run.scenario, nativeDrawCounters: run.after.nativeDrawCounters,
            rigs: run.after.uniqueRigInventory, sceneCounts: run.after.counts,
            renderer: run.after.renderer, replayEqual: run.canonicalReplayEqual })),
    },
    rawFiles: [], errors: Object.entries(data).flatMap(([group, value]) => (value?.errors || []).map(error => ({ group, error }))),
    failures: Object.entries(data).filter(([, value]) => value?.failure).map(([group, value]) => ({ group, failure: value.failure })) };
for (const nativePath of await readdir(root, { recursive: true })) {
    const file = nativePath.replaceAll('\\', '/');
    if ((!file.endsWith('.json') && !file.endsWith('.gz') && !file.endsWith('.png') && !file.endsWith('.txt')) || file === 'results.json') continue;
    const bytes = await readFile(root + '/' + file);
    index.rawFiles.push({ path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(root + '/results.json', JSON.stringify(index, null, 2) + '\n');
const lines = ['### Repeated Running/Paused trials', '',
    '| Fixture | Playback / camera | Trials | FPS range | Frame p95 range ms | Frame p99 range ms | GPU mean range ms | Long tasks per capture |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const row of index.baseline) lines.push(`| ${row.scenario.fixture} | ${row.scenario.running ? 'Running' : 'Paused'} / ${row.scenario.cameraPath ? 'orbit' : 'stationary'} | ${row.repeats} | ${formatRange(row.fps)} | ${formatRange(row.p95)} | ${formatRange(row.p99)} | ${formatRange(row.gpuMean)} | ${formatRange(row.longTasks)} |`);
const selected = data.baseline?.runs.filter(run => run.scenario.fixture === 'developed-810' && run.scenario.running && !run.scenario.cameraPath) || [];
lines.push('', '### Developed campaign CPU spans', '', 'Inclusive rows overlap. Async wall rows are not CPU totals. Rates use the full capture duration.', '',
    '| Span | Calls/s range | Mean per call range ms | p95 per call range ms | Maximum range ms |', '| --- | ---: | ---: | ---: | ---: |');
for (const name of ['frame.callback.inclusive', 'session.command.inclusive', 'ui.refresh.inclusive', 'session.snapshot.inclusive',
    'campaign.project.inclusive', 'shared.persist.inclusive', 'scene.syncAsyncWall', 'motion.advance.inclusive', 'motion.route.inclusive',
    'entities.advance.inclusive', 'human.update.inclusive', 'mixer.update.inclusive', 'campfire.update.inclusive',
    'precipitation.update.inclusive', 'frame.diagnostics.inclusive', 'selectionLabels.update.inclusive',
    'productionLabels.update.inclusive', 'world.update.inclusive', 'render.submit.inclusive']) {
    const values = selected.map(run => ({ sample: run.windows[0].spans[name], duration: run.windows[0].durationMs })).filter(v => v.sample);
    if (!values.length) continue;
    lines.push(`| ${name} | ${formatRange(range(values.map(v => v.sample.count * 1000 / v.duration)))} | ${formatRange(range(values.map(v => v.sample.mean)))} | ${formatRange(range(values.map(v => v.sample.p95)))} | ${formatRange(range(values.map(v => v.sample.max)))} |`);
}
lines.push('', '### Isolated diagnostics', '', 'Each row is an exploratory one-system experiment unless repeated explicitly. Artificial cache/persistence, forced emissions, hidden geometry and disabled systems are ablations, not unchanged gameplay.', '',
    '| Scenario | p95 frame ms | GPU mean ms | UI refresh mean ms | Long tasks | Route max ms |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const row of index.diagnostics) lines.push(`| ${Object.entries(row.scenario).map(([k, v]) => `${k}=${v}`).join(', ')} | ${formatRange(row.p95)} | ${formatRange(row.gpuMean)} | ${formatRange(row.refreshMean)} | ${formatRange(row.longTasks)} | ${formatRange(row.routeMax)} |`);
lines.push('', '### Profiler/query overhead', '', '| Instrumentation / GPU queries | Trials | Frame p95 ms | GPU mean ms |', '| --- | ---: | ---: | ---: |');
for (const row of index.overhead) lines.push(`| ${row.scenario.instrument} / ${row.scenario.gpu} | ${row.repeats} | ${formatRange(row.p95)} | ${formatRange(row.gpuMean)} |`);
lines.push('', '### Previous pinned source', '', '| Fixture / playback / camera | Trials | Frame p95 ms | GPU mean ms | Refresh mean ms |', '| --- | ---: | ---: | ---: | ---: |');
for (const row of index.previous) lines.push(`| ${row.scenario.fixture} / ${row.scenario.running} / ${row.scenario.cameraPath} | ${row.repeats} | ${formatRange(row.p95)} | ${formatRange(row.gpuMean)} | ${formatRange(row.refreshMean)} |`);
lines.push('', '### Stock production control', '', 'No QA bridge is present; GPU execution time is UNKNOWN in this public-controls-only control.', '',
    '| Fixture / playback | Trials | FPS range | Frame p95 ms | Frame p99 ms | Long tasks |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const row of index.production) lines.push(`| ${row.scenario.fixture} / ${row.scenario.running ? 'Running' : 'Paused'} | ${row.repeats} | ${formatRange(row.fps)} | ${formatRange(row.p95)} | ${formatRange(row.p99)} | ${formatRange(row.longTasks)} |`);
lines.push('', '### Five-minute uninterrupted running sample', '', '| Window | Frame p95 ms | GPU mean ms | JS heap used MiB | Long tasks | Refresh mean ms |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const soak of index.soak || []) soak.windows.forEach((w, i) => lines.push(`| ${i + 1} | ${format(w.frame.p95)} | ${format(w.gpu.mean)} | ${format(w.heap.used / 1048576)} | ${w.longTasks.count} | ${format(w.refresh?.mean)} |`));
lines.push('', '### First annual-boundary presentation latency', '',
    'Scene async wall time overlaps synchronous UI work; it must not be added to the UI span. Model reconcile values below measure its synchronous prefix. Frame maximum is retained because a multi-second event can disappear from p95.', '',
    '| Source / year length | Trials | Frame maximum ms | Model reconcile maximum ms | Scene sync maximum wall ms | Core command maximum ms |', '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [label, runs] of [
    ['current, 1 minute', data.diagnostics?.runs.filter(run => run.scenario.fixture === 'boundary-810' && run.scenario.minutes === 1)],
    ['current, 3 minutes', data.diagnostics?.runs.filter(run => run.scenario.fixture === 'boundary-810' && run.scenario.minutes === 3)],
    ['current, 5 minutes', data.diagnostics?.runs.filter(run => run.scenario.fixture === 'boundary-810' && run.scenario.minutes === 5)],
    ['previous, 3 minutes', data['previous-boundary']?.runs],
]) {
    if (!runs?.length) continue;
    const windows = runs.map(run => run.windows[0]);
    lines.push('| ' + label + ' | ' + runs.length + ' | ' + formatRange(range(windows.map(w => w.frames.max))) +
        ' | ' + formatRange(range(windows.map(w => span(w, 'models.reconcile')?.max))) +
        ' | ' + formatRange(range(windows.map(w => w.spans['scene.syncAsyncWall']?.max))) +
        ' | ' + formatRange(range(windows.map(w => span(w, 'session.command')?.max))) + ' |');
}
lines.push('', "### Confirmation with the owner's prepared house models", '',
    'These repeats require zero entity placeholders, use the same frozen Core saves and real local house GLBs, and keep the JavaScript build unchanged. The original checkout series below remains explicitly labelled as using generated-house fallbacks.', '',
    '| Production scenario | Trials | Frame p95 ms | Frame maximum ms | Long tasks per 20 s |', '| --- | ---: | ---: | ---: | ---: |');
for (const row of index.prepared.production) {
    const same = data['prepared/stock-production'].runs.filter(run => JSON.stringify(run.scenario) === JSON.stringify(row.scenario));
    lines.push('| ' + row.scenario.fixture + ' / ' + (row.scenario.running ? 'Running' : 'Paused') +
        ' | ' + row.repeats + ' | ' + formatRange(row.p95) + ' | ' + formatRange(range(same.map(run => run.sample.max))) +
        ' | ' + formatRange(row.longTasks) + ' |');
}
lines.push('', '| Real-house fixed orbit | Trials | Frame p95 ms | GPU mean ms | Long tasks per 20 s |',
    '| --- | ---: | ---: | ---: | ---: |');
for (const row of index.prepared.baseline) lines.push('| ' + (row.scenario.running ? 'Running' : 'Paused') +
    ' | ' + row.repeats + ' | ' + formatRange(row.p95) + ' | ' + formatRange(row.gpuMean) + ' | ' + formatRange(row.longTasks) + ' |');
lines.push('', '| Real-house native/parent scenario | Trials | Frame maximum ms | UI refresh mean ms | Model reconcile maximum ms | Scene sync maximum wall ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |');
for (const [label, runs] of [['Current native', data['prepared/profiles']?.runs], ['Parent', data['prepared/previous-boundary']?.runs]]) {
    if (!runs?.length) continue;
    for (const summary of summaries(runs)) {
        const same = runs.filter(run => JSON.stringify(run.scenario) === JSON.stringify(summary.scenario));
        lines.push('| ' + label + ': ' + JSON.stringify(summary.scenario) + ' | ' + same.length +
            ' | ' + formatRange(range(same.map(run => run.windows[0].frames.max))) +
            ' | ' + formatRange(summary.refreshMean) +
            ' | ' + formatRange(range(same.map(run => span(run.windows[0], 'models.reconcile')?.max))) +
            ' | ' + formatRange(range(same.map(run => run.windows[0].spans['scene.syncAsyncWall']?.max))) + ' |');
    }
}
for (const run of data['prepared/soak']?.runs || []) {
    lines.push('', 'Real-house five-minute run: ' + run.windows.length + ' windows, Core replay ' + run.canonicalReplayEqual + '.', '',
        '| Window | Frame p95 ms | JS heap MiB | Long tasks |', '| --- | ---: | ---: | ---: |');
    run.windows.forEach((window, index) => lines.push('| ' + (index + 1) + ' | ' + format(window.frames.p95) +
        ' | ' + format(window.heap.used / 1048576) + ' | ' + window.longTasks.count + ' |'));
}
const core = await read('core');
lines.push('', '### Headless canonical commands', '', 'Forty trials after five warmups, identical frozen input per command. AdvanceTicks(0) isolates validation/copy cost; it is a diagnostic microbenchmark. A 1,000-tick batch is a whole-year command, not ordinary 500 ms pacing.', '',
    '| Fixture | Ticks | p50 ms | p95 ms | Maximum ms |', '| --- | ---: | ---: | ---: | ---: |');
for (const run of core?.coreRuns || []) {
    if (![0, 3, 10, 1000].includes(run.ticks)) continue;
    lines.push('| ' + run.fixture + ' | ' + run.ticks + ' | ' + format(run.milliseconds.p50) + ' | ' + format(run.milliseconds.p95) + ' | ' + format(run.milliseconds.max) + ' |');
}
lines.push('', '### Native profile evidence', '', 'Native profiles are separate from baseline timing. Self-samples below exclude the idle pseudo-frame; they do not attribute uninstrumented native work speculatively. Gzip files can be decompressed for local DevTools inspection.', '',
    '| Scenario | Native profile duration ms | Largest named self-samples | Renderer-main GC outer markers |', '| --- | ---: | --- | ---: |');
for (const [prefix, group] of [['', data.profiles], ['prepared/', data['prepared/profiles']]]) {
    const native = await read(prefix + 'native-summary');
    for (const run of group?.runs || []) {
        if (!run.cpuProfile) continue;
        const names = run.cpuProfile.topSelf.filter(row => row.function && !row.function.startsWith('(')).slice(0, 6)
            .map(row => row.function + ': ' + format(row.ms) + ' ms').join('; ');
        const gc = native?.native.find(row => row.path === run.cpuProfile.path)?.gc;
        lines.push('| ' + (prefix ? 'Real houses: ' : 'House fallbacks: ') + JSON.stringify(run.scenario) +
            ' · [CPU](' + prefix + run.cpuProfile.path + ') · [trace](' + prefix + run.trace.path + ') | ' +
            format(run.cpuProfile.durationMs) + ' | ' + names + ' | ' +
            (gc ? gc.minorMarkers + ' minor / ' + gc.majorMarkers + ' major; ' + format(gc.mergedOuterWallMs) + ' ms merged wall' : 'UNKNOWN') + ' |');
    }
}
let report = await readFile(root + '/report.md', 'utf8');
const combined = lines.join('\n') + '\n';
const confirmationStart = combined.indexOf("### Confirmation with the owner's prepared house models");
const confirmationEnd = combined.indexOf('### Headless canonical commands');
const table = combined.slice(confirmationStart, confirmationEnd) +
    '\n### Original checkout series: generated-house fallbacks\n\n' +
    'The following baseline, ablation and parent tables use missing generated-house placeholders. Their GPU and navigation values do not describe the complete owner scene. See the real-house confirmation above.\n\n' +
    combined.slice(0, confirmationStart) + combined.slice(confirmationEnd);
report = report.replace(/<!-- AUDIT_TABLES -->[\s\S]*?(?=\n## Regression provenance)/, '<!-- AUDIT_TABLES -->\n\n' + table);
await writeFile(root + '/report.md', report);
console.log(JSON.stringify({ groups: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v?.runs.length || 0])), errors: index.errors, failures: index.failures }));
