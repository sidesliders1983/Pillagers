import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const settle = () => new Promise(resolve => setTimeout(resolve, 30));
function available(element) {
    if (!element || element.closest('[hidden]')) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && element !== parent.querySelector('summary')) return false;
    }
    return true;
}
function button(label) {
    return [...document.querySelectorAll('button')].find(element =>
        available(element) && (element.getAttribute('aria-label') ?? element.textContent.trim()) === label);
}
async function entry(run, saved = null) {
    const dom = new JSDOM('<!doctype html>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'DOMException', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    const { activeSettlementKey } = loadDOMSource('../src/play/SharedSettlement.ts');
    const { runFjordEntry } = loadDOMSource('../src/fjord-play/FjordEntry.ts');
    const writes = [], attempts = [];
    const running = runFjordEntry({
        session: { getItem: key => key === activeSettlementKey ? saved : null, setItem: (...args) => writes.push(args) },
        local: { getItem: () => null }, drawSeed: () => 91,
        open: async attempt => { attempts.push(attempt); },
    }).catch(error => error);
    try { await settle(); await run({ dom, writes, attempts }); }
    finally {
        dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide', { persisted: false }));
        await running;
        dom.window.close();
        Object.assign(globalThis, previous);
    }
}

test('a first arrival can find New game and Load game without navigating technical choices', async () => {
    await entry(async ({ writes, attempts }) => {
        assert.equal(document.activeElement, document.body, 'Entry does not choose an action for the player');
        assert.ok(button('New game'));
        assert.ok(button('Load game'));
        assert.ok(button('Settings'));
        assert.ok(button('Help & support'));
        assert.equal([...document.querySelectorAll('[data-entry="continue"]')].some(available), false);
        assert.equal(available(document.querySelector('.performance-setting')), false);
        assert.equal(available(document.querySelector('[data-diagnostics]')), false);
        assert.equal(writes.length, 0);
        assert.equal(attempts.length, 0);
    });
});

function visibleCopy() {
    const walker = document.createTreeWalker(document.body, document.defaultView.NodeFilter.SHOW_TEXT);
    const text = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
        if (available(node.parentElement)) text.push(node.textContent);
    return text.join(' ');
}

test('returning players see their campaign date, can inspect seed details, and cancel a replacement safely', async () => {
    const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
    const saved = new SharedSettlement(32).persist();
    await entry(async ({ writes, attempts }) => {
        assert.match(visibleCopy(), /Winter 800/);
        assert.doesNotMatch(visibleCopy(), /Seed 32/);
        const details = [...document.querySelectorAll('summary')].find(element => element.textContent === 'Campaign details');
        assert.ok(details);
        details.parentElement.open = true;
        assert.match(visibleCopy(), /Seed 32/);
        button('New game').click();
        document.querySelector('[data-entry="new"]').click();
        await settle();
        assert.match(visibleCopy(), /Replace the active campaign/);
        document.querySelector('[data-cancel]').click();
        await settle();
        assert.equal(attempts.length, 0);
        assert.equal(writes.length, 0);
        assert.ok(button('New game'));
    }, saved);
});

test('the public version stays below the brand and agrees with About and diagnostics without activating a save', async () => {
    await entry(async ({ writes, attempts }) => {
        const label = document.querySelector('header [data-game-version]');
        assert.ok(label, 'The brand includes a selectable version line');
        assert.match(label.textContent, /^v0\.1 alpha · local /);
        const about = document.querySelector('.entry-about');
        about.open = true;
        assert.equal(about.querySelector('[data-build-label]').textContent, label.textContent);
        const { PlaytestPerformance } = loadDOMSource('../src/fjord-play/PlaytestPerformance.ts');
        const performance = new PlaytestPerformance();
        try {
            const report = JSON.parse(performance.exportJSON());
            assert.equal(report.buildInfo.version, '0.1.0-alpha');
            assert.match(about.textContent, new RegExp(report.buildInfo.buildId));
            const { IslandLoadStatus } = loadDOMSource('../src/fjord-play/IslandLoadStatus.ts');
            assert.deepEqual(new IslandLoadStatus('new').snapshot().buildInfo, report.buildInfo);
        } finally { performance.dispose(); }
        assert.equal(writes.length, 0);
        assert.equal(attempts.length, 0);
    });
});

test('animated entry background is a persistent presentation preference, never a campaign write', async () => {
    await entry(async ({ dom, writes, attempts }) => {
        button('Settings').click();
        const preference = document.querySelector('[data-entry-motion]');
        assert.ok(preference, 'Settings exposes the desktop background motion preference');
        assert.equal(preference.checked, true);
        preference.click();
        assert.equal(dom.window.localStorage.getItem('fjordside.entry-motion'), 'off');
        assert.equal(writes.length, 0);
        assert.equal(attempts.length, 0);
        button('Back').click();
        button('Settings').click();
        assert.equal(document.querySelector('[data-entry-motion]').checked, false);
        assert.equal(writes.length, 0);
    });
});
