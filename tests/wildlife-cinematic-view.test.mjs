import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const { WildlifeCinematicView } = loadDOMSource('../src/fjord-play/WildlifeCinematicView.ts');

test('a non-blocking wildlife caption keeps an explicit record action and manual Stop, then removes its listeners and DOM', () => {
    const dom = new JSDOM('<main><canvas></canvas></main>');
    const root = dom.window.document.querySelector('main');
    let stopped = 0, books = 0;
    const view = new WildlifeCinematicView(root, 'Moose <real sighting>', {
        stop: () => stopped++, book: () => books++,
    });
    assert.equal(root.querySelector('[role="dialog"], dialog'), null);
    assert.equal(root.querySelector('.wildlife-cinematic').textContent.includes('Moose <real sighting>'), true);
    assert.equal(root.querySelector('.wildlife-cinematic real'), null);
    const buttons = [...root.querySelectorAll('button')];
    buttons.find(button => button.textContent === 'Open wildlife in Clan Book').click();
    buttons.find(button => button.textContent === 'Stop camera').click();
    assert.equal(books, 1); assert.equal(stopped, 1);
    view.dispose(); view.dispose();
    assert.equal(root.querySelector('.wildlife-cinematic'), null);
    for (const button of buttons) button.click();
    assert.equal(books, 1); assert.equal(stopped, 1);
    dom.window.close();
});
