import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
    origin: { type: 'string', default: 'http://127.0.0.1:5204' },
    output: { type: 'string' }, chrome: { type: 'string' },
    'expect-commit': { type: 'string' },
    frames: { type: 'string', default: '30' }, cycles: { type: 'string', default: '3' },
    hair: { type: 'string', default: 'long-2' },
    'native-counts': { type: 'boolean', default: false },
    'gpu-timing': { type: 'boolean', default: true }, 'no-gpu-timing': { type: 'boolean', default: false },
    'cpu-timing': { type: 'boolean', default: true }, 'no-cpu-timing': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
} });
if (values.help) {
    console.log(`Usage: node scripts/qa/measure-personal-armor-rendering.mjs [options]
  --origin URL         Built review server (default http://127.0.0.1:5204)
  --output PATH        Evidence directory; relative paths start at the repository
  --chrome PATH        Optional Chrome executable; otherwise Playwright Chromium
  --expect-commit SHA  Require this exact source commit and a clean served build
  --frames N           Actual drawing callbacks per sample (default 30; 30–300)
  --cycles N           Warm off/on cycles for resource plateau (default 3; 3–5)
  --hair long-2|none   Keep this same hairstyle throughout all profiles
  --no-gpu-timing      Disable optional asynchronous EXT GPU timers (enabled when supported)
  --no-cpu-timing      Disable optional CDP renderer-main-thread CPU counters
  --native-counts      After closing Chrome, count actual local native meshes,
                       materials and texture objects using public factory APIs

Set PILLAGERS_PLAYWRIGHT_MODULE to an installed Playwright module directory when
Playwright is not installed in this repository. No packages are installed.
This measures instrumented synchronous render-callback wall time, not isolated
CPU time. Optional CDP threadTicks CPU counters and asynchronous GPU timers are
reported separately with their actual support and sampling boundaries.
It does not certify physical-phone performance.`);
    process.exit(0);
}
const frames = Number(values.frames), cycles = Number(values.cycles);
const gpuTiming = values['gpu-timing'] && !values['no-gpu-timing'];
const cpuTiming = values['cpu-timing'] && !values['no-cpu-timing'];
assert.ok(Number.isSafeInteger(frames) && frames >= 30 && frames <= 300);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 3 && cycles <= 5);
assert.ok(['long-2', 'none'].includes(values.hair));
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = new URL(values.origin).origin;
const output = resolve(root, values.output ??
    'scratch/personal-armor-browser/rendering-' + new Date().toISOString().replace(/[:.]/g, '-'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const armor = 'garment/native-leather-body-armor', helmet = 'headwear/native-iron-helmet';
const hair = values.hair === 'long-2' ? 'hair/manual-long-2' : null;
const fixedItems = ['equipment/native-iron-spear', 'equipment/native-iron-shield'];
const profiles = [
    { id: 'baseline', body: false, helmet: false }, { id: 'body-only', body: true, helmet: false },
    { id: 'helmet-only', body: false, helmet: true }, { id: 'both', body: true, helmet: true },
];
const report = {
    schemaVersion: 1, kind: 'Personal armor rendering delta', status: 'RUNNING',
    startedAt: new Date().toISOString(), origin,
    configuration: { frames, cycles, gpuTiming, cpuTiming, hair: values.hair, viewport: [1280, 900], deviceScaleFactor: 1,
        camera: 'public Front orthographic view', animation: 'live native Idle_02', fixedItems },
    methodology: {
        instrumentation: 'Disposable WebGL and requestAnimationFrame wrappers, derived from the earlier scratch instrument-rendering.mjs hook; no production edits.',
        triangles: 'Actual TRIANGLES draw submissions, including actual render passes and instancing; not unique model topology.',
        resources: 'Created WebGL texture/buffer/program objects minus observed delete calls, across the instrumented page. Programs are not material counts.',
        timing: 'Synchronous drawing requestAnimationFrame callback wall time, including application work, driver waits, submission and hook overhead; neither isolated CPU nor GPU duration.',
        cpuTiming: 'Optional owned Chrome CDP Performance.enable({timeDomain:threadTicks}) and getMetrics bracket actual drawing callbacks, before asynchronous GPU-result polling. ThreadTime and TaskDuration cumulative seconds become CPU milliseconds per observed drawing callback, with explicit boundary-count uncertainty. All renderer-main-thread tasks, CDP/instrumentation overhead and unrelated page work remain included; this is not isolated rendering CPU.',
        cpuProtocolReferences: ['https://chromedevtools.github.io/devtools-protocol/tot/Performance/',
            'https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/inspector/inspector_performance_agent.cc'],
        fitting: 'Read public module fit counters before frames and refresh their DOM report afterwards by reselecting the same Idle animation, without changing appearance.',
        gpuTiming: 'Optional EXT elapsed-time queries span the owned Lab drawing callback. Results are polled in later animation frames without gl.finish or synchronous result waiting; unavailable/disjoint/busy/timeout samples remain explicit. GPU query duration is separate from callback wall time.',
        cancellations: 'Every request failure is retained with its observed phase; cleanup is labelled only during owned-context closure.',
    },
    limitations: ['Desktop headless Chrome, not physical iPhone/iPad performance or heat acceptance.',
        'Thirty drawing callbacks per profile are a bounded observation, not a general performance guarantee.',
        'CDP threadTicks counters measure renderer-main-thread CPU across the aggregate window, not isolated rendering, process-wide CPU or worker threads. Boundary frame counts are observed around CDP reads rather than atomically at the metric timestamp.',
        'GPU timer-query duration, when available, covers the submitted Lab callback commands rather than isolated shader or per-material work.',
        'No geometry-fit acceptance is inferred from rendering counts.'],
    profiles: [], resourceCycles: [], assets: [], pageErrors: [], consoleErrors: [], httpErrors: [], failedRequests: [],
};
let browser, context, page, cpuSession, cpuEnabled = false, closing = false, phase = 'startup';
report.cpuInstrumentation = { requested: cpuTiming, status: 'NOT MEASURED', timeDomain: 'threadTicks',
    metricNames: ['ThreadTime', 'TaskDuration'], cumulativeMetricUnit: 'seconds',
    reason: cpuTiming ? 'Not initialized.' : 'Disabled by --no-cpu-timing.', cleanupErrors: [] };
await mkdir(output, { recursive: true });

// This function is serialized into the isolated page before the renderer exists.
// It owns only instrumentation state; it never accesses or mutates an application object.
function instrumentArmorRendering(options = {}) {
    const metric = { samples: [], sequence: 0, calls: 0, triangles: 0,
        textures: new Set(), buffers: new Set(), programs: new Set(), contexts: new Set(),
        gpu: { requested: options.gpuTiming !== false, timedOut: false, stopped: false, contexts: [],
            created: 0, deleted: 0, resolved: 0, disjointDiscarded: 0, busy: 0, capacitySkipped: 0 } };
    window.__armorRendering = metric;
    const states = new Map();
    const maximumPendingQueries = 120;
    function gpuState(gl) {
        if (states.has(gl)) return states.get(gl);
        const info = { canvasId: gl.canvas?.id ?? null, supported: false, extension: null, api: null };
        const state = { gl, info, pending: [], api: null };
        states.set(gl, state);
        metric.gpu.contexts.push(info);
        if (!metric.gpu.requested || info.canvasId !== 'lab-preview') return state;
        try {
            const ext2 = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const ext1 = ext2 ? null : gl.getExtension('EXT_disjoint_timer_query');
            if (ext2 && typeof gl.createQuery === 'function') {
                state.api = { ext: ext2, create: () => gl.createQuery(), remove: query => gl.deleteQuery(query),
                    current: () => gl.getQuery(ext2.TIME_ELAPSED_EXT, gl.CURRENT_QUERY),
                    begin: query => gl.beginQuery(ext2.TIME_ELAPSED_EXT, query),
                    end: () => gl.endQuery(ext2.TIME_ELAPSED_EXT),
                    available: query => gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
                    result: query => gl.getQueryParameter(query, gl.QUERY_RESULT) };
                info.extension = 'EXT_disjoint_timer_query_webgl2'; info.api = 'WebGL2';
            } else if (ext1 && typeof ext1.createQueryEXT === 'function') {
                state.api = { ext: ext1, create: () => ext1.createQueryEXT(),
                    remove: query => ext1.deleteQueryEXT(query),
                    current: () => ext1.getQueryEXT(ext1.TIME_ELAPSED_EXT, ext1.CURRENT_QUERY_EXT),
                    begin: query => ext1.beginQueryEXT(ext1.TIME_ELAPSED_EXT, query),
                    end: () => ext1.endQueryEXT(ext1.TIME_ELAPSED_EXT),
                    available: query => ext1.getQueryObjectEXT(query, ext1.QUERY_RESULT_AVAILABLE_EXT),
                    result: query => ext1.getQueryObjectEXT(query, ext1.QUERY_RESULT_EXT) };
                info.extension = 'EXT_disjoint_timer_query'; info.api = 'WebGL1';
            }
            info.supported = !!state.api;
        } catch (error) { info.error = String(error); }
        return state;
    }
    function release(state, pending, status) {
        if (pending.sample) {
            pending.sample.gpuTiming.status = status;
            if (status !== 'available') pending.sample.gpuTiming.elapsedMs = null;
        }
        state.api.remove(pending.query);
        metric.gpu.deleted++;
    }
    function discard(state, status) {
        for (const pending of state.pending) release(state, pending, status);
        if (status === 'discarded-disjoint') metric.gpu.disjointDiscarded += state.pending.length;
        state.pending = [];
    }
    function poll(state) {
        if (!state.api) return false;
        try {
            if (state.gl.isContextLost()) { discard(state, 'discarded-context-lost'); return false; }
            if (state.gl.getParameter(state.api.ext.GPU_DISJOINT_EXT)) {
                discard(state, 'discarded-disjoint'); return false;
            }
            for (const pending of [...state.pending]) {
                if (!state.api.available(pending.query)) continue;
                // QUERY_RESULT is read only after AVAILABLE, never as a synchronizing wait.
                const nanoseconds = state.api.result(pending.query);
                if (state.gl.getParameter(state.api.ext.GPU_DISJOINT_EXT)) {
                    discard(state, 'discarded-disjoint'); return false;
                }
                if (Number.isFinite(nanoseconds) && nanoseconds >= 0) {
                    pending.sample.gpuTiming.elapsedMs = nanoseconds / 1e6;
                    metric.gpu.resolved++;
                    release(state, pending, 'available');
                } else release(state, pending, 'discarded-invalid-result');
                state.pending.splice(state.pending.indexOf(pending), 1);
            }
            return true;
        } catch (error) {
            state.info.error = String(error);
            discard(state, 'discarded-query-api-error');
            state.api = null;
            return false;
        }
    }
    function beginGpuFrame() {
        if (!metric.gpu.requested) return { status: 'disabled' };
        if (metric.gpu.timedOut) return { status: 'not-sampled-after-timeout' };
        if (metric.gpu.stopped) return { status: 'not-sampled-stopped' };
        const gl = [...metric.contexts].find(context => context.canvas?.id === 'lab-preview');
        if (!gl) return { status: 'context-not-created' };
        const state = gpuState(gl);
        if (!state.api) return { status: 'unsupported', extension: state.info.extension };
        if (!poll(state)) return { status: 'not-sampled-disjoint-or-lost', extension: state.info.extension };
        if (state.pending.length >= maximumPendingQueries) {
            metric.gpu.capacitySkipped++;
            return { status: 'not-sampled-query-capacity', extension: state.info.extension };
        }
        let allocatedQuery;
        try {
            if (state.api.current() !== null) {
                metric.gpu.busy++;
                return { status: 'not-sampled-active-query', extension: state.info.extension };
            }
            const query = allocatedQuery = state.api.create();
            if (!query) return { status: 'not-sampled-query-allocation', extension: state.info.extension };
            metric.gpu.created++;
            state.api.begin(query);
            if (state.api.current() !== query) {
                state.api.remove(query); metric.gpu.deleted++;
                return { status: 'not-sampled-query-not-active', extension: state.info.extension };
            }
            return { status: 'active', state, query, extension: state.info.extension };
        } catch (error) {
            if (allocatedQuery) { state.api.remove(allocatedQuery); metric.gpu.deleted++; }
            state.info.error = String(error);
            return { status: 'not-sampled-query-api-error', extension: state.info.extension };
        }
    }
    function endGpuFrame(scope, sample) {
        if (scope.status !== 'active') {
            if (sample) sample.gpuTiming = { status: scope.status, extension: scope.extension ?? null, elapsedMs: null };
            return;
        }
        const { state, query } = scope;
        if (state.api.current() !== query) {
            if (sample) sample.gpuTiming = { status: 'discarded-query-interference',
                extension: scope.extension, elapsedMs: null };
            state.api.remove(query); metric.gpu.deleted++;
            return; // Never end a query owned by somebody else.
        }
        state.api.end();
        if (!sample) { state.api.remove(query); metric.gpu.deleted++; return; }
        sample.gpuTiming = { status: 'pending', extension: scope.extension, elapsedMs: null };
        state.pending.push({ query, sample });
    }
    metric.stopGpuTiming = reason => {
        metric.gpu.stopped = true;
        if (reason === 'timeout') metric.gpu.timedOut = true;
        for (const state of states.values()) if (state.api)
            discard(state, reason === 'timeout' ? 'discarded-query-timeout' : 'discarded-owned-cleanup');
    };
    metric.gpuInspection = () => ({ ...metric.gpu,
        pendingQueries: [...states.values()].reduce((count, state) => count + state.pending.length, 0) });
    const wrapped = Symbol('personal-armor-rendering-instrumented');
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
        const prototype = window[name]?.prototype;
        if (!prototype) continue;
        for (const [kind, plural] of [['Texture', 'textures'], ['Buffer', 'buffers'], ['Program', 'programs']]) {
            const createName = 'create' + kind, deleteName = 'delete' + kind;
            const create = prototype[createName], remove = prototype[deleteName];
            if (create && !create[wrapped]) {
                const method = function (...args) {
                    metric.contexts.add(this);
                    const object = create.apply(this, args);
                    if (object) metric[plural].add(object);
                    return object;
                };
                method[wrapped] = true; prototype[createName] = method;
            }
            if (remove && !remove[wrapped]) {
                const method = function (object) {
                    metric[plural].delete(object); return remove.call(this, object);
                };
                method[wrapped] = true; prototype[deleteName] = method;
            }
        }
        for (const draw of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            const original = prototype[draw];
            if (!original || original[wrapped]) continue;
            const method = function (...args) {
                metric.contexts.add(this);
                const count = draw.startsWith('drawArrays') ? args[2] : args[1];
                const instances = draw.endsWith('Instanced') ? args[args.length - 1] : 1;
                metric.calls++;
                if (args[0] === this.TRIANGLES) metric.triangles += count * instances / 3;
                return original.apply(this, args);
            };
            method[wrapped] = true; prototype[draw] = method;
        }
    }
    const schedule = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => schedule(time => {
        metric.calls = metric.triangles = 0;
        const scope = beginGpuFrame();
        const started = performance.now();
        let sample;
        try { callback(time); }
        finally {
            const renderCallbackWallMs = performance.now() - started;
            if (metric.calls) sample = { sequence: ++metric.sequence, time, calls: metric.calls,
                triangles: metric.triangles, renderCallbackWallMs, textures: metric.textures.size,
                buffers: metric.buffers.size, programs: metric.programs.size };
            endGpuFrame(scope, sample);
            if (sample) metric.samples.push(sample);
            if (metric.samples.length > 4000) metric.samples.shift();
        }
    });
}

async function metadata() {
    return JSON.parse(await page.locator('#lab-fit-metadata').textContent());
}
async function ready(profile) {
    await page.waitForFunction(({ body, helmet, hair, armorId, helmetId, fixedItems }) => {
        if (document.querySelector('#lab-preview')?.dataset.ready !== 'true') return false;
        try {
            const metadata = JSON.parse(document.querySelector('#lab-fit-metadata').textContent);
            const selected = metadata.selectedAssets;
            return selected?.outfit === 'garment/meshy-grid-trial-001' &&
                selected.shoes === 'garment/meshy-low-shoes-005' && selected.hair === hair &&
                (selected.bodyArmor ?? null) === (body ? armorId : null) &&
                selected.headwear === (helmet ? helmetId : null) &&
                JSON.stringify([...(selected.equipmentItems ?? [])].sort()) === JSON.stringify([...fixedItems].sort());
        } catch { return false; }
    }, { ...profile, hair, armorId: armor, helmetId: helmet, fixedItems }, { timeout: 180000 });
    assert.equal(await page.locator('#lab-preview').getAttribute('data-lod'), '2');
}
async function choose(profile) {
    for (const [selector, value] of [['#lab-combat-body-armor', profile.body ? armor : 'none'],
        ['#lab-combat-headgear', profile.helmet ? helmet : 'none']]) {
        if (await page.locator(selector).inputValue() !== value) {
            await page.locator(selector).selectOption(value);
            await page.waitForFunction(() => document.querySelector('#lab-preview')?.dataset.ready === 'true',
                undefined, { timeout: 180000 });
        }
    }
    await ready(profile);
    await page.locator('#lab-animation').selectOption('Idle_02');
    await page.locator('[data-action="view-front"]').click();
    assert.equal(await page.locator('#lab-preview').getAttribute('data-animation'), 'Idle_02');
}
function cpuMetrics(response) {
    return Object.fromEntries((response?.metrics ?? []).map(metric => [metric.name, metric.value]));
}
async function setupCpuTiming() {
    if (!cpuTiming) return;
    try {
        cpuSession = await context.newCDPSession(page);
        // Chromium rejects threadTicks on unsupported platforms. Never fall back to wall ticks.
        await cpuSession.send('Performance.enable', { timeDomain: 'threadTicks' });
        cpuEnabled = true;
        const probe = await cpuSession.send('Performance.getMetrics');
        const metrics = cpuMetrics(probe);
        const availableMetricNames = ['ThreadTime', 'TaskDuration']
            .filter(name => Number.isFinite(metrics[name]) && metrics[name] >= 0);
        report.cpuInstrumentation = { ...report.cpuInstrumentation,
            status: availableMetricNames.length ? 'AVAILABLE' : 'NOT MEASURED',
            reason: availableMetricNames.length ? null : 'Accepted threadTicks, but no supported CPU duration metric was returned.',
            availableMetricNames, initialMetrics: probe.metrics };
    } catch (error) {
        report.cpuInstrumentation.status = 'NOT MEASURED';
        report.cpuInstrumentation.reason = String(error);
    }
}
async function closeCpuTiming() {
    if (!cpuSession) return;
    const owned = cpuSession;
    cpuSession = undefined;
    if (cpuEnabled) {
        cpuEnabled = false;
        try { await owned.send('Performance.disable'); }
        catch (error) { report.cpuInstrumentation.cleanupErrors.push('Performance.disable: ' + String(error)); }
    }
    try { await owned.detach(); }
    catch (error) { report.cpuInstrumentation.cleanupErrors.push('CDP detach: ' + String(error)); }
}
async function cpuBoundary() {
    if (!cpuEnabled || report.cpuInstrumentation.status !== 'AVAILABLE') return null;
    try {
        const sequenceBefore = await page.evaluate(() => window.__armorRendering.sequence);
        const response = await cpuSession.send('Performance.getMetrics');
        const sequenceAfter = await page.evaluate(() => window.__armorRendering.sequence);
        return { sequenceBefore, sequenceAfter, metrics: response.metrics };
    } catch (error) { return { error: String(error) }; }
}
function mainThreadCpuSummary(before, after) {
    const result = { status: 'NOT MEASURED', timeDomain: 'threadTicks',
        cumulativeMetricUnit: 'seconds', derivedUnit: 'milliseconds per observed drawing callback',
        reason: report.cpuInstrumentation.reason, before, after, metrics: {} };
    if (!before || !after || before.error || after.error) {
        result.reason = before?.error ?? after?.error ?? result.reason ?? 'CPU boundaries unavailable.';
        return result;
    }
    // CDP metrics and our frame counter are separate ordered commands. Retain the
    // actual inner count and the possible edge callbacks; do not claim atomic boundaries.
    const observed = after.sequenceBefore - before.sequenceAfter;
    const maximum = after.sequenceAfter - before.sequenceBefore;
    result.drawingCallbacks = observed;
    result.metricBoundaryDrawingCallbacks = { minimum: observed, maximum };
    if (!Number.isSafeInteger(observed) || observed <= 0 ||
        !Number.isSafeInteger(maximum) || maximum < observed) {
        result.reason = 'No positive, monotonic actual drawing-frame window.';
        return result;
    }
    const start = cpuMetrics(before), end = cpuMetrics(after);
    for (const name of ['ThreadTime', 'TaskDuration']) {
        const startSeconds = start[name], endSeconds = end[name];
        if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
            startSeconds < 0 || endSeconds < startSeconds) {
            result.metrics[name] = { status: 'NOT MEASURED',
                reason: 'Metric missing, nonfinite or reset across the sampling window.' };
            continue;
        }
        const deltaSeconds = endSeconds - startSeconds;
        result.metrics[name] = { status: 'MEASURED', startSeconds, endSeconds, deltaSeconds,
            millisecondsPerObservedDrawingCallback: deltaSeconds * 1000 / observed,
            millisecondsPerMetricBoundaryDrawingCallback: {
                minimum: deltaSeconds * 1000 / maximum, maximum: deltaSeconds * 1000 / observed,
            } };
    }
    if (Object.values(result.metrics).some(metric => metric.status === 'MEASURED')) {
        result.status = 'MEASURED'; result.reason = null;
    } else result.reason = 'Neither CPU metric has a valid monotonic counter delta.';
    return result;
}
async function actualFrames(count, measureCpu = false) {
    const cpuBefore = measureCpu ? await cpuBoundary() : null;
    const start = await page.evaluate(() => window.__armorRendering.sequence);
    await page.waitForFunction(({ start, count }) => window.__armorRendering.sequence >= start + count,
        { start, count }, { timeout: 60000 });
    const cpuAfter = measureCpu ? await cpuBoundary() : null;
    if (gpuTiming) {
        try {
            await page.waitForFunction(({ start, count }) => window.__armorRendering.samples
                .filter(sample => sample.sequence > start).slice(0, count)
                .every(sample => sample.gpuTiming.status !== 'pending'), { start, count }, { timeout: 20000 });
        } catch (error) {
            if (error.name !== 'TimeoutError') throw error;
            // Stop issuing optional queries after an asynchronous availability timeout.
            // Drawing remains untouched; missing GPU durations are reported rather than invented.
            await page.evaluate(() => window.__armorRendering.stopGpuTiming('timeout'));
        }
    }
    const samples = await page.evaluate(({ start, count }) => window.__armorRendering.samples
        .filter(sample => sample.sequence > start).slice(0, count), { start, count });
    return measureCpu ? { samples, mainThreadCpu: mainThreadCpuSummary(cpuBefore, cpuAfter) } : samples;
}
function gpuSummary(samples) {
    const available = samples.filter(sample => sample.gpuTiming.status === 'available');
    return { requested: gpuTiming, availableSamples: available.length, totalSamples: samples.length,
        statusCounts: Object.fromEntries([...new Set(samples.map(sample => sample.gpuTiming.status))]
            .map(status => [status, samples.filter(sample => sample.gpuTiming.status === status).length])),
        elapsedMs: available.length ? summary(available.map(sample => ({ value: sample.gpuTiming.elapsedMs })), 'value') : null };
}
function summary(samples, field) {
    const ordered = samples.map(sample => sample[field]).sort((a, b) => a - b);
    const percentile = amount => ordered[Math.ceil((ordered.length - 1) * amount)];
    return { min: ordered[0], median: percentile(.5), p95: percentile(.95), max: ordered.at(-1) };
}
async function snapshot(profile) {
    const details = page.locator('details.lab-snapshot');
    if (!await details.evaluate(element => element.open)) await details.locator(':scope > summary').click();
    const pending = page.waitForEvent('download');
    await page.locator('[data-action="snapshot-export"]').click();
    const download = await pending;
    await download.saveAs(join(output, profile.id + '-lab-snapshot.json'));
    const result = JSON.parse(await page.locator('#lab-snapshot').inputValue());
    assert.equal(result.lod, 2);
    assert.equal(result.pose.animation, 'Idle_02');
    return result;
}
async function observe(profile, captureSnapshot = false) {
    phase = 'profile-' + profile.id;
    await choose(profile);
    await page.locator('#lab-preview').scrollIntoViewIfNeeded();
    await actualFrames(6); // Warm actual upload/draw callbacks; no fixed-duration sleep.
    const before = await metadata();
    const dna = JSON.parse(await page.locator('#lab-json').inputValue());
    const { samples, mainThreadCpu } = await actualFrames(frames, true);
    // reportModel is event-driven. This public action refreshes its real counters.
    await page.locator('#lab-animation').selectOption('Idle_02');
    const after = await metadata();
    assert.equal(after.fitRuns, before.fitRuns, 'Drawing must not refit clothing each frame.');
    assert.equal(after.lastFitMilliseconds, before.lastFitMilliseconds);
    assert.ok(Number.isFinite(before.fitRuns) && Number.isFinite(before.lastFitMilliseconds));
    const data = { id: profile.id, body: profile.body, helmet: profile.helmet, dna,
        metadataBefore: before, metadataAfter: after, frameCount: samples.length, samples, mainThreadCpu, gpuTiming: gpuSummary(samples),
        summary: Object.fromEntries(['calls', 'triangles', 'renderCallbackWallMs', 'textures', 'buffers', 'programs']
            .map(field => [field, summary(samples, field)])),
        resources: Object.fromEntries(['textures', 'buffers', 'programs'].map(field => [field, samples.at(-1)[field]])) };
    if (captureSnapshot) data.snapshot = await snapshot(profile);
    return data;
}
async function verifyAsset(entry) {
    if (report.assets.some(asset => asset.path === entry.path)) return;
    const response = await page.request.get(new URL(entry.path, origin).href);
    assert.ok(response.ok(), 'Missing runtime asset: ' + entry.path);
    const bytes = await response.body(), actual = digest(bytes);
    assert.equal(actual, entry.sha256, 'The served runtime asset differs from its public registry: ' + entry.path);
    report.assets.push({ id: entry.id, path: entry.path, sha256: actual, bytes: bytes.length });
    if (entry.binding) await verifyAsset({ id: entry.id + ':binding', ...entry.binding });
}

