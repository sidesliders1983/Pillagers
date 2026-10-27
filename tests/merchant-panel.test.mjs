import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { MerchantPanel } = loadDOMSource('../src/fjord-play/MerchantPanel.ts');

test('touch-friendly merchant offers review exact give/get, cancel freely and commit only on confirmation', async () => {
    const dom = new JSDOM('<main><button id="shore">Shore</button></main>', { pretendToBeVisual: true });
    const saved = {};
    for (const key of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'HTMLButtonElement', 'AbortController',
        'HTMLDetailsElement', 'HTMLOptionElement', 'HTMLSelectElement', 'HTMLInputElement']) {
        saved[key] = globalThis[key]; globalThis[key] = key === 'window' ? dom.window : dom.window[key];
    }
    let panel, epoch = 1;
    try {
        let state = core.createCampaign(1, { initialFood: 1000, initialMaterials: 100 }, {},
            { enabled: false }, {}, {}, {}, 'summer-800-v1', undefined, undefined, {}, {}, { enabled: true });
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2000 });
        const before = core.serializeState(state);
        panel = new MerchantPanel(document.querySelector('main'), () => state, command => {
            state = core.applyCommand(state, command);
        }, () => epoch);
        document.querySelector('#shore').focus();
        panel.open();
        assert.match(document.body.textContent, /Supply merchant/);
        assert.match(document.body.textContent, /8 Food/);
        const review = document.querySelector('[data-merchant-review="offer-1"]');
        review.click();
        assert.match(document.querySelector('[role="dialog"]').textContent, /Give 7 Materials/);
        assert.match(document.querySelector('[role="dialog"]').textContent, /Receive 8 Food/);
        assert.equal(core.serializeState(state), before);
        document.querySelector('[data-merchant-cancel]').click();
        assert.equal(core.serializeState(state), before);
        document.querySelector('[data-merchant-review="offer-1"]').click();
        document.querySelector('[data-merchant-confirm]').click();
        await Promise.resolve();
        assert.equal(state.events.filter(event => event.type === 'MerchantBartered').length, 1);
        assert.match(document.body.textContent, /Exchange completed/);
        document.querySelector('[data-merchant-close]').click();
        assert.equal(document.activeElement.id, 'shore');
        panel.open();
        document.querySelector('[data-merchant-review="offer-1"]').click();
        epoch++;
        panel.refresh();
        assert.equal(document.querySelector('[aria-label="Visiting merchant"]').hidden, true, 'Changing campaigns discards the previous quote window');
        panel.dispose(); panel = undefined;
        assert.equal(document.querySelector('[aria-label="Visiting merchant"]'), null);
    } finally {
        panel?.dispose(); dom.window.close();
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});
