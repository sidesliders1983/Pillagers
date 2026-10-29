import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { load } from './load-source.mjs';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const ships = loadTypeScript(new URL('../src/simulation/LongshipTransport.ts', import.meta.url));
const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 256 };
const heights = Array.from({ length: 1089 }, (_, i) => {
    const x = i % 33 * 8, z = Math.floor(i / 33) * 8;
    return x >= 80 && x <= 176 && z >= 80 && z <= 176 ? 2 : -4;
});
const world = {
    waterLevel: 0,
    terrain: { bounds, spacing: 8, columns: 33, rows: 33, heights },
    navigation: { bounds, spacing: 8, columns: 33, rows: 33, cells: heights.map(h => h > 0) },
    settlement: { center: { x: 128, z: 128 }, harbor: { x: 128, z: 72 } },
};
const context = { world, worldId: 'longship-fixture-v1',
    longshipOrigins: { 'founding-longship': { x: 128, z: 72, rotation: 0 } } };
const command = (state, action) => core.applyCommand(state, action, context);
const advance = (state, ticks) => command(state, { type: 'AdvanceTicks', ticks });
const mission = state => Object.values(state.world.spatial.missions).at(-1);
function prepared(testFoodPerMember) {
    let state = core.createCampaign(32, { initialFood: 500, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state = command(state, { type: 'CreateExpeditionGroup', name: 'Sea scouts', memberIds: ['founder-1', 'founder-2'] });
    return command(state, { type: 'StartExpedition', groupId: 'group-1',
        ...(testFoodPerMember === undefined ? {} : { testFoodPerMember }) });
}
function aboard(testFoodPerMember) {
    let state = command(prepared(testFoodPerMember), { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
    for (let i = 0; i < 60 && mission(state).transport.phase !== 'embarked'; i++) state = advance(state, 1);
    assert.equal(mission(state).transport.phase, 'embarked');
    return state;
}

test('boarding preserves the expedition and pack; a paid refill doubles capacity without creating Food', () => {
    let state = aboard();
    const before = state.stocks.food, pack = mission(state).provisions;
    const opening = { ...state.stocks }, eventOffset = state.events.length;
    assert.deepEqual(mission(state).memberIds, ['founder-1', 'founder-2']);
    const offer = ships.longshipFoodOffer(state, 'group-1', context);
    state = command(state, { type: 'LoadLongshipFood', groupId: 'group-1' });
    assert.equal(state.stocks.food, before - offer.foodCost);
    assert.equal(mission(state).provisions.foodPerMember, pack.foodPerMember);
    for (const supply of Object.values(mission(state).provisions.members))
        assert.equal(supply.food + Number(supply.rationTicks > 0), pack.foodPerMember * 2);
    const { bookLedger } = load('../src/lore/BookLedger.ts');
    const ledger = bookLedger(state.events.slice(eventOffset), opening, state.stocks);
    assert.equal(ledger.food.residual, 0);
    assert.equal(ledger.food.spending, offer.foodCost);
    assert.equal(ledger.provisions.reserved, offer.foodCost);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('sailing uses water routes at twice foot speed, persists exactly, and returns over the reserved land trail', () => {
    let state = command(aboard(), { type: 'ExploreArea', groupId: 'group-1', target: { x: 48, z: 128 } });
    state = advance(state, 4);
    assert.equal(mission(state).travelled, state.world.spatial.policy.metresPerTick * 2 * 4);
    const saved = core.reconstructState(core.serializeState(state));
    assert.deepEqual(advance(saved, 3), advance(state, 3));
    state = command(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = advance(state, 100);
    assert.equal(mission(state).status, 'Returned');
    assert.equal(state.landing.longships['founding-longship'].transport.groupId, null);
});

function reboardAtWesternShore(testFoodPerMember) {
    let state = command(aboard(testFoodPerMember), { type: 'ExploreArea', groupId: 'group-1', target: { x: 72, z: 128 } });
    for (let tick = 0; tick < 80 && mission(state).status === 'Traveling'; tick++) state = advance(state, 1);
    state = command(state, { type: 'DisembarkLongship', groupId: 'group-1' });
    const landReturn = structuredClone(mission(state).returnRoutes);
    state = command(core.reconstructState(core.serializeState(state)),
        { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
    assert.equal(mission(state).transport.phase, 'embarked');
    return { state, landReturn };
}

test('Return home after reboarding abroad sails to the original harbour before releasing its passengers', () => {
    let { state } = reboardAtWesternShore();
    const food = state.stocks.food, provisions = structuredClone(mission(state).provisions);
    state = command(state, { type: 'RecallExpedition', groupId: 'group-1' });
    assert.equal(state.stocks.food, food, 'Recall does not buy another pack');
    assert.deepEqual(mission(state).provisions, provisions);
    assert.equal(mission(state).status, 'Returning');
    state = advance(state, 1);
    assert.equal(mission(state).transport?.phase, 'embarked',
        'The crew must sail instead of stepping ashore at its remote boarding point');
    const restored = core.reconstructState(core.serializeState(state));
    ships.assertLongshipWorld(restored, context);
    assert.deepEqual(advance(restored, 2), advance(state, 2), 'Return sailing survives save/load exactly');
    let sailingTicks = 1;
    while (mission(state).transport?.phase === 'embarked' && sailingTicks < 200) {
        state = advance(state, 1);
        sailingTicks++;
    }
    assert.ok(sailingTicks > 1 && sailingTicks < 200);
    const hull = state.landing.longships['founding-longship'].transport;
    assert.equal(hull.x, context.longshipOrigins['founding-longship'].x);
    assert.equal(hull.z, context.longshipOrigins['founding-longship'].z);
    assert.equal(hull.groupId, null, 'Passengers are released only at the home harbour');
    state = advance(state, 100);
    assert.equal(mission(state).status, 'Returned');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('supply-triggered return after reboarding reserves sailing to the founding harbour', () => {
    let { state } = reboardAtWesternShore(1);
    for (let tick = 0; tick < 300 && mission(state).status !== 'Returning'; tick++) state = advance(state, 1);
    assert.equal(mission(state).status, 'Returning');
    assert.equal(mission(state).transport?.phase, 'embarked');
    state = advance(state, 200);
    assert.equal(mission(state).status, 'Returned');
    const hull = state.landing.longships['founding-longship'].transport;
    assert.equal(hull.x, context.longshipOrigins['founding-longship'].x);
    assert.equal(hull.z, context.longshipOrigins['founding-longship'].z);
});

test('a saved legacy return anchored at a remote shore resumes sailing home without teleporting or changing the import', () => {
    const { state, landReturn } = reboardAtWesternShore();
    const legacy = structuredClone(state), trip = mission(legacy);
    const remote = legacy.landing.longships['founding-longship'].transport;
    // Historical #248 saves used the latest boarding berth as home, even after reboarding abroad.
    trip.transport.homeSea = { x: remote.x, z: remote.z, rotation: remote.rotation };
    trip.transport.homeLandRoutes = landReturn;
    trip.transport.seaReturnRoute = [{ x: remote.x, z: remote.z }, { x: remote.x, z: remote.z }];
    trip.status = 'Returning';
    trip.returnFrom = 0;
    trip.travelled = 0;
    trip.outcome = 'Cancelled';
    const text = core.serializeState(legacy), restored = core.reconstructState(text);
    assert.equal(core.serializeState(restored), text, 'Loading itself does not rewrite canonical progress');
    const resumed = advance(restored, 1), hull = resumed.landing.longships['founding-longship'].transport;
    assert.equal(mission(resumed).transport?.phase, 'embarked');
    const distance = Math.hypot(hull.x - remote.x, hull.z - remote.z);
    assert.ok(distance > 0 && distance <= resumed.world.spatial.policy.metresPerTick * 2 + 1e-6);
    ships.assertLongshipWorld(resumed, context);
    assert.equal(mission(advance(resumed, 200)).status, 'Returned');
});

test('unsafe water destinations fail atomically; disembarking releases the same persistent ship', () => {
    let state = aboard();
    const serialized = core.serializeState(state);
    for (const target of [{ x: 128, z: 128 }, { x: 4, z: 32 }])
        assert.throws(() => command(state, { type: 'ExploreArea', groupId: 'group-1', target }), /water|sea|navigable/i);
    assert.equal(core.serializeState(state), serialized);
    assert.throws(() => command(state, { type: 'SalvageLongship', longshipId: 'founding-longship' }), /assigned|expedition/i);
    state = command(state, { type: 'DisembarkLongship', groupId: 'group-1' });
    assert.equal(mission(state).transport, undefined);
    assert.equal(mission(state).status, 'Exploring');
    assert.equal(state.landing.longships['founding-longship'].transport.groupId, null);
    state = command(state, { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
    state = advance(state, 2);
    assert.equal(mission(state).transport.phase, 'embarked');
});

test('landing away from home and boarding again switches directly to sailing, including after saving', () => {
    let state = aboard();
    for (const berth of [{ x: 72, z: 128 }, { x: 128, z: 184 }]) {
        state = command(state, { type: 'ExploreArea', groupId: 'group-1', target: berth });
        for (let tick = 0; tick < 80 && mission(state).status === 'Traveling'; tick++) state = advance(state, 1);
        assert.equal(mission(state).status, 'Exploring');
        state = command(state, { type: 'DisembarkLongship', groupId: 'group-1' });
        state = core.reconstructState(core.serializeState(state));
        const id = mission(state).id, food = state.stocks.food, pack = structuredClone(mission(state).provisions);
        const offer = ships.boardLongshipOffer(state, 'group-1', 'founding-longship', context);
        assert.equal(offer.alreadyThere, true, 'A landed crew is already at its ship’s embarkation shore');
        state = command(state, { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
        assert.equal(mission(state).transport.phase, 'embarked', 'No clock tick is required when everyone is at shore');
        assert.equal(mission(state).id, id);
        assert.equal(state.stocks.food, food);
        assert.deepEqual(mission(state).provisions, pack);
        const target = { x: 64, z: 64 };
        assert.doesNotThrow(() => core.exploreOffer(state, 'group-1', target, context));
        state = command(state, { type: 'ExploreArea', groupId: 'group-1', target });
        assert.equal(mission(state).transport.phase, 'embarked');
        state = advance(state, 2);
        assert.ok(mission(state).travelled > 0);
    }
});

test('the production island berth is boardable and projection uses actual residents on the persistent hull', () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const shared = new SharedSettlement(32, 123, true, 'island-pool-v1');
    shared.fjord.enableDiscovery();
    const save = JSON.parse(shared.fjord.exportJSON());
    save.campaign.stocks.food = 500;
    delete save.narrative;
    shared.importJSON(JSON.stringify(save));
    shared.command({ type: 'CreateExpeditionGroup', name: 'Actual crew',
        memberIds: ['founder-1', 'founder-2', 'founder-3', 'founder-4', 'founder-5'] });
    shared.command({ type: 'StartExpedition', groupId: 'group-1' });
    const origins = Object.fromEntries(shared.fjord.project().entities.filter(e =>
        e.kind === 'persona' && ['founder-1', 'founder-2', 'founder-3', 'founder-4', 'founder-5'].includes(e.id))
        .map(e => [e.id, { x: e.transform.x, z: e.transform.z }]));
    try { shared.session.boardLongshipOffer('group-1', 'founding-longship', origins); }
    catch (error) {
        const hull = shared.fjord.project().entities.find(e => e.kind === 'longship').transform;
        const nav = shared.fjord.blueprint.navigation;
        const candidates = nav.cells.flatMap((cell, i) => cell ? [{ x: nav.bounds.minX + i % nav.columns * nav.spacing,
            z: nav.bounds.minZ + Math.floor(i / nav.columns) * nav.spacing }] : []).sort((a, b) =>
            Math.hypot(a.x - hull.x, a.z - hull.z) - Math.hypot(b.x - hull.x, b.z - hull.z));
        throw new Error(`${error.message}; berth=${JSON.stringify(hull)}, closest land=${JSON.stringify(candidates.slice(0, 4))}`);
    }
    shared.command({ type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship', origins });
    for (let i = 0; i < 150 && mission(shared.session.readSnapshot()).transport.phase !== 'embarked'; i++)
        shared.command({ type: 'AdvanceTicks', ticks: 1 });
    assert.equal(mission(shared.session.readSnapshot()).transport.phase, 'embarked');
    const view = shared.fjord.project();
    const visible = view.entities.filter(e => e.kind === 'persona' && e.status.aboardShip && e.transform);
    assert.equal(visible.length, 3);
    assert.ok(visible.every(e => e.dna && e.facialIdentity && e.status.expedition));
    assert.equal(view.entities.filter(e => e.kind === 'longship').length, 1);
    const restored = SharedSettlement.restore(shared.persist(), 'fjord');
    assert.equal(restored.session.saveJSON(), shared.session.saveJSON());
    assert.deepEqual(restored.fjord.project().entities, view.entities);
    shared.command({ type: 'DisembarkLongship', groupId: 'group-1' });
    const landed = mission(shared.session.readSnapshot());
    for (const member of landed.memberIds)
        assert.deepEqual(landed.returnRoutes[member].at(-1), landed.homeOrigins[member],
            'Disembark must retain the exact off-grid home, not a snapped replacement');
    assert.equal(shared.fjord.project().entities.filter(e => e.status.aboardShip).length, 0);
    assert.equal(SharedSettlement.restore(shared.persist(), 'fjord').session.saveJSON(), shared.session.saveJSON());
});

test('one hull cannot be reserved twice and corrupt ship/route saves are rejected', () => {
    let state = aboard();
    state = command(state, { type: 'CreateExpeditionGroup', name: 'Second crew', memberIds: ['founder-4'] });
    state = command(state, { type: 'StartExpedition', groupId: 'group-2' });
    const before = core.serializeState(state);
    assert.throws(() => command(state, { type: 'BoardLongship', groupId: 'group-2', shipId: 'founding-longship' }), /assigned/i);
    assert.equal(core.serializeState(state), before);
    for (const alter of [
        s => s.landing.longships['founding-longship'].transport.x += 1,
        s => s.landing.longships['founding-longship'].transport.groupId = 'group-2',
        s => mission(s).transport = { phase: 'unknown' },
        s => Object.values(s.world.spatial.missions)[0].transport.seaReturnRoute[0].x += 4,
    ]) {
        const corrupt = structuredClone(state); alter(corrupt);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /longship|spatial/i);
    }
});

test('ship cargo doubles the existing transfer budget and never creates resources or capacity for casualties', () => {
    const { recoverExpeditionCargo } = load('../src/simulation/WorldExpeditions.ts');
    const initial = prepared(), targetId = Object.keys(initial.world.targetClans)[0];
    initial.world.targetClans[targetId].stocks.food = 100;
    for (const [shipId, expected] of [[null, 10], ['founding-longship', 20]]) {
        const state = structuredClone(initial), before = state.stocks.food;
        const loot = recoverExpeditionCargo(state, { id: 'cargo-test', priorities: ['Food'], shipId }, ['founder-1'], targetId);
        assert.equal(loot.food, expected);
        assert.equal(state.stocks.food, before + expected);
        assert.equal(state.world.targetClans[targetId].stocks.food, 100 - expected);
        assert.equal(recoverExpeditionCargo(state, { id: 'none', priorities: ['Food'], shipId }, [], targetId).food, 0);
    }
    initial.world.targetClans[targetId].stocks.food = 5;
    initial.world.targetClans[targetId].stocks.materials = 100;
    const partial = recoverExpeditionCargo(initial, { id: 'partial', priorities: ['Food', 'Materials'],
        shipId: 'founding-longship' }, ['founder-1'], targetId);
    assert.equal(partial.food, 5);
    assert.equal(partial.materials, 0, 'The transport multiplier preserves one category per member');
});

test('an idle transported longship can still be salvaged, releasing its obsolete berth but no active group', () => {
    const landed = command(aboard(), { type: 'DisembarkLongship', groupId: 'group-1' });
    const salvaged = command(landed, { type: 'SalvageLongship', longshipId: 'founding-longship' });
    assert.equal(salvaged.landing.longships['founding-longship'].transport, undefined);
    assert.equal(mission(salvaged).status, 'Exploring');
    assert.throws(() => command(salvaged, { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' }), /unavailable/);
});

test('disembarked groups choose new land destinations and recall without duplicate interior route edges', () => {
    let state = command(aboard(), { type: 'DisembarkLongship', groupId: 'group-1' });
    state = advance(state, 3);
    state = command(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 144, z: 128 } });
    for (const route of Object.values(mission(state).returnRoutes))
        for (let i = 1; i < route.length; i++)
            assert.ok(Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z) > 0);
    state = advance(core.reconstructState(core.serializeState(state)), 4);
    state = command(state, { type: 'RecallExpedition', groupId: 'group-1' });
    assert.equal(mission(advance(state, 100)).status, 'Returned');
});

test('the real expedition controls board, show contextual disembark, and keep valid sailing confirmations collapsed', () => {
    const dom = new JSDOM('<main class="fjord-stage"><div id="fjord-workspace" data-surface="expeditions"><section id="panel"></section></div><nav id="fjord-navigation"></nav></main>',
        { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'AbortController', 'matchMedia'];
    const previous = Object.fromEntries(globals.map(key => [key, globalThis[key]]));
    for (const key of globals) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
    dom.window.matchMedia = () => ({ matches: false });
    globalThis.matchMedia = dom.window.matchMedia;
    try {
        const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
        const { ExpeditionPanel } = loadDOMSource('../src/fjord-play/ExpeditionPanel.ts');
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(prepared()));
        session.bindPhysicalWorld(world, context.worldId, undefined, () => context.longshipOrigins);
        const workspace = document.querySelector('#fjord-workspace'), markers = [];
        let panel;
        panel = new ExpeditionPanel(document.querySelector('#panel'), session,
            action => { session.command(action); panel.committed(action); },
            (point, valid) => markers.push({ point, valid }), () => ({
                'founder-1': { x: 128, z: 128 }, 'founder-2': { x: 128, z: 128 } }),
            { showMap: () => { workspace.hidden = true; }, showGroups: () => { workspace.hidden = false; },
                focus() {}, toggleClock() {} });
        panel.openGroup('group-1');
        document.querySelector('[data-explore]').click();
        panel.previewShip('founding-longship', context.longshipOrigins['founding-longship']);
        assert.equal(markers.at(-1).valid, true);
        panel.chooseShip('founding-longship');
        session.command({ type: 'AdvanceTicks', ticks: 30 });
        panel.openGroup('group-1');
        assert.ok(document.querySelector('[data-disembark]'));
        assert.match(document.querySelector('#panel').textContent, /2× speed/);
        document.querySelector('[data-explore]').click();
        panel.previewTarget({ x: 4, z: 32 });
        assert.equal(markers.at(-1).valid, false);
        panel.chooseTarget({ x: 4, z: 32 });
        assert.match(document.querySelector('#expedition-mode').textContent, /Sea too rough/);
        panel.chooseTarget({ x: 48, z: 128 });
        assert.equal(document.querySelector('#expedition-mode').hidden, true);
        assert.equal(panel.targeting, false);
        panel.openGroup('group-1');
        document.querySelector('[data-explore]').click();
        panel.chooseTarget({ x: 72, z: 128 });
        session.command({ type: 'AdvanceTicks', ticks: 60 });
        panel.openGroup('group-1');
        document.querySelector('[data-disembark]').click();
        panel.openGroup('group-1');
        document.querySelector('[data-explore]').click();
        panel.chooseShip('founding-longship');
        assert.equal(mission(session.readSnapshot()).transport.phase, 'embarked');
        panel.openGroup('group-1');
        document.querySelector('[data-recall]').click();
        session.command({ type: 'AdvanceTicks', ticks: 1 });
        assert.equal(mission(session.readSnapshot()).status, 'Returning');
        assert.equal(mission(session.readSnapshot()).transport?.phase, 'embarked',
            'The real Return home button keeps the remotely reboarded group aboard');
        workspace.hidden = true;
        panel.refresh();
        const toolbar = document.querySelector('#expedition-mode');
        if (toolbar.hidden) document.querySelector('[data-expedition-toggle="group-1"]').click();
        assert.equal(toolbar.hidden, false);
        const beforeCameraFocus = session.saveJSON();
        panel.collapseControls();
        panel.refresh();
        assert.equal(toolbar.hidden, true, 'A wildlife camera can leave expedition controls collapsed');
        assert.equal(session.saveJSON(), beforeCameraFocus, 'Collapsing controls cannot alter the real expedition');
        document.querySelector('[data-expedition-toggle="group-1"]').click();
        assert.equal(toolbar.hidden, false, 'An explicit group toggle brings ordinary controls back');
        panel.dispose();
    } finally {
        for (const key of globals) {
            if (previous[key] === undefined) delete globalThis[key];
            else globalThis[key] = previous[key];
        }
        dom.window.close();
    }
});


test('expedition controls offer disband only at home and remove the current group after the real command', () => {
    const dom = new JSDOM('<main class="fjord-stage"><div id="fjord-workspace" data-surface="expeditions"><section id="panel"></section></div><nav id="fjord-navigation"></nav></main>',
        { url: 'http://localhost/fjord-play', pretendToBeVisual: true });
    const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'AbortController', 'matchMedia'];
    const previous = Object.fromEntries(globals.map(key => [key, globalThis[key]]));
    for (const key of globals) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
    globalThis.matchMedia = () => ({ matches: false });
    let panel;
    try {
        const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
        const { ExpeditionPanel } = loadDOMSource('../src/fjord-play/ExpeditionPanel.ts');
        const session = new GameplaySession();
        session.loadJSON(core.serializeState(prepared()));
        session.bindPhysicalWorld(world, context.worldId, undefined, () => context.longshipOrigins);
        const workspace = document.querySelector('#fjord-workspace');
        panel = new ExpeditionPanel(document.querySelector('#panel'), session,
            action => { session.command(action); panel.committed(action); }, () => {}, () => ({}),
            { showMap() {}, showGroups() { workspace.hidden = false; }, focus() {}, toggleClock() {} });
        panel.openGroup('group-1');
        assert.equal(document.querySelector('[data-disband]'), null);
        session.command({ type: 'CancelExpedition', groupId: 'group-1' });
        panel.openGroup('group-1');
        const disband = document.querySelector('[data-disband="group-1"]');
        assert.ok(disband);
        const missions = structuredClone(session.readSnapshot().world.spatial.missions);
        disband.click();
        assert.equal(session.readSnapshot().world.groups['group-1'], undefined);
        assert.deepEqual(session.readSnapshot().world.spatial.missions, missions);
        assert.equal(document.querySelector('[data-expedition-group="group-1"]'), null);
        document.querySelector('#expedition-create').click();
        assert.ok(session.readSnapshot().world.groups['group-2']);
    } finally {
        panel?.dispose(); dom.window.close();
        for (const key of globals) {
            if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key];
        }
    }
});
