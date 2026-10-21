import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const load = name => loadDOMSource('../src/' + name + '.ts');
const core = load('simulation/SimulationCore');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { SharedSettlement } = load('play/SharedSettlement');
const { FjordInterface } = load('fjord-play/FjordInterface');

test('selecting a home immediately shows every resident and their person link on desktop and mobile', () => {
    const dom = new JSDOM(`<main id="fjord-play"><nav id="fjord-navigation"></nav>
        <section id="fjord-management"><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden></section>
        <button id="fjord-attention"><span id="fjord-attention-count"></span></button></main>`,
    { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement', 'AbortController']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    previous.matchMedia = globalThis.matchMedia;
    let mobile = false;
    globalThis.matchMedia = () => ({ matches: mobile });
    let ui;
    try {
        let state = core.createCampaign(32, { initialMaterials: 100 });
        const home = Object.values(state.households).find(item => item.memberIds.length > 0);
        const tent = Object.values(state.households).find(item => item.id !== home.id && item.memberIds.length > 0);
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
        const buildingId = state.residences[state.households[home.id].residenceId].buildingId;
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(state));
        const owner = new SharedSettlement(session), selected = [];
        ui = new FjordInterface(owner, { select: (kind, id) => selected.push({ kind, id }),
            refresh() {}, commit() { assert.fail('Reading residents cannot issue a command'); }, notify() {} });
        const saved = core.serializeState(session.readSnapshot());
        for (mobile of [false, true]) {
            for (const [selection, household] of [
                [{ kind: 'building', id: buildingId }, home],
                [{ kind: 'household', id: tent.id }, tent],
                [{ kind: 'household', id: home.id }, home],
            ]) {
                owner.select(selection);
                ui.refresh(session.readSnapshot(), selection, '', () => '');
                const list = document.querySelector('.fjord-home-residents');
                assert.ok(list && !list.closest('[hidden]'), 'Residents appear on the initial selection');
                assert.equal(list.closest('details'), null, 'No disclosure click is required');
                const links = [...list.querySelectorAll('button[data-kind="persona"]')];
                assert.deepEqual(links.map(link => link.dataset.id), household.memberIds);
                assert.deepEqual(links.map(link => link.textContent.trim()),
                    household.memberIds.map(id => state.personas[id].name));
                ui.handle(links[0]);
                assert.deepEqual(selected.at(-1), { kind: 'persona', id: household.memberIds[0] });
            }
        }
        assert.equal(core.serializeState(session.readSnapshot()), saved);
    } finally {
        ui?.dispose();
        dom.window.close();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});
