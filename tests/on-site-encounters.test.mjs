import test from 'node:test';
import assert from 'node:assert/strict';
import { core, encounterFixture, latestPhysical } from './encounter-fixture.mjs';

test('an undefended physical Pillage captures real stock on site before any home credit', () => {
    const setup = encounterFixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    let captured;
    for (let step = 0; step < 500; step++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const mission = latestPhysical(state);
        if (mission.task.encounterRules?.manifest?.slots.some(slot => slot.status === 'held')) {
            captured = state;
            assert.notEqual(mission.status, 'Returned');
            assert.equal(mission.task.result, null, 'A capture is not a homecoming report');
            break;
        }
    }
    assert.ok(captured, 'Actual donor stock is captured at the operation site before homecoming');
    const mission = latestPhysical(captured), manifest = mission.task.encounterRules.manifest;
    const heldFood = manifest.slots.filter(slot => slot.kind === 'Food' && slot.status === 'held')
        .reduce((sum, slot) => sum + slot.units, 0);
    assert.ok(heldFood > 0 && heldFood <= setup.memberIds.length * 10);
    assert.equal(manifest.deliveredAt, null);
    assert.equal(captured.events.some(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === mission.id), false);
    assert.deepEqual(core.reconstructState(core.serializeState(captured)), captured);
});

test('actual present defenders exchange on site and exact deaths exist before a return report', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    let fought;
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const entry = Object.values(state.world.encounters?.records ?? {}).find(value => value.missionId === latestPhysical(state).id);
        if (entry?.exchangeIndex > 0) { fought = state; break; }
    }
    assert.ok(fought, 'A real eligible defender must fight at reached contact, rather than an anonymous return-time roll');
    const mission = latestPhysical(fought), entry = fought.world.encounters.records[mission.task.encounterRules.encounterId];
    assert.ok(entry.defenderIds.length > 0 && entry.defenderIds.length <= 2);
    const deaths = [fought, fought.world.targetClans[setup.rivalId]].flatMap(clan =>
        clan.events.filter(event => event.type === 'PersonaDied' && event.details?.encounterId === entry.id)
            .map(event => ({ clan, event })));
    assert.ok(deaths.length > 0);
    for (const { clan, event } of deaths) {
        assert.equal(event.details.cause, 'Combat');
        const person = clan.personas[event.personaId];
        assert.equal(person.deathWinter, event.time.winter);
        assert.equal(person.deathTick, event.time.tick, 'Legacy birth-year residents retain the exact on-site death tick');
        assert.equal(person.occupation, null);
        assert.ok(Object.values(clan.households).every(home => !home.memberIds.includes(person.id)));
    }
    assert.equal(mission.task.result, null);
    assert.notEqual(mission.status, 'Returned');
    assert.equal(fought.events.some(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === mission.id), false);
    assert.deepEqual(core.reconstructState(core.serializeState(fought)), fought);
});


test('recalling an engaged group takes bounded disengagement before the reached-trail return', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 4, disengageTicks: 5 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450 && latestPhysical(state).task.encounterRules.phase !== 'engaging'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const engaged = latestPhysical(state);
    assert.equal(engaged.task.encounterRules.phase, 'engaging');
    const reached = JSON.stringify(engaged.memberRoutes);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    let mission = latestPhysical(state);
    assert.equal(mission.task.encounterRules.phase, 'withdrawing');
    assert.notEqual(mission.status, 'Returning', 'Recall must not grant immediate invulnerability');
    assert.equal(JSON.stringify(mission.memberRoutes), reached, 'Recall does not move any body');
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 4 }, setup.context);
    assert.equal(latestPhysical(state).task.encounterRules.phase, 'withdrawing');
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    mission = latestPhysical(state);
    assert.equal(mission.status, 'Returning');
    assert.equal(mission.task.encounterRules.phase, 'returning');
    const encounter = state.world.encounters.records[mission.task.encounterRules.encounterId];
    assert.equal(encounter.exchangeIndex, 1, 'The pending on-site exchange still happens while disengaging');
    assert.equal(encounter.outcome, 'withdrew');
    assert.equal(mission.returnedAt, null);
    assert.equal(mission.task.result, null);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    assert.equal(latestPhysical(state).status, 'Returned');
    assert.equal(latestPhysical(state).task.result.success, false);
});


