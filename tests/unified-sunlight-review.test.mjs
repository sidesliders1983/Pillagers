import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const reportRoot = new URL('../docs/qa/northern-light-236/', import.meta.url);

test('sunlight review restores the same real saved campaign for both variants and both camera bearings', async () => {
    const source = await readFile(new URL('fixtures/seed-32-phase-0-4.json', reportRoot), 'utf8');
    const html = await readFile(new URL('../scripts/qa/unified-sunlight-237.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost:5228/scripts/qa/unified-sunlight-237.html' });
    const values = { window: dom.window, document: dom.window.document, Option: dom.window.Option,
        sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
        requestAnimationFrame: callback => { callback(0); return 1; },
        addEventListener: dom.window.addEventListener.bind(dom.window),
        setInterval: () => 1, clearInterval() {},
        fetch: async () => ({ ok: true, text: async () => source }) };
    const previous = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    try {
        for (const [key, value] of Object.entries(values))
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        loadDOMSource('../scripts/qa/northern-light-236.ts');
        assert.equal(document.querySelector('#phase').value, '3', 'Late spring is the initial comparison');
        for (const bearing of ['sunward', 'away']) {
            document.querySelector('#bearing').value = bearing;
            await document.querySelector('#prepare').onclick();
            document.querySelector('#baseline').click();
            const key = 'pillagers.fjord-play.active.v1', fixed = sessionStorage.getItem(key);
            const save = JSON.parse(fixed), original = JSON.parse(source);
            assert.deepEqual(save.fjord, original.fjord);
            assert.deepEqual(save.pace, original.pace);
            const { position, target } = save.presentation.camera;
            const sunwardComponent = (target[0] - position[0]) - (target[2] - position[2]);
            assert.ok(bearing === 'sunward' ? sunwardComponent > 0 : sunwardComponent < 0);
            assert.ok(Math.atan2(position[1] - target[1], Math.hypot(position[0] - target[0], position[2] - target[2])) >= .45);
            assert.match(document.querySelector('#game').src, /lighting=northern-v1&sunlight=northern-v1$/);
            sessionStorage.setItem(key, 'Discarded QA play');
            document.querySelector('#candidate').click();
            assert.equal(sessionStorage.getItem(key), fixed);
            assert.match(document.querySelector('#game').src, /lighting=northern-v1&sunlight=unified-v1$/);
        }
    } finally {
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
