import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

async function withReader(run, portrait) {
    const dom = new JSDOM('<!doctype html><button id="clan-book-open">Clan Book</button>', { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLButtonElement',
        'HTMLInputElement', 'HTMLSelectElement', 'HTMLDetailsElement', 'HTMLOptionElement', 'AbortController', 'IntersectionObserver'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    class Observer {
        static latest;
        elements = new Set();
        constructor(callback) { this.callback = callback; Observer.latest = this; }
        observe(element) { this.elements.add(element); }
        disconnect() { this.elements.clear(); }
        visible(ids) {
            this.callback([...this.elements].map(target => ({ target, isIntersecting: ids.includes(target.dataset.familyNode) })));
        }
    }
    globalThis.IntersectionObserver = Observer;
    dom.window.matchMedia = () => ({ matches: false });
    dom.window.HTMLElement.prototype.scrollTo = function (x, y) {
        this.scrollLeft = typeof x === 'object' ? x.left ?? this.scrollLeft : x;
        this.scrollTop = typeof x === 'object' ? x.top ?? this.scrollTop : y;
    };
    let reader;
    try {
        const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
        const { ClanBookReader } = loadDOMSource('../src/lore/ClanBookReader.ts');
        const owner = new SharedSettlement(32, 1, false);
        owner.session.book.notifyPending();
        reader = new ClanBookReader(owner, () => {}, {}, () => {}, portrait);
        reader.update();
        reader.open(0, 'family');
        await run({ owner, reader, Observer, dom, drain: async () => {
            for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve));
        } });
    } finally {
        reader?.dispose();
        dom.window.close();
        Object.assign(globalThis, previous);
    }
}

test('book cards are named avatar profiles, with a factual generation header and reused relationships/history', async () => {
    await withReader(async ({ owner, reader }) => {
        const before = owner.session.saveJSON();
        const nodes = owner.session.familyTree().nodes;
        assert.equal(document.querySelectorAll('[data-family-node]').length, 10);
        assert.equal(document.querySelectorAll('.family-card-avatar > span').length, 10);
        assert.equal(document.querySelector('.family-generation h3').firstChild.textContent, 'Founders');
        assert.match(document.querySelector('.family-generation[data-newest]').textContent, /Newest recorded generation/);
        const node = nodes.find(person => person.children.length || person.founder);
        const card = document.getElementById('family-node-' + encodeURIComponent(node.id));
        assert.ok(card.textContent.includes(node.name));
        assert.ok(card.textContent.includes('Living'));
        card.click();
        assert.equal(card.getAttribute('aria-pressed'), 'true');
        assert.match(document.querySelector('#family-person-details').textContent, /Child of/);
        assert.ok(document.querySelector('[data-personal-history]'));
        assert.ok(document.querySelector('.family-edge.partnership[data-selected]'));
        const diagram = document.querySelector('.family-tree-diagram');
        diagram.scrollLeft = 150;
        diagram.scrollTop = 90;
        reader.update();
        assert.equal(document.activeElement, card);
        assert.deepEqual([diagram.scrollLeft, diagram.scrollTop], [150, 90]);
        assert.equal(owner.session.saveJSON(), before, 'Reading/panning never changes Core, events or RNG');
        document.querySelector('[data-family-reset]').click();
        assert.deepEqual([diagram.scrollLeft, diagram.scrollTop], [0, 0]);
    });
});

test('portraits are requested only for visible cards; Close/tab change aborts work and broken images keep initials', async () => {
    const calls = [];
    await withReader(async ({ reader, Observer, drain, dom }) => {
        assert.equal(calls.length, 0, 'Opening the tree does not render the entire clan');
        Observer.latest.visible(['founder-1', 'founder-2']);
        await drain();
        assert.deepEqual(calls.map(call => call.id), ['founder-1', 'founder-2']);
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 2);
        const image = document.querySelector('.family-card-avatar img');
        const slot = image.parentElement;
        image.dispatchEvent(new dom.window.Event('error'));
        assert.equal(slot.querySelector('img'), null);
        assert.ok(slot.textContent.trim(), 'The actual named initials remain when a portrait fails');
        reader.close();
        assert.equal(calls.every(call => call.signal.aborted), true);
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 0);
        reader.open(0, 'family');
        Observer.latest.visible(['founder-3']);
        await drain();
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 1);
        document.querySelector('#clan-book-story-tab').click();
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 0);
    }, async (id, signal) => {
        calls.push({ id, signal });
        return 'data:image/png;base64,' + id;
    });
});

test('late portraits and selected people from an abandoned campaign never enter the rebuilt tree', async () => {
    let finish;
    await withReader(async ({ owner, reader, Observer, drain }) => {
        document.querySelector('[data-family-node="founder-1"]').click();
        Observer.latest.visible(['founder-1']);
        await drain();
        const originalCard = document.querySelector('[data-family-node="founder-1"]');
        const { createCampaign, serializeState } = loadDOMSource('../src/simulation/SimulationCore.ts');
        owner.importJSON(serializeState(createCampaign(184)));
        reader.open(0, 'family');
        finish('data:image/png;base64,abandoned');
        await drain();
        assert.equal(document.querySelectorAll('[data-family-node][aria-pressed="true"]').length, 0);
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 0);
        assert.equal(document.querySelector('.family-tree-diagram').scrollLeft, 0);
        assert.equal(originalCard.textContent.includes('abandoned'), false);
    }, () => new Promise(resolve => { finish = resolve; }));
});

test('world gestures are contained while native scrolling and keyboard controls remain available', async () => {
    await withReader(async ({ dom }) => {
        let leaked = 0;
        const count = () => leaked++;
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel'])
            document.addEventListener(type, count);
        const diagram = document.querySelector('.family-tree-diagram');
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel'])
            diagram.dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
        assert.equal(leaked, 0);
        assert.equal(diagram.tabIndex, 0);
        assert.ok(document.querySelector('#clan-book-close'));
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel'])
            document.removeEventListener(type, count);
    });
});

test('a large tree bounds visible thumbnail work and ignores callbacks from a previous campaign', async () => {
    const calls = [];
    await withReader(async ({ owner, reader, Observer, drain }) => {
        const { readFileSync } = await import('node:fs');
        owner.importJSON(readFileSync('docs/qa/family-tree-287/legacy-gameplay-save.json', 'utf8'));
        reader.open(0, 'family');
        const observer = Observer.latest;
        const staleCard = document.querySelector('[data-family-node]');
        const ids = owner.session.familyTree().nodes.map(node => node.id);
        observer.visible(ids);
        await drain();
        assert.equal(calls.length, 24, 'A fifty-person tree cannot queue or retain a portrait per resident');
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 24);
        const { createCampaign, serializeState } = loadDOMSource('../src/simulation/SimulationCore.ts');
        owner.importJSON(serializeState(createCampaign(184)));
        reader.open(0, 'family');
        observer.callback([{ target: staleCard, isIntersecting: true }]);
        await drain();
        assert.equal(calls.length, 24, 'A queued obsolete observer cannot start a new campaign request');
        assert.equal(document.querySelectorAll('.family-card-avatar img').length, 0);
    }, async (id, signal) => {
        calls.push({ id, signal });
        return 'data:image/png;base64,' + id;
    });
});
