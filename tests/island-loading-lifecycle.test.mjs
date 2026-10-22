import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

async function withLoading(run) {
    const dom = new JSDOM('<!doctype html><main id="previous">Saved settlement</main>',
        { url: 'http://localhost/fjord-play' });
    const names = ['window', 'document', 'location', 'HTMLElement', 'DOMException', 'AbortController',
        'requestAnimationFrame', 'cancelAnimationFrame'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    // jsdom has no graphics surface. This test exercises the public loading
    // lifetime; visual rendering and physical WebGL remain browser checks.
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    let loading;
    try {
        const { IslandLoading } = loadDOMSource('../src/fjord-play/IslandLoading.ts');
        loading = new IslandLoading(true);
        await run(loading);
    } finally {
        loading?.finish();
        dom.window.close();
        Object.assign(globalThis, previous);
    }
}

test('cancelling island loading releases a pending GPU wait and restores the previous UI', async () => {
    await withLoading(async loading => {
        let started;
        const entered = new Promise(resolve => { started = resolve; });
        const measured = loading.measure('shader-compilation', () => {
            started();
            return new Promise(() => {});
        }, { timeoutMs: 120_000 }).catch(error => error);
        await entered;
        loading.cancel();
        const result = await Promise.race([measured, new Promise(resolve => setTimeout(() => resolve('hung'), 40))]);
        assert.equal(result.name, 'AbortError', 'An unresolved GPU operation cannot trap cancellation');
        loading.finish();
        assert.equal(document.querySelector('#island-loading'), null);
        assert.equal(Boolean(document.querySelector('#previous').inert), false);
        assert.equal(loading.evidence.samples.length, 1);
    });
});

test('a graphics failure releases loading with its original error, not silent cancellation', async () => {
    await withLoading(async loading => {
        let started;
        const entered = new Promise(resolve => { started = resolve; });
        const measured = loading.measure('shader-compilation', () => {
            started();
            return new Promise(() => {});
        }, { timeoutMs: 120_000 }).catch(error => error);
        await entered;
        const failure = new Error('Graphics were interrupted while preparing the island. Please retry.');
        loading.fail(failure);
        assert.equal(await measured, failure);
        assert.throws(() => loading.check(), error => error === failure);
        assert.equal(loading.evidence.samples.length, 1);
    });
});

test('a bounded graphics stage fails instead of keeping a campaign loading indefinitely', async () => {
    await withLoading(async loading => {
        const measured = loading.measure('shader-compilation', () => new Promise(() => {}), {
            timeoutMs: 10,
        }).catch(error => error);
        const failure = await Promise.race([measured,
            new Promise(resolve => setTimeout(() => resolve('hung'), 100))]);
        assert.equal(failure.name, 'Error');
        assert.match(failure.message, /Preparing graphics took too long/);
        assert.equal(loading.signal.reason, failure);
        assert.equal(loading.evidence.samples.length, 1);
    });
});

test('a delayed operation shows its stage before work, then credits only successful completion', async () => {
    await withLoading(async loading => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        let entered;
        const started = new Promise(resolve => { entered = resolve; });
        const operation = loading.measure('assets-fetch-decode', async () => {
            assert.match(document.querySelector('#island-loading-status').textContent, /Loading houses/);
            assert.equal(loading.diagnostics.percent, 0);
            assert.equal(loading.diagnostics.timeline.at(-1).durationMs, undefined);
            entered();
            await gate;
        });
        await started;
        assert.equal(document.querySelector('progress').value, 0);
        loading.units('assets', 1, 2, 'models');
        assert.equal(loading.diagnostics.percent, 0);
        release();
        await operation;
        assert.equal(document.querySelector('progress').value, 5);
        assert.equal(document.querySelector('[data-load-percent]').textContent, '5%');
        assert.equal(loading.diagnostics.timeline.at(-1).outcome, 'complete');
    });
});

test('non-abortable model work drains after cancellation without completing its envelope', async () => {
    await withLoading(async loading => {
        let release, entered;
        const started = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const operation = loading.measure('initial-character-scene-sync', async () => {
            entered(); await gate; return 'late model';
        });
        await started;
        loading.cancel();
        let settled = false;
        operation.catch(() => { settled = true; });
        await new Promise(resolve => setTimeout(resolve, 5));
        assert.equal(settled, false, 'resource owners must wait for models before disposing their sources');
        release();
        await assert.rejects(operation, { name: 'AbortError' });
        assert.equal(loading.diagnostics.percent, 0);
        assert.equal(loading.diagnostics.outcome, 'cancelled');
    });
});

test('worker retry labels a new attempt with the same seed, fencing stale progress', async () => {
    const previousWorker = globalThis.Worker;
    const ports = [];
    globalThis.Worker = class {
        constructor() { ports.push(this); }
        postMessage(request) { this.request = request; }
        terminate() { this.terminated = true; }
        onmessage = null;
        onerror = null;
    };
    try {
        await withLoading(async loading => {
            const operation = loading.prepare(32);
            const first = ports[0];
            first.onmessage({ data: { id: first.request.id, type: 'phase', stage: 'terrain' } });
            first.onmessage({ data: { id: first.request.id, type: 'timing', stage: 'terrain', milliseconds: 10 } });
            assert.equal(loading.diagnostics.percent, 8);
            first.onmessage({ data: { id: first.request.id, type: 'error', message: 'Worker unavailable (test)' } });
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.equal(loading.diagnostics.outcome, 'failed');
            const attempt = loading.diagnostics.attempt;
            assert.equal(document.querySelector('#island-loading-retry').hidden, false);
            document.querySelector('#island-loading-retry').click();
            await new Promise(resolve => setTimeout(resolve, 10));
            assert.equal(ports.length, 2);
            assert.equal(ports[1].request.task.seed, 32);
            assert.notEqual(loading.diagnostics.attempt, attempt);
            assert.equal(loading.diagnostics.percent, 0);
            first.onmessage({ data: { id: first.request.id, type: 'timing', stage: 'terrain', milliseconds: 10 } });
            assert.equal(loading.diagnostics.percent, 0);
            loading.cancel();
            await assert.rejects(operation, { name: 'AbortError' });
            assert.ok(ports.every(port => port.terminated));
        });
    } finally { globalThis.Worker = previousWorker; }
});
