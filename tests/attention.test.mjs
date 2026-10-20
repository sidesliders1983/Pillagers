import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const { AttentionHistoryIndex, attentionEvent, attentionAlerts } = load('../src/lore/AttentionHistory.ts');
const meta = load('../src/lore/AttentionState.ts');
const { resolveAttentionTarget } = load('../src/lore/AttentionNavigation.ts');
const { SharedSettlement, localSettlementText } = load('../src/play/SharedSettlement.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const quiet = { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 };
function life() {
    let state = core.createSettlement(41, { ...quiet, childcareWinters: 0, fertilityChanceBps: 10000 });
    state.stocks.food = 1000; state.stocks.materials = 1000;
    return core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3000 });
}
function ownerAt(state) {
    const session = new GameplaySession(); session.loadJSON(core.serializeState(state));
    return new SharedSettlement(session);
}

test('only actual life and household events are noteworthy; recorded names survive later changes', () => {
    const state = life(), index = new AttentionHistoryIndex(); index.append(state.events);
    const birth = state.events.find(event => event.type === 'ChildBorn'); assert.ok(birth);
    const record = index.retained().find(record => record.eventId === birth.id);
    assert.equal(record.category, 'life'); assert.equal(record.severity, 'noteworthy');
    assert.ok(record.actorIds.includes(birth.personaId));
    assert.match(record.headline, /Einar.*Liv/);
    state.personas.liv.name = 'Changed after the birth';
    assert.doesNotMatch(index.retained().find(record => record.eventId === birth.id).headline, /Changed after/);
    let partnerships = core.createCampaign(32, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 0 },
        { ...quiet, partnershipChanceBps: 10000 }, { enabled: false });
    partnerships = core.applyCommand(partnerships, { type: 'AdvanceTicks', ticks: 1000 });
    const formed = partnerships.events.find(event => event.type === 'PartnershipFormed'); assert.ok(formed);
    assert.equal(attentionEvent(formed).severity, 'noteworthy');
    assert.doesNotMatch(attentionEvent(formed).headline, /married|marriage/);
    const dying = core.applyCommand(core.createSettlement(41, { ...quiet, mortalityBands: [{ minAge: 0, chanceBps: 10000 }] }),
        { type: 'AdvanceTicks', ticks: 1000 });
    assert.ok(dying.events.filter(event => event.type === 'PersonaDied').every(event => attentionEvent(event).severity === 'noteworthy'));
    assert.equal(attentionEvent({ id: 'event-99', type: 'FutureDiplomacy', time: state.time, details: { name: 'Secret enemy' } }), null);
    assert.ok(index.chronicle().some(record => record.severity === 'ambient'));
});

test('real expedition departure and return share source IDs; redirects and routine supplies have no badge', () => {
    let state = core.createCampaign(32, { initialFood: 1000 }, quiet, { enabled: false },
        { casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } });
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Actual scouts', memberIds: ['founder-1', 'founder-2'] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: 'region-east', mission: 'Recon' });
    const departed = state.events.find(event => event.type === 'ExpeditionDeparted');
    assert.deepEqual(resolveAttentionTarget(state, attentionEvent(departed).target), { kind: 'expedition', id: 'group-1' });
    const first = core.serializeState(state);
    const returned = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 });
    const reloaded = core.applyCommand(core.reconstructState(first), { type: 'AdvanceTicks', ticks: 250 });
    assert.deepEqual(reloaded, returned);
    const index = new AttentionHistoryIndex(); index.append(returned.events); const before = index.inspect();
    index.append(returned.events); assert.deepEqual(index.inspect(), before);
    assert.equal(index.retained().filter(record => record.category === 'expedition').length, 2);
    assert.equal(resolveAttentionTarget(returned, attentionEvent(departed).target), null, 'Past expedition keeps historical detail');
    const redirected = { ...departed, type: 'ExploreAreaDeparted', details: { groupName: 'Actual scouts', redirected: true, carriedSupplies: true } };
    assert.equal(attentionEvent(redirected).severity, 'ambient');
    assert.equal(resolveAttentionTarget(state, { kind: 'site', id: 'unseen-clan' }), null);
});

