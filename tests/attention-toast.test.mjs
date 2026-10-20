import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const load = name => loadDOMSource('../src/' + name + '.ts');
const core = load('simulation/SimulationCore');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { SharedSettlement } = load('play/SharedSettlement');
const { AttentionToast } = load('lore/AttentionToast');
const { AttentionView } = load('lore/AttentionView');
const { AttentionHistoryIndex } = load('lore/AttentionHistory');
const quiet = { fertilityChanceBps: 0, partnershipChanceBps: 0, childcareWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }] };

function setup(births = false, food = 0) {
    const dom = new JSDOM('<button id="fjord-attention">Attention</button><button type="button" id="toast" hidden></button><section id="feed"></section>',
        { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'HTMLElement', 'Element']) {
        previous[name] = globalThis[name]; globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    const timers = new Map(); let next = 1;
    dom.window.setTimeout = (callback, ms) => { assert.equal(ms, 8000); const id = next++; timers.set(id, callback); return id; };
    dom.window.clearTimeout = id => timers.delete(id);
    const state = births ? core.createCampaign(32, { initialFood: 10000, initialMaterials: 1000 },
        { ...quiet, fertilityChanceBps: 10000 }, { enabled: false }, {}, { enabled: false }) :
        core.createSettlement(41, quiet, { enabled: true, quarrelMinBps: 10000, quarrelMaxBps: 10000 });
    state.stocks.food = births ? 10000 : food; state.stocks.materials = 1000;
    const session = new GameplaySession(); session.loadJSON(core.serializeState(state));
    const owner = new SharedSettlement(session), root = document.querySelector('#toast'), targets = [];
    const view = new AttentionView(document.querySelector('#feed'), owner, () => {}, { target: () => {} });
    const toast = new AttentionToast(root, owner, () => { targets.push('activity'); view.openInbox(); });
    return { dom, owner, session, root, toast, targets, timers,
        fire() { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); },
        dispose() {
            toast.dispose(); view.dispose(); dom.window.close();
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
            }
        } };
}

test('a compact message opens Activity Center with one click, closes immediately and preserves Core, clock and unread state', () => {
    const h = setup();
    try {
        assert.equal(h.root.hidden, true, 'Adopting existing conditions is silent');
        document.querySelector('#fjord-attention').focus();
        h.session.command({ type: 'AdvanceTicks', ticks: 1000 }); h.session.setRunning(true);
        const source = h.session.readSnapshot().events.find(event => event.type === 'ResidentQuarrelled'); assert.ok(source);
        const before = h.session.saveJSON(); h.toast.update();
        assert.match(h.root.querySelector('.attention-toast-text').textContent, /Einar and Liv had a disagreement/);
        assert.equal(document.activeElement.id, 'fjord-attention', 'Arrival never steals focus');
        assert.equal(h.session.saveJSON(), before); assert.equal(h.session.running, true);
        assert.equal(h.owner.fjord.attentionView().records.find(record => record.eventId === source.id).read, false);
        assert.equal(h.root.tagName, 'BUTTON');
        assert.equal(h.root.querySelector('button, a, [data-toast-view], [data-toast-dismiss]'), null);
        h.root.click();
        assert.deepEqual(h.targets, ['activity']);
        assert.match(document.querySelector('#feed').textContent, /Events/);
        assert.equal(h.root.hidden, true);
        assert.equal(h.owner.fjord.attentionView().records.find(record => record.eventId === source.id).read, false);
        assert.equal(h.session.saveJSON(), before); assert.equal(h.session.running, true);
        h.toast.update(); assert.equal(h.root.hidden, true, 'Refreshing cannot replay the same event');
    } finally { h.dispose(); }
});

