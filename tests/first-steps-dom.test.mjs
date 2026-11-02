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
const { fjordNavigationHTML } = loadDOMSource('../src/fjord-play/FjordNavigation.ts');
const { MobileShell } = loadDOMSource('../src/fjord-play/MobileShell.ts');

function fixture(mobile = false, owner = new SharedSettlement(newFjordScenario(32))) {
    const dom = new JSDOM(`<main id="fjord-play">${fjordHeaderHTML()}
        <section id="fjord-management" hidden><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden tabindex="-1"><h2 id="fjord-workspace-title"></h2>
            <div id="fjord-directory"></div><section data-workspace-area="expeditions" hidden></section></section>
        ${fjordNavigationHTML()}<button id="fjord-attention"><span id="fjord-attention-count"></span></button></main>`, { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement', 'HTMLButtonElement',
        'HTMLDialogElement', 'AbortController', 'CustomEvent', 'Event']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    previous.matchMedia = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
    const mobileShell = new MobileShell(document.querySelector('#fjord-play'));
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
        navigated: (kind, id, entityKind) => guide?.navigated(kind, id, entityKind),
        commit(commands, done) { owner.session.commandBatch(typeof commands === 'function' ? commands() : commands); done(); refresh(); },
    });
    document.querySelector('#entity-panel').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) ui.handle(button);
    });
    guide = new FirstStepsGuide(owner, {
        persist() { writes++; }, pause: () => owner.session.setRunning(false),
        play: () => { if (!guide.blocksClock) owner.session.setRunning(true); },
        reveal: () => ui.closeForHelp(),
        clockChanged() {
            const held = !!guide?.blocksClock;
            document.querySelector('#fjord-run').disabled = held;
            document.querySelector('#fjord-next').disabled = held;
        },
        resident: id => ui.showResident(id), household: id => ui.showEntity('household', id),
        stocks: resource => ui.open(resource, true), work: draft => ui.showWork(draft),
        expeditions: () => ui.open('expeditions', true),
        settlement: () => ui.open('settlement', true),
        clock: () => document.querySelector('#fjord-run').focus(),
        menu: () => {
            const menu = document.querySelector('#fjord-menu');
            menu.open = true;
            menu.querySelector('summary').focus();
        },
        activity: () => ui.open('attention', true),
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
        const targetChapter = id.startsWith('ui-') ? 'orientation' :
            ['recon', 'personal-gear', 'pillage', 'mission-result'].includes(id) ? 'conflict' :
            ['prepare-expedition', 'wildlife-species', 'find-neighbours', 'sea-travel'].includes(id) ? 'discovery' : 'home';
        if (guide.root.dataset.chapter !== targetChapter)
            click('chapter', `[data-chapter="${targetChapter}"]`);
        guide.root.querySelector('details').open = true;
        click('objective', `[data-objective="${id}"]`);
    };
    const chapter = id => { guide.open(); click('chapter', `[data-chapter="${id}"]`); };
    return { owner, dom, guide, ui, refresh, click, objective, chapter, navigation, writes: () => writes,
        dispose() {
            mobileShell.dispose(); guide.dispose(); ui.dispose(); dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        } };
}

test('the founding invitation keeps guided and free play paused and fences stale callbacks', () => {
    const f = fixture(true);
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
        assert.equal(f.owner.session.running, false, 'Guidance and free-play choices do not start time');
        assert.equal(f.guide.root.hidden, true);
        assert.equal(f.owner.session.saveJSON(), canonical);
        const help = document.querySelector('#fjord-navigation-drawer #fjord-first-steps');
        assert.ok(help);
        assert.equal(help.textContent.trim(), 'Need help?');
        assert.ok(help.querySelector('svg[aria-hidden="true"]'), 'Help uses the shared question-mark icon');
        assert.equal(document.querySelector('#fjord-header #fjord-first-steps'), null);
        document.querySelector('#fjord-mobile-menu').click();
        assert.equal(document.querySelector('#fjord-mobile-menu').getAttribute('aria-expanded'), 'true');
        help.click();
        assert.equal(document.querySelector('#fjord-mobile-menu').getAttribute('aria-expanded'), 'false');
        assert.equal(f.guide.root.hidden, false);
        assert.equal(f.owner.session.running, false, 'Guidance and free-play choices do not start time');
        assert.equal(f.owner.session.saveJSON(), canonical, 'Navigation help does not start or change the campaign');
        story = new FoundingBookWindow(f.owner.session.book.snapshot().chapters[0]);
        f.guide.newStart(story);
        f.guide.restore(); story.dispose();
        assert.equal(f.guide.root.hidden, true);
        f.guide.newStart();
        f.guide.root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
        assert.equal(f.owner.session.running, false, 'Escape must not implicitly start free play');
        assert.equal(f.guide.blocksClock, false);
    } finally { story?.dispose(); f.dispose(); }
});