test('an exploring party disengages from real hostile contact instead of fighting to the death', () => {
    const setup = encounterFixture({ defenders: true, policy: { actionLethalityBps: 0 } });
    const prepared = core.applyCommand(setup.state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    let state = core.applyCommand(prepared, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 160, z: 128 } }, setup.context);
    let withdrew = false;
    for (let tick = 0; tick < 500; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const view = core.inspectSpatialExpeditions(state).missions.at(-1);
        if (view.encounter?.phase === 'withdrawing') { withdrew = true; break; }
    }
    assert.equal(withdrew, true, 'Actual reached hostile contact must use the shared disengagement lifecycle');
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    const mission = latestPhysical(state);
    assert.equal(mission.status, 'Returned');
    assert.equal(mission.outcome, 'Cancelled');
    assert.ok(mission.memberIds.every(id => state.personas[id].deathWinter === null));
    assert.equal(state.events.some(event => event.type === 'MissionCargoCaptured' &&
        event.details?.missionId === mission.id), false, 'An observation party cannot acquire raid cargo');
});


test('weather is a once-only departure hazard with an exact cause, separate from pre-contact recall', () => {
    const setup = encounterFixture();
    const weather = structuredClone(core.defaultWeatherConfig);
    weather.enabled = true;
    for (const [kind, profile] of Object.entries(weather.profiles)) {
        profile.probabilityBps = kind === 'Normal' ? 10000 : 0;
        profile.travelRiskBps = 10000;
    }
    const configured = structuredClone(setup.state);
    configured.weather = { version: 1, config: weather,
        regions: { [configured.landing.region.id]: { winter: configured.time.winter, class: 'Normal' } } };
    const initial = core.reconstructState(core.serializeState(configured));
    const dispatch = () => core.applyCommand(initial, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    const recalled = core.applyCommand(dispatch(), { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    assert.ok(setup.memberIds.every(id => recalled.personas[id].deathWinter === null));
    assert.equal(recalled.events.some(event => event.details?.cause === 'Combat' ||
        event.details?.cause === 'TravelWeather'), false, 'Recall before any departure/contact invents no casualty');
    const departed = core.applyCommand(dispatch(), { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const mission = latestPhysical(departed);
    const deaths = departed.events.filter(event => event.type === 'PersonaDied' &&
        event.details?.missionId === mission.id);
    assert.equal(deaths.length, 4, 'The explicitly guaranteed weather hazard happens during actual travel');
    assert.ok(deaths.every(event => event.details.cause === 'TravelWeather' &&
        event.time.tick === initial.time.tick + 1 && event.details.position));
    assert.equal(mission.status, 'Lost');
    assert.equal(mission.task.encounterRules.travelResolvedAt, initial.time.winter * 1000 + initial.time.tick + 1);
    assert.equal(departed.events.some(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === mission.id), false);
    const loaded = core.reconstructState(core.serializeState(departed));
    const continued = core.applyCommand(loaded, { type: 'AdvanceTicks', ticks: 10 }, setup.context);
    assert.equal(continued.events.filter(event => event.type === 'PersonaDied' &&
        event.details?.missionId === mission.id).length, 4, 'Save/continue cannot repeat the travel hazard');
});


test('portable saves reject forged encounter participants and altered committed exchange facts', () => {
    const setup = encounterFixture({ defenders: true, policy: { actionLethalityBps: 0 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        if (Object.values(state.world.encounters?.records ?? {}).some(entry => entry.exchangeIndex > 0)) break;
    }
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    const forged = structuredClone(state);
    Object.values(forged.world.encounters.records)[0].defenderIds.push('invented-defender');
    assert.throws(() => core.reconstructState(JSON.stringify(forged)), /encounter/i,
        'An imported battle cannot recruit a fabricated defender');
    const altered = structuredClone(state);
    const entry = Object.values(altered.world.encounters.records)[0];
    assert.ok(entry.exchanges[0].actions.length > 0);
    entry.exchanges[0].actions[0].roll = -1;
    assert.throws(() => core.reconstructState(JSON.stringify(altered)), /encounter/i,
        'Persisted applied actions must agree with immutable event receipts');
});


test('recall after actual capture keeps the recorded operation and delivers only its held manifest', () => {
    const setup = encounterFixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450 && !latestPhysical(state).task.encounterRules.manifest; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const captured = latestPhysical(state), manifest = structuredClone(captured.task.encounterRules.manifest);
    assert.ok(manifest.slots.some(slot => slot.status === 'held'));
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    const mission = latestPhysical(state);
    assert.equal(mission.status, 'Returned');
    assert.equal(mission.task.result.success, true, 'An already completed on-site capture is not erased by ordering the return');
    assert.equal(mission.task.result.food, manifest.slots.reduce((sum, slot) => sum + slot.units, 0));
    assert.equal(state.events.filter(event => event.type === 'MissionCargoCaptured' &&
        event.details?.missionId === mission.id).length, 1);
    assert.equal(state.events.filter(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === mission.id).length, 1);
});


test('outnumbered real defenders disengage before surrendering the operation site', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 1, disengageTicks: 5 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    let withdrawal;
    for (let tick = 0; tick < 450; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const entry = Object.values(state.world.encounters?.records ?? {})[0];
        if (entry?.exchangeIndex) { withdrawal = entry; break; }
    }
    assert.ok(withdrawal.defenderIds.length > 0 && withdrawal.defenderIds.length < 4);
    assert.equal(withdrawal.phase, 'withdrawing');
    assert.equal(withdrawal.withdrawingSide, 'defender');
    assert.equal(latestPhysical(state).task.encounterRules.manifest, undefined);
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 5 }, setup.context);
    const entry = Object.values(state.world.encounters.records)[0];
    assert.equal(entry.phase, 'resolved');
    assert.equal(entry.outcome, 'won');
    assert.ok(entry.defenderIds.every(id => state.world.targetClans[setup.rivalId].personas[id].deathWinter === null));
    assert.equal(latestPhysical(state).status, 'Exploring');
});


test('a newly blocked return strands the actual party and forfeits held cargo without a homecoming', () => {
    const setup = encounterFixture();
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450 && !latestPhysical(state).task.encounterRules.manifest; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.ok(latestPhysical(state).task.encounterRules.manifest.slots.some(slot => slot.status === 'held'));
    const blocked = { ...setup.context, exclusions: [{ minX: 106, maxX: 114, minZ: 0, maxZ: 255 }] };
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 150 }, blocked);
    const mission = latestPhysical(state);
    assert.equal(mission.status, 'Stranded');
    assert.equal(mission.task.encounterRules.phase, 'stranded');
    assert.ok(mission.task.encounterRules.manifest.slots.every(slot => slot.status === 'lost'));
    assert.equal(mission.task.result, null);
    assert.equal(mission.returnedAt, null);
    assert.equal(state.events.some(event => ['ExpeditionReturned', 'MissionCargoDelivered'].includes(event.type) &&
        event.details?.missionId === mission.id), false);
    const losses = state.events.filter(event => event.type === 'MissionCargoLost' && event.details?.missionId === mission.id);
    assert.equal(losses.length, 4);
    state = core.reconstructState(core.serializeState(state));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, blocked);
    assert.equal(state.events.filter(event => event.type === 'MissionCargoLost' && event.details?.missionId === mission.id).length, 4);
});


test('ordinary mortality ending an active encounter releases its defender reservation without homecoming', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 8, exchangeTicks: 25 } });
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 650 }, setup.context);
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 100 }, setup.context);
    const mission = latestPhysical(state), entry = Object.values(state.world.encounters.records)[0];
    assert.equal(mission.status, 'Lost');
    assert.equal(entry.phase, 'resolved');
    assert.equal(entry.outcome, 'lost');
    assert.equal(mission.returnedAt, null);
    assert.equal(state.events.some(event => event.type === 'ExpeditionReturned' && event.details?.missionId === mission.id), false);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('a real approach death stays in the dispatch record but never joins the reached combat roster', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 1 } });
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 730 }, setup.context);
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 40, chanceBps: 10000 }];
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, setup.context);
    const mission = latestPhysical(state), entry = Object.values(state.world.encounters.records)[0];
    assert.equal(state.personas['founder-1'].deathWinter, 801);
    assert.equal(entry.attackerIds.includes('founder-1'), false);
    assert.equal(entry.equipment['founder-1'], undefined);
    assert.ok(mission.task.encounterRules.attackerEquipment['founder-1'], 'The original dispatch facts remain factual');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('an observation party cannot redirect through its resolved hostile withdrawal before reaching home', () => {
    const setup = encounterFixture({ defenders: true, policy: { actionLethalityBps: 0 } });
    let state = core.applyCommand(setup.state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 160, z: 128 } }, setup.context);
    for (let tick = 0; tick < 450 && latestPhysical(state).status !== 'Returning'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.equal(latestPhysical(state).encounterRules.phase, 'returning');
    const before = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 176, z: 128 } }, setup.context), /return home|contact/i);
    assert.equal(core.serializeState(state), before, 'A refused redirect leaves the canonical trip untouched');
});


