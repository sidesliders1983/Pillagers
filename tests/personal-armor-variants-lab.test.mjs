import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const { CharacterLabUI } = loadDOMSource('../src/character-lab/CharacterLabUI.ts');
const { defaultDNA } = loadDOMSource('../src/characters/CharacterDNA.ts');
const { generatePhenotype } = loadDOMSource('../src/characters/generatePhenotype.ts');
const { parseCharacterPresentation } = loadDOMSource('../src/characters/CharacterPresentation.ts');
const { fjordClothingSets } = loadDOMSource('../src/fjord-play/FjordWardrobe.ts');

function documentFixture() {
    const dom = new JSDOM('<main id="lab-root"></main>', { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLButtonElement', 'Option', 'Event']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    previous.fetch = globalThis.fetch;
    globalThis.fetch = async path => {
        const value = await readFile('public' + String(path).split('?')[0]);
        return { ok: true, arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) };
    };
    return { dom, restore() {
        dom.window.close();
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
        }
    } };
}

test('the public Lab armor selectors preserve actual variants, hand choices, hair, beard and DNA', async () => {
    const fixture = documentFixture();
    try {
        const dna = defaultDNA(), originalDNA = structuredClone(dna);
        const body = { version: 1, preset: 'auto', source: 'meshy' };
        let presentation = parseCharacterPresentation({ ...fjordClothingSets.generic,
            hair: 'hair/manual-long-2', beard: 'beard/manual-fitted-normal',
            headwear: 'headwear/native-leather-helmet', bodyArmor: 'garment/native-iron-body-armor',
            equipmentItems: ['equipment/native-iron-spear', 'equipment/native-leather-shield'] });
        let ui;
        const refresh = () => ui.update(dna, generatePhenotype(dna), null, presentation, body);
        ui = new CharacterLabUI(document.getElementById('lab-root'), dna,
            () => assert.fail('An armor selection cannot change DNA'), () => {}, next => {
                presentation = parseCharacterPresentation(next); refresh();
            });
        refresh();
        const armor = document.getElementById('lab-combat-body-armor');
        const helmet = document.getElementById('lab-combat-headgear');
        assert.deepEqual([...armor.options].map(option => option.value),
            ['none', 'garment/native-leather-body-armor', 'garment/native-iron-body-armor']);
        assert.deepEqual([...helmet.options].map(option => option.value),
            ['none', 'headwear/native-leather-helmet', 'headwear/native-iron-helmet']);
        assert.equal(armor.value, presentation.bodyArmor);
        assert.equal(helmet.value, presentation.headwear);
        for (const bodyArmor of ['garment/native-leather-body-armor', 'garment/native-iron-body-armor']) {
            armor.value = bodyArmor; armor.dispatchEvent(new Event('change', { bubbles: true }));
            assert.equal(presentation.bodyArmor, bodyArmor);
            assert.equal(presentation.headwear, 'headwear/native-leather-helmet');
        }
        for (const headwear of ['headwear/native-iron-helmet', 'headwear/native-leather-helmet']) {
            helmet.value = headwear; helmet.dispatchEvent(new Event('change', { bubbles: true }));
            assert.equal(presentation.headwear, headwear);
            assert.equal(presentation.bodyArmor, 'garment/native-iron-body-armor');
        }
        assert.deepEqual(presentation.equipmentItems,
            ['equipment/native-iron-spear', 'equipment/native-leather-shield']);
        assert.equal(presentation.hair, 'hair/manual-long-2');
        assert.equal(presentation.beard, 'beard/manual-fitted-normal');
        assert.deepEqual(dna, originalDNA);
        // Every real hash-pinned declaration must finish before disposing the document.
        // The public option labels expose pending age requests without private UI access.
        const deadline = Date.now() + 10000;
        while ([...document.querySelectorAll('[data-presentation] option')]
            .some(option => option.textContent.includes('age support unverified')) && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok([...document.querySelectorAll('[data-presentation] option')]
            .every(option => !option.textContent.includes('age support unverified')),
            'All requested real binding declarations must settle');
        assert.equal(armor.disabled, false);
        assert.equal(helmet.disabled, false);
        assert.ok([...armor.options, ...helmet.options].every(option => !option.disabled));
    } finally {
        fixture.restore();
    }
});
