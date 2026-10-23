import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
const { IslandMissionPanel } = loadDOMSource('../src/fjord-play/IslandMissionPanel.ts');

function documentFixture() {
    const dom = new JSDOM(`<main id="fjord-play"><nav id="fjord-navigation"></nav>
        <section class="fjord-stage"><section id="fjord-management"><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden></section><div id="mission-host"></div></section>
        <button id="fjord-attention"><span id="fjord-attention-count"></span></button></main>`,
    { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement', 'HTMLButtonElement',
        'HTMLDialogElement', 'AbortController', 'CustomEvent']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    previous.matchMedia = globalThis.matchMedia;
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
    return { dom, restore() {
        dom.window.close();
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
        }
    } };
}

test('desktop and mobile occupational home panels set bounded targets without debiting inputs or closing the task', () => {
    const fixture = documentFixture();
    let ui;
    try {
        for (const mobile of [false, true]) {
            globalThis.matchMedia = () => ({ matches: mobile });
            let state = core.createCampaign(32, { initialMaterials: 100 });
            state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
            const session = new GameplaySession();
            session.loadJSON(core.serializeState(state));
            const owner = new SharedSettlement(session), notices = [];
            const refresh = () => ui.refresh(session.readSnapshot(), owner.selection, '', () => '');
            ui = new FjordInterface(owner, { select() {}, refresh, notify: text => notices.push(text),
                commit(commands, done) {
                    session.commandBatch(typeof commands === 'function' ? commands() : commands);
                    done();
                } });
            owner.select({ kind: 'household', id: Object.values(state.households).find(home => home.memberIds.includes('founder-1')).id });
            refresh();
            const open = document.querySelector('button[data-ui="smithery"]');
            assert.ok(open, 'An existing craftsperson home exposes production');
            ui.handle(open);
            assert.ok(document.querySelector('[aria-label="Smithery production"]'));
            const inputs = document.querySelectorAll('[data-smithery-target]');
            assert.equal(inputs.length, 3);
            const materials = session.readSnapshot().stocks.materials;
            const spear = document.querySelector('[data-smithery-target="woodenSpear"]');
            spear.value = '2';
            spear.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
            assert.equal(session.readSnapshot().smithery.targets.woodenSpear, 2);
            assert.equal(session.readSnapshot().stocks.materials, materials);
            assert.ok(document.querySelector('[aria-label="Smithery production"]'), 'Target edits keep the contextual task open');
            const before = session.saveJSON(), invalid = document.querySelector('[data-smithery-target="woodenSpear"]');
            invalid.value = '-1';
            invalid.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
            assert.equal(session.saveJSON(), before);
            assert.match(notices.at(-1), /whole stock target/);
            ui.dispose(); ui = undefined;
        }
    } finally { ui?.dispose(); fixture.restore(); }
});

test('Pillage preparation selectors assign distinct real stock, disable shortages and never create a third slot', () => {
    const fixture = documentFixture();
    let panel;
    try {
        globalThis.matchMedia = () => ({ matches: true });
        const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
        const world = { waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
            navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
            settlement: { center: { x: 64, z: 128 }, harbor: null },
            rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
                bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 } };
        let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 100 }), world, 'smithery-dom');
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Mixed crew',
            memberIds: ['founder-1', 'founder-2'] });
        state.smithery.stored.woodenSpear = 1;
        // This rendering fixture uses no mapped target or physical operation.
        const session = { readSnapshot: () => state };
        panel = new IslandMissionPanel(document.querySelector('#mission-host'), session,
            command => { state = core.applyCommand(state, command); }, () => ({}), () => {}, () => {}, () => {});
        panel.refresh();
        const input = document.querySelector('[data-equipment-person="founder-1"][data-equipment-slot="weapon"]');
        assert.ok(input);
        input.value = 'woodenSpear';
        input.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
        assert.equal(state.smithery.assignments['founder-1'].weapon, 'woodenSpear');
        assert.equal(state.smithery.stored.woodenSpear, 0);
        const other = document.querySelector('[data-equipment-person="founder-2"][data-equipment-slot="weapon"]');
        assert.ok(other.querySelector('[value="woodenSpear"]').disabled);
        assert.equal(document.querySelectorAll('[data-equipment-slot]').length, 4);
        assert.equal(document.querySelector('[data-equipment-slot="body"]'), null);
        assert.match(document.querySelector('[aria-label="Personal Pillage risks"]').textContent, /65%/);
    } finally { panel?.dispose(); fixture.restore(); }
});

test('real management transactions commit Smithery targets together and reject invalid batches atomically', () => {
    const session = new GameplaySession(32);
    const before = session.readSnapshot();
    session.commandBatch([
        { type: 'SetSmitheryTarget', item: 'woodenSpear', target: 2 },
        { type: 'SetSmitheryTarget', item: 'woodenShield', target: 1 }
    ]);
    const after = session.readSnapshot();
    assert.equal(after.smithery.targets.woodenSpear, 2);
    assert.equal(after.smithery.targets.woodenShield, 1);
    assert.deepEqual(after.stocks, before.stocks);
    assert.deepEqual(after.time, before.time);
    assert.equal(after.rngState, before.rngState);
    assert.equal(before.smithery.targets.woodenSpear, 0, 'The old UI snapshot stays immutable');
    const saved = session.saveJSON();
    assert.throws(() => session.commandBatch([
        { type: 'SetSmitheryTarget', item: 'woodenSpear', target: 3 },
        { type: 'SetSmitheryTarget', item: 'woodenShield', target: 21 }
    ]), /target/);
    assert.equal(session.saveJSON(), saved);
    assert.equal(session.readSnapshot(), after, 'A rejected batch does not publish a new UI revision');
    assert.throws(() => session.commandBatch([{ type: 'AdvanceTicks', ticks: 1 }]), /unsupported/);
});