test('desktop and touch journeys connect real resident, household, resident-from-home and individual livestock controls', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const canonical = f.owner.session.saveJSON();
            f.guide.newStart(); f.click('guide'); f.chapter('home');
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
        f.guide.newStart(); f.click('guide'); f.guide.open();
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
        document.querySelector('#fjord-book').click();
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
test('Guide me opens freely selectable Chapter 0 before the existing chapters without starting time', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart();
        f.click('guide');
        assert.equal(f.guide.root.dataset.chapter, 'orientation');
        assert.equal(f.guide.root.dataset.objective, 'ui-camera');
        document.querySelector('#fjord-basics-chip').click();
        assert.deepEqual([...f.guide.root.querySelectorAll('[data-guide="chapter"]')]
            .map(button => button.dataset.chapter), ['orientation', 'home', 'discovery', 'conflict']);
        assert.match(f.guide.root.textContent, /left[- ]drag (?:pans|to pan)/i);
        assert.equal(f.owner.session.running, false);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('camera and clock acknowledgments advance only the optional guidance on mouse and touch', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const canonical = f.owner.session.saveJSON();
            f.guide.newStart(); f.click('guide'); f.guide.open();
            assert.match(f.guide.root.textContent, mobile ? /drag (?:to orbit|rotates)/i : /left[- ]drag.*pan/i);
            f.click('acknowledge');
            assert.equal(f.guide.root.dataset.objective, 'ui-resident');
            f.objective('ui-time');
            f.click('acknowledge');
            assert.ok(f.owner.fjord.firstSteps.journey.orientation.includes('ui-time'));
            f.chapter('conflict');
            assert.equal(f.guide.root.dataset.chapter, 'conflict');
            assert.equal(f.owner.session.running, false);
            assert.equal(f.owner.session.saveJSON(), canonical);
        } finally { f.dispose(); }
    }
});


test('orientation Show me focuses existing clock and menu without activating time, including touch collapse', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            const canonical = f.owner.session.saveJSON();
            f.guide.newStart(); f.click('guide');
            f.objective('ui-time'); f.click('show');
            assert.equal(document.activeElement, document.querySelector('#fjord-run'));
            assert.equal(f.owner.session.running, false);
            f.guide.open(); f.objective('ui-navigation'); f.click('show');
            assert.equal(document.querySelector('#fjord-menu').open, true);
            assert.equal(document.activeElement, document.querySelector('#fjord-menu > summary'));
            if (mobile) assert.equal(f.owner.fjord.firstSteps.collapsed, true);
            assert.equal(f.owner.session.saveJSON(), canonical);
        } finally { f.dispose(); }
    }
});

test('completed Basics offers an explicit Chapter I transition and preserves earlier chapter choices', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const { newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
    const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
    owner.fjord.firstSteps = { ...newFirstSteps(), status: 'active', journey: {
        ...newJourney('orientation'),
        orientation: ['ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time', 'ui-navigation'],
        keptShipId: 'founding-longship', later: ['wildlife-species'], skipped: ['upgrade-home'],
    } };
    const f = fixture(false, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.restore(); f.guide.open();
        assert.equal(f.guide.root.dataset.chapter, 'orientation');
        assert.match(f.guide.root.textContent, /Basics complete/);
        assert.equal(owner.session.running, false);
        f.click('continue-home');
        assert.equal(f.guide.root.dataset.chapter, 'home');
        assert.equal(owner.fjord.firstSteps.journey.keptShipId, 'founding-longship');
        assert.deepEqual(owner.fjord.firstSteps.journey.later, ['wildlife-species']);
        assert.deepEqual(owner.fjord.firstSteps.journey.skipped, ['upgrade-home']);
        assert.equal(owner.session.saveJSON(), canonical);
        assert.equal(owner.session.running, false);
    } finally { f.dispose(); }
});

