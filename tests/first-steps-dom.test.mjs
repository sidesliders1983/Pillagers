import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { newFjordScenario } = loadDOMSource('../src/fjord-play/FjordScenario.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
const { SettlementPanel } = loadDOMSource('../src/play/SettlementPanel.ts');
const { FirstStepsGuide } = loadDOMSource('../src/fjord-play/FirstStepsGuide.ts');
const { FoundingBookWindow } = loadDOMSource('../src/lore/FoundingBookWindow.ts');
const { fjordHeaderHTML } = loadDOMSource('../src/fjord-play/FjordHeader.ts');

function fixture(mobile = false, owner = new SharedSettlement(newFjordScenario(32))) {
    const dom = new JSDOM(`<main id="fjord-play">${fjordHeaderHTML()}
        <section id="fjord-management" hidden><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden tabindex="-1"><h2 id="fjord-workspace-title"></h2>
            <div id="fjord-directory"></div><section data-workspace-area="expeditions" hidden></section></section>
        <nav id="fjord-navigation"></nav><button id="fjord-attention"><span id="fjord-attention-count"></span></button></main>`, { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement', 'HTMLButtonElement',
        'HTMLDialogElement', 'AbortController', 'CustomEvent']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    previous.matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: mobile });
    let guide, writes = 0;
    const navigation = [];
    const legacy = new SettlementPanel();
    const refresh = () => {
        const state = owner.session.readSnapshot();
        ui.refresh(state, owner.selection, '', () => legacy.render(state, owner.selection));
        guide?.update();
    };
    const select = (kind, id) => { owner.select(kind ? { kind, id } : null); refresh(); };
    const ui = new FjordInterface(owner, {
        select, refresh, notify() {}, renderPortrait: async () => undefined,
        inspected: (kind, id) => guide?.inspected(kind, id),
        commit(commands, done) { owner.session.commandBatch(typeof commands === 'function' ? commands() : commands); done(); refresh(); },
    });
    document.querySelector('#entity-panel').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) ui.handle(button);
    });
    guide = new FirstStepsGuide(owner, {
        persist() { writes++; }, pause: () => owner.session.setRunning(false),
        reveal: () => ui.closeForHelp(),
        clockChanged() {
            const held = !!guide?.blocksClock;
            document.querySelector('#fjord-run').disabled = held;
            document.querySelector('#fjord-next').disabled = held;
        },
        resident: id => ui.showResident(id), household: id => ui.showEntity('household', id),
        stocks: resource => ui.open(resource, true), work: draft => ui.showWork(draft),
        expeditions: () => ui.open('expeditions', true),
        livestock: id => ui.showEntity('cattle', id), ship: id => ui.showEntity('longship', id),
        improvements: id => ui.showHome(id, 'improvements'), smithery: id => ui.showHome(id, 'smithery'),
        wildlife: id => navigation.push(['wildlife', id]),
        mission: (type, id) => { navigation.push([type, id]); ui.open('expeditions', true); },
        report: id => { navigation.push(['report', id]); return false; },
    });
    const click = (name, selector = '') => {
        const target = guide.root.querySelector(`[data-guide="${name}"]${selector}`);
        assert.ok(target, `The guide offers ${name} ${selector}`);
        target.click();
    };
    const objective = id => {
        guide.open();
        guide.root.querySelector('details').open = true;
        click('objective', `[data-objective="${id}"]`);
    };
    const chapter = id => { guide.open(); click('chapter', `[data-chapter="${id}"]`); };
    return { owner, dom, guide, ui, refresh, click, objective, chapter, navigation, writes: () => writes,
        dispose() {
            guide.dispose(); ui.dispose(); dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        } };
}

test('the actual founding story hands off to an optional journey; both choices stay paused and old callbacks cannot reopen it', () => {
    const f = fixture();
    let story;
    try {
        const canonical = f.owner.session.saveJSON();
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        document.body.append(story.root);
        const text = story.root.querySelector('article').textContent;
        f.guide.newStart(story);
        assert.equal(f.guide.blocksClock, true);
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.owner.session.running, false);
        story.root.querySelector('button').click();
        assert.equal(f.guide.root.hidden, false);
        assert.match(f.guide.root.textContent, /The Founding Journey/);
        assert.ok(text.length > 50);
        f.click('guide');
        assert.equal(f.owner.session.running, false);
        assert.equal(f.guide.blocksClock, false);
        assert.equal(document.querySelector('#fjord-run').disabled, false);
        f.guide.newStart();
        f.click('explore');
        assert.equal(f.owner.session.running, false);
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.owner.session.saveJSON(), canonical);
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        f.guide.newStart(story);
        f.guide.restore(); story.dispose();
        assert.equal(f.guide.root.hidden, true);
    } finally { story?.dispose(); f.dispose(); }
});

