import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { core, craftedPersonalArmorFixture, equippedPersonalArmorFixture,
    personalArmorApply as apply } from './personal-armor-fixture.mjs';

import { craftedPersonalArmorVariantsFixture, equippedPersonalArmorVariantsFixture,
    personalArmorVariantsFixtureLivestockRules } from './personal-armor-variants-fixture.mjs';
import { minedMetalworkingFixture } from './metalworking-fixture.mjs';

const smithery = load('../src/simulation/Smithery.ts');
const { resolveExpeditionCrew, transferPersona } = load('../src/simulation/WorldExpeditions.ts');
const { inspectWork } = load('../src/simulation/Mechanics.ts');
const target = (state, item, amount) => apply(state, { type: 'SetSmitheryTarget', item, target: amount });
const equip = (state, slot, item, personaId = 'founder-1') =>
    apply(state, { type: 'AssignEquipment', personaId, slot, item });

test('only a prospective variant target adopts v4, preserving the exact paid v3 catalogue and old receipts', () => {
    const initial = craftedPersonalArmorFixture();
    const saved = core.serializeState(initial);
    assert.equal(core.serializeState(core.reconstructState(saved)), saved);
    assert.equal(initial.smithery.version, 3);
    const old = structuredClone(initial.smithery);
    const result = target(initial, 'leatherHelmet', 1);
    assert.equal(result.smithery.version, 4);
    assert.deepEqual(result.events.slice(0, initial.events.length), initial.events);
    assert.deepEqual(result.time, initial.time);
    assert.equal(result.rngState, initial.rngState);
    assert.deepEqual(result.stocks, initial.stocks);
    assert.deepEqual(result.specialistStocks, initial.specialistStocks);
    assert.deepEqual(result.smithery.personalArmor, old.personalArmor);
    for (const item of smithery.equipmentItemsFor(initial)) {
        assert.deepEqual(result.smithery.config.recipes[item], old.config.recipes[item]);
        assert.equal(result.smithery.stored[item], old.stored[item]);
        assert.equal(result.smithery.targets[item], old.targets[item]);
    }
    assert.equal(result.smithery.stored.leatherHelmet, 0);
    assert.equal(result.smithery.stored.ironBodyArmor, 0);
    assert.deepEqual(result.events.at(-2).details.personalArmorVersion, 2);
    assert.equal(result.events.at(-2).type, 'PersonalArmorVariantsAdopted');
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(result))), core.serializeState(result));
    assert.equal(core.serializeState(initial), saved, 'The input v3 state is unchanged.');
});

test('a v4 catalogue with no worn variants preserves old armor snapshots, casualty outcomes and RNG', () => {
    const before = equippedPersonalArmorFixture();
    const after = target(before, 'ironBodyArmor', 0);
    const members = ['founder-1', 'founder-2'];
    const snapshot = smithery.pillageEquipment(before, members, 6000, 1000);
    assert.equal(snapshot.version, 3);
    assert.equal(JSON.stringify(smithery.pillageEquipment(after, members, 6000, 1000)), JSON.stringify(snapshot));
    for (let seed = 1; seed <= 100; seed++) {
        const old = structuredClone(before), current = structuredClone(after);
        old.rngState = current.rngState = seed;
        const mission = { id: 'no-variant-parity', memberIds: members, equipment: snapshot,
            casualtyBps: 1000, successBps: snapshot.successBps };
        assert.deepEqual(resolveExpeditionCrew(current, mission), resolveExpeditionCrew(old, mission));
        assert.equal(current.rngState, old.rngState);
    }
});

test('unavailable variant stock and invalid targets reject atomically without granting or adopting gear', () => {
    const state = craftedPersonalArmorFixture(), before = core.serializeState(state);
    assert.throws(() => target(state, 'leatherHelmet', -1), /stock target/);
    assert.throws(() => target(state, 'ironBodyArmor', 999), /stock target/);
    assert.throws(() => equip(state, 'headgear', 'leatherHelmet'), /No stored/);
    assert.throws(() => equip(state, 'headgear', 'ironBodyArmor'), /matching/);
    assert.equal(core.serializeState(state), before);
});


