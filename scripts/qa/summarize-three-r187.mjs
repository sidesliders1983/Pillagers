import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('scratch/three-r187-323');
function read(file) {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
}
function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (!sorted.length) return null;
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function distribution(values) {
    const finite = values.filter(Number.isFinite);
    return { n: finite.length, median: median(finite), min: finite.length ? Math.min(...finite) : null,
        max: finite.length ? Math.max(...finite) : null };
}
function run(name) {
    return read(path.join(root, name, 'run.json'));
}
function stage(loading, name) {
    return loading?.timeline.find(row => row.stage === name)?.durationMs ?? null;
}
function bothArms(project) {
    return Object.fromEntries(['A', 'B'].map(arm => [arm, project(arm)]));
}
function observed(r, project) {
    return r ? project(r) : { status: 'pending' };
}

const rows = ['1-A', '2-B', '3-B', '4-A', '5-A', '6-B'].map(name => observed(run('matrix/' + name), r => ({
    name, arm: r.arm, status: r.status, fixtureSHA256: r.fixtureSHA256, protocolSHA256: r.protocolSHA256,
    sourceCommit: r.sourceCommit, engine: r.engineVersion, loadMs: r.loadToReadyMs,
    firstFrameMs: r.loading.firstFrameMs, playableMs: r.loading.playableMs,
    geometryMs: stage(r.loading, 'terrain-mesh-and-masks'),
    shaderCompilationMs: stage(r.loading, 'shader-compilation'),
    constructionGpuPreparationMs: stage(r.loading, 'construction-gpu-preparation'),
    meanFPS: r.summary.meanFPS, frameP50Ms: r.summary.frameP50Ms, frameP95Ms: r.summary.frameP95Ms,
    frameP99Ms: r.summary.frameP99Ms, longTasks: r.summary.longTasks, longTaskTotalMs: r.summary.longTaskTotalMs,
    sampledCpuFrameP95Ms: median(r.diagnostics.map(row => row.value.sample.cpuFrame.p95Ms)),
    sampledGpuMs: median(r.diagnostics.filter(row => row.value.sample.gpu.status === 'valid')
        .map(row => row.value.sample.gpu.milliseconds)),
    unforcedHeapBytes: r.after.heap?.usedBytes, resources: r.after.resources, workload: r.after.workload,
    browser: r.browser, renderer: r.hardware.renderer, console: r.console,
})));
const metrics = ['loadMs', 'firstFrameMs', 'geometryMs', 'shaderCompilationMs', 'constructionGpuPreparationMs',
    'meanFPS', 'frameP50Ms', 'frameP95Ms', 'frameP99Ms', 'sampledCpuFrameP95Ms', 'sampledGpuMs', 'unforcedHeapBytes'];
const arms = bothArms(arm => Object.fromEntries(metrics.map(metric => [metric,
    distribution(rows.filter(row => row.arm === arm && row.status === 'complete').map(row => row[metric]))])));
const pairs = [[1, 2], [4, 3], [5, 6]].map(([a, b]) => {
    const before = rows[a - 1], after = rows[b - 1];
    return { A: before.name, B: after.name, differences: Object.fromEntries(metrics.map(metric => [metric,
        Number.isFinite(before[metric]) && Number.isFinite(after[metric]) ? {
            absolute: after[metric] - before[metric],
            percent: before[metric] ? 100 * (after[metric] / before[metric] - 1) : null,
        } : null])) };
});
function importSummary(row) {
    return { fixture: row.fixture, heap: row.heap, resources: row.public.resources };
}
const lifecycle = bothArms(arm => observed(run('lifecycle-' + arm), r => ({
    status: r.status, initial: r.initial.heap, initialResources: r.initial.public.resources,
    imports: r.imports.map(importSummary), hdr: r.hdr?.public.resources,
    hdrDpr: r.hdr?.public.context.dpr, final: r.final?.heap,
    portraits: r.portraits.map(row => ({ id: row.id, calls: row.diagnostics.workload.portrait?.calls })), errors: r.errors,
})));
const cacheFollowup = bothArms(arm => observed(run(`lifecycle-${arm}-cache`), r => ({
    status: r.status, followup: r.followup, imports: r.imports.map(importSummary), errors: r.errors,
})));
const sustained = bothArms(arm => observed(run('sustained-' + arm), r => ({
    status: r.status, summary: r.summary, simulation: r.simulation, canonicalSHA256: r.canonicalSHA256,
    canonicalTime: r.canonicalTime, errors: r.errors, resources: r.after?.resources,
})));
const warm = bothArms(arm => observed(run('warm-' + arm), r => ({
    status: r.status, errors: r.errors, rows: r.rows.map(row => ({
        cache: row.cache, toReadyMs: row.toReadyMs, firstFrameMs: row.loading.firstFrameMs,
        playableMs: row.loading.playableMs, stages: row.loading.timeline,
    })),
})));
const geography = bothArms(arm => {
    const base = arm === 'A' ? path.resolve('../three-r187-spike-323-baseline') : path.resolve('.');
    return read(path.join(base, `output/island-loading-259/geography-three323-${arm}.json`)) ?? { status: 'pending' };
});
const visuals = Object.fromEntries(['winter', 'marsh'].map(view => [view,
    bothArms(arm => observed(run(`visual-${view}-${arm}`), r => ({
        status: r.status, errors: r.errors, requestedPresentation: r.requestedPresentation,
        canonicalSHA256: r.canonicalSHA256, fixtureSHA256: r.fixtureSHA256,
        screenshotDiagnosticsHidden: r.screenshotDiagnosticsHidden,
    }))),
]));

