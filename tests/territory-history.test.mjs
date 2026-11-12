import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { territoryAttentionAdapter, territoryHistoryText } = load('../src/lore/TerritoryAttention.ts');
const { AttentionHistoryIndex } = load('../src/lore/AttentionHistory.ts');
const { attentionGroups, createAttentionMetadata } = load('../src/lore/AttentionState.ts');
const { personalChronicleEntry, projectChronicle } = load('../src/lore/Chronicle.ts');
const { PersonalHistoryIndex } = load('../src/lore/PersonalHistory.ts');

const warning = {
    id: 'event-12', type: 'TerritoryIncidentOpened', time: { winter: 801, tick: 40 },
    details: {
        version: 1, incidentId: 'incident-1', phase: 'Alerted', reason: 'settlement-intrusion',
        defendingClanId: 'island-rival', intrudingClanId: 'player', missionId: 'explore-2',
        groupId: 'group-2', groupName: 'Hidden rival group name', observedByPlayer: true,
        position: { x: 12, z: 24 }, participants: ['founder-1', 'founder-2'],
        observerId: 'private-observer', intruderId: 'private-intruder',
        responderIds: ['private-defender'], privateName: 'Hidden enemy name',
    },
};

test('an observed warning shares one factual text without exposing private enemy details', () => {
    const record = territoryAttentionAdapter(warning);
    assert.equal(record.headline, 'The settlement warned the expedition party to withdraw.');
    assert.equal(record.incidentId, 'incident-1');
    assert.deepEqual(record.actorIds, ['founder-1', 'founder-2']);
    assert.deepEqual(record.target, { kind: 'expedition', id: 'explore-2' });
    assert.equal(territoryHistoryText(warning), record.headline);
    assert.doesNotMatch(JSON.stringify(record), /private-|Hidden/);
    const unseen = { ...warning, details: { ...warning.details, observedByPlayer: false } };
    assert.equal(territoryAttentionAdapter(unseen), null);
    assert.equal(territoryHistoryText(unseen), null);
});


test('warning, escalation and closure stay one linked incident across years and Chronicle views', () => {
    const escalation = { ...warning, id: 'event-13', type: 'TerritoryIncidentChanged',
        time: { winter: 801, tick: 65 },
        details: { ...warning.details, phase: 'Hostile', reason: 'warning-ignored' } };
    const closure = { ...warning, id: 'event-14', type: 'TerritoryIncidentClosed',
        time: { winter: 802, tick: 10 },
        details: { ...warning.details, phase: 'Closed', reason: 'lost-contact' } };
    const events = [warning, escalation, closure];
    const index = new AttentionHistoryIndex([territoryAttentionAdapter]);
    index.append(events);
    const records = index.retained();
    assert.equal(records.length, 3);
    const groups = attentionGroups(records, createAttentionMetadata(0), false);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, 'territory:incident-1');
    assert.deepEqual(groups[0].records.map(record => record.eventId), ['event-14', 'event-13', 'event-12']);
    assert.equal(groups[0].unread, 3);
    assert.match(groups[0].records[0].headline, /lost contact.*incident ended/);
    assert.equal(personalChronicleEntry(escalation).text,
        'The expedition party ignored the settlement warning and the encounter became hostile.');
    const entries = projectChronicle(events).flatMap(winter => winter.entries);
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.flatMap(entry => entry.sourceEventIds).sort(), ['event-12', 'event-13', 'event-14']);
    assert.doesNotMatch(JSON.stringify(entries), /private-|Hidden/);
    index.append(events);
    assert.equal(index.retained().length, 3, 'A repeated read does not duplicate incident phases');
});


test('only observed supported incident facts receive prose and an activity record', () => {
    const perimeter = { ...warning, details: { ...warning.details,
        phase: 'Suspicious', reason: 'perimeter-sighting' } };
    assert.equal(territoryHistoryText(perimeter),
        'An expedition party was noticed near the settlement perimeter.');
    const offensive = { ...warning, type: 'TerritoryIncidentChanged',
        details: { ...warning.details, phase: 'Hostile', reason: 'observed-pillage' } };
    assert.equal(territoryHistoryText(offensive),
        'The settlement observed Pillage beginning and the encounter became hostile.');
    for (const reason of ['party-returned', 'party-unavailable', 'observers-unavailable']) {
        const closed = { ...warning, type: 'TerritoryIncidentClosed',
            details: { ...warning.details, phase: 'Closed', reason } };
        assert.ok(territoryAttentionAdapter(closed));
        assert.match(territoryHistoryText(closed), /incident ended/);
        assert.doesNotMatch(territoryHistoryText(closed), /killed|casualt|victory|loot/);
    }
    for (const details of [
        { ...warning.details, version: 2 },
        { ...warning.details, observedByPlayer: false },
        { ...warning.details, phase: 'Victorious', reason: 'victory' },
        { ...warning.details, phase: 'Hostile', reason: 'invented-hostility' },
        { ...warning.details, incidentId: '' },
        { ...warning.details, missionId: null },
    ]) {
        const unsupported = { ...warning, details };
        assert.equal(territoryAttentionAdapter(unsupported), null);
        assert.equal(personalChronicleEntry(unsupported), null);
    }
    assert.equal(territoryAttentionAdapter({ ...warning, type: 'FutureTerritoryAward' }), null);
    assert.equal(territoryAttentionAdapter({ ...warning, type: 'TerritoryIncidentClosed' }), null,
        'A malformed closure cannot fabricate an alert phase');
});


test('personal incident history attributes only recorded player participants', () => {
    const recorded = { ...warning, details: { ...warning.details, people: [
        { id: 'founder-1', name: 'Mieppi' },
        { id: 'founder-2', name: 'Tautmantė' },
        { id: 'private-defender', name: 'Mieppi' },
    ] } };
    const hidden = { ...warning, id: 'event-13', details: { ...warning.details, observedByPlayer: false } };
    const index = new PersonalHistoryIndex();
    index.append([recorded, hidden]);
    const history = index.read('founder-1');
    assert.equal(history.totalRecords, 1);
    assert.equal(history.records[0].sourceEventId, warning.id);
    assert.deepEqual(history.records[0].roles, ['incident participant']);
    assert.equal(index.read('private-defender').totalRecords, 0);
    assert.equal(index.read('private-observer').totalRecords, 0);
    assert.doesNotMatch(JSON.stringify(history), /private-|Hidden/);
});
