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

function fixture(mobile = false, callbacks = {}) {
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
    const navigation = { residentId: null, connectionId: null, closedId: null };
    let ui;
    const refresh = () => ui.refresh(owner.session.readSnapshot(), owner.selection, '', () => '');
    const select = (kind, id) => { owner.select(kind ? { kind, id } : null); refresh(); };
    ui = new FjordInterface(owner, {
        select, refresh, notify() {},
        commit() { assert.fail('Orientation cannot issue a gameplay command'); },
        inspected(kind, id) {
            owner.fjord.firstSteps = inspectFirstSteps(owner.fjord.firstSteps, owner.session.readSnapshot(), kind, id);
            callbacks.inspected?.(kind, id, owner, ui);
        },
        navigated(kind, id, entityKind) {
            if (kind === 'resident') navigation.residentId = id;
            if (kind === 'connection') navigation.connectionId = id;
            if (kind === 'closed') navigation.closedId = id;
            callbacks.navigated?.(kind, id, owner, ui, entityKind);
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
        owner, ui, dom, opener, refresh, select, canonical, navigation,
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
        assert.deepEqual(f.navigation, { residentId: null, connectionId: null, closedId: null });
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
        assert.equal(f.navigation.closedId, null);
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
        assert.equal(f.navigation.closedId, null);
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

test('actual resident-list selection reports navigation while programmatic presentation does not', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.ui.showResident('founder-1');
            f.ui.showEntity('persona', 'founder-2', true);
            f.refresh();
            f.ui.open('settlement', true);
            assert.deepEqual(f.navigation, { residentId: null, connectionId: null, closedId: null });

            document.querySelector('#fjord-directory [data-ui="inspect"][data-kind="persona"][data-id="founder-1"]').click();

            assert.equal(f.navigation.residentId, 'founder-1');
            assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
            assert.equal(document.querySelector('#fjord-workspace').hidden, true);
            assert.equal(document.querySelector('#fjord-management').hidden, false);
            assert.ok(document.querySelector('#entity-panel .fjord-relations'));
            assert.equal(f.navigation.connectionId, null);
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});

test('expanding an actual mobile resident peek reports the resulting full Character Card', () => {
    const f = fixture(true);
    try {
        f.select('persona', 'founder-1');
        assert.equal(f.navigation.residentId, null);
        assert.equal(document.querySelector('#entity-panel .fjord-relations'), null);

        document.querySelector('#entity-panel [data-ui="expand-card"]').click();

        assert.equal(f.navigation.residentId, 'founder-1');
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
        assert.ok(document.querySelector('#entity-panel .fjord-relations'));
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('following a real resident household link reports the selected local connection', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.ui.showResident('founder-1');
            const link = document.querySelector('#entity-panel .fjord-relations [data-kind="household"]');
            const householdId = link.dataset.id;
            assert.equal(f.navigation.connectionId, null);

            link.click();

            assert.equal(f.navigation.connectionId, householdId);
            assert.deepEqual(f.owner.selection, { kind: 'household', id: householdId });
            assert.ok(document.querySelector('#entity-panel .fjord-home-residents'));
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});

test('a real household member link reports both the person and their actual connection', () => {
    const f = fixture(true);
    try {
        const home = Object.values(f.owner.session.readSnapshot().households)
            .find(item => item.memberIds.includes('founder-1'));
        f.ui.showEntity('household', home.id);
        assert.deepEqual(f.navigation, { residentId: null, connectionId: null, closedId: null });

        document.querySelector('#entity-panel .fjord-home-residents [data-kind="persona"][data-id="founder-1"]').click();

        assert.equal(f.navigation.residentId, 'founder-1');
        assert.equal(f.navigation.connectionId, 'founder-1');
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
        assert.ok(document.querySelector('#entity-panel .fjord-relations'));
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('actual full Character Card close reports the cleared live selection', () => {
    for (const mobile of [false, true]) {
        const f = fixture(mobile);
        try {
            f.ui.showResident('founder-1');
            assert.equal(f.navigation.closedId, null);

            f.close();

            assert.equal(f.navigation.closedId, 'founder-1');
            assert.equal(f.owner.selection, null);
            assert.equal(document.querySelector('#fjord-management').hidden, true);
            assert.equal(f.owner.session.saveJSON(), f.canonical);
        } finally {
            f.dispose();
        }
    }
});

test('a navigation callback opening another resident cannot credit the previous household connection', () => {
    const f = fixture(true, {
        navigated(kind, _id, _owner, ui) {
            if (kind === 'resident') ui.showResident('founder-2');
        },
    });
    try {
        const home = Object.values(f.owner.session.readSnapshot().households)
            .find(item => item.memberIds.includes('founder-1'));
        f.ui.showEntity('household', home.id);
        document.querySelector('#entity-panel .fjord-home-residents [data-id="founder-1"]').click();
        assert.equal(f.navigation.residentId, 'founder-1');
        assert.equal(f.navigation.connectionId, null);
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-2' });
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a history restoration during real selection cannot credit an action from the earlier history', () => {
    let restored = false;
    const f = fixture(false, {
        inspected(kind, id, owner, ui) {
            if (kind !== 'resident' || restored) return;
            restored = true;
            owner.session.loadJSON(owner.session.saveJSON());
            ui.showResident(id);
        },
    });
    try {
        f.ui.open('settlement', true);
        document.querySelector('#fjord-directory [data-ui="inspect"][data-kind="persona"][data-id="founder-1"]').click();
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-1' });
        assert.equal(f.navigation.residentId, null);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a real local livestock-list link and its close report only that selected connection', () => {
    const f = fixture(true);
    try {
        const animal = Object.values(f.owner.session.readSnapshot().landing.cattle)
            .find(item => item.deathWinter === null);
        document.querySelector('[data-stock="livestock"]').click();
        assert.deepEqual(f.navigation, { residentId: null, connectionId: null, closedId: null });

        document.querySelector(`#fjord-directory [data-ui="inspect"][data-kind="cattle"][data-id="${animal.id}"]`).click();

        assert.equal(f.navigation.connectionId, animal.id);
        assert.equal(f.navigation.residentId, null);
        assert.deepEqual(f.owner.selection, { kind: 'cattle', id: animal.id });
        assert.equal(document.querySelector('#fjord-management').hidden, false);
        f.close();
        assert.equal(f.navigation.closedId, animal.id);
        assert.equal(f.owner.selection, null);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a close notification may open another card without its heading losing focus', () => {
    const f = fixture(true, {
        navigated(kind, _id, _owner, ui) {
            if (kind === 'closed') ui.showResident('founder-2');
        },
    });
    try {
        f.ui.showResident('founder-1');
        f.close();
        assert.equal(f.navigation.closedId, 'founder-1');
        assert.deepEqual(f.owner.selection, { kind: 'persona', id: 'founder-2' });
        assert.equal(document.activeElement, document.querySelector('#entity-panel h2'));
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('a close notification restoring history keeps focus chosen for the replacement view', () => {
    const f = fixture(false, {
        navigated(kind, _id, owner) {
            if (kind !== 'closed') return;
            owner.session.loadJSON(owner.session.saveJSON());
            document.querySelector('#fjord-run').focus();
        },
    });
    try {
        f.opener.focus();
        f.opener.click();
        f.close();
        assert.equal(f.navigation.closedId, 'founder-1');
        assert.equal(f.owner.selection, null);
        assert.equal(document.activeElement, document.querySelector('#fjord-run'));
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});

test('closing real resident and household cards with the same ID identifies the actual closed view', () => {
    let closedView;
    const f = fixture(true, {
        navigated(kind, id, _owner, _ui, entityKind) {
            if (kind === 'closed') closedView = { id, entityKind };
        },
    });
    try {
        const home = Object.values(f.owner.session.readSnapshot().households)[0];
        assert.ok(f.owner.session.readSnapshot().personas[home.id]);
        f.ui.showResident(home.id);
        assert.ok(document.querySelector('#entity-panel .fjord-relations'));
        f.close();
        assert.deepEqual(closedView, { id: home.id, entityKind: 'persona' });

        f.ui.showEntity('household', home.id);
        assert.ok(document.querySelector('#entity-panel .fjord-home-residents'));
        f.close();
        assert.deepEqual(closedView, { id: home.id, entityKind: 'household' });
        assert.equal(f.owner.selection, null);
        assert.equal(f.owner.session.saveJSON(), f.canonical);
    } finally {
        f.dispose();
    }
});
