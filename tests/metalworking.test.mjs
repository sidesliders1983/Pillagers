import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { core, metalworkingApply as apply, metalworkingContext as context,
    minedMetalworkingFixture, craftedIronFixture } from './metalworking-fixture.mjs';

const smithery = loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
const { resolveExpeditionCrew } = loadTypeScript(new URL('../src/simulation/WorldExpeditions.ts', import.meta.url));
const advance = (state, ticks) => apply(state, { type: 'AdvanceTicks', ticks });
const target = (state, item, quantity) => apply(state, { type: 'SetSmitheryTarget', item, target: quantity });
const equip = (state, id, slot, item) => apply(state, { type: 'AssignEquipment', personaId: id, slot, item });
const extracted = state => state.mining.sites.reduce((sum, site) => sum + site.initialUnits - site.remainingUnits, 0);
const ironCrafts = state => state.events.filter(event => event.type === 'EquipmentCrafted' &&
    ['ironSpear', 'ironShield'].includes(event.details.item));

function readySmith() {
    return apply(minedMetalworkingFixture(), { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
}
function legacyDeparture(state, casualtyBps = 1000) {
    state = apply(state, { type: 'EditExpeditionGroup', groupId: 'group-1', name: 'Named iron crew',
        memberIds: ['founder-1', 'founder-2'] });
    const region = Object.values(state.world.regions).find(value => value.targetClanId && !value.requiresShip);
    state.world.config.successBps.Recon = 10000;
    state.world.config.casualtyBps.Recon = 0;
    state.world.config.durations.Recon = 1;
    state = apply(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id, mission: 'Recon' });
    state = advance(state, 1);
    state.world.config.casualtyBps.Pillage = casualtyBps;
    state.world.config.durations.Pillage = 4;
    return apply(state, { type: 'DispatchExpedition', groupId: 'group-1', regionId: region.id,
        mission: 'Pillage', priorities: ['Materials'] });
}

test('explicit prospective iron targets adopt once without free ore, gear, clocks or load-time changes', () => {
    const legacy = core.createCampaign(32, { initialFood: 500, initialMaterials: 100 });
    const bytes = core.serializeState(legacy);
    assert.equal(legacy.smithery.version, 1);
    assert.deepEqual(Object.keys(legacy.smithery.stored), ['woodenSpear', 'woodenShield', 'leatherShield']);
    assert.equal(core.serializeState(core.reconstructState(bytes)), bytes);
    let state = core.applyCommand(legacy, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    const before = state;
    state = core.applyCommand(state, { type: 'SetSmitheryTarget', item: 'ironSpear', target: 1 });
    assert.equal(state.smithery.version, 2);
    assert.equal(state.smithery.stored.ironSpear, 0);
    assert.equal(state.smithery.stored.ironShield, 0);
    assert.deepEqual(state.stocks, before.stocks);
    assert.deepEqual(state.specialistStocks, before.specialistStocks);
    assert.deepEqual(state.time, before.time);
    assert.equal(state.rngState, before.rngState);
    assert.deepEqual(state.world, before.world);
    assert.equal(state.events.filter(event => event.type === 'MetalworkingAdopted').length, 1);
    assert.equal(core.serializeState(core.applyCommand(state, { type: 'SetSmitheryTarget', item: 'ironSpear', target: 1 })),
        core.serializeState(state));
    assert.equal(core.inspectWork(state, 'founder-1').reason, 'missing-iron-ore');
    const blocked = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 100 });
    assert.equal(blocked.smithery.stored.ironSpear, 0);
    assert.equal(blocked.personas['founder-1'].workProgress, 0);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(blocked))), core.serializeState(blocked));
});

