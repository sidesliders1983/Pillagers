import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { encounterFixture } from './encounter-fixture.mjs';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { IslandMissionPanel } = loadDOMSource('../src/fjord-play/IslandMissionPanel.ts');
const { ExpeditionPanel } = loadDOMSource('../src/fjord-play/ExpeditionPanel.ts');
const { renderMissionOutcome } = loadDOMSource('../src/fjord-play/MissionOutcomeView.ts');
const { territoryNotice } = loadDOMSource('../src/fjord-play/TerritoryView.ts');
const { createFjordLayout, projectFjordSettlement } = loadDOMSource('../src/fjord-play/FjordProjection.ts');
const { projectRivalSettlement, inspectRivalSettlement } = loadDOMSource('../src/fjord-play/RivalSettlement.ts');

function withMissionPanel(check, { fatalWinter = false } = {}) {
    const setup = encounterFixture({ members: 1 });
    if (fatalWinter) {
        setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
        setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    }
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
    session.loadJSON(core.serializeState(setup.state));
    session.bindPhysicalWorld(setup.context.world, setup.context.worldId);
    let panel, expeditions;
    try {
        panel = new IslandMissionPanel(document.querySelector('#groups'), session,
            command => session.command(command), members => Object.fromEntries(members.map(id =>
                [id, { ...session.readSnapshot().residentPresence.residents[id].position }])),
            () => {}, () => {}, () => {});
        panel.refresh();
        check({ session, panel, setup,
            mountExpeditions() {
                expeditions = new ExpeditionPanel(document.querySelector('#exploration'), session,
                    command => session.command(command), () => {}, members => Object.fromEntries(members.map(id =>
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

test('a new physical Pillage quote distinguishes real combat from the separately quoted travel hazard', () => {
    withMissionPanel(({ session, panel, setup }) => {
        const before = session.saveJSON();
        panel.openPreparation('Pillage', setup.target.siteId);
        const summary = document.querySelector('#island-mission-summary').textContent;
        assert.equal(document.querySelector('dialog').hasAttribute('open'), true);
        assert.match(summary, /actual present defenders and personal equipment/i);
        assert.match(summary, /Travel hazard: 0%/);
        assert.match(summary, /provisional/i);
        assert.doesNotMatch(summary, /Success:|Casualty risk per member:|Risk per member:/);
        assert.equal(session.saveJSON(), before, 'An encounter quote cannot resolve combat or spend Food');
        document.querySelector('[data-island-cancel]').click();
        assert.equal(session.saveJSON(), before, 'Back retains the campaign and its equipment');
    });
});

test('captured assets are shown as in transit with a factual on-site outcome before any return report', () => {
    withMissionPanel(({ session, panel, setup, mountExpeditions }) => {
        panel.openPreparation('Pillage', setup.target.siteId);
        document.querySelector('[data-island-confirm]').click();
        let mission;
        for (let tick = 0; tick < 500; tick++) {
            session.command({ type: 'AdvanceTicks', ticks: 1 });
            mission = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
            if (mission.manifest?.status === 'in-transit' && mission.manifest.food > 0) break;
        }
        assert.equal(mission.manifest?.status, 'in-transit');
        assert.equal(mission.manifest.food, 10);
        assert.equal(mission.encounter.outcome, 'undefended');
        assert.equal(mission.result, null, 'A local capture has no return report yet');
        const before = session.saveJSON();
        panel.refresh();
        const panelText = document.querySelector('#island-mission-panel').textContent;
        assert.match(panelText, /On-site encounter resolved/);
        assert.match(panelText, /In transit/);
        assert.match(panelText, /unavailable in home stocks/);
        assert.match(panelText, /10 Food/);
        assert.doesNotMatch(panelText, /island-rival:|encounter-rival|defenderIds/);
        mountExpeditions();
        const toolbar = document.querySelector('#expedition-mode').textContent;
        assert.match(toolbar, /On-site encounter resolved/);
        assert.match(toolbar, /In transit/);
        assert.match(toolbar, /unavailable in home stocks/);
        assert.equal(session.saveJSON(), before, 'Opening either panel cannot deliver or reroll the capture');
    });
});

test('a lost physical party has a factual loss report and no active return or homecoming controls', () => {
    withMissionPanel(({ session, panel, setup, mountExpeditions }) => {
        panel.openPreparation('Pillage', setup.target.siteId);
        document.querySelector('[data-island-confirm]').click();
        session.command({ type: 'AdvanceTicks', ticks: 1000 - session.readSnapshot().time.tick });
        const lost = core.inspectSpatialExpeditions(session.readSnapshot()).missions.at(-1);
        assert.equal(lost.status, 'Lost');
        assert.equal(lost.returnedAt, null);
        assert.equal(lost.result.success, false);
        const before = session.saveJSON();
        panel.refresh();
        assert.equal(document.querySelector('[data-island-return]'), null, 'No dead party can be recalled');
        assert.match(document.querySelector('#island-mission-panel').textContent, /No survivors/);
        assert.doesNotMatch(document.querySelector('#island-mission-panel').textContent,
            /Home again|Return group home|Returning home/);
        mountExpeditions();
        assert.equal(document.querySelector('[data-recall]'), null);
        assert.equal(document.querySelector('#expedition-mode').hidden, true);
        assert.match(document.querySelector('#exploration').textContent, /Previous expedition: Expedition lost/);
        const event = session.readSnapshot().events.find(event => event.type === 'ExpeditionLost' &&
            event.details?.missionId === lost.id);
        const report = document.createElement('section');
        report.innerHTML = renderMissionOutcome(session.readSnapshot(), event);
        assert.match(report.textContent, /Expedition lost/);
        assert.match(report.textContent, /No party returned/);
        assert.doesNotMatch(report.textContent, /Succeeded|Returned crew/);
        assert.equal(session.saveJSON(), before, 'Rendering a terminal loss never invents a homecoming');
    }, { fatalWinter: true });
});

function projectionWorld(physicalWorld, seed) {
    const cells = physicalWorld.terrain.heights.length;
    return { ...physicalWorld,
        config: { seed, generatorVersion: 'fjordside-v0.1', preset: 'fjord', width: 320, depth: 256,
            relief: 0, forestDensity: 0, conifers: 'ez-tree' },
        coast: [], placementPlan: [],
        settlement: { ...physicalWorld.settlement,
            bounds: { minX: 24, maxX: 112, minZ: 80, maxZ: 184 }, elevation: 0,
            buildings: [], accessPaths: [], harbor: { x: 64, z: 128 } },
        validation: { accepted: true, reasons: [], connectedBuildings: 0, connectedArea: 81920,
            maximumFoundationSlope: 0, minimumFoundationElevation: 0, score: 1 },
        biomes: { cells: Array(cells).fill('grass'), waterDistance: Array(cells).fill(100),
            moisture: Array(cells).fill(0), worn: Array(cells).fill(0),
            coverage: { water: 0, shore: 0, clearing: 0, grass: 1, forest: 0, rock: 0 } },
    };
}

function capturedAnimalForProjection() {
    const setup = encounterFixture({ members: 1 });
    const world = projectionWorld(setup.context.world, setup.state.seed);
    setup.context.world = world;
    const originalSource = setup.state.world.targetClans[setup.rivalId];
    const originalView = projectRivalSettlement(originalSource, world);
    const actualAnimals = originalView.entities.filter(entity => entity.kind === 'cattle' && entity.transform);
    assert.ok(actualAnimals.some(entity => Math.hypot(entity.transform.x - 160, entity.transform.z - 128) <= 8));
    setup.context.livestockPositionsByClan = { [setup.rivalId]: Object.fromEntries(actualAnimals.map(entity =>
        [entity.id, { x: entity.transform.x, z: entity.transform.z }])) };
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Cattle'] }, setup.context);
    let animalId;
    for (let tick = 0; tick < 500; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        animalId = core.inspectSpatialExpeditions(state).missions.at(-1).manifest?.cattleIds[0];
        if (animalId) break;
    }
    assert.ok(animalId, 'Capture is a genuine Core receipt using an actual source animal');
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2 }, setup.context);
    return { state, setup, world, originalView, animalId };
}

test('one real captured animal follows its saved custody position and reached trail instead of remaining at home', () => {
    const { state, setup, world, originalView, animalId } = capturedAnimalForProjection();
    const source = state.world.targetClans[setup.rivalId], custody = source.custody.livestock[animalId];
    const before = core.serializeState(state);
    const sourceView = projectRivalSettlement(source, world, originalView.layout);
    const projected = sourceView.entities.filter(entity => entity.id === animalId);
    assert.equal(projected.length, 1);
    assert.deepEqual({ x: projected[0].transform.x, z: projected[0].transform.z }, custody.position);
    assert.deepEqual(projected[0].status.presence.route, custody.reachedRoute,
        'Only actual crossed movement enters the scene, never the future custody route');
    const localView = projectFjordSettlement(state, world, createFjordLayout(world));
    assert.equal(localView.entities.some(entity => entity.id === animalId), false,
        'The recipient has no duplicate household animal before arrival');
    const observed = inspectRivalSettlement(state, world, sourceView).entities.find(entity => entity.id === animalId);
    assert.ok(observed);
    assert.equal(observed.label, 'Observed livestock');
    assert.equal(core.serializeState(state), before, 'Projection cannot transfer, advance or release custody');
});

test('a captured animal changes presentation owner at its actual arrival position without a duplicate or jump home', () => {
    const { state, setup, world, originalView, animalId } = capturedAnimalForProjection();
    const beforeArrival = projectFjordSettlement(state, world, createFjordLayout(world));
    const arrived = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 }, setup.context);
    const receipt = arrived.events.find(event => event.type === 'LivestockTransferredIn' &&
        event.details?.livestockId === animalId);
    assert.ok(receipt?.details?.arrivalPosition, 'The actual transfer records its physical handoff');
    const before = core.serializeState(arrived);
    const localView = projectFjordSettlement(arrived, world, beforeArrival.layout);
    const sourceView = projectRivalSettlement(arrived.world.targetClans[setup.rivalId], world, originalView.layout);
    const owned = localView.entities.filter(entity => entity.id === animalId);
    assert.equal(owned.length, 1);
    assert.equal(sourceView.entities.some(entity => entity.id === animalId), false);
    assert.deepEqual({ x: owned[0].transform.x, z: owned[0].transform.z }, receipt.details.arrivalPosition);
    assert.equal(owned[0].status.sex, arrived.landing.cattle[animalId].sex);
    assert.equal(core.serializeState(arrived), before);
});

test('a real captured person retains one body in custody and hands off at the recorded arrival reference', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    const world = projectionWorld(setup.context.world, setup.state.seed);
    setup.context.world = world;
    setup.state.smithery.stored.leatherShield = setup.memberIds.length;
    for (const personaId of setup.memberIds) setup.state = core.applyCommand(setup.state,
        { type: 'AssignEquipment', personaId, slot: 'shield', item: 'leatherShield' }, setup.context);
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['People'] }, setup.context);
    let personId;
    for (let tick = 0; tick < 500; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        personId = core.inspectSpatialExpeditions(state).missions.at(-1).manifest?.personaIds[0];
        if (personId) break;
    }
    assert.ok(personId);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2 }, setup.context);
    const source = state.world.targetClans[setup.rivalId], custody = source.custody.people[personId];
    const before = core.serializeState(state);
    const remote = projectRivalSettlement(source, world);
    const body = remote.entities.filter(entity => entity.kind === 'persona' && entity.id === personId);
    assert.equal(body.length, 1);
    assert.deepEqual({ x: body[0].transform.x, z: body[0].transform.z }, custody.position);
    assert.deepEqual(body[0].status.presence.route, custody.reachedRoute);
    const local = projectFjordSettlement(state, world, createFjordLayout(world));
    assert.equal(local.entities.some(entity => entity.kind === 'persona' && entity.id === personId), false);
    for (const casualty of core.inspectSpatialExpeditions(state).missions.at(-1).encounter.casualtyIds)
        assert.equal(local.entities.some(entity => entity.kind === 'persona' && entity.id === casualty), false,
            'An actual on-site casualty has no living presentation body');
    assert.equal(core.serializeState(state), before);
    let arrived = state, receipt;
    for (let tick = 0; tick < 500; tick++) {
        arrived = core.applyCommand(arrived, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        receipt = arrived.events.find(event => event.type === 'PersonaTransferredIn' && event.personaId === personId);
        if (receipt) break;
    }
    assert.ok(receipt?.details?.arrivalPosition);
    assert.deepEqual(arrived.residentPresence.residents[personId].position, receipt.details.arrivalPosition,
        'The new domestic reference starts at the actual handoff, including indoor placement');
    const finalLocal = projectFjordSettlement(arrived, world, local.layout);
    const finalRemote = projectRivalSettlement(arrived.world.targetClans[setup.rivalId], world, remote.layout);
    assert.equal(finalLocal.entities.filter(entity => entity.kind === 'persona' && entity.id === personId).length, 1);
    assert.equal(finalRemote.entities.some(entity => entity.kind === 'persona' && entity.id === personId), false);
});

