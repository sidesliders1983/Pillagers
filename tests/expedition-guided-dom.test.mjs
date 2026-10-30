import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { ExpeditionPanel } = loadDOMSource('../src/fjord-play/ExpeditionPanel.ts');
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

function fixture(food = 15, members = ['founder-1']) {
    const dom = new JSDOM('<main id="fjord-play" class="fjord-stage">' +
        '<section id="fjord-workspace" data-surface="expeditions"><div id="panel"></div></section>' +
        '<nav id="fjord-navigation"></nav></main>', { pretendToBeVisual: true });
    const globals = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLButtonElement', 'HTMLDetailsElement', 'HTMLDialogElement',
        'AbortController', 'CustomEvent', 'Event', 'matchMedia'];
    const previous = Object.fromEntries(globals.map(name => [name, globalThis[name]]));
    for (const name of globals) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = dom.window.matchMedia = () => ({ matches: false });
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute('open');
        this.dispatchEvent(new dom.window.Event('close'));
    };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: food }), world, 'guided-menu');
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: members });
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    session.bindPhysicalWorld(world, 'guided-menu');
    session.setRunning(false);
    const workspace = document.querySelector('#fjord-workspace');
    let panel, missions;
    panel = new ExpeditionPanel(document.querySelector('#panel'), session, command => {
        session.command(command);
        panel.committed(command);
        missions?.committed(command);
    }, () => {}, ids => Object.fromEntries(ids.map(id => [id, { ...world.settlement.center }])), {
        showMap: () => { workspace.hidden = true; },
        showGroups: () => { workspace.hidden = false; },
        focus() {}, toggleClock() {}, workspaceChanged: () => missions?.refresh(),
    });
    missions = new IslandMissionPanel(document.querySelector('#panel'), session, command => {
        session.command(command); panel.committed(command); missions.committed(command);
    }, ids => Object.fromEntries(ids.map(id => [id, { ...world.settlement.center }])),
    () => { workspace.hidden = true; }, () => { workspace.hidden = false; }, () => {}, () => {}, {
        groupId: () => panel.selectedGroupId,
        visible: () => panel.missionsOpen,
        open: () => panel.openMissions(),
    });
    panel.refresh(); missions.refresh();
    return {
        panel, session, workspace,
        button(label) {
            const scope = document.querySelector('dialog[open]') ?? document;
            const found = Array.from(scope.querySelectorAll('button')).find(node => node.textContent.trim() === label);
            assert.ok(found, `Player can find ${label}`);
            return found;
        },
        dispose() { missions.dispose(); panel.dispose(); dom.window.close(); Object.assign(globalThis, previous); },
    };
}

test('guided crew and supplies steps preserve the complete campaign and manual pause', () => {
    const app = fixture();
    try {
        const before = app.session.saveJSON();
        app.button('Continue to supplies').click();
        assert.match(document.querySelector('[aria-current="step"]').textContent, /Supplies/);
        assert.match(document.querySelector('#panel').textContent, /8 Food/);
        assert.equal(app.session.saveJSON(), before);
        assert.equal(app.session.running, false);
        app.button('Back to crew').click();
        assert.match(document.querySelector('[aria-current="step"]').textContent, /Crew/);
        assert.equal(document.activeElement, app.button('Continue to supplies'));
        assert.equal(app.session.saveJSON(), before);
    } finally { app.dispose(); }
});

test('packing exposes destination controls and cancelling a map choice preserves the paid pack', () => {
    const app = fixture();
    try {
        const untouched = app.session.saveJSON();
        app.button('Continue to supplies').click();
        app.button('Review supplies').click();
        assert.equal(app.session.saveJSON(), untouched);
        app.button('Back').click();
        assert.equal(app.session.saveJSON(), untouched);
        app.button('Review supplies').click();
        app.button('Pack supplies').click();
        const prepared = app.session.saveJSON();
        assert.equal(app.session.readSnapshot().stocks.food, 7);
        assert.equal(core.inspectSpatialExpeditions(app.session.readSnapshot()).missions[0].status, 'Prepared');
        assert.equal(document.querySelector('[aria-label="Exploration controls"]').hidden, false,
            'The next step and its cancellation are visible immediately after payment');
        app.button('Cancel').click();
        assert.equal(app.session.saveJSON(), prepared);
        app.workspace.hidden = false;
        app.panel.refresh();
        app.button('Choose destination').click();
        assert.equal(app.panel.chooseTarget({ x: 224, z: 128 }), true);
        assert.equal(app.session.readSnapshot().stocks.food, 7);
        assert.equal(core.inspectSpatialExpeditions(app.session.readSnapshot()).missions[0].status, 'Traveling');
        assert.equal(app.session.running, false);
        const travelling = app.session.saveJSON();
        assert.equal(app.panel.chooseTarget({ x: 256, z: 128 }), false);
        assert.equal(app.session.saveJSON(), travelling);
    } finally { app.dispose(); }
});


test('Explore and Known places share the selected group without dispatching or changing the clock', () => {
    const app = fixture();
    try {
        const before = app.session.saveJSON();
        app.button('Known places').click();
        const missions = document.querySelector('[aria-label="Physical island missions"]');
        assert.equal(missions.hidden, false);
        assert.match(missions.textContent, /No settlement has been sighted/);
        assert.equal(document.querySelector('#island-mission-group'), null,
            'There is one visible group choice, not an independent second selector');
        assert.equal(app.session.saveJSON(), before);
        app.button('Explore island').click();
        assert.equal(missions.hidden, true);
        app.button('New group').click();
        const created = app.session.saveJSON();
        app.button('Known places').click();
        assert.match(missions.textContent, /Group 2/);
        assert.match(missions.textContent, /Add eligible residents/);
        assert.equal(app.session.saveJSON(), created);
        assert.equal(app.session.running, false);
    } finally { app.dispose(); }
});


test('ending a paid pack and disbanding at home each require a real confirmation with a safe Back', () => {
    const app = fixture();
    try {
        app.button('Continue to supplies').click();
        app.button('Review supplies').click();
        app.button('Pack supplies').click();
        app.button('Cancel').click();
        app.workspace.hidden = false;
        app.panel.refresh();
        const prepared = app.session.saveJSON();
        app.button('End expedition').click();
        assert.match(document.querySelector('dialog[open]')?.textContent ?? '', /discarded.*refund/s);
        assert.equal(app.session.saveJSON(), prepared);
        app.button('Back').click();
        assert.equal(app.session.saveJSON(), prepared);
        app.button('End expedition').click();
        app.button('End expedition').click();
        assert.equal(app.session.readSnapshot().stocks.food, 7);
        assert.equal(core.inspectSpatialExpeditions(app.session.readSnapshot()).missions[0].status, 'Returned');
        assert.match(document.querySelector('#panel').textContent, /Previous expedition: Expedition ended/);
        const atHome = app.session.saveJSON();
        app.button('Disband group').click();
        assert.equal(app.session.saveJSON(), atHome);
        app.button('Back').click();
        assert.equal(app.session.saveJSON(), atHome);
        app.button('Disband group').click();
        app.button('Disband group').click();
        assert.equal(Object.keys(app.session.readSnapshot().world.groups).length, 0);
        assert.equal(app.session.readSnapshot().stocks.food, 7);
        assert.equal(app.session.running, false);
    } finally { app.dispose(); }
});
