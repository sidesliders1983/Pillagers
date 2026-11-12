import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { core, encounterFixture, latestPhysical } from './encounter-fixture.mjs';

const { projectChronicle } = load('../src/lore/Chronicle.ts');
const { attentionEvent, AttentionHistoryIndex } = load('../src/lore/AttentionHistory.ts');
const { projectPersonalHistory } = load('../src/lore/PersonalHistory.ts');
const { bookLedger } = load('../src/lore/BookLedger.ts');
const entries = state => projectChronicle(state.events).flatMap(winter => winter.entries);
const advance = (state, setup) => core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);

function dispatch(setup) {
    return core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
}

function until(state, setup, predicate, limit = 700) {
    for (let tick = 0; tick < limit && !predicate(state); tick++) state = advance(state, setup);
    assert.ok(predicate(state), 'The public expedition must reach the requested factual checkpoint');
    return state;
}

test('actual on-site capture has safe factual history and debits only the source ledger', () => {
    const setup = encounterFixture();
    const opening = structuredClone(setup.state.stocks);
    const sourceOpening = structuredClone(setup.state.world.targetClans[setup.rivalId]);
    const state = until(dispatch(setup), setup, current => latestPhysical(current)
        .task.encounterRules.manifest?.slots.some(slot => slot.status === 'held'));
    const mission = latestPhysical(state);
    const capture = state.events.find(event => event.type === 'MissionCargoCaptured' &&
        event.details.missionId === mission.id);
    assert.ok(capture);
    const record = attentionEvent(capture);
    assert.ok(record, 'An actual capture must be visible without claiming it reached home');
    assert.equal(record.category, 'expedition');
    assert.equal(record.severity, 'noteworthy');
    assert.match(record.headline, /Food.*in transit/);
    assert.doesNotMatch(record.headline, /returned|recovered|delivered|island-rival|encounter-rival/);
    assert.deepEqual(record.target, { kind: 'expedition', id: mission.id });
    const source = state.world.targetClans[setup.rivalId];
    const debit = source.events.find(event => event.type === 'SettlementPillaged' &&
        event.details.missionId === mission.id);
    assert.ok(debit);
    const own = bookLedger(state.events.slice(setup.state.events.length), opening, state.stocks);
    const donor = bookLedger(source.events.slice(sourceOpening.events.length), sourceOpening.stocks, source.stocks);
    assert.equal(own.food.otherReceipts, 0);
    assert.equal(own.food.residual, 0);
    assert.equal(donor.food.losses, debit.details.food);
    assert.equal(donor.food.residual, 0);
    assert.equal(own.transactions.some(row => row.eventId === capture.id), false);
    const contact = state.events.find(event => event.type === 'EncounterContact' &&
        event.details.missionId === mission.id);
    const contactEntry = entries(state).find(entry => entry.sourceEventIds.includes(contact.id));
    assert.ok(contactEntry);
    assert.match(contactEntry.text, /reached the operation site/);
    assert.doesNotMatch(contactEntry.text, /defender|won|enemy/);
    assert.ok(projectPersonalHistory(state, setup.memberIds[0], [], 100).records
        .some(entry => entry.sourceEventId === contact.id));
    const index = new AttentionHistoryIndex();
    index.append(state.events);
    const before = index.inspect();
    index.append(state.events);
    assert.deepEqual(index.inspect(), before);
    assert.equal(index.retained().filter(row => row.eventId === capture.id).length, 1);
    const restored = core.reconstructState(core.serializeState(state));
    assert.deepEqual(entries(restored), entries(state));
    assert.deepEqual(attentionEvent(restored.events.find(event => event.id === capture.id)), record);
});


