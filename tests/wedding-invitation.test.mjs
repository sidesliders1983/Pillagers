import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';

const core = loadDOMSource('../src/simulation/SimulationCore.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const { SharedSettlement } = loadDOMSource('../src/play/SharedSettlement.ts');

function fixture(initialFood = 100, initialMaterials = 5, enabled = true) {
    const dom = new JSDOM('<main id="fjord-play"><canvas id="fjord-canvas"></canvas><button id="outside">Outside</button></main>',
        { pretendToBeVisual: true });
    const previous = {};
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLButtonElement',
        'AbortController', 'CustomEvent']) {
        previous[name] = globalThis[name];
        globalThis[name] = name === 'window' ? dom.window : dom.window[name];
    }
    const state = core.createCampaign(32, { initialFood, initialMaterials, foundingCoupleChanceBps: 0 }, {
        partnershipChanceBps: 10000, fertilityChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    }, { enabled: false }, {}, {}, {}, undefined, undefined, undefined, { enabled });
    const session = new GameplaySession();
    session.loadJSON(core.serializeState(state));
    const owner = new SharedSettlement(session);
    return { dom, session, owner,
        dispose() {
            dom.window.close();
            for (const [name, value] of Object.entries(previous)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        },
    };
}

test('a new real partnership offers one non-modal wedding invitation and Not now remembers only that source', () => {
    const f = fixture();
    let invitation;
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        let saves = 0;
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() { saves++; },
            commit(commands, done, rejected) {
                try { f.session.commandBatch(typeof commands === 'function' ? commands() : commands); done(); }
                catch (error) { rejected(error); }
            },
        });
        invitation.update();
        assert.equal(invitation.root.hidden, true);
        f.session.setRunning(true);
        f.session.command({ type: 'AdvanceWinter' });
        invitation.update();
        assert.equal(invitation.root.hidden, false);
        assert.equal(invitation.root.getAttribute('role'), 'dialog');
        assert.equal(invitation.root.getAttribute('aria-modal'), 'false');
        assert.equal(document.querySelector('dialog[open]'), null);
        const source = invitation.root.dataset.weddingSource;
        const event = f.session.readSnapshot().events.find(item => item.id === source);
        assert.equal(event.type, 'PartnershipFormed');
        for (const id of event.details.participants)
            assert.ok(invitation.root.textContent.includes(f.session.readSnapshot().personas[id].name));
        assert.match(invitation.root.textContent, /3 Food per attendee/);
        assert.match(invitation.root.textContent, /24 Food total/);
        assert.match(invitation.root.textContent, /1 Material/);
        assert.equal(invitation.root.querySelector('[data-wedding-action="confirm"]').textContent.trim(), 'Confirm');
        const savedCore = f.session.saveJSON();
        invitation.root.querySelector('[data-wedding-action="decline"]').click();
        assert.equal(invitation.root.hidden, true);
        assert.equal(f.session.saveJSON(), savedCore);
        assert.equal(f.session.running, true);
        assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, true);
        assert.equal(saves, 1);
        const restored = SharedSettlement.restore(f.owner.persist(), 'fjord');
        invitation.dispose();
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), restored, {
            changed() {}, commit() { throw new Error('Reading an invitation must not submit a command'); },
        });
        invitation.update();
        assert.notEqual(invitation.root.dataset.weddingSource, source);
        assert.equal(restored.session.saveJSON(), savedCore);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('Confirm spends the displayed per-attendee Food and campfire Material atomically without pausing', () => {
    const f = fixture();
    let invitation;
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() { invitation.update(); },
            commit(commands, done, rejected) {
                try { f.session.commandBatch(typeof commands === 'function' ? commands() : commands); done(); }
                catch (error) { rejected(error); }
            },
        });
        f.session.setRunning(true);
        f.session.command({ type: 'AdvanceWinter' });
        invitation.update();
        const source = invitation.root.dataset.weddingSource;
        const before = f.session.readSnapshot();
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        const after = f.session.readSnapshot();
        assert.equal(after.stocks.food, before.stocks.food - 24);
        assert.equal(after.stocks.materials, before.stocks.materials - 1);
        assert.equal(core.inspectCampfire(after).lit, true);
        assert.equal(core.inspectCampfire(after).fuelTicks, 1000);
        const celebration = after.events.find(event => event.type === 'CulturalGatheringHeld');
        assert.equal(celebration.details.sourceEventId, source);
        assert.equal(celebration.details.foodCost, 24);
        assert.equal(celebration.details.materialsCost, 1);
        assert.equal(celebration.details.participants.length, 8);
        assert.deepEqual(after.time, before.time);
        assert.deepEqual(after.personas, before.personas);
        assert.equal(f.session.running, true);
        assert.equal(invitation.root.hidden, true);
        assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, true);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('a queued invitation cannot spend in a reloaded campaign even when its source IDs and quote match', () => {
    const f = fixture();
    let invitation;
    const pending = [];
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() {},
            commit(commands, done, rejected) {
                pending.push(() => {
                    try {
                        f.session.commandBatch(typeof commands === 'function' ? commands() : commands);
                        done();
                    } catch (error) { rejected(error); }
                });
            },
        });
        f.session.command({ type: 'AdvanceWinter' });
        invitation.update();
        const saved = f.session.saveJSON();
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        assert.equal(pending.length, 1);
        f.session.loadJSON(saved);
        invitation.update();
        pending.shift()();
        assert.equal(f.session.saveJSON(), saved);
        assert.equal(invitation.root.querySelector('[data-wedding-action="confirm"]').disabled, false);
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        pending.shift()();
        assert.equal(f.session.readSnapshot().stocks.food, 85);
        assert.equal(f.session.readSnapshot().events.filter(event => event.type === 'CulturalGatheringHeld').length, 1);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('a changed campfire quote rejects without Food spending and requires a fresh Confirm at the new cost', () => {
    const f = fixture();
    let invitation;
    const pending = [];
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() { invitation.update(); },
            commit(commands, done, rejected) {
                pending.push(() => {
                    try {
                        f.session.commandBatch(typeof commands === 'function' ? commands() : commands);
                        done();
                    } catch (error) { rejected(error); }
                });
            },
        });
        f.session.command({ type: 'AdvanceWinter' });
        invitation.update();
        const source = invitation.root.dataset.weddingSource;
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        assert.equal(invitation.root.querySelector('[data-wedding-action="confirm"]').disabled, true);
        f.session.command({ type: 'SetCampfire', lit: true });
        const alreadyLit = f.session.saveJSON();
        const paidMaterials = f.session.readSnapshot().stocks.materials;
        pending.shift()();
        assert.equal(f.session.saveJSON(), alreadyLit);
        assert.match(invitation.root.textContent, /quote has changed/i);
        assert.match(invitation.root.textContent, /0 Materials/);
        assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, false);
        assert.equal(invitation.root.querySelector('[data-wedding-action="confirm"]').disabled, false);
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        pending.shift()();
        assert.equal(f.session.readSnapshot().stocks.food, 85);
        assert.equal(f.session.readSnapshot().stocks.materials, paidMaterials);
        assert.equal(f.session.readSnapshot().events.filter(event => event.type === 'CulturalGatheringHeld').length, 1);
        assert.equal(f.session.readSnapshot().events.find(event => event.type === 'CulturalGatheringHeld').details.materialsCost, 0);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('ordinary campaigns with culture disabled never receive an automatic wedding prototype window', () => {
    const f = fixture(100, 5, false);
    let invitation;
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() {}, commit() { throw new Error('Disabled culture must never submit'); },
        });
        f.session.command({ type: 'AdvanceWinter' });
        assert.ok(f.session.readSnapshot().events.some(event => event.type === 'PartnershipFormed'));
        invitation.update();
        assert.equal(invitation.root.hidden, true);
        assert.equal(f.session.readSnapshot().culture, undefined);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('reading the partnership after Confirm cannot cancel the same-campaign sponsorship intent', () => {
    const f = fixture();
    let invitation;
    const pending = [];
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() {},
            commit(commands, done, rejected) {
                pending.push(() => {
                    try {
                        f.session.commandBatch(typeof commands === 'function' ? commands() : commands);
                        done();
                    } catch (error) { rejected(error); }
                });
            },
        });
        f.session.command({ type: 'AdvanceWinter' });
        invitation.update();
        const source = invitation.root.dataset.weddingSource;
        invitation.root.querySelector('[data-wedding-action="confirm"]').click();
        f.owner.fjord.markAttentionRead([source]);
        invitation.update();
        pending.shift()();
        assert.equal(f.session.readSnapshot().stocks.food, 85);
        assert.equal(f.session.readSnapshot().events.find(event => event.type === 'CulturalGatheringHeld').details.sourceEventId, source);
    } finally { invitation?.dispose(); f.dispose(); }
});

