import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { newFjordScenario } = loadDOMSource('../src/fjord-play/FjordScenario.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
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
    const refresh = () => { ui.refresh(owner.session.readSnapshot(), owner.selection, '', () => ''); guide?.update(); };
    const ui = new FjordInterface(owner, {
        select: (kind, id) => { owner.select(kind ? { kind, id } : null); refresh(); },
        refresh, notify() {},
        renderPortrait: async () => undefined,
        inspected: (kind, id) => guide?.inspected(kind, id),
        commit(commands, done) { owner.session.commandBatch(typeof commands === 'function' ? commands() : commands); done(); refresh(); },
    });
    guide = new FirstStepsGuide(owner, {
        persist() { writes++; }, pause: () => owner.session.setRunning(false),
        reveal: () => ui.closeForHelp(),
        clockChanged() {
            const held = !!guide?.blocksClock;
            document.querySelector('#fjord-run').disabled = held;
            document.querySelector('#fjord-next').disabled = held;
        },
        resident: id => ui.showResident(id),
        household: id => { owner.select({ kind: 'household', id }); refresh(); },
        stocks: resource => ui.open(resource, true), work: draft => ui.showWork(draft),
        expeditions: () => ui.open('expeditions', true),
    });
    const click = name => {
        const target = guide.root.querySelector(`[data-guide="${name}"]`);
        assert.ok(target, `The guide offers ${name}`);
        target.click();
    };
    return { owner, dom, guide, ui, refresh, click, writes: () => writes,
        dispose() {
            guide.dispose(); ui.dispose(); dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        } };
}

test('the invitation waits for the real founding chapter; guide pauses, opt-out preserves ordinary startup, and disposal fences old callbacks', () => {
    const f = fixture();
    let story;
    try {
        const canonical = f.owner.session.saveJSON();
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        document.body.append(story.root);
        const text = story.root.querySelector('article').textContent;
        let starts = 0;
        f.guide.newStart(story, () => { starts++; f.owner.session.setRunning(true); });
        assert.equal(f.guide.blocksClock, true);
        assert.equal(document.querySelector('#fjord-run').disabled, true);
        assert.equal(document.querySelector('#fjord-next').disabled, true);
        assert.equal(f.guide.root.hidden, true, 'The second card never stacks over the story');
        assert.equal(starts, 0);
        story.root.querySelector('button').click();
        assert.equal(f.guide.root.hidden, false);
        assert.match(f.guide.root.textContent, /Build a home for the next generation/);
        assert.ok(text.length > 50);
        f.click('guide');
        assert.equal(f.owner.session.running, false);
        assert.equal(f.guide.blocksClock, false);
        assert.equal(document.querySelector('#fjord-run').disabled, false);
        assert.equal(document.querySelector('#fjord-next').disabled, false);
        assert.equal(starts, 0, 'Guidance releases pause intent only to the real Play control');
        assert.equal(f.owner.session.saveJSON(), canonical);
        f.guide.newStart(undefined, () => { starts++; f.owner.session.setRunning(true); });
        f.click('explore');
        assert.equal(starts, 1);
        assert.equal(f.owner.session.running, true);
        assert.equal(f.guide.root.hidden, true);
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        f.guide.newStart(story);
        f.guide.restore();
        story.dispose();
        assert.equal(f.guide.root.hidden, true, 'A closed old story cannot reopen a restored guide');
    } finally { story?.dispose(); f.dispose(); }
});

test('desktop and touch links use actual profiles, stocks and households; shortage leads to real observed production without issuing a command', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const canonical = f.owner.session.saveJSON();
            f.guide.newStart(); f.click('guide');
            f.click('resident');
            assert.ok(document.querySelector('.fjord-relations'), 'The actual full Character Card exposes the household on mobile too');
            f.guide.open();
            assert.equal(document.querySelector('#fjord-management').hidden, true, 'Help yields the sheet rather than overlapping it');
            assert.equal(document.querySelector('#fjord-workspace').hidden, true);
            assert.equal(f.guide.root.dataset.step, '2');
            f.click('materials');
            f.guide.open();
            assert.equal(f.guide.root.dataset.step, '3');
            assert.match(f.guide.root.textContent, /5 more Materials/);
            f.click('home');
            assert.ok(document.querySelector('.fjord-home-residents'));
            assert.match(document.querySelector('#entity-panel').textContent, /1 Materials\/year when occupied/);
            f.guide.open(); f.click('watch');
            assert.equal(f.guide.root.dataset.step, '4');
            assert.equal(f.guide.root.querySelector('[data-guide="understood"]'), null);
            assert.equal(f.owner.session.saveJSON(), canonical, 'Every guide navigation and Keep working choice is presentation only');
            const reference = new SharedSettlement(32);
            reference.session.loadJSON(canonical);
            for (const owner of [f.owner, reference]) owner.command({ type: 'AdvanceTicks', ticks: 1000 });
            f.refresh(); f.guide.open();
            assert.ok(f.guide.root.querySelector('[data-first-steps-evidence]'));
            assert.equal(f.owner.session.saveJSON(), reference.session.saveJSON(), 'Matched commands preserve canonical bytes, RNG, events and outcomes');
            f.click('understood');
            assert.equal(f.owner.fjord.firstSteps.status, 'complete');
            assert.match(f.guide.root.textContent, /What’s next/);
            assert.equal(f.guide.root.querySelectorAll('[data-guide="next-home"], [data-guide="food"], [data-guide="expeditions"]').length, 1);
            f.click('dismiss');
            assert.equal(f.guide.root.hidden, true);
            document.querySelector('#fjord-first-steps').click();
            assert.equal(f.guide.root.hidden, false);
            f.click('replay');
            assert.equal(f.guide.root.dataset.step, '1');
            assert.equal(f.owner.session.saveJSON(), reference.session.saveJSON());
        } finally { f.dispose(); }
    }
});

