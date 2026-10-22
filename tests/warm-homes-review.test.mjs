import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('home review compares the identical real campaign and preserves Core when changing view or quality', async () => {
    const source = await readFile(new URL('../docs/qa/warm-homes-256/fixtures/phase-0.json', import.meta.url), 'utf8');
    const html = await readFile(new URL('../scripts/qa/warm-homes-256.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost:5229/scripts/qa/warm-homes-256.html' });
    const values = { document: dom.window.document, sessionStorage: dom.window.sessionStorage,
        addEventListener: dom.window.addEventListener.bind(dom.window), setInterval: () => 1, clearInterval() {},
        fetch: async () => ({ ok: true, text: async () => source }) };
    const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    try {
        for (const [key, value] of Object.entries(values))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        loadDOMSource('../scripts/qa/warm-homes-256.ts');
        for (const view of ['normal', 'house-1', 'house-2', 'house-3', 'house-4', 'house-5']) {
            document.querySelector('#view').value = view;
            document.querySelector('#quality').value = 'standard';
            await document.querySelector('#prepare').onclick();
            document.querySelector('#baseline').click();
            const key = 'pillagers.fjord-play.active.v1', fixed = sessionStorage.getItem(key);
            assert.ok(fixed, document.querySelector('#status').textContent);
            assert.deepEqual(JSON.parse(fixed).fjord, JSON.parse(source).fjord);
            assert.deepEqual(JSON.parse(fixed).pace, JSON.parse(source).pace);
            assert.equal(JSON.parse(fixed).presentation.quality, 'standard');
            assert.match(document.querySelector('#game').src, /lighting=northern-v1&homes=baseline$/);
            sessionStorage.setItem(key, 'Discarded QA play');
            document.querySelector('#candidate').click();
            assert.equal(sessionStorage.getItem(key), fixed);
            assert.match(document.querySelector('#game').src, /lighting=northern-v1&homes=warm-v1$/);
            const { position, target } = JSON.parse(fixed).presentation.camera;
            assert.ok(Math.atan2(position[1] - target[1], Math.hypot(position[0] - target[0], position[2] - target[2])) >= .45);
        }
    } finally {
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
