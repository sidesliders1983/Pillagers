import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');
const { newFjordScenario } = loadDOMSource('../src/fjord-play/FjordScenario.ts');
const { FjordInterface } = loadDOMSource('../src/fjord-play/FjordInterface.ts');
const { inspectFirstSteps, newFirstSteps } = loadDOMSource('../src/fjord-play/FirstStepsState.ts');
const { newJourney } = loadDOMSource('../src/fjord-play/JourneyProgress.ts');
const { fjordHeaderHTML } = loadDOMSource('../src/fjord-play/FjordHeader.ts');
const { fjordNavigationHTML } = loadDOMSource('../src/fjord-play/FjordNavigation.ts');

function fixture(mobile = false) {
    const dom = new JSDOM(`<main id="fjord-play">${fjordHeaderHTML()}
        <section id="fjord-management" hidden><div id="entity-panel"></div></section>
        <section id="fjord-workspace" hidden tabindex="-1"><h2 id="fjord-workspace-title"></h2>
            <button type="button" data-ui="close-workspace">Close workspace</button>
            <div id="fjord-directory"></div><section data-workspace-area="attention" hidden></section></section>
        <section id="fjord-first-steps-card"><button id="orientation-opener">Show a resident</button></section>
        ${fjordNavigationHTML()}<button id="fjord-attention" data-surface="attention"><span id="fjord-attention-count"></span></button>
        </main>`, { pretendToBeVisual: true });
    const names = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
        'HTMLSelectElement', 'HTMLOptionElement', 'HTMLDetailsElement', 'HTMLButtonElement',
        'HTMLDialogElement', 'AbortController', 'Event'];
    const previous = Object.fromEntries([...names, 'matchMedia'].map(name => [name, globalThis[name]]));
    for (const name of names) globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    globalThis.matchMedia = () => ({ matches: mobile });

    const owner = new SharedSettlement(newFjordScenario(32));
    owner.fjord.firstSteps = { ...newFirstSteps(), journey: newJourney(), status: 'active' };
    const canonical = owner.session.saveJSON();
    let ui;
    const refresh = () => ui.refresh(owner.session.readSnapshot(), owner.selection, '', () => '');
    const select = (kind, id) => { owner.select(kind ? { kind, id } : null); refresh(); };
    ui = new FjordInterface(owner, {
        select, refresh, notify() {},
        commit() { assert.fail('Orientation cannot issue a gameplay command'); },
        inspected(kind, id) {
            owner.fjord.firstSteps = inspectFirstSteps(owner.fjord.firstSteps, owner.session.readSnapshot(), kind, id);
        },
    });
    document.querySelector('#entity-panel').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (button && !button.disabled) ui.handle(button);
    });
    const opener = document.querySelector('#orientation-opener');
    // jsdom has no layout engine; supply the real opener's visible layout boundary.
    opener.getClientRects = () => [new dom.window.DOMRect(0, 0, 100, 44)];
    opener.addEventListener('click', () => ui.showResident('founder-1'));
    refresh();

    return {
        owner, ui, dom, opener, refresh, select, canonical,
        completed: id => owner.fjord.firstSteps.journey.orientation?.includes(id) ?? false,
        close() { document.querySelector('#entity-panel [data-ui="close-card"]').click(); },
        escape() { document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
        dispose() {
            ui.dispose();
            dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        },
    };
}

test('closing a full Character Card returns to the world and completes meeting a real resident', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.opener.focus();
            f.opener.click();
            assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
            assert.equal(document.querySelector('#fjord-management').hidden, false);
            assert.equal(document.querySelector('#entity-panel h2').textContent,
                f.owner.session.readSnapshot().personas['founder-1'].name);
            assert.equal(f.completed('ui-resident'), false, 'Opening the card is only half of the lesson');

            f.close();

            assert.equal(f.owner.selection, null);
            assert.equal(document.querySelector('#fjord-management').hidden, true);
            assert.equal(f.completed('ui-resident'), true);
            assert.equal(document.activeElement, f.opener);
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});