test('bounded read state and alert episodes remain presentation metadata across acknowledgement and resolution', () => {
    const source = life(), index = new AttentionHistoryIndex(); index.append(source.events);
    const records = index.retained(), value = meta.createAttentionMetadata(0);
    meta.reconcileAttention(value, records, [], source.events.length);
    const first = records[0]; meta.readAttentionEvents(value, records, [first.eventId, first.eventId]);
    assert.deepEqual(value.readIds, [first.eventId]);
    meta.validateAttentionMetadata(value, source);
    const empty = structuredClone(source); empty.stocks.food = 0;
    const alerts = attentionAlerts(empty, []); assert.ok(alerts.find(alert => alert.id === 'food-empty'));
    meta.reconcileAttention(value, records, alerts, source.events.length);
    const episode = value.alerts.find(alert => alert.id === 'food-empty');
    meta.acknowledgeAttention(value, episode.id, episode.since);
    meta.reconcileAttention(value, records, alerts, source.events.length + 1);
    assert.equal(value.alerts.find(alert => alert.id === 'food-empty').acknowledged, true);
    meta.reconcileAttention(value, records, [], source.events.length + 2);
    meta.reconcileAttention(value, records, alerts, source.events.length + 3);
    assert.equal(value.alerts.find(alert => alert.id === 'food-empty').acknowledged, false);
    meta.acknowledgeAttention(value, 'food-empty', episode.since);
    assert.equal(value.alerts.find(alert => alert.id === 'food-empty').acknowledged, false, 'Stale episode cannot dismiss a recurrence');
});

test('save/load, rollback and new/restart preserve appropriate reads without mutating Core or clock intent', () => {
    const owner = ownerAt(core.createSettlement(41, { ...quiet, fertilityChanceBps: 10000, childcareWinters: 0 }));
    owner.session.command({ type: 'AdvanceTicks', ticks: 3000 });
    const record = owner.fjord.attentionView().records.find(record => record.canonicalType === 'ChildBorn'); assert.ok(record && !record.read);
    owner.session.setRunning(true);
    const before = owner.session.saveJSON();
    owner.fjord.markAttentionRead([record.eventId]);
    const alert = owner.fjord.attentionView().alerts[0];
    if (alert) owner.fjord.acknowledgeAttention(alert.id, alert.since);
    assert.equal(owner.session.running, true); assert.equal(owner.session.saveJSON(), before);
    const saved = owner.persist(), loaded = SharedSettlement.restore(saved, 'fjord');
    assert.deepEqual(loaded.session.snapshot(), owner.session.snapshot());
    assert.deepEqual(loaded.fjord.attentionSave(), owner.fjord.attentionSave());
    const invalid = JSON.parse(saved); invalid.fjord.attention.readIds.push('event-9999999');
    assert.throws(() => loaded.importJSON(JSON.stringify(invalid.fjord)), /Attention/);
    assert.equal(loaded.persist(), SharedSettlement.restore(saved, 'fjord').persist());
    const older = core.serializeState(core.createSettlement(41, quiet));
    const sidecar = owner.fjord.exportJSON();
    const merged = localSettlementText({ getItem: key => key === 'pillagers.gameplay-lab.v1' ? older : sidecar });
    const restored = SharedSettlement.restore(merged, 'fjord');
    assert.deepEqual(restored.fjord.attentionSave().readIds, []);
    assert.equal(restored.fjord.attentionSave().readThrough, restored.session.snapshot().events.length);
    loaded.restart(true);
    assert.equal(loaded.fjord.attentionSave().readThrough, loaded.session.snapshot().events.length);
    assert.deepEqual(loaded.fjord.attentionSave().readIds, []);
});

test('long histories ingest once, retain bounded inboxes and page older Chronicle facts without rescanning history', () => {
    const actual = life().events.find(event => event.type === 'ChildBorn');
    const events = Array.from({ length: 100000 }, (_, i) => ({ ...actual, id: 'event-' + (i + 1),
        type: i % 20 ? 'UnsupportedRoutineFixture' : 'ChildBorn' }));
    const index = new AttentionHistoryIndex(); index.append(events); const initial = index.inspect();
    for (let read = 0; read < 1000; read++) index.append(events);
    assert.deepEqual(index.inspect(), initial); assert.equal(initial.examined, 100000);
    assert.equal(initial.retained, 200); assert.equal(initial.chronicle, 100);
    const value = meta.createAttentionMetadata(0);
    meta.readAttentionEvents(value, index.retained(), index.retained().map(record => record.eventId));
    assert.equal(value.readIds.length, 200);
    const groups = meta.attentionGroups(index.retained(), value, false);
    assert.equal(groups.length, 1); assert.equal(groups[0].records.length, 200);
    assert.equal(meta.attentionGroups(index.retained(), value, true).length, 0);
    const page = index.chroniclePage(events, 1000);
    assert.ok(page.records.length <= 20 && page.nextBefore >= 800);
    assert.ok(page.records.every(record => Number(record.eventId.slice(6)) <= 1000));
    assert.equal(index.inspect().examined, 100000);
    assert.throws(() => index.chroniclePage(events, -1), /cursor/);
});