test('an engaged living raider faces an actual observed defender without adding actors or resolving an exchange', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 4, exchangeTicks: 25 } });
    const world = projectionWorld(setup.context.world, setup.state.seed);
    setup.context.world = world;
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    let mission;
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        mission = core.inspectSpatialExpeditions(state).missions.at(-1);
        if (mission.encounter.phase === 'engaging') break;
    }
    assert.equal(mission.encounter.phase, 'engaging');
    const before = core.serializeState(state);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const body = view.entities.find(entity => entity.kind === 'persona' && entity.id === setup.memberIds[0]);
    assert.equal(body.status.encounter.phase, 'engaging');
    assert.equal(body.status.encounter.id, mission.encounter.id);
    const record = state.world.encounters.records[mission.encounter.id];
    const actualDefenders = record.defenderIds.map(id => state.world.targetClans[setup.rivalId]
        .residentPresence.residents[id].position);
    assert.ok(actualDefenders.some(point => point.x === body.status.encounter.facing.x &&
        point.z === body.status.encounter.facing.z), 'Facing uses an actual saved participant position');
    assert.equal(view.entities.filter(entity => entity.kind === 'persona').length,
        Object.values(state.personas).filter(person => person.deathWinter === null).length);
    assert.equal(core.serializeState(state), before, 'Scene readiness never creates attacks, damage or RNG');
});

