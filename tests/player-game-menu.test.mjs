import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

function available(element) {
    if (!element || element.closest('[hidden]')) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
        if (parent.tagName === 'DETAILS' && !parent.open && element !== parent.querySelector('summary')) return false;
    return true;
}
function named(selector, text) {
    return [...document.querySelectorAll(selector)].find(element => available(element) &&
        (element.getAttribute('aria-label') ?? element.textContent.trim()) === text);
}
async function header(run) {
    const { fjordHeaderHTML, FjordHeader } = loadDOMSource('../src/fjord-play/FjordHeader.ts');
    const dom = new JSDOM(fjordHeaderHTML(), { pretendToBeVisual: true });
    const names = ['window', 'document', 'Node', 'HTMLElement', 'Element', 'matchMedia'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const owner = new FjordHeader(document.querySelector('#fjord-header'));
    try { await run({ dom, owner }); }
    finally { owner.dispose(); dom.window.close(); Object.assign(globalThis, previous); }
}

test('the game menu prioritizes session actions and retains setting values when returning and closing', async () => {
    await header(async () => {
        named('summary', 'Game menu').click();
        assert.ok(named('summary', 'Save game'));
        assert.ok(named('summary', 'Load game'));
        assert.ok(named('summary', 'Settings'));
        assert.ok(named('summary', 'Help & support'));
        assert.equal(available(document.querySelector('#fjord-export-core')), false);
        assert.equal(available(document.querySelector('#fjord-seed')), false);
        named('summary', 'Settings').click();
        const quality = document.querySelector('#fjord-quality');
        assert.equal(available(quality), true);
        quality.value = 'standard';
        named('button', 'Back').click();
        assert.equal(available(quality), false);
        named('summary', 'Settings').click();
        assert.equal(quality.value, 'standard');
        named('button', 'Close game menu').click();
        assert.equal(document.querySelector('#fjord-menu').open, false);
        assert.equal(document.activeElement.getAttribute('aria-label'), 'Game menu');
    });
});

test('New game offers a fresh arrival and founding replay without requiring a seed choice', async () => {
    await header(async () => {
        named('summary', 'Game menu').click();
        named('summary', 'New game / Replay').click();
        assert.ok(named('button', 'New arrival'));
        assert.ok(named('button', 'Replay original founding'));
        assert.equal(available(document.querySelector('#fjord-seed')), false);
    });
});

test('feedback links require an owner-configured HTTPS destination and add no campaign data', () => {
    const { fjordHeaderHTML } = loadDOMSource('../src/fjord-play/FjordHeader.ts');
    const configured = new JSDOM(fjordHeaderHTML('https://feedback.example.test/fjord'));
    const link = configured.window.document.querySelector('[data-player-feedback]');
    assert.ok(link);
    assert.equal(link.href, 'https://feedback.example.test/fjord');
    assert.equal(link.target, '_blank');
    assert.match(link.rel, /noopener/);
    configured.window.close();
    for (const value of ['', 'http://feedback.example.test/fjord', 'https://user:secret@feedback.example.test/fjord']) {
        const rejected = new JSDOM(fjordHeaderHTML(value));
        assert.equal(rejected.window.document.querySelector('[data-player-feedback]'), null);
        rejected.window.close();
    }
});
