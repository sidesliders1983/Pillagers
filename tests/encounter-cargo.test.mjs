import test from 'node:test';
import assert from 'node:assert/strict';
import { core, encounterFixture, latestPhysical } from './encounter-fixture.mjs';

const foodProduced = events => events.reduce((total, event) => total + (
    event.type === 'CattleFoodProduced' || event.type === 'ResourceProduced' && event.details?.resource === 'food' ||
    event.type === 'LivestockResourceProduced' && event.details?.resource === 'food'
        ? Number(event.details.units) : 0), 0);

function reachCapture(setup, priorities) {
    let state = core.applyCommand(setup.state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities }, setup.context);
    for (let tick = 0; tick < 500; tick++) {
        const before = state;
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const manifest = latestPhysical(state).task.encounterRules?.manifest;
        if (manifest) return { state, before, manifest };
    }
    assert.fail('A real on-site capture must precede homecoming');
}

test('captured stock is debited on site and credited once only after genuine homecoming', () => {
    const setup = encounterFixture();
    const { state: captured, before, manifest } = reachCapture(setup, ['Food']);
    const missionId = latestPhysical(captured).id;
    const held = manifest.slots.filter(slot => slot.status === 'held' && slot.kind === 'Food')
        .reduce((total, slot) => total + slot.units, 0);
    assert.ok(held > 0);
    const sourceBefore = before.world.targetClans[setup.rivalId];
    const source = captured.world.targetClans[setup.rivalId];
    assert.equal(source.stocks.food, sourceBefore.stocks.food +
        foodProduced(source.events.slice(sourceBefore.events.length)) - held);
    assert.equal(captured.stocks.food, before.stocks.food + foodProduced(captured.events.slice(before.events.length)),
        'Normal domestic production is separate from carried stock');
    assert.equal(manifest.deliveredAt, null);
    const resumed = core.reconstructState(core.serializeState(captured));
    const final = core.applyCommand(resumed, { type: 'AdvanceTicks', ticks: 500 }, setup.context);
    const delivered = latestPhysical(final).task.encounterRules.manifest;
    assert.equal(latestPhysical(final).status, 'Returned');
    assert.ok(delivered.deliveredAt > delivered.capturedAt);
    assert.equal(latestPhysical(final).task.result.food, held);
    assert.equal(delivered.slots.filter(slot => slot.status === 'held').length, 0);
    assert.equal(final.events.filter(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === missionId).length, 1);
    const repeated = core.applyCommand(core.reconstructState(core.serializeState(final)),
        { type: 'AdvanceTicks', ticks: 5 }, setup.context);
    assert.equal(repeated.events.filter(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === missionId).length, 1);
});

