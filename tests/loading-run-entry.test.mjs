import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const settle = () => new Promise(resolve => setTimeout(resolve, 35));

async function withEntry(url, run) {
    const dom = new JSDOM('<!doctype html>', { url, pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const downloads = [], timers = [];
    const oldCreate = URL.createObjectURL, oldRevoke = URL.revokeObjectURL, oldTimeout = globalThis.setTimeout;
    URL.createObjectURL = blob => { downloads.push(blob); return 'blob:diagnostics'; };
    URL.revokeObjectURL = () => {};
    dom.window.HTMLAnchorElement.prototype.click = () => {};
    globalThis.setTimeout = (callback, delay, ...args) => {
        const timer = oldTimeout(callback, delay, ...args);
        if (delay === 30_000) timers.push(timer);
        return timer;
    };
    try { await run({ dom, downloads }); }
    finally {
        for (const timer of timers) clearTimeout(timer);
        URL.createObjectURL = oldCreate;
        URL.revokeObjectURL = oldRevoke;
        globalThis.setTimeout = oldTimeout;
        dom.window.close();
        Object.assign(globalThis, previous);
    }
}

function prepared(attempt) {
    const { IslandLoadStatus, loadPlan } = loadDOMSource('../src/fjord-play/IslandLoadStatus.ts');
    const status = new IslandLoadStatus(attempt.kind === 'continue' ? 'resume' : attempt.kind, attempt.seed);
    attempt.diagnosticRun.attach(status);
    for (const step of Object.keys(loadPlan)) if (step !== 'handoff') status.complete(step);
    status.diagnosticComplete();
}

test('saved-campaign diagnostics auto-download a report, allow manual export, and never activate storage', async () => {
    await withEntry('http://localhost/fjord-play?diagnostics=load', async ({ dom, downloads }) => {
        const { SharedSettlement, activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
        const saved = new SharedSettlement(32).persist();
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        let writes = 0, opens = 0;
        const running = runFjordEntry({
            session: { getItem: key => key === activeSettlementKey ? saved : null, setItem: () => { writes++; } },
            local: { getItem: () => null }, drawSeed: () => 91,
            open: async attempt => {
                opens++;
                assert.equal(attempt.source.text, saved);
                assert.throws(() => attempt.activate('unexpected save'), /diagnostic run cannot activate/);
                prepared(attempt);
            },
        }).catch(error => error);
        await settle();
        assert.match(document.body.textContent, /Test saved campaign/);
        document.querySelector('[data-entry="continue"]').click();
        await settle();
        assert.match(document.body.textContent, /Loading diagnostics complete/);
        assert.equal(opens, 1);
        assert.equal(writes, 0);
        assert.equal(downloads.length, 1);
        const report = JSON.parse(await downloads[0].text());
        assert.equal(report.outcome, 'diagnostic-complete');
        assert.equal(report.loading.mode, 'resume');
        assert.doesNotMatch(JSON.stringify(report), /personas|chapters/);
        document.querySelector('[data-download]').click();
        assert.equal(downloads.length, 2);
        document.querySelector('[data-back]').click();
        await settle();
        assert.match(document.body.textContent, /Test saved campaign/);
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
        assert.equal((await running).name, 'AbortError');
    });
});

test('new diagnostic scenarios skip replacement, export failures, and retry with a fresh recorder on the same seed', async () => {
    await withEntry('http://localhost/fjord-play', async ({ dom, downloads }) => {
        const { SharedSettlement, activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
        const saved = new SharedSettlement(32).persist();
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const recorders = [], seeds = [];
        let writes = 0, draws = 0;
        const running = runFjordEntry({
            session: { getItem: key => key === activeSettlementKey ? saved : null, setItem: () => { writes++; } },
            local: { getItem: () => null }, drawSeed: () => { draws++; return 91; },
            open: async attempt => {
                recorders.push(attempt.diagnosticRun);
                seeds.push(attempt.seed);
                if (recorders.length === 1) throw new Error('Test asset failed');
                prepared(attempt);
            },
        }).catch(error => error);
        await settle();
        document.querySelector('[data-diagnostics]').click();
        await settle();
        document.querySelector('[data-entry="new"]').click();
        await settle();
        assert.equal(document.querySelector('[data-confirm]'), null);
        assert.match(document.body.textContent, /Test asset failed/);
        assert.equal(JSON.parse(await downloads[0].text()).outcome, 'failed');
        document.querySelector('[data-retry]').click();
        await settle();
        assert.match(document.body.textContent, /Loading diagnostics complete/);
        assert.notEqual(recorders[0], recorders[1]);
        assert.deepEqual(seeds, [91, 91]);
        assert.equal(draws, 1);
        assert.equal(writes, 0);
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
        assert.equal((await running).name, 'AbortError');
    });
});