test('guide keyboard controls keep their keys out of world navigation while preserving Escape', () => {
    const f = fixture();
    try {
        f.guide.newStart(); f.click('guide'); f.guide.open();
        const reachedWorld = [];
        window.addEventListener('keydown', event => reachedWorld.push(event.key));
        const control = f.guide.root.querySelector('[data-guide="acknowledge"]');
        control.focus();
        for (const key of [' ', 'ArrowDown', 'w'])
            control.dispatchEvent(new window.KeyboardEvent('keydown', {key, bubbles:true}));
        assert.deepEqual(reachedWorld, [], 'Guide controls never move the camera or toggle recording');
        control.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
        assert.equal(f.owner.fjord.firstSteps.collapsed, true);
        assert.ok(document.activeElement.closest('#fjord-first-steps-card'));
    } finally { f.dispose(); }
});

test('completed Basics lessons remain reviewable through the chapter objective controls', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const { newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
    const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
    owner.fjord.firstSteps = { ...newFirstSteps(), status:'active', journey: {
        ...newJourney('orientation'),
        orientation:['ui-camera','ui-resident','ui-connections','ui-home','ui-time','ui-navigation'],
    }};
    const f = fixture(false, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.restore(); f.guide.open();
        f.objective('ui-time');
        assert.equal(f.guide.root.querySelector('article h3').textContent, 'Control time');
        f.click('show');
        assert.equal(document.activeElement, document.querySelector('#fjord-run'));
        f.chapter('orientation');
        assert.match(f.guide.root.textContent, /Basics complete/);
        assert.equal(owner.session.running, false);
        assert.equal(owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});

test('acknowledging the selected final lesson shows completion and retains keyboard focus inside guidance', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const { newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
    const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
    owner.fjord.firstSteps = { ...newFirstSteps(), status:'active', journey: {
        ...newJourney('orientation'), selected:'ui-time',
        orientation:['ui-camera','ui-resident','ui-connections','ui-home','ui-navigation'],
    }};
    const f = fixture(false, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.restore(); f.guide.open();
        f.guide.root.querySelector('[data-guide="acknowledge"]').focus();
        f.click('acknowledge');
        assert.ok(document.activeElement.closest('#fjord-first-steps-card'), 'Completion does not drop keyboard focus to the world');
        assert.ok(f.guide.root.querySelector('[data-guide="continue-home"]'));
        assert.match(f.guide.root.textContent, /Basics complete/);
        assert.equal(owner.session.saveJSON(),canonical);
        assert.equal(owner.session.running,false);
    } finally { f.dispose(); }
});


test('Guide me uses a single non-modal callout and a compact chip instead of the long chapter card', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        const callout = document.querySelector('#fjord-basics-callout');
        assert.ok(callout, 'Guidance appears next to the actual control instead of in the long card');
        assert.equal(callout.hidden, false);
        assert.match(callout.textContent, /Step 1[/]6/);
        assert.equal(callout.getAttribute('aria-modal'), null);
        assert.ok(document.querySelector('#fjord-basics-chip'));
        assert.equal(f.guide.root.hidden, true, 'The full chapter browser stays out of the guided exercise');
        assert.ok(callout.querySelector('[data-basics="skip"]'));
        assert.ok(callout.querySelector('[data-basics="next"]'));
        assert.equal(f.owner.session.running, false);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});


test('the anchored resident exercise follows actual selection and closing, never programmatic card opening', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        f.guide.navigated('camera');
        const callout = document.querySelector('#fjord-basics-callout');
        assert.equal(callout.dataset.step, 'ui-resident');
        const person = Object.values(f.owner.session.readSnapshot().personas)[0];
        f.ui.showResident(person.id);
        assert.match(callout.textContent, /Select a resident/);
        assert.equal(callout.dataset.phase, 'entry', 'Programmatic Show me is not a selection exercise');
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"]').click();
        assert.equal(callout.dataset.phase, 'card');
        assert.match(callout.textContent, /This is/);
        callout.querySelector('[data-basics="next"]').click();
        assert.equal(callout.dataset.phase, 'close');
        document.querySelector('#entity-panel [data-ui="close-card"]').click();
        assert.equal(callout.dataset.step, 'ui-connections');
        assert.ok(f.owner.fjord.firstSteps.journey.orientation.includes('ui-resident'));
        assert.equal(f.owner.session.running, false);
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});


