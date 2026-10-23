import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const smithery = loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
const world = loadTypeScript(new URL('../src/simulation/WorldExpeditions.ts', import.meta.url));

function campaign(seed = 32) {
    let state = core.createCampaign(seed, { initialFood: 1000, initialMaterials: 200 }, {
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
        partnershipChanceBps: 0, switchTicks: 0, workPerUnit: 100000,
    }, { enabled: false });
    for (const id of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id, occupation: null });
    return state;
}
const command = (state, action) => core.applyCommand(state, action);
const work = (state, personaId, occupation) => command(state, { type: 'AssignOccupation', personaId, occupation });
const target = (state, item, count) => command(state, { type: 'SetSmitheryTarget', item, target: count });
const equip = (state, personaId, slot, item) => command(state, { type: 'AssignEquipment', personaId, slot, item });
const advance = (state, ticks) => command(state, { type: 'AdvanceTicks', ticks });
function goods() {
    let state = work(campaign(), 'founder-1', 'smith');
    state = target(target(state, 'woodenSpear', 2), 'woodenShield', 3);
    state = advance(state, 100);
    assert.equal(state.smithery.stored.woodenSpear, 2);
    assert.equal(state.smithery.stored.woodenShield, 3);
    return state;
}
function raid(state, casualtyBps = 1000, successBps = 6000) {
    state = command(state, { type: 'CreateExpeditionGroup', name: 'Named crew',
        memberIds: ['founder-1', 'founder-2', 'founder-3', 'founder-4'] });
    const region = Object.values(state.world.regions).find(region => region.targetClanId && !region.requiresShip);
    assert.ok(region);
    state.world.knowledge[region.id] = { level: 'Scouted', observedAt: world.absoluteTick(state),
        terrain: region.terrain, resources: [], settlementName: 'Known clan', opportunity: true, resistance: null };
    state.world.config.casualtyBps.Pillage = casualtyBps;
    state.world.config.successBps.Pillage = successBps;
    state.world.config.durations.Pillage = 4;
    return { state, region };
}

test('Smith makes bounded whole gear from real Materials using ordinary progress, with no instant output', () => {
    let state = work(campaign(), 'founder-1', 'smith');
    const initial = state.stocks.materials;
    state = target(target(state, 'woodenSpear', 2), 'woodenShield', 3);
    assert.equal(state.smithery.stored.woodenSpear, 0);
    assert.equal(state.stocks.materials, initial);
    state = advance(state, 100);
    assert.deepEqual(state.smithery.stored, { woodenSpear: 2, woodenShield: 3, leatherShield: 0 });
    assert.equal(state.stocks.materials, initial - 2 * 2 - 3 * 3);
    const crafted = state.events.filter(event => event.type === 'EquipmentCrafted');
    assert.equal(crafted.length, 5);
    assert.ok(crafted.every(event => event.personaId === 'founder-1' && event.details.creatorId === event.personaId));
    assert.equal(core.inspectWork(state, 'founder-1').reason, 'target-reached');
    const after = advance(state, 100);
    assert.deepEqual(after.smithery.stored, state.smithery.stored);
    assert.equal(after.stocks.materials, state.stocks.materials);
});

test('Leatherworker consumes Hides and Materials once; no Hides and no active worker mean no gear', () => {
    let state = target(work(campaign(), 'founder-1', 'leatherAndJewelleryMaker'), 'leatherShield', 2);
    assert.equal(core.inspectWork(state, 'founder-1').reason, 'missing-hides');
    const blocked = advance(state, 100);
    assert.equal(blocked.smithery.stored.leatherShield, 0);
    assert.equal(blocked.personas['founder-1'].workProgress, 0);
    state.specialistStocks = { version: 1, hides: 1 }; // A supplied stock fixture; slaughter is tested separately.
    const initial = state.stocks.materials;
    state = advance(state, 100);
    assert.equal(state.smithery.stored.leatherShield, 1);
    assert.equal(state.specialistStocks.hides, 0);
    assert.equal(state.stocks.materials, initial - 3);
    state = work(state, 'founder-1', null);
    state.specialistStocks.hides = 10;
    assert.equal(advance(state, 100).smithery.stored.leatherShield, 1);
});

test('Materials shortages, stopped targets and multiple Smiths never duplicate or overshoot stock', () => {
    let state = target(work(work(campaign(), 'founder-1', 'smith'), 'founder-2', 'smith'), 'woodenSpear', 1);
    state.stocks.materials = 1;
    state = advance(state, 20);
    assert.equal(state.smithery.stored.woodenSpear, 0);
    state.stocks.materials = 2;
    state = advance(state, 100);
    assert.equal(state.smithery.stored.woodenSpear, 1);
    assert.equal(state.stocks.materials, 0);
    state = equip(state, 'founder-4', 'weapon', 'woodenSpear');
    state.stocks.materials = 100;
    state = advance(state, 100);
    assert.equal(state.smithery.stored.woodenSpear, 0, 'Assigned items already meet the target');
    assert.equal(smithery.equipmentOwned(state, 'woodenSpear'), 1);
});

