import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

async function withLoading(run) {
    const dom = new JSDOM('<!doctype html><main id="previous">Saved settlement</main>',
        { url: 'http://localhost/fjord-play' });
    const names = ['window', 'document', 'HTMLElement', 'DOMException', 'AbortController',
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