test('passive messages expire even under the pointer; reload, replacement and hidden periods never replay', () => {
    const h = setup();
    try {
        h.session.command({ type: 'AdvanceTicks', ticks: 1000 }); h.toast.update();
        const source = h.owner.fjord.attentionView().records.find(record => record.canonicalType === 'ResidentQuarrelled');
        assert.equal(h.timers.size, 1);
        h.root.dispatchEvent(new h.dom.window.MouseEvent('mouseenter'));
        assert.equal(h.timers.size, 1, 'A passive message does not intercept pointer input or hold its timer');
        h.fire();
        assert.equal(h.root.hidden, true);
        assert.equal(h.owner.fjord.attentionView().records.find(record => record.eventId === source.eventId).read, false);
        const saved = h.owner.persist(); h.owner.importJSON(JSON.stringify(JSON.parse(saved).fjord));
        h.toast.update(); assert.equal(h.root.hidden, true);
        h.session.command({ type: 'AdvanceTicks', ticks: 2000 }); h.toast.update(true);
        h.toast.update(); assert.equal(h.root.hidden, true, 'Updates suppressed while hidden do not form a backlog');
        assert.equal(h.targets.length, 0);
    } finally { h.dispose(); }
});

test('real multi-year births condense into a bounded catch-up invitation, retaining every unread source', () => {
    const h = setup(true);
    try {
        h.session.command({ type: 'AdvanceTicks', ticks: 5000 });
        const before = h.session.saveJSON(); h.toast.update();
        assert.match(h.root.textContent, /New updates from your clan and expeditions/);
        const births = h.owner.fjord.attentionView().records.filter(record => record.canonicalType === 'ChildBorn');
        assert.ok(births.length > 3); assert.ok(births.every(record => !record.read));
        h.fire();
        assert.equal(h.root.hidden, true);
        assert.ok(h.owner.fjord.attentionView().records.filter(record => record.canonicalType === 'ChildBorn').every(record => !record.read));
        assert.equal(h.session.saveJSON(), before);
    } finally { h.dispose(); }
});

test('physical homeward travel and actual return have separate, concise canonical messages', () => {
    const world = { waterLevel: -1,
        terrain: { bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 128 }, spacing: 8,
            columns: 33, rows: 17, heights: Array(561).fill(0) },
        navigation: { bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 128 }, spacing: 8,
            columns: 33, rows: 17, cells: Array(561).fill(true) },
        settlement: { center: { x: 16, z: 64 }, harbor: null } };
    const context = { world, worldId: 'toast-physical-fixture-v1' };
    let state = core.createCampaign(32, { initialFood: 500 }, quiet, { enabled: false });
    state = core.initializePhysicalDiscovery(state, world, context.worldId);
    state.world.spatial = { version: 1, worldId: context.worldId,
        policy: { metresPerTick: 2, exploringTicks: 25, foodIntervalTicks: 125 }, missions: {} };
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coast scouts', memberIds: ['founder-1', 'founder-2'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } }, context);
    for (let batch = 0; batch < 10 && !state.events.some(event => event.type === 'ExploreAreaReturned'); batch++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, context);
    const index = new AttentionHistoryIndex(); index.append(state.events);
    const records = index.retained();
    assert.equal(records.find(record => record.canonicalType === 'ExploreAreaReturnStarted').shortText, 'Coast scouts is heading home.');
    assert.equal(records.find(record => record.canonicalType === 'ExploreAreaReturned').shortText, 'Coast scouts has returned home.');
    const quietEvents = index.chroniclePage(state.events).records.filter(record => ['MediationAttempted', 'SocialIncidentEnded'].includes(record.canonicalType));
    assert.ok(quietEvents.every(record => record.severity === 'ambient'));
});


test('a newly empty Food stock is announced, but expiration never acknowledges its persistent alert', () => {
    const h = setup(false, 1);
    try {
        h.session.command({ type: 'AdvanceTicks', ticks: 1000 });
        const before = h.session.saveJSON(); h.toast.update();
        assert.match(h.root.querySelector('.attention-toast-text').textContent, /Food stocks are empty/);
        h.fire();
        assert.equal(h.owner.fjord.attentionView().alerts.find(alert => alert.id === 'food-empty').acknowledged, false);
        assert.equal(h.session.saveJSON(), before);
        assert.match(h.root.querySelector('.attention-toast-text').textContent, /disagreement/);
    } finally { h.dispose(); }
});