test('a real on-site engagement notice keeps withdrawal available without claiming combat is unavailable', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 4, exchangeTicks: 25 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        if (core.inspectSpatialExpeditions(state).missions.at(-1).encounter.phase === 'engaging') break;
    }
    const before = core.serializeState(state);
    const notice = territoryNotice(state, 'group-1', 'island');
    assert.match(notice, /Engagement in progress/);
    assert.match(notice, /Withdraw group/);
    assert.doesNotMatch(notice, /combat is not available|defenderIds|island-rival:/);
    assert.equal(core.serializeState(state), before);
});

test('an actual defender retreat is labelled as observed defenders withdrawing while the party retains its operation', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 1, disengageTicks: 5 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
        if (mission.encounter.phase === 'withdrawing') break;
    }
    const mission = core.inspectSpatialExpeditions(state).missions.at(-1);
    assert.equal(mission.encounter.withdrawingSide, 'defender');
    const before = core.serializeState(state);
    const notice = territoryNotice(state, 'group-1', 'island');
    assert.match(notice, /Observed defenders are withdrawing/);
    assert.match(notice, /Withdraw group/);
    assert.doesNotMatch(notice, /The expedition is withdrawing|defenderIds|island-rival:/);
    assert.equal(core.serializeState(state), before);
});