test('opening Settlement or Activity Center completes interface navigation without changing the campaign', () => {
    for (const mobile of [false, true]) {
        for (const surface of ['settlement', 'attention']) {
            const f = fixture(mobile);
            try {
                f.ui.open('food', true);
                assert.equal(f.completed('ui-navigation'), false, 'A resource view is not this lesson');
                f.ui.close();
                if (surface === 'settlement') document.querySelector('[data-surface="settlement"]').click();
                else f.ui.open('attention', true);

                const workspace = document.querySelector('#fjord-workspace');
                assert.equal(workspace.hidden, false);
                assert.equal(workspace.dataset.surface, surface);
                assert.equal(document.querySelector('#fjord-workspace-title').textContent,
                    surface === 'settlement' ? 'Settlement' : 'Activity Center');
                assert.equal(f.completed('ui-navigation'), true);
                assert.equal(f.owner.session.saveJSON(), f.canonical);
            } finally {
                f.dispose();
            }
        }
    }
});

test('Escape closes the full Character Card on desktop and mobile and restores its visible opener', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.opener.focus();
            f.opener.click();
            assert.equal(document.querySelector('#entity-panel .fjord-relations').closest('[hidden]'), null);
            assert.equal(f.owner.fjord.firstSteps.residentId, 'founder-1');

            f.escape();

            assert.equal(f.owner.selection, null);
            assert.equal(document.querySelector('#fjord-management').hidden, true);
            assert.equal(f.completed('ui-resident'), true);
            assert.equal(document.activeElement, f.opener);
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});

test('peek, collapse, card switching and workspaces never substitute for closing a full Character Card', () => {
    const f = fixture(true);
    try {
        f.select('persona', 'founder-1');
        assert.ok(document.querySelector('[data-ui="expand-card"]'));
        assert.equal(document.querySelector('.fjord-relations'), null, 'The mobile peek is not the full card');
        f.close();
        assert.equal(f.completed('ui-resident'), false);

        f.opener.click();
        document.querySelector('[data-ui="collapse-card"]').click();
        f.close();
        assert.equal(f.completed('ui-resident'), false, 'Collapsing and closing the peek do not complete the lesson');

        f.opener.click();
        f.ui.showResident('founder-2');
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-2' });
        assert.equal(f.completed('ui-resident'), false, 'Switching to another real resident does not close their card');
        f.ui.open('settlement', true);
        assert.equal(document.querySelector('#fjord-management').hidden, true);
        assert.equal(f.completed('ui-resident'), false);
        document.querySelector('[data-ui="close-workspace"]').click();
        assert.equal(document.querySelector('#fjord-workspace').hidden, true);
        assert.equal(document.querySelector('#fjord-management').hidden, false);
        assert.equal(f.completed('ui-resident'), false, 'Closing a workspace returns to the selected card');
        f.escape();
        assert.equal(f.completed('ui-resident'), false, 'A stale selection with no full card projection is not a card close');

        f.ui.showResident('founder-2');
        document.querySelector('[data-ui="occupation"]').click();
        f.close();
        assert.equal(f.completed('ui-resident'), false, 'Closing a work task does not close the full Character Card');
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a stale card cannot complete meeting a different selected resident', () => {
    const f = fixture();
    try {
        f.opener.click();
        assert.equal(f.owner.fjord.firstSteps.residentId, 'founder-1');
        f.owner.select({ kind: 'persona', id: 'founder-2' });
        f.close();
        assert.equal(f.completed('ui-resident'), false);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a card from before campaign restoration cannot complete meeting a resident', () => {
    const f = fixture();
    try {
        f.opener.click();
        f.owner.session.loadJSON(f.canonical);
        f.close();
        assert.equal(f.completed('ui-resident'), false);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('Escape inside an open dialog leaves the resident card and dialog focus alone', () => {
    const f = fixture();
    try {
        f.opener.click();
        const dialog = document.createElement('dialog');
        dialog.open = true;
        dialog.innerHTML = '<button>Keep reviewing</button>';
        document.querySelector('#fjord-play').append(dialog);
        const review = dialog.querySelector('button');
        review.focus();
        f.escape();
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
        assert.equal(f.completed('ui-resident'), false);
        assert.equal(document.activeElement, review);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('closing a Character Card uses a visible world control when its opener has disappeared', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.opener.click();
            f.opener.hidden = true;
            const fallback = document.querySelector(mobile ? '#fjord-mobile-menu' : '#fjord-first-steps');
            fallback.getClientRects = () => [new f.dom.window.DOMRect(0, 0, 44, 44)];
            f.close();
            assert.equal(f.completed('ui-resident'), true);
            assert.equal(document.activeElement, fallback);
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});