test('desktop and touch journeys connect real resident, household, resident-from-home and individual livestock controls', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const canonical = f.owner.session.saveJSON();
            f.guide.newStart(); f.click('guide');
            const checks = () => [...f.guide.root.querySelectorAll('[data-journey-check] [role="checkbox"]')]
                .map(check => check.getAttribute('aria-checked') === 'true');
            assert.deepEqual(checks(), [false, false, false, false]);
            const saved = JSON.stringify(f.owner.fjord.firstSteps), writes = f.writes();
            const firstCheck = f.guide.root.querySelector('[role="checkbox"]');
            assert.equal(firstCheck.getAttribute('aria-readonly'), 'true');
            firstCheck.click();
            assert.deepEqual(checks(), [false, false, false, false], 'A status indicator cannot forge progress');
            assert.equal(JSON.stringify(f.owner.fjord.firstSteps), saved);
            assert.equal(f.writes(), writes);
            f.click('show');
            assert.ok(document.querySelector('.fjord-relations'), 'The real full Character Card exposes the family');
            f.guide.open();
            assert.equal(document.querySelector('#fjord-management').hidden, true);
            assert.deepEqual(checks(), [true, false, false, false]);
            assert.equal(f.guide.root.querySelector('[role="checkbox"] [aria-hidden]').textContent, '✓');
            f.click('show');
            assert.ok(document.querySelector('.fjord-home-residents'));
            assert.equal(document.activeElement, document.querySelector('#entity-panel h2'));
            f.guide.open();
            assert.deepEqual(checks(), [true, true, false, false]);
            f.click('show');
            document.querySelector('.fjord-home-residents [data-ui="inspect"][data-kind="persona"]').click();
            assert.ok(document.querySelector('.fjord-relations'));
            assert.ok(f.owner.fjord.firstSteps.journey.homeResidentId);
            f.guide.open();
            assert.deepEqual(checks(), [true, true, true, false]);
            f.click('show');
            assert.equal(f.owner.selection.kind, 'cattle');
            assert.ok(f.owner.fjord.firstSteps.journey.livestockId);
            assert.match(document.querySelector('#entity-panel').textContent, /Female|Male|female|male/);
            f.guide.open();
            f.objective('meet-people');
            assert.equal(f.guide.root.querySelector('[data-journey-status]').dataset.journeyStatus, 'completed');
            assert.deepEqual(checks(), [true, true, true, true]);
            const restored = SharedSettlement.restore(f.owner.persist(), 'fjord');
            assert.deepEqual(restored.fjord.firstSteps, f.owner.fjord.firstSteps, 'Real checklist observations survive load');
            f.objective('understand-work'); f.click('show');
            assert.equal(document.querySelector('#fjord-workspace').hidden, false);
            assert.equal(f.owner.fjord.firstSteps.resourcesSeen, true);
            assert.equal(f.owner.session.saveJSON(), canonical, 'Inspections never manufacture commands or outcomes');
            if (mobile) assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        } finally { f.dispose(); }
    }
});

test('a missing Materials producer opens the real work proposal; target stock, time and house construction remain ordinary actions', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    for (const person of Object.values(owner.session.readSnapshot().personas))
        if (person.occupation === 'woodworker') owner.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'hunter' });
    const f = fixture(true, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        f.objective('permanent-home');
        assert.match(f.guide.root.textContent, /5 more Materials/);
        f.click('show');
        const commit = document.querySelector('[data-ui="commit-plan"]');
        assert.ok(commit);
        assert.match(document.querySelector('#entity-panel').textContent, /woodwork/i);
        assert.equal(owner.session.saveJSON(), canonical, 'The guide did not approve the real work draft');
        const materials = owner.session.readSnapshot().stocks.materials;
        commit.click();
        assert.equal(owner.session.readSnapshot().stocks.materials, materials);
        assert.equal(owner.session.readSnapshot().events.at(-1).type, 'OccupationAssigned');
        const reference = new SharedSettlement(32);
        reference.session.loadJSON(owner.session.saveJSON());
        for (const subject of [owner, reference]) subject.command({ type: 'AdvanceTicks', ticks: 1000 });
        f.refresh(); f.objective('permanent-home');
        assert.equal(owner.session.saveJSON(), reference.session.saveJSON());
        assert.equal(owner.session.readSnapshot().events.some(event => event.type === 'HouseBuilt'), false);
    } finally { f.dispose(); }
});