test('the connection callout follows a real household link and waits for the resulting card to close', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide'); f.guide.navigated('camera');
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"]').click();
        document.querySelector('#entity-panel [data-ui="close-card"]').click();
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"]').click();
        const callout = document.querySelector('#fjord-basics-callout');
        assert.equal(callout.dataset.step, 'ui-connections');
        assert.match(callout.textContent, /Follow the household link/);
        document.querySelector('#entity-panel .fjord-relations [data-kind="household"]').click();
        assert.equal(callout.dataset.phase, 'result');
        assert.equal(callout.dataset.step, 'ui-connections', 'Opening the resulting view does not skip learning how to return');
        assert.ok(f.owner.fjord.firstSteps.journey.orientation.includes('ui-connections'));
        document.querySelector('#entity-panel [data-ui="close-card"]').click();
        assert.equal(callout.dataset.step, 'ui-home');
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});


test('tour Back, Skip, Resume and Replay basics preserve earned facts and the existing chapters and clock', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.guide.newStart(); f.click('guide');
        const callout = document.querySelector('#fjord-basics-callout');
        callout.querySelector('[data-basics="next"]').click();
        assert.equal(callout.dataset.step, 'ui-resident');
        callout.querySelector('[data-basics="back"]').click();
        assert.equal(callout.dataset.step, 'ui-camera');
        assert.deepEqual(f.owner.fjord.firstSteps.journey.orientation, ['ui-camera']);
        callout.querySelector('[data-basics="next"]').click();
        callout.querySelector('[data-basics="skip"]').click();
        assert.equal(document.querySelector('#fjord-basics-tour').hidden, true);
        assert.equal(f.owner.fjord.firstSteps.journey.tour.dismissed, true);
        f.guide.open(); f.click('resume-tour');
        assert.equal(callout.dataset.step, 'ui-resident');
        callout.querySelector('[data-basics="skip"]').click();
        f.owner.fjord.firstSteps.journey.later = ['wildlife-species'];
        f.owner.fjord.firstSteps.journey.skipped = ['upgrade-home'];
        f.owner.fjord.firstSteps.journey.smitherySeen = true;
        f.owner.session.setRunning(true);
        f.guide.open(); f.click('replay-basics');
        assert.equal(callout.dataset.step, 'ui-camera');
        assert.deepEqual(f.owner.fjord.firstSteps.journey.orientation, []);
        assert.deepEqual(f.owner.fjord.firstSteps.journey.later, ['wildlife-species']);
        assert.deepEqual(f.owner.fjord.firstSteps.journey.skipped, ['upgrade-home']);
        assert.equal(f.owner.fjord.firstSteps.journey.smitherySeen, true);
        assert.equal(f.owner.session.running, true, 'Replaying only Basics does not take ownership of time');
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});


