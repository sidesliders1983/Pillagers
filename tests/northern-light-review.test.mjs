import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
import { load } from './load-source.mjs';

const reportRoot = new URL('../docs/qa/northern-light-236/', import.meta.url);
test('all fourteen archived real-island review saves match their phase receipts and reconstruct canonically', async () => {
    const { reconstructState } = load('../src/simulation/SimulationCore.ts');
    const report = JSON.parse(await readFile(new URL('cpu-report.json', reportRoot), 'utf8'));
    assert.equal(report.samples.length, 14);
    assert.deepEqual([...new Set(report.samples.map(sample => sample.island))].sort((a, b) => a - b), [7, 18]);
    for (const sample of report.samples) {
        const bytes = await readFile(new URL(sample.path, reportRoot));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), sample.saveSha256);
        const save = JSON.parse(bytes);
        const state = reconstructState(JSON.stringify(save.fjord.campaign));
        assert.equal(state.time.tick / state.ticksPerWinter, sample.calendar.progress);
        assert.equal(save.fjord.island.seed, sample.island);
        assert.equal(save.pace.running, false);
    }
});

test('review buttons restore identical campaign data through the real active-session storage lane', async () => {
    const source = await readFile(new URL('fixtures/seed-32-phase-0.json', reportRoot), 'utf8');
    const html = await readFile(new URL('../scripts/qa/northern-light-236.html', import.meta.url), 'utf8');
    const dom = new JSDOM(html, { url: 'http://localhost:5227/scripts/qa/northern-light-236.html' });
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
        const key = 'pillagers.fjord-play.active.v1';
        localStorage.setItem(key, 'Unrelated local data');
        document.querySelector('#quality').value = 'standard';
        document.querySelector('#camera').value = 'low';
        await document.querySelector('#prepare').onclick();
        assert.equal(document.querySelector('#baseline').disabled, false);
        document.querySelector('#baseline').click();
        const baseline = sessionStorage.getItem(key), save = JSON.parse(baseline), original = JSON.parse(source);
        assert.deepEqual(save.fjord, original.fjord, 'Presentation choices cannot rewrite the archived campaign');
        assert.deepEqual(save.pace, original.pace);
        assert.equal(save.presentation.quality, 'standard');
        const { position, target } = save.presentation.camera;
        assert.ok(Math.atan2(position[1] - target[1], Math.hypot(position[0] - target[0], position[2] - target[2])) >= .45);
        assert.match(document.querySelector('#game').src, /lighting=baseline$/);
        save.fjord.campaign.stocks.food--;
        sessionStorage.setItem(key, JSON.stringify(save));
        document.querySelector('#candidate').click();
        assert.equal(sessionStorage.getItem(key), baseline, 'Switching comparisons discards intervening QA play and restores the identical fixed save');
        assert.match(document.querySelector('#game').src, /lighting=northern-v1$/);
        assert.equal(localStorage.getItem(key), 'Unrelated local data');
    } finally {
        dom.window.close();
        for (const [key, descriptor] of previous) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