test('genuine arrival credits delivered stock once and retains both factual source references', () => {
    const setup = encounterFixture();
    const state = until(dispatch(setup), setup, current => latestPhysical(current).status === 'Returned');
    const mission = latestPhysical(state);
    const related = state.events.filter(event => event.details?.missionId === mission.id);
    const delivered = related.filter(event => event.type === 'MissionCargoDelivered');
    const reports = related.filter(event => event.type === 'ExpeditionReturned');
    assert.equal(delivered.length, 1);
    assert.equal(reports.length, 1);
    assert.ok(delivered[0].details.food > 0);
    const ledger = bookLedger(state.events.slice(setup.state.events.length), setup.state.stocks, state.stocks);
    assert.equal(ledger.food.otherReceipts, reports[0].details.food);
    assert.equal(ledger.food.otherReceipts, delivered[0].details.food);
    assert.equal(ledger.food.residual, 0);
    assert.equal(ledger.materials.residual, 0);
    assert.equal(ledger.transactions.filter(row => row.category === 'otherReceipts' &&
        row.resource === 'food').length, 1);
    const projected = entries(state);
    assert.match(projected.find(entry => entry.sourceEventIds.includes(delivered[0].id)).text, /brought .* Food home/);
    assert.match(projected.find(entry => entry.sourceEventIds.includes(reports[0].id)).text, /returned: completed/);
    assert.equal(attentionEvent(delivered[0]).severity, 'ambient');
    assert.equal(attentionEvent(reports[0]).severity, 'noteworthy');
    const frozen = core.serializeState(state);
    projectPersonalHistory(state, setup.memberIds[0], [], 100);
    const index = new AttentionHistoryIndex();
    index.append(state.events);
    index.append(state.events);
    assert.equal(index.retained().filter(row => row.eventId === reports[0].id).length, 1);
    assert.equal(core.serializeState(state), frozen, 'History rendering never changes Core or clocks');
    const resumed = core.applyCommand(core.reconstructState(frozen), { type: 'AdvanceTicks', ticks: 5 }, setup.context);
    assert.equal(resumed.events.filter(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === mission.id).length, 1);
});

test('actual lethal contact records combat deaths and terminal loss without a false homecoming or private enemy facts', () => {
    const setup = encounterFixture({ members: 1, defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    const state = until(dispatch(setup), setup, current => latestPhysical(current).status === 'Lost');
    const mission = latestPhysical(state);
    const related = state.events.filter(event => event.details?.missionId === mission.id);
    const died = related.find(event => event.type === 'PersonaDied' && event.details?.cause === 'Combat');
    const lost = related.find(event => event.type === 'ExpeditionLost');
    assert.ok(died && lost);
    const casualty = state.personas[died.personaId];
    assert.equal(casualty.deathTick, died.time.tick);
    const deathRecord = attentionEvent(died);
    assert.equal(deathRecord.headline, casualty.name + ' died in combat.');
    const lossRecord = attentionEvent(lost);
    assert.equal(lossRecord.category, 'expedition');
    assert.equal(lossRecord.severity, 'critical');
    assert.match(lossRecord.headline, /lost before returning home/);
    assert.doesNotMatch(lossRecord.shortText, /has returned|returned home|has set out/);
    assert.equal(related.some(event => event.type === 'ExpeditionReturned'), false);
    assert.equal(related.some(event => event.type === 'MissionCargoDelivered'), false);
    const projected = entries(state);
    const exchange = related.find(event => event.type === 'EncounterExchange');
    assert.ok(exchange.details.actions.length > 0);
    assert.equal(attentionEvent(exchange), null, 'Private rolls and opposing action identities are not public summaries');
    assert.equal(projected.some(entry => entry.sourceEventIds.includes(exchange.id)), false);
    const history = projectPersonalHistory(state, died.personaId, [], 100);
    assert.ok(history.records.some(record => record.sourceEventId === died.id));
    assert.ok(history.records.some(record => record.sourceEventId === lost.id));
    const formatted = related.map(event => attentionEvent(event)?.headline ?? '').join(' ');
    assert.doesNotMatch(formatted, /probabilityBps|targetClanId|island-rival|encounter-rival|roll/);
    const before = projected.find(entry => entry.sourceEventIds.includes(died.id)).text;
    casualty.name = 'A later name';
    assert.equal(entries(state).find(entry => entry.sourceEventIds.includes(died.id)).text, before);
    const restored = core.reconstructState(core.serializeState(state));
    assert.deepEqual(entries(restored), entries(state));
});


test('an exploring party lost during actual contact has a loss notice instead of a return notice', () => {
    const setup = encounterFixture({ members: 1, defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1, exchangeTicks: 1, disengageTicks: 5 } });
    let state = core.applyCommand(setup.state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 160, z: 128 } }, setup.context);
    state = until(state, setup, current => latestPhysical(current).status === 'Lost');
    const mission = latestPhysical(state);
    const loss = state.events.find(event => event.type === 'ExploreAreaLost' && event.details?.missionId === mission.id);
    assert.ok(loss);
    const record = attentionEvent(loss);
    assert.ok(record);
    assert.equal(record.category, 'expedition');
    assert.equal(record.severity, 'critical');
    assert.match(record.headline, /lost before returning home/);
    assert.doesNotMatch(record.shortText, /has returned|has set out/);
    assert.ok(projectPersonalHistory(state, setup.memberIds[0], [], 100).records
        .some(entry => entry.sourceEventId === loss.id));
    assert.equal(state.events.some(event => event.type === 'ExploreAreaReturned' &&
        event.details?.missionId === mission.id), false);
});