test('all nine products use real paid work, with the hybrid body recipe assigned to Smiths and leather helmets to Leatherworkers', () => {
    const state = craftedPersonalArmorVariantsFixture();
    const crafts = state.events.filter(event => event.type === 'EquipmentCrafted');
    const body = crafts.find(event => event.details.item === 'ironBodyArmor');
    const helmet = crafts.find(event => event.details.item === 'leatherHelmet');
    assert.equal(crafts.length, 9);
    assert.deepEqual(body.details.recipe, { materials: 3, hides: 2, ironOre: 2, unitsPerWinter: 1 });
    assert.deepEqual(helmet.details.recipe, { materials: 2, hides: 1, unitsPerWinter: 1 });
    assert.equal(body.details.occupation, 'smith');
    assert.equal(helmet.details.occupation, 'leatherAndJewelleryMaker');
    assert.equal(body.details.personalArmorVersion, 2);
    assert.equal(helmet.details.personalArmorVersion, 2);
    assert.equal(crafts.reduce((sum, event) => sum + event.details.hides, 0), 6);
    assert.equal(crafts.reduce((sum, event) => sum + (event.details.ironOre ?? 0), 0), 7);
    for (const item of smithery.equipmentItems) assert.equal(state.smithery.stored[item], 1);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});

test('a hybrid Smith target spends neither ingredient when genuine Hides or genuine Ore are unavailable', () => {
    let missingHides = target(craftedPersonalArmorVariantsFixture(), 'ironBodyArmor', 2);
    missingHides = apply(missingHides, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    assert.equal(inspectWork(missingHides, 'founder-1').reason, 'missing-hides');
    const hidesBefore = structuredClone(missingHides.specialistStocks), materialsBefore = missingHides.stocks.materials;
    missingHides = apply(missingHides, { type: 'AdvanceTicks', ticks: 25 });
    assert.deepEqual(missingHides.specialistStocks, hidesBefore);
    assert.equal(missingHides.stocks.materials, materialsBefore);
    assert.equal(missingHides.smithery.stored.ironBodyArmor, 1);

    let missingOre = minedMetalworkingFixture({ livestockRules: personalArmorVariantsFixtureLivestockRules });
    const animal = Object.values(missingOre.landing.cattle).find(value => value.deathWinter === null &&
        missingOre.landing.livestock.hides[value.species] > 0 && missingOre.time.winter - value.birthWinter >= 2);
    missingOre = apply(missingOre, { type: 'SlaughterLivestock', livestockId: animal.id });
    missingOre = apply(missingOre, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    missingOre = target(missingOre, 'ironSpear', 20);
    for (let ticks = 0; missingOre.specialistStocks.ironOre > 0 && ticks < 1000; ticks += 25)
        missingOre = apply(missingOre, { type: 'AdvanceTicks', ticks: 25 });
    assert.equal(missingOre.specialistStocks.ironOre, 0);
    missingOre = target(target(missingOre, 'ironSpear', 0), 'ironBodyArmor', 1);
    assert.equal(inspectWork(missingOre, 'founder-1').reason, 'missing-iron-ore');
    const oreStocks = structuredClone(missingOre.specialistStocks), materials = missingOre.stocks.materials;
    missingOre = apply(missingOre, { type: 'AdvanceTicks', ticks: 25 });
    assert.deepEqual(missingOre.specialistStocks, oreStocks);
    assert.equal(missingOre.stocks.materials, materials);
    assert.equal(missingOre.smithery.stored.ironBodyArmor, 0);
});

test('variant replacement and named transfer use the same two existing armor slots and conserve hand gear', () => {
    let state = equippedPersonalArmorVariantsFixture();
    const hands = [state.smithery.assignments['founder-1'].weapon, state.smithery.assignments['founder-1'].shield];
    state = equip(equip(state, 'bodyArmor', 'leatherBodyArmor'), 'headgear', 'ironHelmet');
    assert.equal(state.smithery.stored.ironBodyArmor, 1);
    assert.equal(state.smithery.stored.leatherHelmet, 1);
    state = equip(equip(state, 'bodyArmor', 'ironBodyArmor', 'founder-3'), 'headgear', 'leatherHelmet', 'founder-3');
    assert.deepEqual([state.smithery.assignments['founder-1'].weapon, state.smithery.assignments['founder-1'].shield], hands);
    assert.equal(state.smithery.assignments['founder-3'].bodyArmor, 'ironBodyArmor');
    assert.equal(state.smithery.assignments['founder-3'].headgear, 'leatherHelmet');
    assert.equal(state.smithery.stored.ironBodyArmor, 0);
    assert.equal(state.smithery.stored.leatherHelmet, 0);
    assert.equal(smithery.equipmentOwned(state, 'ironBodyArmor'), 1);
    assert.equal(smithery.equipmentOwned(state, 'leatherHelmet'), 1);
    assert.equal(Object.keys(state.smithery.assignments['founder-3']).length, 4);
    const receiver = Object.values(state.world.targetClans)[0];
    transferPersona(state, receiver, 'founder-3', 'variant-transfer-review');
    assert.equal(state.smithery.stored.ironBodyArmor, 1);
    assert.equal(state.smithery.stored.leatherHelmet, 1);
    assert.equal(receiver.smithery.assignments['founder-3'], undefined);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('new protection remains wearer-only, multiplicative, capped and conservatively rounded', () => {
    const state = equippedPersonalArmorVariantsFixture(), rules = state.smithery.config;
    const gear = state.smithery.assignments['founder-1'];
    for (const [shield, expected] of [[null, 6650], ['woodenShield', 4987], ['leatherShield', 4000], ['ironShield', 4000]])
        assert.equal(smithery.equipmentCasualtyRisk(10000, { ...gear, shield }, rules), expected);
    assert.equal(smithery.equipmentCasualtyRisk(10000, { ...gear, bodyArmor: null, shield: null }, rules), 9500);
    assert.equal(smithery.equipmentCasualtyRisk(10000, { ...gear, headgear: null, shield: null }, rules), 7000);
    for (const base of [0, 1, 250, 1000, 9999, 10000])
        assert.ok(smithery.equipmentCasualtyRisk(base, gear, rules) >= Math.ceil(base * .4));
    const snapshot = smithery.pillageEquipment(state, ['founder-1', 'founder-2'], 6000, 1000);
    assert.equal(snapshot.version, 4);
    assert.equal(snapshot.members[0].casualtyBps, 400);
    assert.equal(snapshot.members[1].casualtyBps, 1000);
    assert.equal(snapshot.leatherHelmetProtectionBps, 500);
    assert.equal(snapshot.ironBodyArmorProtectionBps, 3000);
    const custom = equip(equip(state, 'bodyArmor', null), 'headgear', null);
    custom.smithery.config.ironShieldProtectionBps = 7500;
    const saved = core.serializeState(custom);
    assert.throws(() => equip(custom, 'bodyArmor', 'ironBodyArmor'), /Remove the shield first/);
    assert.throws(() => equip(custom, 'headgear', 'leatherHelmet'), /Remove the shield first/);
    assert.equal(core.serializeState(custom), saved);
});

test('paid variant receipts, ingredient stock, adoption and ownership reject forged save data', () => {
    const original = craftedPersonalArmorVariantsFixture();
    const receipt = state => state.events.find(event => event.type === 'EquipmentCrafted' && event.details.item === 'ironBodyArmor');
    for (const tamper of [
        state => { state.smithery.stored.ironBodyArmor++; },
        state => { state.smithery.stored.leatherHelmet++; },
        state => { state.specialistStocks.hides++; },
        state => { state.specialistStocks.ironOre++; },
        state => { receipt(state).details.occupation = 'leatherAndJewelleryMaker'; },
        state => { receipt(state).details.hides = receipt(state).details.recipe.hides = 0; },
        state => { receipt(state).details.ironOre = receipt(state).details.recipe.ironOre = 0; },
        state => { receipt(state).details.personalArmorVersion = 1; },
        state => { delete state.smithery.personalArmorVariants; },
        state => { state.smithery.personalArmorVariants.adoptedAt++; },
        state => { state.smithery.version = 3; },
    ]) {
        const corrupted = structuredClone(original);
        tamper(corrupted);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupted)), /armor|provenance|mining|Smithery/i);
    }
});