test('real mining funds Smith recipes once, with integer ore/material spending and no target overrun', () => {
    const before = readySmith(), openingOre = before.specialistStocks.ironOre;
    let state = target(target(before, 'ironSpear', 2), 'ironShield', 2);
    assert.equal(state.specialistStocks.ironOre, openingOre);
    state = advance(state, 200);
    assert.equal(state.smithery.stored.ironSpear, 2);
    assert.equal(state.smithery.stored.ironShield, 2);
    assert.equal(state.stocks.materials, before.stocks.materials - 12);
    assert.equal(state.specialistStocks.ironOre, openingOre - 6);
    const receipts = ironCrafts(state);
    assert.equal(receipts.length, 4);
    assert.ok(receipts.every(event => event.personaId === 'founder-1' && event.details.creatorId === 'founder-1' &&
        event.details.occupation === 'smith' && event.details.metalworkingVersion === 1));
    assert.equal(state.specialistStocks.ironOre + receipts.reduce((sum, event) => sum + event.details.ironOre, 0), extracted(state));
    assert.deepEqual(advance(state, 100).smithery.stored, state.smithery.stored);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('new iron stocks and ore spending require complete factual provenance, not a catalogue key or counterfeit stock', () => {
    const state = craftedIronFixture();
    for (const tamper of [
        copy => { copy.specialistStocks.ironOre++; },
        copy => { copy.smithery.stored.ironSpear++; },
        copy => { copy.smithery.stored.ironShield--; },
        copy => { ironCrafts(copy)[0].details.ironOre = 0; },
        copy => { ironCrafts(copy)[0].details.recipe.ironOre = 0; },
        copy => { ironCrafts(copy)[0].details.creatorId = 'founder-2'; },
        copy => { copy.events.find(event => event.type === 'MetalworkingAdopted').details.clanId = 'other-clan'; },
    ]) {
        const copy = structuredClone(state);
        tamper(copy);
        assert.throws(() => core.reconstructState(JSON.stringify(copy)), /mining|Metalworking/i);
    }
    const historical = minedMetalworkingFixture();
    historical.smithery.stored.ironSpear = 1;
    assert.throws(() => core.serializeState(historical), /catalogue/);
});

test('ordinary labour eligibility, finite inputs and shared targets govern iron work', () => {
    let state = target(minedMetalworkingFixture(), 'ironSpear', 1);
    assert.equal(advance(state, 100).smithery.stored.ironSpear, 0, 'No Smith cannot turn targets into items');
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'leatherAndJewelleryMaker' });
    assert.equal(advance(state, 100).smithery.stored.ironSpear, 0, 'Leatherworker does not forge iron');
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: 'smith' });
    const before = structuredClone(state);
    state.stocks.materials = 1;
    const blocked = advance(state, 30);
    assert.equal(blocked.smithery.stored.ironSpear, 0);
    assert.equal(blocked.specialistStocks.ironOre, before.specialistStocks.ironOre);
    state = advance(before, 100);
    assert.equal(state.smithery.stored.ironSpear, 1, 'Two Smiths cannot overrun one shared target');
    state = equip(state, 'founder-1', 'weapon', 'ironSpear');
    assert.equal(advance(state, 100).smithery.stored.ironSpear, 0, 'A worn iron item already meets the target');
    const household = Object.values(state.households).find(home => home.memberIds.includes('founder-1'));
    state = apply(state, { type: 'HouseHousehold', householdId: household.id });
    const buildingId = state.residences[state.households[household.id].residenceId].buildingId;
    state = apply(state, { type: 'SpecializeBuilding', buildingId, occupation: 'smith' });
    state = target(state, 'ironSpear', 3);
    const plain = core.inspectWork(state, 'founder-1');
    const upgraded = core.inspectWork(apply(state, { type: 'UpgradeBuilding', buildingId }), 'founder-1');
    assert.equal(upgraded.aptitudeBps, plain.aptitudeBps);
    assert.equal(upgraded.productivityBps, Math.floor(plain.productivityBps * 1.25));
    assert.equal(plain.unitsPerWinter, 2);
});