test('a real carrier death loses in-transit stock without a second home debit or receipt', () => {
    const setup = encounterFixture({ members: 1 });
    setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    let state = until(dispatch(setup), setup, current => latestPhysical(current)
        .task.encounterRules.manifest?.slots.some(slot => slot.status === 'held'));
    const missionId = latestPhysical(state).id;
    const held = latestPhysical(state).task.encounterRules.manifest.slots
        .filter(slot => slot.kind === 'Food').reduce((sum, slot) => sum + slot.units, 0);
    assert.ok(held > 0);
    state = core.applyCommand(core.reconstructState(core.serializeState(state)),
        { type: 'AdvanceTicks', ticks: 1000 - state.time.tick }, setup.context);
    const losses = state.events.filter(event => event.type === 'MissionCargoLost' &&
        event.details?.missionId === missionId);
    assert.ok(losses.length > 0);
    assert.equal(losses.reduce((sum, event) => sum + event.details.units, 0), held);
    assert.ok(losses.every(event => /Cargo lost in transit/.test(attentionEvent(event).headline)));
    const ledger = bookLedger(state.events.slice(setup.state.events.length), setup.state.stocks, state.stocks);
    assert.equal(ledger.food.otherReceipts, 0);
    assert.equal(ledger.food.residual, 0);
    assert.equal(ledger.transactions.some(row => losses.some(event => event.id === row.eventId)), false,
        'Cargo was never in home stocks and must not be debited there again');
    assert.equal(state.events.some(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === missionId), false);
    assert.equal(state.events.some(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === missionId), false);
    const loss = state.events.find(event => event.type === 'ExpeditionLost' && event.details?.missionId === missionId);
    assert.ok(loss);
    assert.equal(attentionEvent(loss).severity, 'critical');
});


test('a genuine travel-weather death is named separately from combat and never exposes random rolls', () => {
    const setup = encounterFixture({ members: 1 });
    const weather = structuredClone(core.defaultWeatherConfig);
    weather.enabled = true;
    for (const [kind, profile] of Object.entries(weather.profiles)) {
        profile.probabilityBps = kind === 'Normal' ? 10000 : 0;
        profile.travelRiskBps = 10000;
    }
    setup.state.weather = { version: 1, config: weather,
        regions: { [setup.state.landing.region.id]: { winter: setup.state.time.winter, class: 'Normal' } } };
    const state = advance(dispatch(setup), setup);
    const missionId = latestPhysical(state).id;
    const death = state.events.find(event => event.type === 'PersonaDied' &&
        event.details?.missionId === missionId && event.details?.cause === 'TravelWeather');
    assert.ok(death);
    const record = attentionEvent(death);
    assert.equal(record.headline, state.personas[death.personaId].name + ' died during hazardous travel weather.');
    assert.doesNotMatch(record.headline, /combat|TravelWeather/);
    const hazard = state.events.find(event => event.type === 'ExpeditionTravelHazard' &&
        event.details?.missionId === missionId);
    const summary = attentionEvent(hazard);
    assert.ok(summary);
    assert.equal(summary.category, 'expedition');
    assert.match(summary.headline, /hazardous travel weather; 1 expedition member died/);
    assert.doesNotMatch(summary.headline, /roll|riskBps|10000/);
    assert.ok(projectPersonalHistory(state, death.personaId, [], 100).records
        .some(entry => entry.sourceEventId === hazard.id));
});


test('observed defender withdrawal does not falsely say the expedition withdrew', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 1, disengageTicks: 5 } });
    const state = until(dispatch(setup), setup, current => current.events.some(event =>
        event.type === 'EncounterWithdrawalRequested' && event.details?.withdrawingSide === 'defender'));
    const withdrawal = state.events.find(event => event.type === 'EncounterWithdrawalRequested' &&
        event.details?.withdrawingSide === 'defender');
    const record = attentionEvent(withdrawal);
    assert.ok(record);
    assert.equal(record.headline, 'The observed defenders began disengaging from the on-site encounter.');
    assert.doesNotMatch(record.headline, /Shore party began disengaging/);
    assert.ok(projectPersonalHistory(state, setup.memberIds[0], [], 100).records
        .some(entry => entry.sourceEventId === withdrawal.id));
});