test('a real escorted animal has one owner and cannot work, feed, breed or be assigned before arrival', () => {
    const setup = encounterFixture({ members: 1 });
    const source = setup.state.world.targetClans[setup.rivalId];
    Object.assign(source.landing.config, { cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0, cattleWeatherMortalityBps: 0 });
    const animal = Object.values(source.landing.cattle).filter(value => value.deathWinter === null)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    const identity = { id: animal.id, birthWinter: animal.birthWinter, parentIds: [...animal.parentIds], sex: animal.sex };
    setup.context.livestockPositionsByClan = { [setup.rivalId]: { [animal.id]: { x: 160, z: 136 } } };
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    const { state: captured, manifest } = reachCapture(setup, ['Cattle']);
    const slot = manifest.slots.find(value => value.kind === 'Cattle');
    assert.equal(slot?.entityId, animal.id, 'Capture uses the actual nearby animal, not an invented herd token');
    const heldSource = captured.world.targetClans[setup.rivalId];
    assert.ok(heldSource.landing.cattle[animal.id]);
    assert.equal(captured.landing.cattle[animal.id], undefined);
    assert.equal(heldSource.custody.livestock[animal.id].phase, 'held');
    for (const type of ['AssignCattle', 'SlaughterCattle']) {
        assert.throws(() => core.applyCommand(heldSource, { type, cattleId: animal.id, farmyardId: null }), /custody|available/i);
    }
    const breedingIds = core.inspectLivestockBreeding(heldSource).species.flatMap(species => species.herds.flatMap(herd =>
        [...herd.femaleIds, ...herd.maleIds, ...herd.youngFemaleIds, ...herd.youngMaleIds, ...herd.pastWindowIds]));
    assert.equal(breedingIds.includes(animal.id), false);
    let final = core.reconstructState(core.serializeState(captured));
    for (let tick = 0; tick < 500 && latestPhysical(final).status !== 'Returned'; tick++)
        final = core.applyCommand(final, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.equal(latestPhysical(final).status, 'Returned');
    const sourceEvents = final.world.targetClans[setup.rivalId].events.slice(heldSource.events.length);
    assert.ok(sourceEvents.some(event => ['CattleFoodConsumed', 'LivestockFoodConsumed'].includes(event.type)),
        'This real escort crosses a Winter feeding boundary');
    for (const event of sourceEvents) {
        if (['CattleFoodConsumed', 'LivestockFoodConsumed'].includes(event.type))
            assert.equal([...(event.details.cattleIds ?? []), ...(event.details.livestockIds ?? [])].includes(animal.id), false);
        if (['CattleFoodProduced', 'LivestockResourceProduced'].includes(event.type))
            assert.notEqual(event.details.cattleId ?? event.details.livestockId, animal.id);
        if (['CattleBorn', 'LivestockBorn'].includes(event.type))
            assert.equal(event.details.parentIds.includes(animal.id), false);
    }
    const arrived = final.landing.cattle[animal.id];
    assert.deepEqual({ id: arrived.id, birthWinter: arrived.birthWinter, parentIds: arrived.parentIds, sex: arrived.sex }, identity);
    assert.equal(final.world.targetClans[setup.rivalId].landing.cattle[animal.id], undefined);
    assert.ok(final.world.targetClans[setup.rivalId].landing.cattleArchive[animal.id]);
    assert.deepEqual(core.reconstructState(core.serializeState(final)), final);
});

test('a carrier dying on site loses carried stock without a delivery or invented homecoming', () => {
    const setup = encounterFixture({ members: 1 });
    setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    const { state: captured, manifest } = reachCapture(setup, ['Food']);
    assert.ok(manifest.slots.some(slot => slot.status === 'held'));
    const missionId = latestPhysical(captured).id;
    let state = core.reconstructState(core.serializeState(captured));
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 - state.time.tick }, setup.context);
    const final = latestPhysical(state), cargo = final.task.encounterRules.manifest;
    assert.equal(state.personas[setup.memberIds[0]].deathWinter, 801);
    assert.equal(cargo.slots.filter(slot => slot.status === 'held').length, 0);
    assert.equal(cargo.slots.every(slot => slot.status === 'lost'), true);
    assert.equal(state.events.filter(event => event.type === 'MissionCargoLost' &&
        event.details?.missionId === missionId).length, manifest.slots.length);
    assert.equal(state.events.some(event => event.type === 'MissionCargoDelivered' &&
        event.details?.missionId === missionId), false);
    assert.equal(state.events.some(event => event.type === 'ExpeditionReturned' &&
        event.details?.missionId === missionId), false);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('a released escort starts at its actual reached position and walks home before becoming available', () => {
    const setup = encounterFixture({ members: 1 });
    const source = setup.state.world.targetClans[setup.rivalId];
    Object.assign(source.landing.config, { cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0, cattleWeatherMortalityBps: 0 });
    const animal = Object.values(source.landing.cattle).filter(value => value.deathWinter === null)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    setup.context.livestockPositionsByClan = { [setup.rivalId]: { [animal.id]: { x: 160, z: 136 } } };
    setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    let { state } = reachCapture(setup, ['Cattle']);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 999 - state.time.tick }, setup.context);
    const beforeLoss = structuredClone(state.world.targetClans[setup.rivalId].custody.livestock[animal.id]);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    const released = state.world.targetClans[setup.rivalId].custody.livestock[animal.id];
    assert.equal(latestPhysical(state).task.encounterRules.manifest.slots[0].status, 'released');
    assert.equal(released.phase, 'returning');
    assert.deepEqual(released.position, beforeLoss.position, 'Loss cannot teleport the actual escort');
    assert.notDeepEqual(released.position, released.home);
    assert.equal(state.landing.cattle[animal.id], undefined);
    state = core.reconstructState(core.serializeState(state));
    let previous = { ...released.position };
    for (let tick = 0; tick < 60; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const returning = state.world.targetClans[setup.rivalId].custody.livestock[animal.id];
        if (!returning) break;
        assert.ok(Math.hypot(returning.position.x - previous.x, returning.position.z - previous.z) <= .600001);
        previous = { ...returning.position };
        assert.throws(() => core.applyCommand(state.world.targetClans[setup.rivalId],
            { type: 'SlaughterCattle', cattleId: animal.id }), /custody|available/i);
    }
    const returnedSource = state.world.targetClans[setup.rivalId];
    assert.equal(returnedSource.custody.livestock[animal.id], undefined);
    assert.ok(returnedSource.landing.cattle[animal.id]);
    assert.equal(state.landing.cattle[animal.id], undefined);
    const receipts = returnedSource.events.filter(event => event.type === 'CustodyReturned' && event.details?.entityId === animal.id);
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts[0].details.position, beforeLoss.home);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('a real person captured after a won encounter keeps one identity through custody and arrival', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    // Explicit fixture inventory; actual assignments still use the public command.
    setup.state.smithery.stored.leatherShield = setup.memberIds.length;
    for (const personaId of setup.memberIds) setup.state = core.applyCommand(setup.state,
        { type: 'AssignEquipment', personaId, slot: 'shield', item: 'leatherShield' }, setup.context);
    const { state: captured, manifest } = reachCapture(setup, ['People']);
    const slot = manifest.slots.find(value => value.kind === 'People');
    assert.ok(slot?.entityId, 'A surviving raider captures an actual nearby living resident after real combat');
    const original = setup.state.world.targetClans[setup.rivalId].personas[slot.entityId];
    const source = captured.world.targetClans[setup.rivalId];
    const held = source.custody.people[slot.entityId];
    assert.equal(held.phase, 'held');
    assert.deepEqual(held.position, source.residentPresence.residents[slot.entityId].position);
    assert.equal(captured.personas[slot.entityId], undefined);
    assert.equal(source.personas[slot.entityId].name, original.name);
    assert.deepEqual(source.personas[slot.entityId].dna, original.dna);
    assert.equal(core.inspectWork(source, slot.entityId).productivityBps, 0);
    assert.throws(() => core.applyCommand(source, { type: 'AssignOccupation', personaId: slot.entityId,
        occupation: null }), /away|custody/i);
    let state = core.reconstructState(core.serializeState(captured));
    let previousPosition = { ...held.position }, receipt;
    for (let tick = 0; tick < 500; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const current = state.world.targetClans[setup.rivalId].custody.people[slot.entityId];
        if (current) {
            assert.ok(Math.hypot(current.position.x - previousPosition.x, current.position.z - previousPosition.z) <= 2.000001,
                'The actual escort follows reached terrain instead of teleporting');
            previousPosition = { ...current.position };
        }
        receipt = state.events.find(event => event.type === 'PersonaTransferredIn' && event.personaId === slot.entityId);
        if (receipt) break;
    }
    assert.ok(receipt);
    assert.deepEqual(receipt.details.arrivalPosition, previousPosition);
    assert.equal(state.world.targetClans[setup.rivalId].personas[slot.entityId], undefined);
    assert.ok(state.world.targetClans[setup.rivalId].personaArchive[slot.entityId]);
    assert.equal(state.personas[slot.entityId].name, original.name);
    assert.equal(state.personas[slot.entityId].birthWinter, original.birthWinter);
    assert.deepEqual(state.personas[slot.entityId].parentIds, original.parentIds);
    assert.deepEqual(state.personas[slot.entityId].dna, original.dna);
    assert.equal(state.events.filter(event => event.type === 'PersonaTransferredIn' && event.personaId === slot.entityId).length, 1);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('portable custody rejects an invented home outside the actual saved world', () => {
    const setup = encounterFixture({ members: 1 });
    const animalId = Object.keys(setup.state.world.targetClans[setup.rivalId].landing.cattle).sort()[0];
    setup.context.livestockPositionsByClan = { [setup.rivalId]: { [animalId]: { x: 160, z: 136 } } };
    const { state } = reachCapture(setup, ['Cattle']);
    const invalid = JSON.parse(core.serializeState(state));
    invalid.world.targetClans[setup.rivalId].custody.livestock[animalId].home.x = 5000;
    assert.throws(() => core.reconstructState(JSON.stringify(invalid)), /custody|world|route/i);
});

test('one lost carrier forfeits only its slot while actual survivors deliver their own stock', () => {
    const setup = encounterFixture();
    setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 40, chanceBps: 10000 }];
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    const { state: captured, manifest } = reachCapture(setup, ['Food']);
    assert.equal(manifest.slots.length, 4);
    let state = core.applyCommand(core.reconstructState(core.serializeState(captured)),
        { type: 'AdvanceTicks', ticks: 1000 - captured.time.tick }, setup.context);
    const afterLoss = latestPhysical(state).task.encounterRules.manifest;
    assert.equal(afterLoss.slots.filter(slot => slot.status === 'lost').length, 1);
    assert.equal(afterLoss.slots.filter(slot => slot.status === 'held').length, 3);
    state = core.applyCommand(core.reconstructState(core.serializeState(state)), { type: 'AdvanceTicks', ticks: 100 }, setup.context);
    const mission = latestPhysical(state), final = mission.task.encounterRules.manifest;
    assert.equal(mission.status, 'Returned');
    assert.equal(mission.task.result.survivorIds.length, 3);
    assert.deepEqual(mission.task.result.casualtyIds, ['founder-1']);
    assert.equal(final.slots.filter(slot => slot.status === 'delivered').length, 3);
    assert.equal(final.slots.filter(slot => slot.status === 'lost').length, 1);
    assert.equal(mission.task.result.food, 30);
    assert.equal(state.events.filter(event => event.type === 'MissionCargoLost' && event.details?.missionId === mission.id).length, 1);
    assert.equal(state.events.filter(event => event.type === 'MissionCargoDelivered' && event.details?.missionId === mission.id).length, 1);
    for (const id of mission.task.result.survivorIds) {
        const actor = core.inspectResidentPresence(state, id);
        assert.ok(actor);
        assert.ok(Math.hypot(actor.position.x - mission.homeOrigins[id].x, actor.position.z - mission.homeOrigins[id].z) < 1e-6);
    }
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('a released person keeps canonical presence at the real returning body until reaching the old home', () => {
    const setup = encounterFixture({ defenders: true,
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    setup.state.smithery.stored.leatherShield = setup.memberIds.length;
    for (const personaId of setup.memberIds) setup.state = core.applyCommand(setup.state,
        { type: 'AssignEquipment', personaId, slot: 'shield', item: 'leatherShield' }, setup.context);
    setup.state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 40, chanceBps: 10000 }];
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 310 }, setup.context);
    let { state, manifest } = reachCapture(setup, ['People']);
    const slot = manifest.slots.find(slot => slot.carrierId === 'founder-1');
    assert.ok(slot?.entityId);
    const id = slot.entityId;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 - state.time.tick }, setup.context);
    const released = state.world.targetClans[setup.rivalId].custody.people[id];
    assert.equal(released.phase, 'returning');
    const home = { ...released.home };
    for (let tick = 0; tick < 100; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const source = state.world.targetClans[setup.rivalId], held = source.custody.people[id];
        const actor = source.residentPresence.residents[id];
        assert.deepEqual(actor.position, held ? held.position : home,
            'Canonical presence must not stay at the capture point or jump on release');
        if (!held) break;
        assert.equal(core.personaAway(source, id), true);
    }
    const source = state.world.targetClans[setup.rivalId];
    assert.equal(source.custody.people[id], undefined);
    assert.equal(core.personaAway(source, id), false);
    assert.deepEqual(source.residentPresence.residents[id].position, home);
    assert.equal(state.personas[id], undefined);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('a genuinely scheduled maternal delivery stays with one source owner during captivity and follows arrival once', () => {
    const setup = encounterFixture({ defenders: true, calendarMode: 'individual-v1',
        policy: { actionLethalityBps: 10000, maximumExchanges: 1 } });
    const origin = setup.state.world.targetClans[setup.rivalId];
    origin.mechanics.config.fertilityChanceBps = 10000;
    origin.mechanics.config.partnershipChanceBps = 10000;
    setup.state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 718 }, setup.context);
    setup.state.smithery.stored.leatherShield = setup.memberIds.length;
    for (const personaId of setup.memberIds) setup.state = core.applyCommand(setup.state,
        { type: 'AssignEquipment', personaId, slot: 'shield', item: 'leatherShield' }, setup.context);
    const { state: captured } = reachCapture(setup, ['People']);
    const motherId = 'island-rival:founder-1';
    const source = captured.world.targetClans[setup.rivalId];
    assert.ok(source.custody.people[motherId], 'The actual pregnant mother is captured after the encounter');
    const plan = structuredClone(source.birthdayCalendar.pendingBirths.find(value => value.motherId === motherId));
    assert.ok(plan);
    assert.deepEqual(plan.dueAt, { winter: 801, tick: 428 });
    assert.ok(source.events.some(event => event.type === 'BirthScheduled' && event.personaId === motherId),
        'The plan was sampled by real annual fertility, never inserted by the test');
    const absolute = value => value.time.winter * value.ticksPerWinter + value.time.tick;
    const due = plan.dueAt.winter * captured.ticksPerWinter + plan.dueAt.tick;
    assert.ok(due > absolute(captured));
    let state = core.applyCommand(core.reconstructState(core.serializeState(captured)),
        { type: 'AdvanceTicks', ticks: due - absolute(captured) }, setup.context);
    assert.deepEqual(state.world.targetClans[setup.rivalId].birthdayCalendar.pendingBirths.find(value => value.motherId === motherId), plan);
    assert.equal(state.world.targetClans[setup.rivalId].events.some(event => event.type === 'ChildBorn' &&
        event.details.parentIds.includes(motherId)), false);
    assert.equal(state.personas[motherId], undefined);
    let birth;
    for (let tick = 0; tick < 200; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        birth = state.events.find(event => event.type === 'ChildBorn' && event.details.parentIds.includes(motherId));
        if (birth) break;
    }
    assert.ok(birth);
    const arrival = state.events.find(event => event.type === 'PersonaTransferredIn' && event.personaId === motherId);
    assert.ok(arrival);
    assert.ok(birth.time.winter * 1000 + birth.time.tick >= arrival.time.winter * 1000 + arrival.time.tick);
    assert.deepEqual(state.personas[birth.personaId].dna, plan.dna);
    assert.deepEqual(state.personas[birth.personaId].parentIds, [plan.fatherId, motherId]);
    assert.equal(state.personas[birth.personaId].name, plan.name);
    assert.ok(state.personas[plan.fatherId] || state.personaArchive[plan.fatherId]);
    assert.equal(state.world.targetClans[setup.rivalId].birthdayCalendar.pendingBirths.some(value => value.motherId === motherId), false);
    assert.equal([state, state.world.targetClans[setup.rivalId]].flatMap(clan => clan.events)
        .filter(event => event.type === 'ChildBorn' && event.details.parentIds.includes(motherId)).length, 1);
    const uninterrupted = core.applyCommand(captured, { type: 'AdvanceTicks', ticks: absolute(state) - absolute(captured) }, setup.context);
    assert.deepEqual(uninterrupted, state);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});


