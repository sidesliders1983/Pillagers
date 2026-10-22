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
function prepared() {
    let state = core.createCampaign(32, { initialFood: 500, cattleBirthChanceBps: 0 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state = command(state, { type: 'CreateExpeditionGroup', name: 'Sea scouts', memberIds: ['founder-1', 'founder-2'] });
    return command(state, { type: 'StartExpedition', groupId: 'group-1' });
}
function aboard() {
    let state = command(prepared(), { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship' });
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
        panel.dispose();
    } finally {
        for (const key of globals) {
            if (previous[key] === undefined) delete globalThis[key];
            else globalThis[key] = previous[key];
        }
        dom.window.close();
    }
});
