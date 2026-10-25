import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { IslandMissionPanel } = loadDOMSource('../src/fjord-play/IslandMissionPanel.ts');
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};
const context = { world, worldId: 'journey-preparation-ui' };
const apply = (state, command) => core.applyCommand(state, command, context);

test('Show me uses the actual mission offer and confirmation; unavailable routes show real reasons without dispatch', () => {
    const dom = new JSDOM('<main class="fjord-stage"><section id="groups"></section></main>', { pretendToBeVisual: true });
    const names = ['window', 'document', 'HTMLElement', 'Element', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLInputElement', 'AbortController'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    let panel;
    try {
        let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
            { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 },
            { enabled: false }, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
                casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } }), world, context.worldId);
        state = apply(state, { type: 'CreateExpeditionGroup', name: 'Actual crew', memberIds: ['founder-1'] });
        const session = new GameplaySession();
        const restore = state => { session.loadJSON(core.serializeState(state)); session.bindPhysicalWorld(world, context.worldId); };
        restore(state);
        let commands = 0;
        panel = new IslandMissionPanel(document.querySelector('#groups'), session,
            command => { commands++; session.command(command); }, members => Object.fromEntries(members.map(id => [id, { ...world.settlement.center }])),
            () => {}, () => {}, () => {});
        const before = session.saveJSON();
        panel.openPreparation('Recon');
        assert.equal(document.querySelector('[data-island-area]').disabled, false);
        assert.equal(document.querySelector('dialog').hasAttribute('open'), false);
        assert.equal(session.saveJSON(), before);
        assert.equal(commands, 0);
        state = apply(state, { type: 'StartExpedition', groupId: 'group-1' });
        state = apply(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
        state = apply(state, { type: 'AdvanceTicks', ticks: 80 });
        state = apply(state, { type: 'RecallExpedition', groupId: 'group-1' });
        state = apply(state, { type: 'AdvanceTicks', ticks: 80 });
        state = apply(state, { type: 'DispatchIslandMission', groupId: 'group-1',
            target: { kind: 'site', siteId: 'rival-pocket-1' }, mission: 'Recon' });
        state = apply(state, { type: 'AdvanceTicks', ticks: 250 });
        restore(state);
        const canonical = session.saveJSON();
        panel.openPreparation('Pillage', 'rival-pocket-1');
        assert.equal(document.querySelector('dialog').hasAttribute('open'), true);
        assert.match(document.querySelector('#island-mission-summary').textContent, /5 Food/);
        assert.equal(commands, 0);
        assert.equal(session.saveJSON(), canonical);
        document.querySelector('[data-island-cancel]').click();
        panel.openPreparation('Pillage', 'rival-pocket-1');
        document.querySelector('[data-island-confirm]').click();
        assert.equal(commands, 1, 'Only the actual existing confirmation dispatches');
        assert.notEqual(session.saveJSON(), canonical);
        const dispatched = session.saveJSON();
        panel.openPreparation('Pillage', 'rival-pocket-1');
        assert.match(document.querySelector('.island-mission-status').textContent, /Group already active|unavailable/);
        assert.equal(session.saveJSON(), dispatched);
        assert.equal(commands, 1);
    } finally {
        panel?.dispose(); dom.window.close(); Object.assign(globalThis, previous);
    }
});