test('four named people retain deliberate mixed allocations with exactly two slots', () => {
    let state = goods();
    for (const id of ['founder-1', 'founder-3']) state = equip(state, id, 'weapon', 'woodenSpear');
    for (const id of ['founder-1', 'founder-2', 'founder-4']) state = equip(state, id, 'shield', 'woodenShield');
    assert.deepEqual(smithery.equipmentFor(state, 'founder-1'), { weapon: 'woodenSpear', shield: 'woodenShield' });
    assert.deepEqual(smithery.equipmentFor(state, 'founder-2'), { weapon: null, shield: 'woodenShield' });
    assert.deepEqual(smithery.equipmentFor(state, 'founder-3'), { weapon: 'woodenSpear', shield: null });
    assert.deepEqual(smithery.equipmentFor(state, 'founder-4'), { weapon: null, shield: 'woodenShield' });
    const snapshot = smithery.pillageEquipment(state, ['founder-1', 'founder-2', 'founder-3', 'founder-4'], 6000, 1000);
    assert.equal(snapshot.successBps, 6500);
    assert.deepEqual(snapshot.members.map(member => member.casualtyBps), [750, 750, 1000, 750]);
    state.smithery.stored.leatherShield = 1;
    state = equip(state, 'founder-2', 'shield', 'leatherShield');
    assert.equal(state.smithery.stored.woodenShield, 1);
    assert.equal(smithery.pillageEquipment(state, ['founder-2', 'founder-3'], 6000, 1000).members[0].casualtyBps, 600);
});

test('invalid targets, unavailable inventory, wrong slots and underage assignments are atomic', () => {
    const state = goods(), before = core.serializeState(state);
    for (const action of [
        { type: 'SetSmitheryTarget', item: 'woodenSpear', target: -1 },
        { type: 'SetSmitheryTarget', item: 'woodenSpear', target: 1.5 },
        { type: 'SetSmitheryTarget', item: 'woodenSpear', target: 21 },
        { type: 'AssignEquipment', personaId: 'founder-1', slot: 'weapon', item: 'woodenShield' },
        { type: 'AssignEquipment', personaId: 'founder-1', slot: 'shield', item: 'leatherShield' },
        { type: 'AssignEquipment', personaId: 'missing', slot: 'weapon', item: 'woodenSpear' },
    ]) {
        assert.throws(() => command(state, action));
        assert.equal(core.serializeState(state), before);
    }
    const young = structuredClone(state);
    young.personas['founder-1'].birthWinter = 790;
    assert.throws(() => equip(young, 'founder-1', 'weapon', 'woodenSpear'));
});

test('dispatch freezes equipment and probabilities; away items cannot be reassigned or automatically replaced', () => {
    let state = equip(goods(), 'founder-1', 'weapon', 'woodenSpear');
    state = equip(state, 'founder-1', 'shield', 'woodenShield');
    const prepared = raid(state);
    state = command(prepared.state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: prepared.region.id,
        mission: 'Pillage', priorities: ['Materials'] });
    const mission = state.world.missions['mission-1'], frozen = structuredClone(mission.equipment);
    const before = core.serializeState(state);
    assert.throws(() => equip(state, 'founder-1', 'shield', null), /home/);
    assert.equal(core.serializeState(state), before);
    state = target(state, 'woodenSpear', 8);
    state.smithery.config.spearBonusBps = 2000;
    assert.deepEqual(state.world.missions['mission-1'].equipment, frozen);
    assert.deepEqual(core.reconstructState(core.serializeState(state)).world.missions['mission-1'].equipment, frozen);
});

test('returning survivors keep their gear, repeated dispatch does not debit it and a casualty loses it', () => {
    let prepared = raid(equip(goods(), 'founder-1', 'weapon', 'woodenSpear'), 0, 10000);
    let state = command(prepared.state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: prepared.region.id,
        mission: 'Pillage', priorities: ['Materials'] });
    state = advance(state, 4);
    assert.equal(smithery.equipmentFor(state, 'founder-1').weapon, 'woodenSpear');
    assert.equal(state.world.missions['mission-1'].result.equipment.returned.length, 4);
    assert.equal(state.smithery.stored.woodenSpear, 1);
    state.world.config.casualtyBps.Pillage = 10000;
    state = command(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: prepared.region.id,
        mission: 'Pillage', priorities: ['Materials'] });
    state = advance(state, 4);
    assert.equal(state.personas['founder-1'].deathWinter, 800);
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    assert.equal(state.smithery.stored.woodenSpear, 1, 'The carried spear was lost, not refunded');
    assert.equal(state.world.missions['mission-2'].result.equipment.lost.length, 4);
    assert.equal(state.events.filter(event => event.type === 'EquipmentLost').length, 1);
});