test('insufficient Food or Materials disables Confirm without shrinking the quoted attendance', () => {
    for (const [food, materials] of [[0, 5], [100, 0]]) {
        const f = fixture(food, materials);
        let invitation;
        try {
            if (materials === 0) {
                for (const id of Object.keys(f.session.readSnapshot().personas))
                    f.session.command({ type: 'AssignOccupation', personaId: id, occupation: null });
            }
            const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
            invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
                changed() {}, commit() { throw new Error('An unavailable invitation must not submit'); },
            });
            f.session.command({ type: 'AdvanceWinter' });
            invitation.update();
            assert.equal(invitation.root.hidden, false);
            const source = invitation.root.dataset.weddingSource;
            const offer = core.gatheringOffer(f.session.readSnapshot(), 'wedding', source);
            assert.equal(offer.participantIds.length, 8);
            assert.equal(offer.foodCost, 24);
            assert.match(invitation.root.textContent, /8 attendees/);
            assert.match(invitation.root.textContent, /24 Food total/);
            const confirm = invitation.root.querySelector('[data-wedding-action="confirm"]');
            assert.equal(confirm.textContent.trim(), 'Not enough resources');
            assert.equal(confirm.disabled, true);
            const saved = f.session.saveJSON();
            confirm.click();
            assert.equal(f.session.saveJSON(), saved);
            assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, false);
        } finally { invitation?.dispose(); f.dispose(); }
    }
});