test('two real personal slots atomically exchange iron gear and dispatch freezes wearer-specific rules', () => {
    let state = craftedIronFixture();
    state = equip(equip(state, 'founder-1', 'weapon', 'ironSpear'), 'founder-1', 'shield', 'ironShield');
    const owned = state.smithery.stored.ironSpear;
    const snapshot = smithery.pillageEquipment(state, ['founder-1', 'founder-2'], 6000, 1000);
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.successBps, 6750, 'Only the actual iron spear holder contributes +1500/2 percentage-point bps');
    assert.deepEqual(snapshot.members.map(member => member.casualtyBps), [500, 1000]);
    assert.deepEqual(Object.keys(state.smithery.assignments['founder-1']), ['weapon', 'shield']);
    assert.equal(state.smithery.stored.ironSpear, owned);
    const departure = legacyDeparture(state), mission = Object.values(departure.world.missions).at(-1);
    const frozen = structuredClone(mission.equipment);
    assert.throws(() => equip(departure, 'founder-1', 'weapon', null), /home/);
    assert.deepEqual(core.reconstructState(core.serializeState(departure)).world.missions[mission.id].equipment, frozen);
    const changed = structuredClone(departure);
    changed.smithery.config.ironSpearBonusBps = 2000;
    changed.smithery.config.ironShieldProtectionBps = 6000;
    assert.deepEqual(core.reconstructState(core.serializeState(changed)).world.missions[mission.id].equipment, frozen);
    const unequipped = equip(equip(state, 'founder-1', 'weapon', null), 'founder-1', 'shield', null);
    assert.equal(unequipped.smithery.stored.ironSpear, 2);
    assert.equal(unequipped.smithery.stored.ironShield, 2);
    assert.equal(unequipped.smithery.assignments['founder-1'], undefined);
});

test('iron casualties lose actual carried items once and survivors retain theirs through save/return', () => {
    let state = craftedIronFixture();
    state = equip(equip(state, 'founder-1', 'weapon', 'ironSpear'), 'founder-1', 'shield', 'ironShield');
    const survived = advance(legacyDeparture(state, 0), 4);
    assert.deepEqual(survived.smithery.assignments['founder-1'], state.smithery.assignments['founder-1']);
    assert.equal(survived.events.filter(event => event.type === 'EquipmentLost').length, 0);
    const fatal = structuredClone(state);
    fatal.smithery.config.woodenShieldProtectionBps = 0;
    fatal.smithery.config.leatherShieldProtectionBps = 0;
    fatal.smithery.config.ironShieldProtectionBps = 0;
    const lost = advance(legacyDeparture(fatal, 10000), 4);
    assert.equal(lost.smithery.assignments['founder-1'], undefined);
    assert.equal(lost.smithery.stored.ironSpear, 1);
    assert.equal(lost.smithery.stored.ironShield, 1);
    const losses = lost.events.filter(event => event.type === 'EquipmentLost');
    assert.equal(losses.length, 1);
    assert.deepEqual(losses[0].details.items, ['ironSpear', 'ironShield']);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(lost))), core.serializeState(lost));
});

test('split/reloaded iron work conserves stocks, receipts and RNG while historical snapshots stay exact', () => {
    const initial = target(target(readySmith(), 'ironSpear', 2), 'ironShield', 2);
    const batch = advance(initial, 160);
    const checkpoint = core.reconstructState(core.serializeState(advance(initial, 63)));
    assert.equal(core.serializeState(advance(checkpoint, 97)), core.serializeState(batch));
    const legacy = readySmith();
    legacy.smithery.stored.woodenSpear = 1;
    const equipped = equip(legacy, 'founder-1', 'weapon', 'woodenSpear');
    const oldSnapshot = smithery.pillageEquipment(equipped, ['founder-1', 'founder-2'], 6000, 1000);
    const adopted = target(equipped, 'ironSpear', 0);
    assert.equal(JSON.stringify(smithery.pillageEquipment(adopted, ['founder-1', 'founder-2'], 6000, 1000)),
        JSON.stringify(oldSnapshot), 'No actual iron means the original v1 snapshot bytes remain exact');
    for (let seed = 1; seed <= 100; seed++) {
        const first = structuredClone(equipped), second = structuredClone(adopted);
        first.rngState = second.rngState = seed;
        const mission = { id: 'zero-iron-parity', memberIds: ['founder-1', 'founder-2'],
            successBps: oldSnapshot.successBps, casualtyBps: 1000, equipment: oldSnapshot };
        const before = resolveExpeditionCrew(first, mission), after = resolveExpeditionCrew(second, mission);
        assert.deepEqual(after, before);
        assert.equal(second.rngState, first.rngState);
    }
});