test('a won raid cannot capture a real defender still serving another group encounter', () => {
    const defenderId = 'island-rival:founder-1';
    const setup = encounterFixture({
        policy: { actionLethalityBps: 0, maximumExchanges: 1, exchangeTicks: 25 },
        rivalHomes: clan => Object.fromEntries(Object.keys(clan.personas).sort().map((id, index) =>
            [id, id === defenderId ? { x: 160, z: 128 } : { x: 232 + index % 4 * 4, z: 116 + Math.floor(index / 4) * 8 }])),
    });
    const secondMembers = core.inspectWorld(setup.state).eligible.map(person => person.id).slice(0, 2);
    assert.equal(secondMembers.length, 2);
    let state = core.applyCommand(setup.state, { type: 'CreateExpeditionGroup',
        name: 'Second shore party', memberIds: secondMembers }, setup.context);
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: setup.target, mission: 'Pillage', priorities: ['People'] }, setup.context);
    const firstId = latestPhysical(state).id;
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 300 }, setup.context);
    const secondContext = { ...setup.context, encounterPolicy: {
        actionLethalityBps: 0, maximumExchanges: 8, exchangeTicks: 25 } };
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-2',
        target: setup.target, mission: 'Pillage', priorities: ['Food'] }, secondContext);
    const secondId = latestPhysical(state).id;
    let before;
    for (let tick = 0; tick < 500; tick++) {
        before = state;
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, secondContext);
        if (state.world.spatial.missions[firstId].task.encounterRules.manifest) break;
    }
    const first = state.world.spatial.missions[firstId];
    assert.ok(first.task.encounterRules.manifest, 'The first real raid reaches its on-site capture');
    const second = before.world.spatial.missions[secondId];
    const active = before.world.encounters.records[second.task.encounterRules.encounterId];
    assert.equal(active.phase, 'engaging');
    assert.ok(active.defenderIds.includes(defenderId), 'The second encounter commits the same actual surviving defender');
    const dutyId = before.world.targetClans[setup.rivalId].residentPresence.residents[defenderId].incidentId;
    assert.ok(dutyId, 'This is an actual reserved duty, never an inserted role');
    assert.equal(before.world.territory.incidents[dutyId].missionId, secondId);
    assert.equal(first.task.encounterRules.manifest.slots.some(slot => slot.entityId === defenderId), false,
        'A person already serving another encounter is unavailable for capture');
    assert.ok(state.world.targetClans[setup.rivalId].personas[defenderId]);
    assert.equal(state.world.targetClans[setup.rivalId].custody?.people[defenderId], undefined);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