test('a progressed save, Continue/import, repeated refresh and collapse do not reopen old guidance or reset its progress', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.refresh();
        assert.equal(f.owner.fjord.firstSteps, undefined, 'An old campaign does not silently acquire a first-run invitation');
        f.guide.newStart(); f.click('guide'); f.click('resident');
        f.guide.open(); f.click('collapse');
        assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        const saved = f.owner.persist();
        f.owner.importJSON(JSON.parse(saved).fjord ? JSON.stringify(JSON.parse(saved).fjord) : saved);
        f.guide.restore();
        for (let i = 0; i < 20; i++) f.refresh();
        assert.equal(f.guide.root.hidden, true);
        assert.ok(f.owner.fjord.firstSteps.residentId);
        assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        f.guide.open(); f.click('skip');
        for (let i = 0; i < 20; i++) f.refresh();
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('keyboard Escape collapses only the guide, focus survives unchanged projections, and replay/skip add no canonical action', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        const target = f.guide.root.querySelector('[data-guide="resident"]');
        target.focus();
        const writes = f.writes();
        for (let i = 0; i < 20; i++) f.refresh();
        assert.equal(document.activeElement, target);
        assert.equal(f.writes(), writes, 'An unchanged revision causes no guidance saves');
        target.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        assert.ok(document.activeElement.closest('#fjord-first-steps-card'));
        f.click('expand'); f.click('skip');
        assert.equal(f.owner.selection, null);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('a missing Materials producer opens a legitimate task preview and never completes saving from Food production', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    for (const person of Object.values(owner.session.readSnapshot().personas))
        if (person.occupation === 'woodworker') owner.command({ type: 'AssignOccupation', personaId: person.id, occupation: 'hunter' });
    const f = fixture(true, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.newStart(); f.click('guide'); f.click('resident');
        f.guide.open(); f.click('materials');
        f.guide.open(); f.click('home');
        f.guide.open();
        assert.equal(f.guide.root.querySelector('[data-guide="watch"]'), null,
            'Food output cannot be presented as saving Materials for a home');
        f.click('work');
        assert.ok(document.querySelector('[data-ui="commit-plan"]'));
        assert.match(document.querySelector('#entity-panel').textContent, /woodwork/i);
        assert.equal(owner.session.saveJSON(), canonical, 'Show me opened the existing preview without approving it');
        const before = owner.session.readSnapshot().stocks.materials;
        f.ui.handle(document.querySelector('[data-ui="commit-plan"]'));
        assert.equal(owner.session.readSnapshot().stocks.materials, before);
        assert.equal(owner.session.readSnapshot().events.at(-1).type, 'OccupationAssigned');
        f.guide.open();
        assert.ok(f.guide.root.querySelector('[data-guide="watch"]'));
    } finally { f.dispose(); }
});

test('resuming skipped guidance credits genuine production observed since its saved decision', () => {
    const f = fixture();
    try {
        f.guide.newStart(); f.click('guide'); f.click('resident');
        f.guide.open(); f.click('materials'); f.guide.open(); f.click('home');
        f.guide.open(); f.click('watch'); f.click('skip');
        f.owner.command({ type: 'AdvanceTicks', ticks: 1000 });
        f.refresh();
        assert.equal(f.guide.root.hidden, true);
        f.guide.open(); f.click('resume');
        assert.ok(f.guide.root.querySelector('[data-first-steps-evidence]'));
        const canonical = f.owner.session.saveJSON();
        f.click('understood');
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('continuing the founding story in the full Clan Book defers the invitation without stealing its reading focus', () => {
    const f = fixture();
    let story;
    try {
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        document.body.append(story.root);
        f.guide.newStart(story);
        const reader = document.createElement('section');
        reader.id = 'clan-book-reader';
        reader.tabIndex = -1;
        reader.hidden = false;
        document.body.append(reader);
        reader.focus();
        const open = document.querySelector('#clan-book-open');
        open.click();
        assert.equal(story.isOpen, false);
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.guide.blocksClock, true);
        assert.equal(document.activeElement, reader);
        f.guide.update();
        assert.equal(f.guide.root.hidden, true);
        reader.hidden = true;
        f.guide.update();
        assert.equal(f.guide.root.hidden, false);
    } finally { story?.dispose(); f.dispose(); }
});