test('chapter navigation, real preparation links, a read-only keep choice and skip/replay change only bounded presentation state', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        f.chapter('conflict');
        assert.equal(f.guide.root.dataset.chapter, 'conflict');
        f.objective('pillage'); f.click('show');
        assert.deepEqual(f.navigation.at(-1), ['Pillage', undefined], 'Unknown targets remain unknown');
        f.chapter('discovery'); f.objective('wildlife-species'); f.click('show');
        assert.equal(document.querySelector('#fjord-workspace').hidden, false,
            'An unfinished witnessed-species step opens real expedition controls');
        assert.equal(f.owner.fjord.firstSteps.journey.selected, 'wildlife-species');
        assert.equal(f.guide.root.querySelectorAll('[data-journey-check] [aria-checked="false"]').length, 3);
        assert.equal(f.guide.root.querySelectorAll('[data-journey-check] [aria-checked="true"]').length, 0);
        f.chapter('home'); f.objective('longship-choice'); f.click('keep-ship');
        assert.equal(f.owner.fjord.firstSteps.journey.keptShipId, 'founding-longship');
        assert.equal(f.owner.session.readSnapshot().events.some(event => event.type === 'FoundingLongshipKept'), false);
        f.objective('upgrade-home'); f.click('later');
        f.objective('upgrade-home');
        assert.equal(f.guide.root.querySelector('[data-journey-status]').dataset.journeyStatus, 'later');
        f.click('try-again'); f.click('skip-objective');
        assert.ok(f.owner.fjord.firstSteps.journey.skipped.includes('upgrade-home'));
        f.click('skip');
        for (let i = 0; i < 20; i++) f.refresh();
        assert.equal(f.guide.root.hidden, true);
        const saved = f.owner.persist();
        f.owner.importJSON(JSON.stringify(JSON.parse(saved).fjord)); f.guide.restore();
        assert.equal(f.guide.root.hidden, true);
        document.querySelector('#fjord-first-steps').click(); f.click('resume');
        assert.equal(f.owner.fjord.firstSteps.journey.keptShipId, 'founding-longship');
        f.click('skip'); f.guide.open(); f.click('replay');
        assert.equal(f.owner.fjord.firstSteps.journey.keptShipId, null);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('home upgrades and Smithery help use existing full panels and do not execute construction or production', () => {
    const owner = new SharedSettlement(32);
    owner.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
    const state = owner.session.readSnapshot(), home = Object.values(state.households)[0];
    owner.command({ type: 'BuildHouse', householdId: home.id });
    owner.command({ type: 'AssignOccupation', personaId: home.memberIds[0], occupation: 'smith' });
    const f = fixture(true, owner);
    try {
        f.guide.newStart(); f.click('guide');
        const canonical = owner.session.saveJSON();
        f.objective('upgrade-home'); f.click('show');
        assert.ok(document.querySelector('.fjord-home-improvements'));
        assert.match(document.querySelector('#entity-panel').textContent, /Materials\/year/);
        f.chapter('conflict'); f.objective('personal-gear'); f.click('show');
        assert.ok(document.querySelector('.fjord-smithery'));
        assert.match(document.querySelector('#entity-panel').textContent, /Target stock/);
        assert.equal(owner.fjord.firstSteps.journey.smitherySeen, true);
        assert.equal(owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('keyboard collapse, unique keyed chapter buttons and unchanged revisions preserve focus without repeated saves', () => {
    const f = fixture();
    try {
        f.guide.newStart(); f.click('guide');
        const target = f.guide.root.querySelector('[data-guide="show"]');
        target.focus();
        const writes = f.writes(), canonical = f.owner.session.saveJSON();
        for (let i = 0; i < 20; i++) f.refresh();
        assert.equal(document.activeElement, target);
        assert.equal(f.writes(), writes);
        const keys = [...f.guide.root.querySelectorAll('[data-view-key]')].map(node => node.dataset.viewKey);
        assert.equal(new Set(keys).size, keys.length);
        target.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        assert.ok(document.activeElement.closest('#fjord-first-steps-card'));
        f.click('expand');
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('the full Clan Book defers the invitation and keeps reading focus', () => {
    const f = fixture();
    let story;
    try {
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        document.body.append(story.root); f.guide.newStart(story);
        const reader = document.createElement('section');
        reader.id = 'clan-book-reader'; reader.tabIndex = -1; reader.hidden = false;
        document.body.append(reader); reader.focus();
        document.querySelector('#clan-book-open').click();
        assert.equal(story.isOpen, false);
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.guide.blocksClock, true);
        assert.equal(document.activeElement, reader);
        f.guide.update();
        assert.equal(f.guide.root.hidden, true);
        reader.hidden = true; f.guide.update();
        assert.equal(f.guide.root.hidden, false);
    } finally { story?.dispose(); f.dispose(); }
});
