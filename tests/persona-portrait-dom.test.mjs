import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('persona selection uses the supplied scene snapshots, caches them and drops superseded selections', async () => {
    const dom = new JSDOM(`<!doctype html><main id="fjord-play">
        <nav id="fjord-navigation"></nav><section id="fjord-management"><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden></section><button id="fjord-attention"></button>
        <span id="fjord-attention-count"></span></main>`, { url: 'http://localhost/fjord-play' });
    const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLDetailsElement', 'AbortController', 'matchMedia'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = () => ({ matches: true });
    let ui;
    try {
        const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
        const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
        const owner = new SharedSettlement(32);
        const before = owner.session.saveJSON();
        const rendered = [];
        const refresh = () => ui.refresh(owner.session.readSnapshot(), owner.selection, '', () => '');
        ui = new FjordInterface(owner, { refresh, select() {}, notify() {}, commit() {},
            renderPortrait: async input => {
                rendered.push(input.residentId);
                return 'data:image/png;base64,' + input.residentId;
            } });
        const select = id => { owner.select({ kind: 'persona', id }); refresh(); };
        const drain = async () => {
            for (let index = 0; index < 3; index++) await new Promise(resolve => setImmediate(resolve));
        };
        for (const id of ['founder-1', 'founder-2', 'founder-3', 'founder-1']) {
            select(id);
            await drain();
            assert.ok(document.querySelector('.fjord-portrait img')?.src.endsWith(id));
        }
        assert.deepEqual(rendered, ['founder-1', 'founder-2', 'founder-3']);
        const sharedImage = await ui.requestPortrait('founder-1');
        assert.ok(sharedImage.endsWith('founder-1'));
        assert.deepEqual(rendered, ['founder-1', 'founder-2', 'founder-3'],
            'The Family Tree API reuses the Character Card cache, rather than rendering a second face');
        select('founder-7');
        select('founder-8');
        await drain();
        assert.equal(rendered.at(-1), 'founder-8');
        assert.equal(rendered.includes('founder-7'), false);
        assert.equal(owner.session.saveJSON(), before, 'Portrait selection cannot change Core/save state');
    } finally {
        ui?.dispose();
        dom.window.close();
        Object.assign(globalThis, previous);
    }
});