test('save/load, rollback and split work advances preserve integer stocks, progress, RNG and factual events', () => {
    let state = target(work(campaign(), 'founder-1', 'smith'), 'woodenSpear', 6);
    const batch = advance(state, 80);
    const split = advance(core.reconstructState(core.serializeState(advance(state, 33))), 47);
    assert.equal(core.serializeState(split), core.serializeState(batch));
    assert.equal(state.smithery.stored.woodenSpear, 0, 'The original checkpoint is still intact');
    assert.deepEqual(core.reconstructState(core.serializeState(batch)).smithery, batch.smithery);
});

test('legacy campaigns gain no invented stock or retroactive equipment effects', () => {
    const original = campaign();
    delete original.smithery;
    const loaded = core.reconstructState(core.serializeState(original));
    assert.equal(loaded.smithery, undefined);
    assert.equal(smithery.pillageEquipment(loaded, ['founder-1'], 6000, 1000), undefined);
    const prospect = target(loaded, 'woodenSpear', 1);
    assert.equal(prospect.smithery.stored.woodenSpear, 0);
    assert.equal(prospect.specialistStocks, undefined, 'No historic slaughter is replayed');
});

test('death at home recovers clan gear and transfer cannot carry a second clan inventory', () => {
    let state = equip(goods(), 'founder-1', 'weapon', 'woodenSpear');
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 10000 }];
    state = advance(state, 900);
    assert.equal(state.smithery.stored.woodenSpear, 2);
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    assert.equal(state.events.filter(event => event.type === 'EquipmentRecovered').length, 1);
    let looter = campaign();
    const targetClanId = Object.keys(looter.world.targetClans)[0], targetClan = looter.world.targetClans[targetClanId];
    const personId = Object.keys(targetClan.personas).sort()[0];
    targetClan.smithery.stored.woodenSpear = 1;
    looter.world.targetClans[targetClanId] = equip(targetClan, personId, 'weapon', 'woodenSpear');
    const loot = world.recoverExpeditionCargo(looter, { id: 'transfer-fixture', priorities: ['People'] }, ['founder-1'], targetClanId);
    assert.equal(loot.personaIds[0], personId);
    assert.equal(looter.world.targetClans[targetClanId].smithery.stored.woodenSpear, 1);
    assert.equal(looter.world.targetClans[targetClanId].smithery.assignments[personId], undefined);
    assert.equal(looter.smithery.assignments[personId], undefined);
    core.serializeState(looter);
});

test('saved invalid slot counts and corrupted mission probabilities are rejected', () => {
    let state = goods();
    state.smithery.stored.woodenShield = -1;
    assert.throws(() => core.reconstructState(JSON.stringify(state)), /Smithery/);
    state = goods();
    state.smithery.assignments['founder-1'] = { weapon: 'woodenSpear', shield: null, body: 'armor' };
    assert.throws(() => core.serializeState(state), /owner/);
    const snapshot = smithery.pillageEquipment(goods(), ['founder-1'], 6000, 1000);
    snapshot.members[0].casualtyBps = 0;
    assert.throws(() => smithery.validatePillageEquipment(snapshot, ['founder-1'], 6000, 1000), /snapshot/);
});

test('crafts reuse care restrictions, aptitude and existing permanent-home specialization upgrades', () => {
    let state = core.createSettlement(32, { switchTicks: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] });
    state = command(state, { type: 'AssignOccupation', personaId: 'liv', occupation: 'smith' });
    state = target(state, 'woodenSpear', 1);
    assert.equal(core.inspectWork(state, 'liv').reason, 'childcare');
    const cared = advance(state, 100);
    assert.equal(cared.smithery.stored.woodenSpear, 0);
    assert.equal(cared.personas.liv.workProgress, 0);
    let working = target(work(campaign(), 'founder-1', 'smith'), 'woodenSpear', 3);
    const household = Object.values(working.households).find(home => home.memberIds.includes('founder-1'));
    working = command(working, { type: 'HouseHousehold', householdId: household.id });
    const residence = working.residences[working.households[household.id].residenceId];
    working = command(working, { type: 'SpecializeBuilding', buildingId: residence.buildingId, occupation: 'smith' });
    const plain = core.inspectWork(working, 'founder-1');
    working = command(working, { type: 'UpgradeBuilding', buildingId: residence.buildingId });
    const upgraded = core.inspectWork(working, 'founder-1');
    assert.equal(upgraded.aptitudeBps, plain.aptitudeBps);
    assert.equal(upgraded.productivityBps, Math.floor(plain.productivityBps * 1.25));
});
