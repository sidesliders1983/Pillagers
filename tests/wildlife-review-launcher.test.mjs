import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { load } from './load-source.mjs';
const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const page = await readFile(new URL('../scripts/qa/wildlife-sightings-review.html', import.meta.url), 'utf8');

test('review launcher responds before fetch, preserves checkpoint data and opens a paused phone review without world imports', async () => {
    const owner = new SharedSettlement(32), checkpoint = JSON.parse(owner.persist());
    checkpoint.pace.running = true;
    let finish;
    const requests = [];
    const dom = new JSDOM(page, { url: 'http://localhost:5218/scripts/qa/wildlife-sightings-review.html', runScripts: 'dangerously',
        beforeParse(window) {
            window.HTMLElement.prototype.scrollIntoView = () => {};
            window.fetch = url => { requests.push(url); return new Promise(resolve => { finish = resolve; }); };
        } });
    try {
        const document = dom.window.document, button = document.querySelector('#phone');
        button.click();
        assert.match(document.querySelector('[role="status"]').textContent, /Loading the selected checkpoint/);
        assert.equal(button.disabled, true);
        document.querySelector('#desktop').click(); assert.equal(requests.length, 1);
        finish({ ok: true, json: async () => structuredClone(checkpoint) });
        await new Promise(setImmediate);
        const saved = JSON.parse(dom.window.sessionStorage.getItem('pillagers.fjord-play.active.v1'));
        assert.deepEqual(saved.fjord.campaign, checkpoint.fjord.campaign);
        assert.equal(saved.target, 'fjord'); assert.equal(saved.pace.running, false);
        assert.equal(document.querySelector('iframe').hidden, false);
        assert.equal(document.querySelector('iframe').getAttribute('src'), '/fjord-play?attention=1');
        assert.match(document.querySelector('[role="status"]').textContent, /Attention opens when ready/);
        assert.equal(button.disabled, false);
        document.querySelector('select').value = 'read';
        document.querySelector('select').dispatchEvent(new dom.window.Event('change'));
        assert.equal(requests.length, 2, 'An already-open phone preview follows the selected checkpoint');
        finish({ ok: true, json: async () => structuredClone(checkpoint) });
        await new Promise(setImmediate);
    } finally { dom.window.close(); }
});

test('review launcher reports failed requests, preserves the existing QA save and allows retry', async () => {
    const dom = new JSDOM(page, { url: 'http://localhost:5218/', runScripts: 'dangerously', beforeParse(window) {
        window.fetch = async () => ({ ok: false, status: 503 });
    } });
    try {
        const document = dom.window.document;
        dom.window.sessionStorage.setItem('pillagers.fjord-play.active.v1', 'previous QA checkpoint');
        document.querySelector('#phone').click(); await new Promise(setImmediate);
        assert.match(document.querySelector('[role="status"]').textContent, /Could not open.*503/);
        assert.equal(document.querySelector('#phone').disabled, false);
        assert.equal(dom.window.sessionStorage.getItem('pillagers.fjord-play.active.v1'), 'previous QA checkpoint');
    } finally { dom.window.close(); }
});