async function nativeCounts(rows) {
    const { loadTypeScript } = await import('../load-typescript.mjs');
    const { MeshyHumanFactory } = loadTypeScript(new URL('../../src/characters/MeshyHuman.ts', import.meta.url));
    const { resolveLabBodyProfile } = loadTypeScript(new URL('../../src/characters/LabBodyPresentation.ts', import.meta.url));
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile(resolve(root, 'public' + path.split('?')[0]));
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    for (const row of rows) {
        const saved = row.snapshot;
        for (const asset of saved.modules) {
            assert.equal(digest(await readFile(resolve(root, 'public' + asset.path))), asset.sha256,
                'Local factory counts require the same exact assets as the served snapshot.');
        }
        const human = await factory.create(saved.dna, 2, resolveLabBodyProfile(saved.dna, saved.body).profile,
            saved.presentation, saved.face);
        try {
            const materials = new Set(), textures = new Set();
            const visible = mesh => { for (let node = mesh; node; node = node.parent) if (!node.visible) return false; return true; };
            const triangles = mesh => (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
            let totalTriangles = 0, meshes = 0;
            human.root.traverse(mesh => {
                if (!mesh.isMesh || !visible(mesh)) return;
                meshes++; totalTriangles += triangles(mesh);
                for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                    materials.add(material);
                    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
                }
            });
            row.nativeCounts = { scope: 'Actual visible native factory objects, outside Chrome; not WebGL draw submissions.',
                meshes, triangles: totalTriangles, materials: materials.size, textures: textures.size,
                moduleTriangles: Object.fromEntries([...human.fit.modules].map(([id, group]) => {
                    let count = 0;
                    group.traverse(mesh => { if (mesh.isMesh && visible(mesh)) count += triangles(mesh); });
                    return [id, count];
                })) };
        } finally { human.dispose(); }
    }
}

