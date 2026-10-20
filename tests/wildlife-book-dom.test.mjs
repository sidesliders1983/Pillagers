import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from './load-dom-source.mjs';
const load = path => loadDOMSource('../src/' + path + '.ts');
const { SharedSettlement, localSettlementText } = load('play/SharedSettlement');
const { GameplaySession } = load('gameplay-lab/GameplaySession');
const core = load('simulation/SimulationCore');
const { AttentionView } = load('lore/AttentionView');
const { readWildlifeDiscoveries, wildlifeAttentionAdapter } = load('lore/WildlifeAttention');
const reads = owner => readWildlifeDiscoveries(owner.session.readSnapshot(), owner.fjord.attentionSave());
const { ClanBookReader } = load('lore/ClanBookReader');
const { wildlifeEventLink, recentGroupWildlife } = load('lore/WildlifeBookView');

test('real Clan Book DOM supports explicit adoption, Attention, witnesses, groups, persistence and stale links', () => {
    const dom = new JSDOM('<!doctype html><main><button id="clan-book-open">Clan Book</button><section id="attention"></section></main>',
        { pretendToBeVisual: true, url: 'http://localhost/fjord-play' });
    const previous = Object.fromEntries(['window', 'document', 'HTMLElement', 'Element'].map(key => [key, globalThis[key]]));
    for (const key of Object.keys(previous)) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
    const session = new GameplaySession(32);
    session.loadJSON(core.serializeState(core.createCampaign(32, { initialFood: 1000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false })));
    const owner = new SharedSettlement(session);
    owner.session.initializeDiscovery(owner.fjord.blueprint, owner.fjord.layout.geographyId);
    const selected = [], groups = [], persisted = [];
    const attention = document.querySelector('#attention');
    let attentionView;
    const refresh = () => attentionView?.render();
    const reader = new ClanBookReader(owner, () => persisted.push(owner.persist()),
        { witness: id => selected.push(id), group: id => groups.push(id) }, refresh);
    attentionView = new AttentionView(attention, owner, () => { persisted.push(owner.persist()); refresh(); },
        { target: target => { if (target.kind === 'wildlife') reader.openWildlife(target.id); } });
    const panel = document.querySelector('#clan-book-reader');
    const wildlifePanel = document.querySelector('#clan-book-wildlife-panel');
    const click = selector => {
        const button = document.querySelector(selector);
        assert.ok(button, 'Control exists: ' + selector); button.click();
    };
    try {
        reader.openWildlife();
        assert.equal(session.snapshot().wildlife, undefined);
        assert.match(wildlifePanel.textContent, /Earlier encounters are not inferred/);
        click('[data-wildlife-enable]');
        assert.ok(session.snapshot().wildlife);
        assert.match(wildlifePanel.textContent, /No wildlife has been recorded/);
        assert.doesNotMatch(wildlifePanel.textContent, /Lynx|Reindeer|Rabbit/);
        const beforeEncounters = session.saveJSON();
        session.command({ type: 'CreateExpeditionGroup', name: 'Coast watch', memberIds: ['founder-1', 'founder-2'] });
        session.command({ type: 'StartExpedition', groupId: 'group-1' });
        const target = session.snapshot().wildlife.actors.find(actor => actor.id.includes('grounded')).position;
        session.command({ type: 'ExploreArea', groupId: 'group-1', target: { x: target.x, z: target.z } });
        for (let batch = 0; batch < 30 && !session.wildlifeHistory().summaries().length; batch++)
            session.command({ type: 'AdvanceTicks', ticks: 5 });
        const record = session.wildlifeHistory().summaries()[0]?.first;
        assert.ok(record, 'Actual expedition produces the UI source record');
        refresh();
        const beforeReading = session.saveJSON();
        const sharedRecord = owner.fjord.attentionView().records.find(item => item.eventId === record.eventId);
        assert.ok(sharedRecord && !sharedRecord.read && sharedRecord.severity === 'noteworthy');
        const groupButton = attention.querySelector('[data-attention-action="group"][data-attention-id="WildlifeSighted:' + record.time.winter + '"]');
        if (groupButton) groupButton.click();
        click('#attention [data-attention-action="event"][data-attention-id="' + record.eventId + '"]');
        click('#attention [data-attention-action="target"]');
        assert.equal(panel.hidden, false);
        assert.equal(panel.dataset.tab, 'wildlife');
        assert.match(wildlifePanel.textContent, /First clan sighting/);
        assert.equal(wildlifePanel.querySelectorAll('[data-wildlife-person]').length, 2);
        assert.doesNotMatch(wildlifePanel.textContent, /Lynx|Reindeer|Rabbit/);
        assert.equal(session.saveJSON(), beforeReading);
        assert.deepEqual(reads(owner), [record.eventId]);
        assert.ok(persisted.length);
        assert.equal(owner.fjord.attentionView().records.find(item => item.eventId === record.eventId).read, true);
        const witness = record.sighting.witnessPersonaIds[0];
        const witnessButton = wildlifePanel.querySelector('[data-wildlife-person="' + witness + '"]');
        witnessButton.focus();
        for (let refresh = 0; refresh < 20; refresh++) reader.update();
        assert.equal(document.activeElement, witnessButton, 'Unchanged refreshes must preserve keyboard/touch targets');
        assert.equal(witnessButton.isConnected, true);
        click('[data-wildlife-person="' + witness + '"]');
        assert.deepEqual(selected, [witness]);
        assert.equal(panel.hidden, true);
        reader.openWildlife(record.eventId);
        click('[data-wildlife-group]');
        assert.deepEqual(groups, ['group-1']);
        assert.equal(panel.hidden, true);
        const groupHistory = document.createElement('div');
        groupHistory.innerHTML = recentGroupWildlife(session, 'group-1'); document.body.append(groupHistory);
        groupHistory.querySelector('[data-wildlife-event]').click();
        assert.equal(panel.hidden, false);
        assert.ok(wildlifePanel.querySelector('[data-wildlife-target]'));
        const tab = document.querySelector('#clan-book-wildlife-tab');
        tab.focus(); tab.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal(document.activeElement.id, 'clan-book-story-tab');
        document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
        assert.equal(document.activeElement.id, 'clan-book-wildlife-tab');
        const staleLink = document.createElement('div');
        staleLink.innerHTML = wildlifeEventLink(record, session.personalHistoryEpoch);
        document.body.append(staleLink);
        const checkpoint = owner.persist();
        const legacy = JSON.parse(checkpoint);
        delete legacy.fjord.attention; legacy.fjord.wildlifeReadIds = [];
        const migrated = SharedSettlement.restore(JSON.stringify(legacy), 'fjord');
        assert.deepEqual(migrated.session.snapshot(), session.snapshot());
        assert.equal(migrated.fjord.attentionView().records.find(item => item.eventId === record.eventId).read, false);
        assert.ok(migrated.fjord.attentionView().records.filter(item => item.canonicalType !== 'WildlifeSighted').every(item => item.read),
            'Prototype migration preserves unread discoveries without replaying old life/expedition notifications');
        assert.equal(Object.hasOwn(migrated.fjord.exportData(), 'wildlifeReadIds'), false,
            'New saves have one common read contract, not a parallel wildlife read store');
        legacy.fjord.wildlifeReadIds = [record.eventId];
        assert.deepEqual(reads(SharedSettlement.restore(JSON.stringify(legacy), 'fjord')), [record.eventId]);
        legacy.fjord.wildlifeReadIds = ['event-999999'];
        assert.throws(() => migrated.importJSON(JSON.stringify(legacy.fjord)), /legacy wildlife/);
        assert.deepEqual(migrated.session.snapshot(), session.snapshot(), 'Rejected migration commits no canonical changes');
        const source = session.readSnapshot().events.find(event => event.id === record.eventId);
        assert.match(wildlifeAttentionAdapter(source).shortText, /Coast watch sighted a .* on their journey/);
        const policyFixture = { ...source, details: { ...source.details, firstForClan: false } };
        assert.equal(wildlifeAttentionAdapter(policyFixture).severity, 'ambient', 'Repeat policy has no Attention badge');
        owner.importJSON(JSON.stringify(JSON.parse(checkpoint).fjord));
        reader.update();
        assert.equal(panel.hidden, true);
        staleLink.querySelector('button').click();
        assert.equal(panel.hidden, true, 'Previous campaign epoch cannot open a coincidentally reused event ID');
        reader.openWildlife(record.eventId);
        assert.equal(panel.hidden, false);
        assert.deepEqual(reads(owner), [record.eventId]);
        const sidecar = owner.fjord.exportJSON();
        const mixedStorage = { getItem: key => key === 'pillagers.gameplay-lab.v1' ? beforeEncounters : sidecar };
        const rolledBack = SharedSettlement.restore(localSettlementText(mixedStorage), 'fjord');
        assert.deepEqual(rolledBack.session.snapshot(), core.reconstructState(beforeEncounters));
        assert.deepEqual(reads(rolledBack), [],
            'A newer same-seed presentation sidecar must not block or mark discoveries in an older canonical save');
        panel.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(panel.hidden, true);
    } finally {
        attentionView.dispose(); reader.dispose(); dom.window.close();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
    }
});
