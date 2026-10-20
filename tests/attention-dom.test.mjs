import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const load = name => loadDOMSource('../src/' + name + '.ts');
const core = load('simulation/SimulationCore');
const { SharedSettlement } = load('play/SharedSettlement');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const { AttentionView } = load('lore/AttentionView');
const { ClanBookReader } = load('lore/ClanBookReader');

test('Attention DOM acknowledges actual conditions, groups births, navigates source identities and preserves historical fallback', () => {
    const dom = new JSDOM('<!doctype html><main><section id="fjord-attention-feed"></section></main>', { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'HTMLSelectElement', 'HTMLInputElement', 'HTMLDetailsElement', 'HTMLOptionElement']) {
        previous[name] = globalThis[name]; globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    let initial = core.createSettlement(41, { childcareWinters: 0, fertilityChanceBps: 10000,
        partnershipChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    initial.stocks.food = 0;
    const session = new GameplaySession(); session.loadJSON(core.serializeState(initial));
    const owner = new SharedSettlement(session), root = document.querySelector('section');
    const targets = [], families = [], saves = [];
    const view = new AttentionView(root, owner, () => { saves.push(owner.persist()); view.render(); },
        { target: target => targets.push(target), family: id => families.push(id) });
    const click = (action, id) => {
        const button = [...root.querySelectorAll('button')].find(button => button.dataset.attentionAction === action &&
            (id === undefined || button.dataset.attentionId === id));
        assert.ok(button, action + ' control exists'); button.click();
    };
    try {
        session.setRunning(true); const before = session.saveJSON(); view.render();
        assert.match(root.textContent, /Food stocks are empty/);
        const food = owner.fjord.attentionView().alerts.find(alert => alert.id === 'food-empty');
        click('read-all');
        assert.equal(owner.fjord.attentionView().alerts.find(alert => alert.id === 'food-empty').acknowledged, false);
        click('ack', 'food-empty|' + food.since);
        assert.equal(owner.fjord.attentionView().alerts.find(alert => alert.id === 'food-empty').acknowledged, true);
        assert.equal(session.saveJSON(), before); assert.equal(session.running, true);
        // Fund the separate life-event phase explicitly; acknowledgement itself changes no resources.
        const funded = owner.fjord.exportData();
        funded.campaign = session.snapshot(); funded.campaign.stocks.food = 1000; funded.campaign.stocks.materials = 1000;
        delete funded.narrative;
        owner.importJSON(JSON.stringify(funded));
        session.command({ type: 'AdvanceTicks', ticks: 3000 }); view.render();
        const births = owner.fjord.attentionView().records.filter(record => record.canonicalType === 'ChildBorn');
        assert.ok(births.length);
        const birth = births[0];
        if (root.querySelector('[data-attention-action="group"][data-attention-id="ChildBorn:' + birth.time.winter + '"]'))
            click('group', 'ChildBorn:' + birth.time.winter);
        click('event', birth.eventId);
        assert.equal(owner.fjord.attentionView().records.find(record => record.eventId === birth.eventId).read, true);
        assert.match(root.textContent, /Historical record/);
        click('target', birth.eventId);
        assert.deepEqual(targets.at(-1), { kind: 'persona', id: birth.target.id });
        click('family', birth.eventId + '|' + birth.actorIds[0]);
        assert.equal(families.at(-1), birth.actorIds[0]);
        const back = root.querySelector('[data-attention-action="back"]'); back.focus();
        for (let frame = 0; frame < 30; frame++) view.render();
        assert.equal(document.activeElement, back);
        const stale = root.querySelector('[data-attention-action="target"]').cloneNode(true);
        const saved = owner.fjord.exportData(), input = session.snapshot();
        input.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
        saved.campaign = core.applyCommand(input, { type: 'AdvanceTicks', ticks: 1000 }); delete saved.narrative;
        owner.importJSON(JSON.stringify(saved)); view.render();
        root.append(stale); stale.click();
        assert.equal(targets.length, 1, 'Stale epoch cannot navigate a replaced campaign');
        view.openEvent(birth.eventId);
        assert.match(root.textContent, /live destination is unavailable/);
        assert.ok(!root.querySelector('[data-attention-action="target"]'));
        assert.match(root.textContent, /Einar.*Liv/);
        root.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.doesNotMatch(root.textContent, /Historical record/);
        click('chronicle');
        assert.match(root.textContent, /Routine events do not add/);
        assert.ok(root.querySelector('[data-attention-action="event"]'));
        assert.ok(saves.length);
        const reader = new ClanBookReader(owner, () => {});
        try {
            const story = owner.session.book.snapshot().chapters[0].read;
            reader.openFamily('einar');
            assert.equal(document.querySelector('#clan-book-reader').dataset.tab, 'family');
            assert.equal(owner.session.book.snapshot().chapters[0].read, story, 'Opening family does not mark Story read');
        } finally { reader.dispose(); }
    } finally {
        view.dispose(); dom.window.close();
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
        }
    }
});