try {
    report.runnerSha256 = digest(await readFile(fileURLToPath(import.meta.url)));
    report.instrumentationSha256 = digest(instrumentArmorRendering.toString());
    const { chromium } = createRequire(import.meta.url)(process.env.PILLAGERS_PLAYWRIGHT_MODULE || 'playwright');
    browser = await chromium.launch({ headless: true, args: ['--mute-audio'],
        ...(values.chrome ? { executablePath: values.chrome } : {}) });
    report.browser = { version: await browser.version(), headless: true,
        hostPlatform: process.platform, hostArchitecture: process.arch };
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
        acceptDownloads: true, reducedMotion: 'reduce' });
    await context.addInitScript(instrumentArmorRendering, { gpuTiming });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('requestfailed', request => report.failedRequests.push({ phase, url: request.url(),
        reason: request.failure()?.errorText, duringOwnedCleanup: closing }));
    page.on('response', response => { if (response.status() >= 400)
        report.httpErrors.push({ url: response.url(), status: response.status() }); });
    const buildResponse = await page.request.get(origin + '/build-info.json');
    assert.ok(buildResponse.ok());
    report.build = await buildResponse.json();
    if (values['expect-commit']) {
        assert.equal(report.build.source.commit, values['expect-commit']);
        assert.equal(report.build.source.dirty, false, 'Pinned final performance evidence requires a clean served build.');
    }
    await page.goto(origin + '/character-lab?combat=ready&weapon=iron&shield=iron&hair=' + values.hair,
        { waitUntil: 'domcontentloaded' });
    await ready(profiles[0]);
    await setupCpuTiming();
    for (const profile of profiles) {
        const row = await observe(profile, true);
        if (report.profiles.length) {
            assert.deepEqual(row.dna, report.profiles[0].dna, 'DNA must remain identical.');
            assert.deepEqual(row.snapshot.body, report.profiles[0].snapshot.body);
            assert.deepEqual(row.snapshot.camera, report.profiles[0].snapshot.camera, 'Fixed camera must remain identical.');
        }
        for (const asset of row.snapshot.modules) await verifyAsset(asset);
        await page.locator('#lab-preview').screenshot({ path: join(output, profile.id + '.png') });
        report.profiles.push(row);
        console.log('Measured ' + profile.id + ': ' + row.frameCount + ' actual drawing callbacks');
    }
    report.gl = await page.evaluate(() => [...window.__armorRendering.contexts].map(gl => {
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            canvasId: gl.canvas?.id ?? null, version: gl.getParameter(gl.VERSION),
            vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
            unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
            unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
            supportedTimerExtensions: (gl.getSupportedExtensions() ?? []).filter(name => /disjoint_timer_query/.test(name)),
            timerQueryWebGL2: !!gl.getExtension('EXT_disjoint_timer_query_webgl2'),
            timerQueryWebGL1: !!gl.getExtension('EXT_disjoint_timer_query'),
            timingEvidence: 'See raw per-frame gpuTiming and its separate elapsedMs summaries; unsupported/disjoint samples have no duration.',
        };
    }));
    assert.equal(report.gl.length, 1, 'A page with extra WebGL contexts needs a separately scoped measurement.');
    assert.equal(report.gl[0].canvasId, 'lab-preview');
    for (let cycle = 1; cycle <= cycles; cycle++) {
        const on = await observe({ ...profiles[3], id: 'cycle-' + cycle + '-on' });
        const off = await observe({ ...profiles[0], id: 'cycle-' + cycle + '-off' });
        report.resourceCycles.push({ cycle, on, off });
    }
    const tail = report.resourceCycles.slice(1);
    report.resourcePlateau = { policy: 'Exact identical live-resource counts on the last two or more warm off/on cycles.',
        warmCyclesExcluded: 1, passed: false, on: tail[0].on.resources, off: tail[0].off.resources };
    for (const row of tail) {
        assert.deepEqual(row.on.resources, report.resourcePlateau.on, 'Repeated armor-on resources must plateau.');
        assert.deepEqual(row.off.resources, report.resourcePlateau.off, 'Repeated armor-off resources must plateau.');
    }
    report.resourcePlateau.passed = true;
    await page.evaluate(() => window.__armorRendering.stopGpuTiming('owned-cleanup'));
    report.gpuInstrumentation = await page.evaluate(() => window.__armorRendering.gpuInspection());
    assert.equal(report.gpuInstrumentation.pendingQueries, 0);
    assert.equal(report.gpuInstrumentation.created, report.gpuInstrumentation.deleted,
        'Every owned optional GPU timer query must be released.');
    closing = true; phase = 'owned-context-cleanup';
    await closeCpuTiming();
    await context.close(); context = undefined;
    await browser.close(); browser = undefined;
    if (values['native-counts']) await nativeCounts(report.profiles);
    const baseline = report.profiles[0];
    for (const row of report.profiles) {
        row.deltaFromBaseline = Object.fromEntries(['calls', 'triangles', 'renderCallbackWallMs', 'textures', 'buffers', 'programs']
            .map(field => [field, row.summary[field].median - baseline.summary[field].median]));
        row.gpuMedianDeltaFromBaselineMs = row.gpuTiming.elapsedMs && baseline.gpuTiming.elapsedMs
            ? row.gpuTiming.elapsedMs.median - baseline.gpuTiming.elapsedMs.median : null;
        row.mainThreadCpuDeltaFromBaselineMsPerObservedDrawingCallback = Object.fromEntries(
            ['ThreadTime', 'TaskDuration'].map(name => {
                const value = row.mainThreadCpu.metrics[name], start = baseline.mainThreadCpu.metrics[name];
                return [name, value?.status === 'MEASURED' && start?.status === 'MEASURED'
                    ? value.millisecondsPerObservedDrawingCallback - start.millisecondsPerObservedDrawingCallback : null];
            }));
        if (row.nativeCounts) row.nativeGeometryDelta = {
            triangles: row.nativeCounts.triangles - baseline.nativeCounts.triangles,
            materials: row.nativeCounts.materials - baseline.nativeCounts.materials,
            textures: row.nativeCounts.textures - baseline.nativeCounts.textures,
            hairTriangles: (row.nativeCounts.moduleTriangles[hair] ?? 0) -
                (baseline.nativeCounts.moduleTriangles[hair] ?? 0),
        };
    }
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.httpErrors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = { message: String(error), stack: error.stack, phase };
    process.exitCode = 1; console.error(error);
} finally {
    closing = true; phase = 'owned-context-cleanup';
    if (page && !page.isClosed()) {
        await page.evaluate(() => window.__armorRendering?.stopGpuTiming('owned-cleanup')).catch(() => {});
        report.gpuInstrumentation ??= await page.evaluate(() => window.__armorRendering?.gpuInspection()).catch(() => undefined);
    }
    await closeCpuTiming();
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const rows = report.profiles.map(row => '| ' + [row.id, row.summary.calls.median,
        row.summary.triangles.median, row.resources.textures, row.resources.buffers, row.resources.programs,
        row.summary.renderCallbackWallMs.median.toFixed(3), row.summary.renderCallbackWallMs.p95.toFixed(3),
        row.gpuTiming.elapsedMs?.median.toFixed(3) ?? 'unavailable',
        row.gpuTiming.availableSamples + '/' + row.gpuTiming.totalSamples,
        row.mainThreadCpu.metrics.ThreadTime?.millisecondsPerObservedDrawingCallback?.toFixed(3) ?? 'NOT MEASURED',
        row.mainThreadCpu.metrics.TaskDuration?.millisecondsPerObservedDrawingCallback?.toFixed(3) ?? 'NOT MEASURED',
        row.nativeGeometryDelta?.hairTriangles ?? 'not measured'].join(' | ') + ' |');
    const summary = `# Personal armor rendering observation\n\nStatus: ${report.status}. Build: ${report.build?.buildId ?? 'unavailable'}.\n\n` +
        'All profiles keep the same DNA, LOD2, hair, field tunic, shoes, iron hand props, Front camera and live Idle.\n\n' +
        '| Profile | Draws median | Submitted triangles median | Live textures | Live buffers | Live programs | Callback wall median ms | Callback wall p95 ms | GPU query median ms | Valid GPU samples | ThreadTime CPU ms / observed callback | TaskDuration CPU ms / observed callback | Native hair triangles delta |\n' +
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n' + rows.join('\n') + '\n\n' +
        'Callback wall time includes application work, driver waits, submission and instrumentation. It is neither isolated CPU time nor GPU duration. Optional EXT GPU elapsed queries are separate, asynchronously polled and discarded on disjoint. Programs are not material counts.\n\n' +
        'CDP threadTicks ThreadTime/TaskDuration are aggregate renderer-main-thread CPU counter deltas (seconds), converted to milliseconds per actual observed drawing callback. They include all main-thread work and measurement overhead. The raw report retains start/end metrics and the possible extra callbacks at CDP boundary reads; no isolated per-render CPU claim is made. Unsupported domains, absent/reset metrics and failed reads remain NOT MEASURED. GPU result polling occurs after the CPU window.\n\n' +
        (report.resourcePlateau?.passed ? 'Warm resource-cycle plateau passed with exact counts.\n\n' : 'Resource-cycle plateau was not completed.\n\n') +
        'This is desktop headless evidence. Physical-device heat and geometry-fit acceptance remain separate. Missing/disjoint GPU query durations are not a GPU timing pass. See report.json for raw frames, source/asset hashes, counters and any failures.\n';
    await writeFile(join(output, 'summary.md'), summary);
    console.log('Evidence: ' + output);
}