test('home, time acknowledgment and actual navigation open/close finish the tour without running or switching chapters', () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const { newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
    const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
    owner.fjord.firstSteps = { ...newFirstSteps(), status: 'active', journey: {
        ...newJourney('orientation'), orientation: ['ui-camera', 'ui-resident', 'ui-connections'],
        tour: { step: 'ui-home', dismissed: true },
    } };
    const f = fixture(false, owner);
    try {
        const canonical = owner.session.saveJSON();
        f.guide.restore(); f.guide.open(); f.click('resume-tour');
        const callout = document.querySelector('#fjord-basics-callout');
        f.guide.navigated('home', 'focus');
        assert.equal(callout.dataset.step, 'ui-time');
        callout.querySelector('[data-basics="next"]').click();
        assert.equal(callout.dataset.step, 'ui-navigation');
        assert.equal(owner.session.running, false);
        const menu = document.querySelector('#fjord-menu');
        menu.open = true; f.guide.navigated('interface-open', 'menu');
        assert.equal(callout.dataset.phase, 'result');
        assert.equal(callout.dataset.complete, 'false');
        menu.open = false; f.guide.navigated('surface-closed', 'menu');
        assert.equal(callout.dataset.complete, 'true');
        assert.match(callout.textContent, /Basics complete/);
        assert.equal(owner.fjord.firstSteps.journey.chapter, 'orientation');
        assert.equal(owner.fjord.firstSteps.journey.orientation.length, 6);
        assert.equal(owner.session.saveJSON(), canonical);
        callout.querySelector('[data-basics="next"]').click();
        assert.equal(owner.fjord.firstSteps.journey.chapter, 'home');
        assert.equal(owner.session.running, false);
        assert.equal(owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});


test('the navigation callout follows native menu actions and ignores programmatic opening', async () => {
    const owner = new SharedSettlement(newFjordScenario(32));
    const { newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
    const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
    owner.fjord.firstSteps = { ...newFirstSteps(), status: 'active', journey: {
        ...newJourney('orientation'), orientation: ['ui-camera', 'ui-resident', 'ui-connections', 'ui-home', 'ui-time'],
        tour: { step: 'ui-navigation', dismissed: true },
    } };
    const f = fixture(false, owner);
    try {
        f.guide.restore(); f.guide.open(); f.click('resume-tour');
        const menu = document.querySelector('#fjord-menu');
        const callout = document.querySelector('#fjord-basics-callout');
        const settle = () => new Promise(resolve => f.dom.window.setTimeout(resolve, 10));
        menu.open = true; await settle();
        assert.equal(callout.dataset.phase, 'entry', 'A rendered/programmatically opened surface is not a user exercise');
        menu.open = false;
        menu.querySelector(':scope > summary').click(); await settle();
        assert.equal(callout.dataset.phase, 'result');
        menu.querySelector(':scope > summary').click(); await settle();
        assert.equal(callout.dataset.complete, 'true');
        assert.equal(owner.session.running, false);
    } finally { f.dispose(); }
});


test('callout keyboard actions keep world shortcuts out and retain focus when Next disappears', () => {
    const f = fixture();
    try {
        f.guide.newStart(); f.click('guide');
        const callout = document.querySelector('#fjord-basics-callout');
        const next = callout.querySelector('[data-basics="next"]');
        const leaked = [];
        window.addEventListener('keydown', event => leaked.push(event.key));
        next.focus();
        next.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'w', bubbles: true }));
        assert.deepEqual(leaked, []);
        next.click();
        assert.notEqual(document.activeElement, document.body, 'Removing Next must not drop keyboard focus into the world');
        assert.equal(callout.dataset.step, 'ui-resident');
        const skip = callout.querySelector('[data-basics="skip"]');
        skip.focus();
        skip.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(document.querySelector('#fjord-basics-tour').hidden, true);
        assert.deepEqual(leaked, []);
        assert.equal(f.owner.session.running, false);
    } finally { f.dispose(); }
});


test('a household sharing another person identifier remains the connection target after reflow', async () => {
    const f = fixture();
    try {
        const state = f.owner.session.readSnapshot();
        const home = Object.values(state.households).find(home => home.memberIds.length > 1);
        const member = home.memberIds.find(id => id !== home.id);
        assert.ok(member, 'Use the real retained founding couple');
        f.guide.newStart(); f.click('guide'); f.guide.navigated('camera');
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"][data-id="' + member + '"]').click();
        document.querySelector('#entity-panel [data-ui="close-card"]').click();
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"][data-id="' + member + '"]').click();
        document.querySelector('#entity-panel .fjord-relations [data-kind="household"]').click();
        await new Promise(resolve => f.dom.window.setTimeout(resolve, 50));
        const callout = document.querySelector('#fjord-basics-callout');
        assert.equal(callout.dataset.phase, 'result', 'Entity kind, not an overlapping ID, determines the live target');
        document.querySelector('#entity-panel [data-ui="close-card"]').click();
        assert.equal(callout.dataset.step, 'ui-home');
    } finally { f.dispose(); }
});


test('following a real household link keeps keyboard reading focus in the resulting card', () => {
    const f = fixture();
    try {
        const canonical = f.owner.session.saveJSON();
        f.ui.open('settlement', true);
        document.querySelector('.fjord-directory-list [data-kind="persona"]').click();
        const link = document.querySelector('#entity-panel .fjord-relations [data-kind="household"]');
        link.focus(); link.click();
        assert.equal(document.activeElement, document.querySelector('#entity-panel .fjord-card-heading h2'));
        assert.equal(f.owner.session.saveJSON(), canonical);
    } finally { f.dispose(); }
});
