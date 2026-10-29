import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
const { SettlementPanel } = loadDOMSource('../src/play/SettlementPanel.ts');

function fixture(mobile, enabled = true, initialFood = 15, mechanics = {}, queued = false) {
    const dom = new JSDOM(`<main id="fjord-play"><nav id="fjord-navigation"></nav>
        <section id="fjord-management"><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden></section>
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
    globalThis.matchMedia = () => ({ matches: mobile });
    const state = core.createCampaign(32, { initialFood }, mechanics, {}, {}, {}, {},
        undefined, undefined, undefined, { enabled });
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    const owner = new SharedSettlement(session), notices = [], reports = [], pending = [], legacy = new SettlementPanel();
    const refresh = () => ui.refresh(session.readSnapshot(), owner.selection, '',
        () => legacy.render(session.readSnapshot(), owner.selection));
    const ui = new FjordInterface(owner, {
        select(kind, id) { owner.select(kind ? { kind, id } : null); refresh(); },
        refresh,
        report(id) { reports.push(id); },
        notify(message) { notices.push(message); },
        commit(commands, done, rejected) {
            const apply = () => {
                try {
                    session.commandBatch(typeof commands === 'function' ? commands() : commands);
                } catch (error) {
                    if (!rejected) throw error;
                    rejected(error);
                    refresh();
                    return;
                }
                done();
                refresh();
            };
            if (queued) pending.push(apply); else apply();
        },
    });
    document.querySelector('#entity-panel').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) ui.handle(button);
    });
    owner.select({ kind: 'campfire', id: 'settlement-campfire' });
    refresh();
    return { session, owner, ui, dom, refresh, notices, reports, flush() { while (pending.length) pending.shift()(); },
        click(action) {
            const button = document.querySelector(`[data-ui="${action}"]`);
            assert.ok(button, `The current campfire card offers ${action}`);
            button.click();
            return button;
        },
        dispose() {
            ui.dispose(); dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        },
    };
}

test('desktop and touch campfire review quote real Food and Not now changes no campaign state', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const before = f.session.saveJSON();
            assert.match(document.querySelector('#entity-panel').textContent, /Community occasions/);
            f.click('culture-review');
            const review = document.querySelector('[aria-label="Gathering review"]');
            assert.ok(review);
            assert.match(review.textContent, /3 Food/);
            assert.match(review.textContent, /Storytelling & music/);
            assert.equal(document.querySelector('dialog[open]'), null);
            f.click('culture-cancel');
            assert.equal(document.querySelector('[aria-label="Gathering review"]'), null);
            assert.equal(f.session.saveJSON(), before);
            assert.equal(f.owner.selection.kind, 'campfire');
        } finally { f.dispose(); }
    }
});

test('sponsoring a reviewed gathering spends once, reports the committed event and leaves the clock alone', () => {
    const f = fixture(true);
    try {
        f.session.setRunning(true);
        const time = { ...f.session.readSnapshot().time };
        f.click('culture-review');
        const sponsor = f.click('culture-sponsor');
        const after = f.session.readSnapshot();
        assert.equal(after.stocks.food, 12);
        assert.equal(after.events.filter(event => event.type === 'CulturalGatheringHeld').length, 1);
        assert.equal(core.inspectCulture(after).supportCount, 1);
        assert.match(document.querySelector('#entity-panel [role="status"]').textContent, /Gathering supported.*3 Food/);
        assert.equal(document.querySelector('[aria-label="Gathering review"]'), null);
        assert.deepEqual(after.time, time);
        assert.equal(f.session.running, true);
        f.ui.handle(sponsor);
        assert.equal(f.session.readSnapshot().stocks.food, 12);
        assert.equal(f.session.readSnapshot().events.filter(event => event.type === 'CulturalGatheringHeld').length, 1);
    } finally { f.dispose(); }
});

test('a changed real roster disables the old quote and a rejected click can be cancelled safely', () => {
    const f = fixture(false, true, 15, {
        fertilityChanceBps: 0, partnershipChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 10000 }],
    });
    try {
        f.click('culture-review');
        const oldSponsor = document.querySelector('[data-ui="culture-sponsor"]');
        f.session.command({ type: 'AdvanceWinter' });
        f.refresh();
        assert.equal(document.querySelector('[data-ui="culture-sponsor"]').disabled, true);
        assert.match(document.querySelector('[aria-label="Gathering review"]').textContent, /changed|available adult residents/);
        const saved = f.session.saveJSON();
        f.ui.handle(oldSponsor);
        assert.equal(f.session.saveJSON(), saved);
        assert.match(f.notices.at(-1), /available adult residents/);
        f.click('culture-cancel');
        assert.equal(document.activeElement.tagName, 'H2', 'An unavailable trigger has a focus fallback');
        assert.equal(document.querySelector('[aria-label="Gathering review"]'), null);
        assert.equal(f.session.saveJSON(), saved);
    } finally { f.dispose(); }
});

test('keyboard and touch review focus can return to the campfire without committing a gathering', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const before = f.session.saveJSON();
            f.click('culture-review');
            assert.equal(document.activeElement.tagName, 'H2');
            assert.match(document.activeElement.textContent, /Support gathering/);
            f.click('culture-cancel');
            assert.equal(document.activeElement.dataset.ui, 'culture-review');
            f.click('culture-review');
            document.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            assert.equal(document.querySelector('[aria-label="Gathering review"]'), null);
            assert.equal(document.activeElement.dataset.ui, 'culture-review');
            assert.equal(f.owner.selection.kind, 'campfire');
            assert.equal(f.session.saveJSON(), before);
            f.click('culture-review');
            f.click('close-card');
            assert.equal(f.owner.selection, null);
            assert.equal(f.session.saveJSON(), before);
        } finally { f.dispose(); }
    }
});

test('the committed gathering links to its real existing Activity record without changing the campaign', () => {
    const f = fixture(false);
    try {
        f.click('culture-review'); f.click('culture-sponsor');
        const source = f.session.inspectCulture().lastGatheringEventId;
        const saved = f.session.saveJSON();
        f.click('culture-record');
        assert.deepEqual(f.reports, [source]);
        assert.equal(f.session.saveJSON(), saved);
        assert.equal(f.session.readSnapshot().events.find(event => event.id === source).type, 'CulturalGatheringHeld');
    } finally { f.dispose(); }
});

test('queued sponsorship shows progress immediately and a Food rejection leaves a usable review', () => {
    const f = fixture(false, true, 15, {}, true);
    try {
        f.click('culture-review');
        f.click('culture-sponsor');
        assert.equal(document.querySelector('[data-ui="culture-sponsor"]').disabled, true);
        assert.equal(document.querySelector('[data-ui="culture-cancel"]').disabled, true);
        assert.match(document.querySelector('[aria-label="Gathering review"] [role="status"]').textContent, /Supporting/);
        const replacement = core.createCampaign(32, { initialFood: 2 }, {}, {}, {}, {}, {},
            undefined, undefined, undefined, { enabled: true });
        f.session.loadJSON(core.serializeState(replacement));
        f.flush();
        assert.equal(f.session.readSnapshot().stocks.food, 2);
        assert.match(document.querySelector('[aria-label="Gathering review"] [role="status"]').textContent, /Not enough Food/);
        assert.equal(document.querySelector('[data-ui="culture-cancel"]').disabled, false);
        f.click('culture-cancel');
        assert.equal(document.querySelector('[aria-label="Gathering review"]'), null);
    } finally { f.dispose(); }
});

test('disabled and unaffordable campaigns expose no active paid gathering action', () => {
    for (const [enabled, food] of [[false, 15], [true, 2]]) {
        const f = fixture(true, enabled, food);
        try {
            const saved = f.session.saveJSON();
            const button = document.querySelector('[data-ui="culture-review"]');
            if (!enabled) {
                assert.equal(button, null);
                assert.equal(document.querySelector('[aria-label="Community gathering"]'), null);
            } else {
                assert.equal(button.disabled, true);
                assert.match(document.querySelector('[aria-label="Community gathering"]').textContent, /Not enough Food/);
                button.click();
            }
            assert.match(document.querySelector('#entity-panel').textContent, /Light campfire/);
            assert.equal(f.session.saveJSON(), saved);
        } finally { f.dispose(); }
    }
});

test('a full support reserve disables another purchase while keeping real gathering history reachable', () => {
    const f = fixture(false);
    try {
        for (let count = 0; count < 2; count++) {
            f.click('culture-review'); f.click('culture-sponsor');
        }
        assert.equal(f.session.readSnapshot().stocks.food, 9);
        const saved = f.session.saveJSON();
        const button = document.querySelector('[data-ui="culture-review"]');
        assert.equal(button.disabled, true);
        assert.match(document.querySelector('[aria-label="Community gathering"]').textContent, /maximum prepared support/);
        button.click();
        assert.equal(f.session.saveJSON(), saved);
        f.click('culture-record');
        assert.deepEqual(f.reports, [f.session.inspectCulture().lastGatheringEventId]);
        assert.equal(f.session.saveJSON(), saved);
    } finally { f.dispose(); }
});

test('desktop and touch choose a communal occasion below campfire fuel without spending before sponsorship', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const saved = f.session.saveJSON();
            const occasion = document.querySelector('[data-culture-occasion]');
            assert.ok(occasion, 'One shared occasion selector is in the existing campfire card');
            assert.deepEqual([...occasion.options].map(option => option.value),
                ['storytelling_music', 'communal_ceremony', 'wedding']);
            const fuel = document.querySelector('[data-command]');
            const culture = document.querySelector('[aria-label="Community gathering"]');
            assert.ok(fuel.compareDocumentPosition(culture) & Node.DOCUMENT_POSITION_FOLLOWING,
                'Culture stays below the existing campfire fuel controls');
            occasion.value = 'communal_ceremony';
            occasion.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
            assert.match(culture.textContent, /Communal ceremony/);
            f.click('culture-review');
            const review = document.querySelector('[aria-label="Gathering review"]');
            assert.match(review.textContent, /Communal ceremony/);
            assert.match(review.textContent, /3 Food/);
            assert.equal(document.querySelector('dialog[open]'), null);
            f.click('culture-cancel');
            assert.equal(f.session.saveJSON(), saved);
        } finally { f.dispose(); }
    }
});

test('a communal sponsorship records its selected occasion through the same paid session command', () => {
    const f = fixture(false);
    try {
        const choice = document.querySelector('[data-culture-occasion]');
        choice.value = 'communal_ceremony';
        choice.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        const materials = f.session.readSnapshot().stocks.materials;
        assert.match(document.querySelector('[aria-label="Community gathering"]').textContent, /1 Material/);
        f.click('culture-review');
        assert.match(document.querySelector('[aria-label="Gathering review"]').textContent, /1 Material/);
        f.click('culture-sponsor');
        const after = f.session.readSnapshot();
        assert.equal(after.stocks.materials, materials - 1);
        assert.equal(core.inspectCampfire(after).lit, true);
        assert.equal(core.inspectCampfire(after).fuelTicks, 1000);
        const event = after.events.find(item => item.type === 'CulturalGatheringHeld');
        assert.equal(event.details.occasion, 'communal_ceremony');
        assert.match(document.querySelector('#entity-panel [role="status"]').textContent, /Communal ceremony supported.*3 Food.*1 Material/);
        assert.equal(after.stocks.food, 12);
        assert.equal(f.session.inspectCulture().supportCount, 1);
        assert.equal(event.details.sourceEventId, undefined);
    } finally { f.dispose(); }
});

test('a wedding review names its actual couple and quotes 3 Food for each of eight attendees', () => {
    const f = fixture(true);
    try {
        const initial = core.createCampaign(32, { initialFood: 100, foundingCoupleChanceBps: 0 }, {
            partnershipChanceBps: 10000, fertilityChanceBps: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }],
        }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
        const paired = core.advanceWinter(initial);
        const source = paired.events.find(event => event.type === 'PartnershipFormed');
        assert.ok(source, 'The real annual Core produced a new partnership');
        f.session.loadJSON(core.serializeState(paired));
        f.refresh();
        const choice = document.querySelector('[data-culture-occasion]');
        choice.value = 'wedding';
        choice.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        const couple = document.querySelector('[data-culture-partnership]');
        assert.ok(couple, 'Wedding selection offers real recent partnerships');
        couple.value = source.id;
        couple.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        const spouses = source.details.participants.map(id => paired.personas[id].name);
        for (const name of spouses) assert.ok(couple.textContent.includes(name));
        const before = f.session.readSnapshot();
        const card = document.querySelector('[aria-label="Community gathering"]');
        assert.match(card.textContent, /3 Food per attendee/);
        assert.match(card.textContent, /8 attendees/);
        assert.match(card.textContent, /24 Food total/);
        f.click('culture-review');
        const review = document.querySelector('[aria-label="Gathering review"]');
        assert.match(review.textContent, /Wedding celebration/);
        assert.match(review.textContent, /3 Food per attendee/);
        assert.equal(document.querySelector('[data-ui="culture-sponsor"]').textContent.trim(), 'Sponsor · 24 Food');
        const coupleSummary = review.querySelector('[data-culture-couple]');
        assert.ok(coupleSummary, 'The review names the real couple without opening the attendance list');
        for (const name of spouses) assert.ok(coupleSummary.textContent.includes(name));
        f.click('culture-sponsor');
        const after = f.session.readSnapshot();
        const celebration = after.events.find(event => event.type === 'CulturalGatheringHeld');
        assert.equal(celebration.details.occasion, 'wedding');
        assert.equal(celebration.details.sourceEventId, source.id);
        assert.equal(after.stocks.food, before.stocks.food - 24);
        assert.deepEqual(after.personas, before.personas);
        assert.deepEqual(after.events.find(event => event.id === source.id), source);
        assert.equal(document.querySelector('[data-culture-partnership]').value, source.id);
        assert.equal(document.querySelector('[data-ui="culture-review"]').disabled, true);
    } finally { f.dispose(); }
});

test('the wedding card opens its actual partnership source and declining preserves that relationship', () => {
    const f = fixture(false);
    try {
        const initial = core.createCampaign(32, { initialFood: 100, foundingCoupleChanceBps: 0 }, {
            partnershipChanceBps: 10000, fertilityChanceBps: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }],
        }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
        const paired = core.advanceWinter(initial);
        const source = paired.events.find(event => event.type === 'PartnershipFormed');
        f.session.loadJSON(core.serializeState(paired));
        f.refresh();
        const choice = document.querySelector('[data-culture-occasion]');
        choice.value = 'wedding';
        choice.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        const before = f.session.saveJSON();
        f.click('culture-partnership-record');
        assert.deepEqual(f.reports, [source.id]);
        f.click('culture-review');
        f.click('culture-cancel');
        assert.equal(f.session.saveJSON(), before);
        assert.deepEqual(f.session.readSnapshot().events.find(event => event.id === source.id), source);
    } finally { f.dispose(); }
});

test('founding partnerships never appear as purchasable wedding occasions', () => {
    const f = fixture(false);
    try {
        const state = core.createCampaign(32, { foundingCoupleChanceBps: 10000 }, {
            partnershipChanceBps: 0, fertilityChanceBps: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }],
        }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
        assert.ok(state.events.some(event => event.type === 'FoundingPartnershipPresent'));
        f.session.loadJSON(core.serializeState(state));
        f.refresh();
        const saved = f.session.saveJSON();
        const choice = document.querySelector('[data-culture-occasion]');
        choice.value = 'wedding';
        choice.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        const couple = document.querySelector('[data-culture-partnership]');
        assert.equal(couple.options.length, 1, 'Only the empty recent-partnership prompt is shown');
        assert.match(document.querySelector('[aria-label="Community gathering"]').textContent, /Founding partnerships are not wedding occasions/);
        assert.equal(document.querySelector('[data-ui="culture-review"]').disabled, true);
        assert.equal(f.session.saveJSON(), saved);
    } finally { f.dispose(); }
});

test('a wedding quote expires at one game year without cancelling the partnership or spending Food', () => {
    const f = fixture(true);
    try {
        const initial = core.createCampaign(32, { initialFood: 100, foundingCoupleChanceBps: 0 }, {
            partnershipChanceBps: 10000, fertilityChanceBps: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }],
        }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled: true });
        const paired = core.advanceWinter(initial);
        const source = paired.events.find(event => event.type === 'PartnershipFormed');
        f.session.loadJSON(core.serializeState(paired));
        f.refresh();
        const choice = document.querySelector('[data-culture-occasion]');
        choice.value = 'wedding';
        choice.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
        f.click('culture-review');
        const oldSponsor = document.querySelector('[data-ui="culture-sponsor"]');
        f.session.command({ type: 'AdvanceTicks', ticks: 1000 });
        f.refresh();
        const saved = f.session.saveJSON();
        assert.equal(document.querySelector('[data-ui="culture-sponsor"]').disabled, true);
        assert.match(document.querySelector('[aria-label="Gathering review"]').textContent, /one-year wedding celebration window has ended/);
        f.ui.handle(oldSponsor);
        assert.equal(f.session.saveJSON(), saved);
        f.click('culture-cancel');
        assert.equal(document.querySelector('[data-ui="culture-review"]').disabled, true);
        assert.deepEqual(f.session.readSnapshot().events.find(event => event.id === source.id), source);
        assert.equal(f.session.saveJSON(), saved);
    } finally { f.dispose(); }
});
