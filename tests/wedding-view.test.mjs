import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

test('the compact ceremony controls allow Skip, optional music and Escape, then release all DOM/input hooks', () => {
    const { WeddingCinematicView } = loadDOMSource('../src/fjord-play/WeddingCinematicView.ts');
    const dom = new JSDOM('<main></main>');
    const root = dom.window.document.querySelector('main');
    let skips = 0, plays = 0;
    const view = new WeddingCinematicView(root, { skip: () => skips++, play: () => plays++ });
    view.update(['Dervla', 'Kauppi'], 'gathering', 'blocked', true, 20);
    root.querySelector('[data-wedding-play]').click();
    root.querySelector('[data-wedding-skip]').click();
    root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(plays, 1);
    assert.equal(skips, 2);
    assert.ok(root.textContent.includes('Dervla'));
    view.dispose(); view.dispose();
    root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(skips, 2);
    assert.equal(root.children.length, 0);
    dom.window.close();
});