const deviceRoot = path.join(root, 'device-results');
const deviceFiles = fs.existsSync(deviceRoot) ? fs.readdirSync(deviceRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name) : [];
const devices = deviceFiles.map(file => ({ file, ...read(path.join(deviceRoot, file)) }))
    .filter(row => ['A', 'B'].includes(row.arm));
// Owner downloads and automatic uploads are duplicate evidence for one session.
for (const arm of ['A', 'B']) {
    const value = read(path.join(deviceRoot, 'user-attachments', arm + '.json'));
    if (value && !devices.some(row => row.arm === value.arm && row.startedUtc === value.startedUtc)) {
        devices.push({ file: `user-attachments/${arm}.json`, ...value });
    }
}
const ios = devices.filter(row => /iPhone/.test(row.userAgent) && !/smoke/i.test(row.protocol));
const safari = ios.filter(row => /Version\//.test(row.userAgent) && /Safari\//.test(row.userAgent) && !/CriOS/.test(row.userAgent));
function deviceSummary(r) {
    return { file: r.file, arm: r.arm, status: r.status, device: r.device, thermalBefore: r.thermalBefore,
        userAgent: r.userAgent, startedUtc: r.startedUtc, finishedUtc: r.finishedUtc,
        commit: r.commit, engineVersion: r.engineVersion, fixtureSHA256: r.fixtureSHA256,
        viewport: r.viewport, dpr: r.dpr, elapsedMs: r.elapsedMs, summary: r.summary,
        startTick: r.startTick, endTick: r.endTick, loading: r.loading,
        resources: r.after?.resources, errors: r.errors,
        gpuStatus: r.after?.sample?.gpu?.status, heapStatus: r.after?.heap?.status,
    };
}
const output = {
    generatedUtc: new Date().toISOString(), rows, arms, pairs, lifecycle, cacheFollowup, sustained, warm, geography, visuals,
    sustainedCoreParity: sustained.A.canonicalSHA256 && sustained.B.canonicalSHA256
        ? sustained.A.canonicalSHA256 === sustained.B.canonicalSHA256 : 'pending',
    geographyParity: geography.A.canonicalSha256 && geography.B.canonicalSha256
        ? geography.A.canonicalSha256 === geography.B.canonicalSha256 : 'pending',
    iPhoneChrome: ios.filter(row => /CriOS/.test(row.userAgent)).map(deviceSummary),
    thermalObservation: read(path.join(deviceRoot, 'thermal-observation.json')),
    physical: safari.map(deviceSummary),
    smokeCount: devices.filter(row => /smoke/i.test(row.protocol)).length,
    limits: [
        'Three repetitions on one GPU; no statistical generalization or pooled per-window p95 claim.',
        'Primary heap is unforced Chromium JS heap; lifecycle CDP heap and backing storage are separate, not process/VRAM bytes.',
        'Source/build identity and renderer are retained in raw runs; headless Chrome and Chrome iOS are not physical Safari.',
        'Single CPU-generation, warm-cache and phone pairs are exploratory observations, not isolated causal engine effects.',
    ],
};
fs.writeFileSync('docs/qa/three-r187-323/comparison.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({
    primary: rows.filter(row => row.status === 'complete').length,
    lifecycle: Object.values(lifecycle).map(row => row.status), sustained: Object.values(sustained).map(row => row.status),
    phoneChrome: output.iPhoneChrome.length, phoneSafari: safari.length,
    fps: [arms.A.meanFPS.median, arms.B.meanFPS.median], p95: [arms.A.frameP95Ms.median, arms.B.frameP95Ms.median],
}));
