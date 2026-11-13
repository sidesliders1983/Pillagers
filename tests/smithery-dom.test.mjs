import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
import { craftedPersonalArmorFixture, personalArmorApply } from './personal-armor-fixture.mjs';
import { craftedPersonalArmorVariantsFixture } from './personal-armor-variants-fixture.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
const { IslandMissionPanel } = loadDOMSource('../src/fjord-play/IslandMissionPanel.ts');
const { renderRaiderEquipment, renderSmithery } = loadDOMSource('../src/fjord-play/SmitheryView.ts');

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
            assert.equal(inputs.length, 9);
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

test('Pillage preparation keeps four personal slots independent and disables unavailable real stock', () => {
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
        assert.equal(document.querySelectorAll('[data-equipment-slot]').length, 8);
        assert.ok(document.querySelector('[data-equipment-slot="bodyArmor"] [value="leatherBodyArmor"]').disabled);
        assert.ok(document.querySelector('[data-equipment-slot="headgear"] [value="ironHelmet"]').disabled);
        assert.ok(document.querySelector('[data-equipment-slot="bodyArmor"] [value="ironBodyArmor"]').disabled);
        assert.ok(document.querySelector('[data-equipment-slot="headgear"] [value="leatherHelmet"]').disabled);
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

test('adopted metalworking targets stay in existing management and cannot create free iron equipment', () => {
    const fixture = documentFixture();
    let ui;
    try {
        globalThis.matchMedia = () => ({ matches: true });
        let state = core.createCampaign(32, { initialMaterials: 100 });
        state = core.applyCommand(state, {
            type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith',
        });
        state = core.applyCommand(state, {
            type: 'SetSmitheryTarget', item: 'ironSpear', target: 1,
        });
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(state));
        const owner = new SharedSettlement(session), notices = [];
        const refresh = () => ui.refresh(session.readSnapshot(), owner.selection, '', () => '');
        ui = new FjordInterface(owner, {
            select() {}, refresh, notify: text => notices.push(text),
            commit(commands, done) {
                session.commandBatch(typeof commands === 'function' ? commands() : commands);
                done();
            },
        });
        owner.select({ kind: 'household', id: Object.values(state.households)
            .find(home => home.memberIds.includes('founder-1')).id });
        refresh();
        ui.handle(document.querySelector('button[data-ui="smithery"]'));
        const production = document.querySelector('[aria-label="Smithery production"]');
        assert.ok(production);
        assert.match(production.textContent, /Iron Ore/);
        assert.equal(production.querySelectorAll('[data-smithery-target]').length, 9);
        const target = production.querySelector('[data-smithery-target="ironShield"]');
        const before = session.readSnapshot();
        target.value = '2';
        target.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
        const after = session.readSnapshot();
        assert.equal(after.smithery.targets.ironShield, 2);
        assert.deepEqual(after.stocks, before.stocks);
        assert.deepEqual(after.specialistStocks, before.specialistStocks);
        assert.deepEqual(after.time, before.time);
        assert.equal(after.rngState, before.rngState);
        assert.equal(after.smithery.stored.ironSpear, 0);
        assert.equal(after.smithery.stored.ironShield, 0);
        assert.ok(document.querySelector('[aria-label="Smithery production"]'));
        assert.deepEqual(notices, ['Crafting target updated.']);
    } finally { ui?.dispose(); fixture.restore(); }
});

test('four-slot preparation uses real crafted armor and helmet stock without duplication or away reassignment', () => {
    const fixture = documentFixture();
    let panel;
    try {
        globalThis.matchMedia = () => ({ matches: true });
        let state = craftedPersonalArmorFixture({ physical: true });
        state = personalArmorApply(state, {
            type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-1', included: true,
        });
        panel = new IslandMissionPanel(document.querySelector('#mission-host'),
            { readSnapshot: () => state },
            command => { state = personalArmorApply(state, command); },
            () => ({}), () => {}, () => {}, () => {});
        panel.refresh();
        const choice = (person, slot) => document.querySelector(
            '[data-equipment-person="' + person + '"][data-equipment-slot="' + slot + '"]');
        const change = (person, slot, item) => {
            const input = choice(person, slot);
            assert.ok(input, 'Every named member has the actual requested slot');
            input.value = item;
            input.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
        };
        change('founder-1', 'bodyArmor', 'leatherBodyArmor');
        change('founder-1', 'headgear', 'ironHelmet');
        assert.equal(state.smithery.assignments['founder-1'].bodyArmor, 'leatherBodyArmor');
        assert.equal(state.smithery.assignments['founder-1'].headgear, 'ironHelmet');
        assert.equal(state.smithery.stored.leatherBodyArmor, 0);
        assert.equal(state.smithery.stored.ironHelmet, 0);
        assert.ok(choice('founder-2', 'bodyArmor').querySelector('[value="leatherBodyArmor"]').disabled);
        assert.ok(choice('founder-2', 'headgear').querySelector('[value="ironHelmet"]').disabled);
        change('founder-1', 'weapon', 'ironSpear');
        change('founder-1', 'shield', 'ironShield');
        const effects = document.createElement('div');
        effects.innerHTML = renderRaiderEquipment(state, ['founder-1', 'founder-2'], true);
        const ownText = effects.querySelector('[data-equipment-person="founder-1"]')
            .closest('fieldset').textContent;
        const allyText = effects.querySelector('[data-equipment-person="founder-2"]')
            .closest('fieldset').textContent;
        assert.match(ownText, /Own attack: \+15%/);
        assert.match(ownText, /Own protection:\s*60% \(combined cap:\s*60%\)/);
        assert.match(allyText, /Own attack: \+0%/);
        assert.match(allyText, /Own protection:\s*0%/,
            'A different resident must not inherit this personal protection');
        change('founder-1', 'bodyArmor', '');
        assert.equal(state.smithery.stored.leatherBodyArmor, 1);
        change('founder-2', 'bodyArmor', 'leatherBodyArmor');
        assert.equal(state.smithery.stored.leatherBodyArmor, 0);
        assert.equal(state.smithery.assignments['founder-2'].bodyArmor, 'leatherBodyArmor');
        state = personalArmorApply(state, { type: 'StartExpedition', groupId: 'group-1' });
        state = personalArmorApply(state, { type: 'ExploreArea', groupId: 'group-1',
            target: state.mining.sites[0].approach });
        assert.equal(core.personaAway(state, 'founder-1'), true);
        panel.refresh();
        assert.ok(choice('founder-1', 'headgear').disabled);
        assert.ok(choice('founder-2', 'bodyArmor').disabled);
        const before = core.serializeState(state);
        change('founder-1', 'headgear', '');
        assert.equal(core.serializeState(state), before, 'Away gear remains with its actual owner');
        assert.match(document.querySelector('.island-mission-status').textContent, /home/i);
    } finally { panel?.dispose(); fixture.restore(); }
});


test('both actual body and helmet variants share four slots and exchange only real paid stock', () => {
    const fixture = documentFixture();
    let panel;
    try {
        globalThis.matchMedia = () => ({ matches: true });
        let state = craftedPersonalArmorVariantsFixture({ physical: true });
        state = personalArmorApply(state, {
            type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-1', included: true,
        });
        panel = new IslandMissionPanel(document.querySelector('#mission-host'),
            { readSnapshot: () => state },
            command => { state = personalArmorApply(state, command); },
            () => ({}), () => {}, () => {}, () => {});
        panel.refresh();
        const choice = (person, slot) => document.querySelector(
            '[data-equipment-person="' + person + '"][data-equipment-slot="' + slot + '"]');
        const change = (person, slot, item) => {
            const input = choice(person, slot);
            input.value = item;
            input.dispatchEvent(new fixture.dom.window.Event('change', { bubbles: true }));
        };
        assert.equal(document.querySelectorAll('[data-equipment-slot]').length, 8);
        assert.deepEqual([...choice('founder-1', 'bodyArmor').options].map(option => option.value),
            ['', 'leatherBodyArmor', 'ironBodyArmor']);
        assert.deepEqual([...choice('founder-1', 'headgear').options].map(option => option.value),
            ['', 'leatherHelmet', 'ironHelmet']);
        change('founder-1', 'bodyArmor', 'ironBodyArmor');
        change('founder-1', 'headgear', 'leatherHelmet');
        change('founder-2', 'bodyArmor', 'leatherBodyArmor');
        change('founder-2', 'headgear', 'ironHelmet');
        assert.equal(state.smithery.assignments['founder-1'].bodyArmor, 'ironBodyArmor');
        assert.equal(state.smithery.assignments['founder-1'].headgear, 'leatherHelmet');
        assert.equal(state.smithery.stored.ironBodyArmor, 0);
        assert.equal(state.smithery.stored.leatherHelmet, 0);
        assert.ok(choice('founder-2', 'bodyArmor').querySelector('[value="ironBodyArmor"]').disabled);
        assert.ok(choice('founder-2', 'headgear').querySelector('[value="leatherHelmet"]').disabled);
        change('founder-2', 'bodyArmor', '');
        change('founder-1', 'bodyArmor', 'leatherBodyArmor');
        assert.equal(state.smithery.stored.ironBodyArmor, 1);
        change('founder-2', 'bodyArmor', 'ironBodyArmor');
        assert.equal(state.smithery.stored.ironBodyArmor, 0);
        const products = document.createElement('div');
        products.innerHTML = renderSmithery(state);
        const article = item => products.querySelector('[data-smithery-target="' + item + '"]').closest('article').textContent;
        assert.match(article('leatherHelmet'), /Leatherworker\s*·\s*2 Materials \+ 1 Hide/);
        assert.match(article('ironBodyArmor'), /Smith\s*·\s*3 Materials \+ 2 Hides \+ 2 Iron Ore/);
        const saved = core.serializeState(state);
        assert.equal(core.serializeState(core.reconstructState(saved)), saved);
        state = personalArmorApply(state, { type: 'StartExpedition', groupId: 'group-1' });
        state = personalArmorApply(state, { type: 'ExploreArea', groupId: 'group-1',
            target: state.mining.sites[0].approach });
        panel.refresh();
        assert.ok(choice('founder-1', 'headgear').disabled);
        assert.ok(choice('founder-2', 'bodyArmor').disabled);
        const before = core.serializeState(state);
        change('founder-2', 'bodyArmor', '');
        assert.equal(core.serializeState(state), before);
    } finally {
        panel?.dispose();
        fixture.restore();
    }
});
