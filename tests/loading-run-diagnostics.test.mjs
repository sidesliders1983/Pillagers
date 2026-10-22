import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { LoadingRunDiagnostics } = load('../src/fjord-play/LoadingRunDiagnostics.ts');
const { IslandLoadStatus, loadPlan } = load('../src/fjord-play/IslandLoadStatus.ts');

function observers() {
    const previous = globalThis.PerformanceObserver;
    const instances = [];
    globalThis.PerformanceObserver = class {
        static supportedEntryTypes = ['resource', 'longtask'];
        constructor(callback) { this.callback = callback; instances.push(this); }
        observe(options) { this.type = options.type; }
        takeRecords() { return []; }
        disconnect() { this.disconnected = true; }
        send(entries) { this.callback({ getEntries: () => entries }); }
    };
    return { instances, restore: () => { globalThis.PerformanceObserver = previous; } };
}

test('diagnostic loading records browser resources, model work and nested spans, then disconnects', () => {
    const fake = observers();
    try {
        const run = new LoadingRunDiagnostics();
        const status = new IslandLoadStatus('resume', 32);
        run.attach(status);
        const span = status.begin('initial-settlement-models');
        run.model('persona', 'human', performance.now());
        status.end(span);
        const resource = { name: 'https://user:secret@local.test/game-assets/body.glb?token=secret',
            entryType: 'resource', startTime: run.started, duration: 80, initiatorType: 'fetch',
            requestStart: run.started + 2, responseStart: run.started + 25, responseEnd: run.started + 80,
            transferSize: 1200, encodedBodySize: 1000, decodedBodySize: 2400, responseStatus: 200 };
        const resourceObserver = fake.instances.find(observer => observer.type === 'resource');
        resourceObserver.send([resource, resource, { ...resource, startTime: run.started - 1 },
            { ...resource, name: 'data:image/png;secret' }, { ...resource, name: 'blob:local.test/secret' }]);
        fake.instances.find(observer => observer.type === 'longtask').send([
            { entryType: 'longtask', startTime: run.started, duration: 60 }]);
        for (const step of Object.keys(loadPlan)) if (step !== 'handoff') status.complete(step);
        status.diagnosticComplete();
        const report = run.finish();
        assert.equal(report.outcome, 'diagnostic-complete');
        assert.equal(report.loading.percent, 100);
        assert.equal(report.loading.playableMs, undefined, 'preparation is not playable ownership');
        assert.equal(report.summary.resourceCount, 1);
        assert.equal(report.summary.observedTransferBytes, 1200);
        assert.equal(report.resources[0].path, '/game-assets/body.glb');
        assert.equal(report.resources[0].responseStatus, 200);
        assert.equal(report.settlementModels[0].kind, 'persona');
        assert.equal(report.preparation[0].outcome, 'complete');
        assert.equal(report.preparation[0].attempt, status.attempt);
        assert.equal(report.longTasks[0].durationMs, 60);
        assert.ok(fake.instances.every(observer => observer.disconnected));
        assert.doesNotMatch(JSON.stringify(report), /secret|local\.test|token=/);
        assert.equal(run.finish().elapsedMs, report.elapsedMs, 're-export cannot extend the run');
    } finally { fake.restore(); }
});

test('diagnostic records are bounded and failed preparation never reports a playable island', () => {
    const fake = observers();
    try {
        const run = new LoadingRunDiagnostics();
        const status = new IslandLoadStatus('new', 91);
        run.attach(status);
        const parent = status.begin('initial-settlement-models');
        for (let index = 0; index < 2200; index++) {
            const span = status.begin('model-' + index);
            status.end(span);
            run.model('persona', 'human', performance.now());
        }
        status.end(parent);
        const observer = fake.instances.find(observer => observer.type === 'resource');
        observer.send(Array.from({ length: 2200 }, (_, index) => ({
            name: '/model-' + index + '.glb', entryType: 'resource', startTime: run.started,
            duration: 1, initiatorType: 'fetch', requestStart: 0, responseStart: 0,
            responseEnd: run.started + 1, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0,
        })));
        const failure = new Error('Graphics were interrupted: https://user:secret@local.test/body.glb?token=secret');
        const report = run.finish(failure);
        assert.equal(report.outcome, 'failed');
        assert.equal(report.loading.error.kind, 'context-loss');
        assert.doesNotMatch(JSON.stringify(report), /secret|local\.test|token=/);
        assert.equal(report.resources.length, 2048);
        assert.equal(report.resources[0].responseStatus, undefined);
        assert.equal(report.preparation.length, 2048);
        assert.equal(report.preparation[0].outcome, 'complete', 'long parent spans survive UI timeline eviction');
        assert.equal(report.settlementModels.length, 512);
        assert.deepEqual(report.dropped, { resources: 152, timings: 153, models: 1688, longTasks: 0 });
        assert.equal(report.loading.playableMs, undefined);
        assert.equal(status.timeline.length, 128, 'ordinary progress retains its small bound');
    } finally { fake.restore(); }
});

test('unsupported observers and cancellation remain downloadable, without invented CPU or cache evidence', () => {
    const previous = globalThis.PerformanceObserver;
    globalThis.PerformanceObserver = undefined;
    try {
        const run = new LoadingRunDiagnostics();
        const status = new IslandLoadStatus('resume');
        run.attach(status);
        const pending = status.begin('shader-compilation');
        const report = run.finish(new DOMException('Loading cancelled.', 'AbortError'));
        assert.equal(report.outcome, 'cancelled');
        assert.equal(pending.outcome, 'cancelled');
        assert.deepEqual(report.support, { resourceObserver: false, longTaskObserver: false });
        assert.equal(report.loading.measurements.gpuTime, 'unsupported');
        assert.match(report.limits.join(' '), /cache temperature is not inferred/);
        assert.doesNotThrow(() => JSON.stringify(report));
    } finally { globalThis.PerformanceObserver = previous; }
});
