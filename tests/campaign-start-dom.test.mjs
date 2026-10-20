import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('entry is read-only until a confirmed choice is ready; cancel and repeated clicks are safe', async () => {
    const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const { SharedSettlement, activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
    const saved = new SharedSettlement(32).persist();
    const session = new Map([[activeSettlementKey, saved]]), writes = [], opens = [];
    let seedDraws = 0;
    const storage = { getItem: key => session.get(key) ?? null, setItem: (key, text) => {
        writes.push(key); session.set(key, text);
    } };
    try {
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const running = runFjordEntry({ session: storage, local: { getItem: () => null },
            drawSeed: () => { seedDraws++; return 32; },
            open: async attempt => { opens.push(attempt); attempt.activate('ready campaign'); },
        });
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        await settle();
        assert.equal(opens.length, 0);
        assert.equal(writes.length, 0);
        assert.match(document.body.textContent, /Continue campaign/);
        assert.match(document.body.textContent, /Winter 800/);
        document.querySelector('[data-entry="new"]').click();
        await settle();
        assert.match(document.body.textContent, /Replace the active campaign/);
        document.querySelector('[data-cancel]').click();
        await settle();
        assert.equal(seedDraws, 0);
        assert.equal(session.get(activeSettlementKey), saved);
        document.querySelector('[data-entry="new"]').click();
        await settle();
        const confirm = document.querySelector('[data-confirm]');
        confirm.click(); confirm.click();
        await running;
        assert.equal(seedDraws, 1);
        assert.equal(opens.length, 1);
        assert.equal(opens[0].seed, 33, 'a colliding seed is advanced once');
        assert.deepEqual(writes, [activeSettlementKey]);
    } finally {
        dom.window.close(); Object.assign(globalThis, previous);
    }
});

test('failed assets and quota retry the same attempt, protecting saves and exposing export', async () => {
    const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const { SharedSettlement, activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
    const saved = new SharedSettlement(32).persist();
    let current = saved, opens = 0, draws = 0, quota = true;
    const seeds = [];
    const settle = () => new Promise(resolve => setTimeout(resolve, 30));
    try {
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const running = runFjordEntry({
            session: { getItem: key => key === activeSettlementKey ? current : null,
                setItem: (_key, text) => { if (quota) throw new Error('QuotaExceeded'); current = text; } },
            local: { getItem: () => null }, drawSeed: () => { draws++; return 91; },
            open: async attempt => {
                seeds.push(attempt.seed);
                if (++opens === 1) throw new Error('Asset loading failed');
                attempt.activate('prepared campaign');
            },
        });
        await settle();
        document.querySelector('[data-entry="new"]').click(); await settle();
        document.querySelector('[data-confirm]').click(); await settle();
        assert.match(document.body.textContent, /Asset loading failed/);
        assert.equal(current, saved);
        document.querySelector('[data-retry]').click(); await settle();
        assert.match(document.body.textContent, /Progress cannot be saved/);
        assert.equal(document.querySelector('[data-export]').hidden, false);
        assert.equal(current, saved);
        quota = false;
        document.querySelector('[data-retry]').click(); await running;
        assert.equal(current, 'prepared campaign');
        assert.deepEqual(seeds, [91, 91, 91]);
        assert.equal(draws, 1);
    } finally {
        dom.window.close(); Object.assign(globalThis, previous);
    }
});

test('fresh entry has no invented save; leaving fences late activation', async () => {
    const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    let writes = 0, finish, attempt;
    try {
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const running = runFjordEntry({
            session: { getItem: () => null, setItem: () => { writes++; } },
            local: { getItem: () => null }, drawSeed: () => 17,
            open: choice => { attempt = choice; return new Promise(resolve => { finish = resolve; }); },
        }).catch(error => error);
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        await settle();
        assert.equal(document.querySelector('[data-entry="continue"]').disabled, true);
        assert.equal(document.querySelector('[data-entry="restart"]').disabled, true);
        assert.equal(writes, 0);
        document.querySelector('[data-entry="new"]').click(); await settle();
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
        assert.throws(() => attempt.activate('late result'), { name: 'AbortError' });
        finish(); await running;
        assert.equal(writes, 0);
    } finally {
        dom.window.close(); Object.assign(globalThis, previous);
    }
});

test('a changed active session fences a stale loaded campaign before any write', async () => {
    const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const { SharedSettlement, activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
    let current = new SharedSettlement(32).persist(), writes = 0;
    const newer = new SharedSettlement(91).persist();
    try {
        const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
        const running = runFjordEntry({
            session: { getItem: key => key === activeSettlementKey ? current : null,
                setItem: () => { writes++; } }, local: { getItem: () => null }, drawSeed: () => 17,
            open: async attempt => { current = newer; attempt.activate('stale checkpoint'); },
        }).catch(error => error);
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        await settle();
        document.querySelector('[data-entry="continue"]').click(); await settle();
        assert.match(document.body.textContent, /active session changed/);
        assert.equal(current, newer);
        assert.equal(writes, 0);
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
        assert.equal((await running).name, 'AbortError');
    } finally {
        dom.window.close(); Object.assign(globalThis, previous);
    }
});
