import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { IslandMissionPanel } = loadDOMSource('../src/fjord-play/IslandMissionPanel.ts');
const { ExpeditionPanel } = loadDOMSource('../src/fjord-play/ExpeditionPanel.ts');
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};

function campaign() {
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }), world, 'recon-ui');
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8 }]));
    const rival = state.world.targetClans['island-rival'];
    const context = { world, worldId: 'recon-ui', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: { minX: 32, maxX: 128, minZ: 64, maxZ: 192 }, homes: homes(state, 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center,
            bounds: world.rivalSite.bounds, homes: homes(rival, 216) },
    ] };
    state = core.initializeTerritorialAwareness(state, context);
    return core.applyCommand(state, { type: 'CreateExpeditionGroup',
        name: 'Coast watchers', memberIds: ['founder-1'] }, context);
}

function withPanel(check) {
    const dom = new JSDOM('<main id="fjord-play" class="fjord-stage">' +
        '<section id="fjord-workspace" data-surface="expeditions">' +
        '<section id="groups"></section><section id="exploration"></section></section>' +
        '<nav id="fjord-navigation"></nav></main>', { pretendToBeVisual: true });
    const names = ['window', 'document', 'Node', 'HTMLElement', 'Element', 'HTMLButtonElement',
        'HTMLSelectElement', 'HTMLInputElement', 'HTMLDetailsElement', 'HTMLDialogElement',
        'AbortController', 'CustomEvent', 'Event', 'matchMedia'];
    const previous = Object.fromEntries(names.map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = dom.window.matchMedia = () => ({ matches: false });
    dom.window.HTMLElement.prototype.scrollIntoView = () => {};
    dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(campaign()));
    let exclusions = [];
    session.bindPhysicalWorld(world, 'recon-ui', () => exclusions);
    let panel, expeditions;
    try {
        panel = new IslandMissionPanel(document.querySelector('#groups'), session,
            command => session.command(command), members => Object.fromEntries(members.map(id =>
                [id, { ...session.readSnapshot().residentPresence.residents[id].position }])),
            () => {}, () => {}, () => {});
        panel.refresh();
        check({ session, panel, setExclusions: next => { exclusions = next; },
            mountExpeditions() {
                expeditions = new ExpeditionPanel(document.querySelector('#exploration'), session,
                    command => session.command(command), () => {},
                    members => Object.fromEntries(members.map(id =>
                        [id, { ...session.readSnapshot().residentPresence.residents[id].position }])),
                    { showMap() {}, showGroups() {}, focus() {}, toggleClock() {} });
                expeditions.refresh();
                return expeditions;
            },
        });
    } finally {
        expeditions?.dispose();
        panel?.dispose();
        dom.window.close();
        Object.assign(globalThis, previous);
    }
}

test('Recon review explains planned observation coverage before payment and Back preserves the campaign', () => {
    withPanel(({ session, panel }) => {
        const before = session.saveJSON();
        document.querySelector('[data-island-area]').click();
        assert.equal(panel.chooseTarget({ x: 128, z: 128 }), true);
        assert.equal(document.querySelector('dialog').hasAttribute('open'), true);
        const summary = document.querySelector('#island-mission-summary').textContent;
        assert.match(summary, /Planned observation/);
        assert.match(summary, /viewpoints/);
        assert.match(summary, /travel and return/);
        assert.match(summary, /observation ticks/);
        assert.match(summary, /2 Food/);
        assert.equal(session.saveJSON(), before, 'Review is read-only');
        document.querySelector('[data-island-cancel]').click();
        assert.equal(session.saveJSON(), before, 'Back neither pays nor creates a mission');
    });
});

test('a changed safe Recon route requires a new review even when its Food and duration are unchanged', () => {
    withPanel(({ session, panel, setExclusions }) => {
        const target = { kind: 'area', position: { x: 128, z: 128 } };
        const original = session.islandMissionOffer('group-1', target, 'Recon');
        document.querySelector('[data-island-area]').click();
        panel.chooseTarget(target.position);
        const before = session.saveJSON();
        setExclusions([{ minX: 80, maxX: 88, minZ: 96, maxZ: 144 }]);
        const changed = session.islandMissionOffer('group-1', target, 'Recon');
        assert.equal(changed.foodCost, original.foodCost);
        assert.equal(changed.duration, original.duration);
        assert.notEqual(changed.observationRoute.planKey, original.observationRoute.planKey);
        document.querySelector('[data-island-confirm]').click();
        assert.match(document.querySelector('#island-mission-summary').textContent,
            /route or conditions changed.*Review the mission again/);
        assert.equal(session.saveJSON(), before, 'A stale route confirmation neither pays nor dispatches');
        assert.equal(document.querySelector('dialog').hasAttribute('open'), true);
    });
});

test('active Recon shows reached viewpoints and truthful settlement sightings, then recalls through the existing action', () => {
    withPanel(({ session, panel, mountExpeditions }) => {
        document.querySelector('[data-island-area]').click();
        panel.chooseTarget({ x: 128, z: 128 });
        document.querySelector('[data-island-confirm]').click();
        session.command({ type: 'AdvanceTicks', ticks: 60 });
        const reached = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        assert.ok(reached.recon.reachedViewpoints > 0);
        assert.equal(reached.recon.observedViewpoints, 0, 'No settlement is visible from this area');
        const beforeRefresh = session.saveJSON();
        panel.refresh();
        assert.match(document.querySelector('#island-mission-panel').textContent,
            new RegExp(`${reached.recon.reachedViewpoints}/${reached.recon.plannedViewpoints} viewpoints reached`));
        assert.match(document.querySelector('#island-mission-panel').textContent, /0 settlement sightings/);
        mountExpeditions();
        assert.match(document.querySelector('#expedition-mode').textContent,
            new RegExp(`${reached.recon.reachedViewpoints}/${reached.recon.plannedViewpoints} viewpoints reached`));
        assert.match(document.querySelector('#expedition-mode').textContent, /0 settlement sightings/);
        assert.equal(session.saveJSON(), beforeRefresh, 'Rendering progress cannot advance or reveal the campaign');
        document.querySelector('[data-island-return]').click();
        const recalled = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        assert.equal(recalled.status, 'Returning');
        assert.equal(recalled.position.x, reached.position.x);
        assert.equal(recalled.position.z, reached.position.z);
        assert.equal(session.readSnapshot().stocks.food, 498, 'Recall does not pay again or refund provisions');
        session.command({ type: 'AdvanceTicks', ticks: 190 });
        const returned = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        assert.equal(returned.status, 'Returned');
        assert.equal(session.readSnapshot().events.filter(event => event.type === 'ExpeditionReturned').length, 1);
    });
});
