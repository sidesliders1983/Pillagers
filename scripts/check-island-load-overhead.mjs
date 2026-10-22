import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from './load-typescript.mjs';

const { IslandLoadStatus, loadPlan } = loadTypeScript(new URL('../src/fjord-play/IslandLoadStatus.ts', import.meta.url));
const iterations = 2000;
let retained;
function exercise(instrumented) {
    let time = 0;
    const samples = [];
    const status = instrumented ? new IslandLoadStatus('new', 32, () => time) : undefined;
    for (let index = 0; index < 180; index++) {
        const start = time;
        const timing = status?.begin('preparation-batch');
        time += 20;
        if (timing) status.end(timing);
        samples.push({ stage: 'preparation-batch', startedAt: start, milliseconds: time - start });
        if (samples.length > 128) samples.shift();
        if (index % 12 === 0) status?.snapshot(); // approximately the UI's 4 Hz cadence
    }
    for (const step of Object.keys(loadPlan).filter(step => step !== 'handoff')) status?.complete(step);
    status?.playable();
    retained = status?.snapshot();
}
const percentile = (values, fraction) => values[Math.floor((values.length - 1) * fraction)];
function measure(instrumented) {
    const durations = [];
    for (let index = 0; index < iterations; index++) {
        const started = performance.now();
        exercise(instrumented);
        durations.push(performance.now() - started);
    }
    durations.sort((a, b) => a - b);
    return { p50Ms: percentile(durations, .5), p95Ms: percentile(durations, .95), p99Ms: percentile(durations, .99) };
}
for (let index = 0; index < 200; index++) { exercise(false); exercise(true); }
global.gc?.();
const baseline = measure(false);
global.gc?.();
const before = process.memoryUsage().heapUsed;
const instrumented = measure(true);
global.gc?.();
const after = process.memoryUsage().heapUsed;
const source = readFileSync(new URL('../src/fjord-play/IslandLoadStatus.ts', import.meta.url));
const report = {
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    platform: `Node ${process.version}, ${process.platform}/${process.arch}; no browser, layout, assets or GPU`,
    workload: `${iterations} synthetic attempts, 180 completed batches and 15 status reads each; not island load duration`,
    baseline, instrumented, approximateRetainedHeapDeltaBytes: after - before,
    boundedReportBytes: Buffer.byteLength(JSON.stringify(retained)), timelineEntries: retained.timeline.length,
    addedRenderResources: { geometries: 0, textures: 0, programs: 0, drawCalls: 0 },
    limitations: 'Synthetic CPU-only observation overhead. GC deltas are noisy; browser peak memory, DOM cost and real load latency remain unmeasured.',
};
mkdirSync('docs/qa/island-loading-259', { recursive: true });
writeFileSync('docs/qa/island-loading-259/overhead.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