test('background and explicit-flow suspension defer the source; Escape dismisses without a camera click or pause', () => {
    const f = fixture();
    let invitation;
    try {
        const { WeddingInvitation } = loadDOMSource('../src/fjord-play/WeddingInvitation.ts');
        invitation = new WeddingInvitation(document.querySelector('#fjord-play'), f.owner, {
            changed() {}, commit() { throw new Error('Deferral and navigation never sponsor'); },
        });
        f.session.setRunning(true);
        f.session.command({ type: 'AdvanceWinter' });
        const before = f.session.saveJSON();
        invitation.update(true);
        assert.equal(invitation.root.hidden, true);
        const outside = document.querySelector('#outside');
        outside.focus();
        invitation.update(false);
        assert.equal(invitation.root.hidden, false);
        assert.equal(document.activeElement, outside);
        const source = invitation.root.dataset.weddingSource;
        let worldClicks = 0;
        document.querySelector('#fjord-play').addEventListener('click', () => worldClicks++);
        invitation.root.querySelector('.fjord-wedding-couple').dispatchEvent(new f.dom.window.MouseEvent('click', { bubbles: true }));
        assert.equal(worldClicks, 0);
        outside.click();
        assert.equal(worldClicks, 1);
        invitation.update(true);
        assert.equal(invitation.root.hidden, true);
        assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, false);
        invitation.update(false);
        assert.equal(invitation.root.dataset.weddingSource, source);
        document.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(invitation.root.hidden, true);
        assert.equal(document.activeElement, outside);
        assert.equal(f.owner.fjord.attentionView().records.find(item => item.eventId === source).read, true);
        assert.equal(f.session.saveJSON(), before);
        assert.equal(f.session.running, true);
    } finally { invitation?.dispose(); f.dispose(); }
});