test('portable combat death dates must match the actual fatal exchange and death receipt', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450 && !state.events.some(event => event.type === 'PersonaDied' &&
        event.details?.cause === 'Combat'); tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const altered = structuredClone(state);
    const death = altered.events.find(event => event.type === 'PersonaDied' && event.details?.cause === 'Combat');
    assert.ok(death);
    altered.personas[death.personaId].deathTick--;
    assert.throws(() => core.reconstructState(JSON.stringify(altered)), /encounter/i,
        'A combat casualty cannot move to a different canonical tick on import');
});


test('a real responder arriving after the initial contact wait can still confront the ongoing raid', () => {
    const setup = encounterFixture({ policy: { actionLethalityBps: 0 },
        rivalHomes: clan => Object.fromEntries(Object.keys(clan.personas).sort().map((id, index) => [id,
            id.endsWith('founder-1') ? { x: 188, z: 128 } : { x: 232 + index % 4 * 4, z: 112 + Math.floor(index / 4) * 8 }])) });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 150 }, setup.context);
    const entry = Object.values(state.world.encounters.records)[0];
    assert.ok(entry.defenderIds.length > 0, 'A guard physically reaching a still-operating raid must not be disabled by an earlier timeout');
    assert.ok(entry.exchanges.length > 0);
    assert.notEqual(entry.outcome, 'undefended');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('recalling during defender withdrawal records the own decision without resetting disengagement', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 0, maximumExchanges: 1, disengageTicks: 5 } });
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, setup.context);
    for (let tick = 0; tick < 450 && latestPhysical(state).task.encounterRules.phase !== 'withdrawing'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const requestedAt = latestPhysical(state).task.encounterRules.withdrawalRequestedAt;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2 }, setup.context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    const decision = state.events.filter(event => event.type === 'EncounterWithdrawalRequested').at(-1);
    assert.equal(decision.details.withdrawingSide, 'attacker');
    assert.equal(latestPhysical(state).task.encounterRules.withdrawalRequestedAt, requestedAt);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 3 }, setup.context);
    assert.equal(latestPhysical(state).status, 'Returning');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('an exhausted real stock opportunity reports an empty manifest rather than lost cargo', () => {
    const setup = encounterFixture();
    let source = setup.state.world.targetClans[setup.rivalId];
    for (const person of Object.values(source.personas).filter(person => person.occupation))
        source = core.applyCommand(source, { type: 'AssignOccupation', personaId: person.id, occupation: null });
    source.stocks.materials = 0;
    setup.state.world.targetClans[setup.rivalId] = source;
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['Materials'] }, setup.context);
    for (let tick = 0; tick < 450 && !latestPhysical(state).task.encounterRules.manifest; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.deepEqual(latestPhysical(state).task.encounterRules.manifest.slots, []);
    assert.equal(core.inspectSpatialExpeditions(state).missions.at(-1).manifest.status, 'empty');
    assert.equal(state.events.some(event => event.type === 'MissionCargoLost' &&
        event.details?.missionId === latestPhysical(state).id), false);
});
