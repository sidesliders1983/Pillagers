import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { core, personalArmorApply as apply, craftedPersonalArmorFixture, equippedPersonalArmorFixture } from './personal-armor-fixture.mjs';
import { craftedIronFixture, metalworkingContext } from './metalworking-fixture.mjs';
const smithery = loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
const { resolveExpeditionCrew, transferPersona } = loadTypeScript(new URL('../src/simulation/WorldExpeditions.ts', import.meta.url));
const equip = (state, slot, item, id = 'founder-1') => apply(state, { type: 'AssignEquipment', personaId: id, slot, item });
const advance = (state, ticks) => apply(state, { type: 'AdvanceTicks', ticks });
const target = (state, item, count) => apply(state, { type: 'SetSmitheryTarget', item, target: count });
const armorCrafts = state => state.events.filter(event => event.type === 'EquipmentCrafted' &&
    ['leatherBodyArmor', 'ironHelmet'].includes(event.details.item));

function legacyDeparture(state, casualtyBps = 0) {
    state = apply(state, { type: 'EditExpeditionGroup', groupId: 'group-1', name: 'Armored review crew',
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

test('v3 adoption is prospective and preserves v1/v2 ownership, history, clocks and zero-armor snapshots', () => {
    const before = craftedIronFixture();
    const bytes = core.serializeState(before);
    assert.equal(core.serializeState(core.reconstructState(bytes)), bytes);
    const state = target(before, 'leatherBodyArmor', 0);
    assert.equal(state.smithery.version, 3);
    assert.equal(Object.keys(state.smithery.stored).length, 7);
    assert.equal(state.smithery.stored.leatherBodyArmor, 0);
    assert.equal(state.smithery.stored.ironHelmet, 0);
    assert.deepEqual(state.smithery.assignments, before.smithery.assignments);
    assert.deepEqual(state.stocks, before.stocks);
    assert.deepEqual(state.specialistStocks, before.specialistStocks);
    assert.deepEqual(state.time, before.time);
    assert.equal(state.rngState, before.rngState);
    assert.deepEqual(state.world, before.world);
    assert.deepEqual(state.events.slice(0, before.events.length), before.events);
    const same = target(state, 'leatherBodyArmor', 0);
    assert.equal(core.serializeState(same), core.serializeState(state));
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});

test('real slaughter and mining fund separate Leatherworker and Smith armor recipes once', () => {
    const state = craftedPersonalArmorFixture();
    const receipts = armorCrafts(state);
    assert.equal(receipts.length, 2);
    const body = receipts.find(event => event.details.item === 'leatherBodyArmor');
    const helmet = receipts.find(event => event.details.item === 'ironHelmet');
    assert.equal(body.details.occupation, 'leatherAndJewelleryMaker');
    assert.equal(body.details.materials, 3);
    assert.equal(body.details.hides, 2);
    assert.equal(body.details.ironOre, undefined);
    assert.equal(helmet.details.occupation, 'smith');
    assert.equal(helmet.details.materials, 3);
    assert.equal(helmet.details.hides, 0);
    assert.equal(helmet.details.ironOre, 2);
    assert.equal(body.personaId, 'founder-1');
    assert.equal(helmet.personaId, 'founder-1');
    assert.equal(state.events.filter(event => ['LivestockSlaughtered', 'CattleSlaughtered'].includes(event.type))
        .reduce((sum, event) => sum + (event.details.hides ?? 0), 0), 2);
    assert.equal(state.specialistStocks.hides, 0);
    assert.equal(state.specialistStocks.ironOre + state.events.filter(event => event.type === 'EquipmentCrafted')
        .reduce((sum, event) => sum + (event.details.ironOre ?? 0), 0), state.mining.sites.reduce((sum, site) =>
        sum + site.initialUnits - site.remainingUnits, 0));
    assert.equal(core.inspectWork(state, 'founder-1').reason, 'target-reached');
    assert.deepEqual(advance(state, 50).smithery.stored, state.smithery.stored);
});

test('named residents use four independent actual slots, with no shared protection or duplicated item', () => {
    let state = equippedPersonalArmorFixture();
    const gear = smithery.equipmentFor(state, 'founder-1');
    assert.deepEqual(gear, { weapon: 'ironSpear', shield: 'ironShield', bodyArmor: 'leatherBodyArmor', headgear: 'ironHelmet' });
    const snapshot = smithery.pillageEquipment(state, ['founder-1', 'founder-2'], 6000, 1000);
    assert.equal(snapshot.version, 3);
    assert.deepEqual(snapshot.members.map(member => member.casualtyBps), [400, 1000]);
    assert.equal(snapshot.maximumPersonalProtectionBps, 6000);
    const before = core.serializeState(state);
    assert.throws(() => equip(state, 'bodyArmor', 'leatherBodyArmor', 'founder-2'), /No stored/);
    assert.throws(() => equip(state, 'headgear', 'leatherBodyArmor'), /matching/);
    assert.equal(core.serializeState(state), before);
    state = equip(state, 'bodyArmor', null);
    assert.equal(state.smithery.stored.leatherBodyArmor, 1);
    state = equip(state, 'bodyArmor', 'leatherBodyArmor', 'founder-2');
    assert.deepEqual(smithery.pillageEquipment(state, ['founder-1', 'founder-2'], 6000, 1000)
        .members.map(member => member.casualtyBps), [450, 800]);
    state = equip(state, 'bodyArmor', null, 'founder-2');
    assert.equal(state.smithery.assignments['founder-2'], undefined);
    state = equip(state, 'headgear', null);
    assert.deepEqual(smithery.equipmentFor(state, 'founder-1'), { weapon: 'ironSpear', shield: 'ironShield' });
    assert.equal(smithery.pillageEquipment(state, ['founder-1'], 6000, 1000).version, 2);
});

test('protection combines multiplicatively once and applies the approved absolute cap', () => {
    const state = equippedPersonalArmorFixture(), rules = state.smithery.config;
    const gear = { weapon: null, shield: null, bodyArmor: 'leatherBodyArmor', headgear: 'ironHelmet' };
    for (const [shield, risk] of [[null, 720], ['woodenShield', 540], ['leatherShield', 432], ['ironShield', 400]])
        assert.equal(smithery.equipmentCasualtyRisk(1000, { ...gear, shield }, rules), risk);
    assert.equal(smithery.equipmentCasualtyRisk(1000, { ...gear, headgear: null }, rules), 800);
    assert.equal(smithery.equipmentCasualtyRisk(1000, { ...gear, bodyArmor: null }, rules), 900);
    for (const base of [0, 1, 250, 1000, 9999, 10000])
        assert.ok(smithery.equipmentCasualtyRisk(base, { ...gear, shield: 'ironShield' }, rules) >= Math.ceil(base * .4));
});

test('unsupported old custom shield combinations reject atomically without weakening shield-only rules', () => {
    let state = craftedPersonalArmorFixture();
    state.smithery.config.woodenShieldProtectionBps = 7500;
    state.smithery.config.leatherShieldProtectionBps = 7500;
    state.smithery.config.ironShieldProtectionBps = 7500;
    state = equip(state, 'shield', 'ironShield');
    assert.equal(smithery.pillageEquipment(state, ['founder-1'], 6000, 1000).members[0].casualtyBps, 250);
    const before = core.serializeState(state);
    assert.throws(() => equip(state, 'bodyArmor', 'leatherBodyArmor'), /Remove the shield first/);
    assert.throws(() => equip(state, 'headgear', 'ironHelmet'), /Remove the shield first/);
    assert.equal(core.serializeState(state), before);
    state = equip(equip(state, 'shield', null), 'bodyArmor', 'leatherBodyArmor');
    const armored = core.serializeState(state);
    assert.throws(() => equip(state, 'shield', 'ironShield'), /Remove the shield first/);
    assert.equal(core.serializeState(state), armored);
    let legacy = core.createCampaign(32);
    legacy.smithery.config.woodenShieldProtectionBps = legacy.smithery.config.leatherShieldProtectionBps = 7500;
    assert.doesNotThrow(() => target(legacy, 'leatherBodyArmor', 0), 'Catalogue adoption itself must not invalidate a custom old policy');
});

test('armor load validation conserves paid Hides, Ore, finished items and the recorded creator', () => {
    const original = craftedPersonalArmorFixture();
    for (const tamper of [
        copy => { copy.smithery.stored.leatherBodyArmor++; },
        copy => { copy.smithery.stored.ironHelmet++; },
        copy => { copy.specialistStocks.hides++; },
        copy => { copy.specialistStocks.ironOre++; },
        copy => { armorCrafts(copy)[0].details.creatorId = 'founder-2'; },
        copy => { armorCrafts(copy).find(event => event.details.item === 'leatherBodyArmor').details.hides = 0; },
        copy => { copy.events.find(event => ['CattleSlaughtered', 'LivestockSlaughtered'].includes(event.type)).details.hides = 0; },
        copy => { copy.smithery.personalArmor.openingHides++; },
    ]) {
        const corrupted = structuredClone(original);
        tamper(corrupted);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupted)), /armor|provenance|mining/i);
    }
});

test('four-slot dispatch snapshots survive reload while away changes are refused and casualties lose exact gear', () => {
    const state = equippedPersonalArmorFixture();
    const departed = legacyDeparture(state);
    const mission = Object.values(departed.world.missions).at(-1), snapshot = structuredClone(mission.equipment);
    assert.equal(snapshot.version, 3);
    for (const slot of ['weapon', 'shield', 'bodyArmor', 'headgear']) assert.throws(() => equip(departed, slot, null), /home/);
    const survived = advance(core.reconstructState(core.serializeState(departed)), 4);
    assert.deepEqual(survived.world.missions[mission.id].equipment, snapshot);
    assert.deepEqual(survived.smithery.assignments['founder-1'], state.smithery.assignments['founder-1']);
    const fatal = structuredClone(state);
    for (const field of ['woodenShieldProtectionBps', 'leatherShieldProtectionBps', 'ironShieldProtectionBps',
        'leatherBodyArmorProtectionBps', 'ironHelmetProtectionBps']) fatal.smithery.config[field] = 0;
    const lost = advance(legacyDeparture(fatal, 10000), 4);
    assert.equal(lost.smithery.assignments['founder-1'], undefined);
    const loss = lost.events.find(event => event.type === 'EquipmentLost' && event.personaId === 'founder-1');
    assert.deepEqual(loss.details.items, ['ironSpear', 'ironShield', 'leatherBodyArmor', 'ironHelmet']);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(lost))), core.serializeState(lost));
});

test('transfer recovers all four source-clan items and split work/replay preserve their actual receipts', () => {
    const state = equippedPersonalArmorFixture();
    const receiver = Object.values(state.world.targetClans)[0];
    transferPersona(state, receiver, 'founder-1', 'armor-transfer-review');
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    assert.equal(receiver.smithery.assignments['founder-1'], undefined);
    for (const item of ['ironSpear', 'ironShield', 'leatherBodyArmor', 'ironHelmet']) assert.equal(state.smithery.stored[item], 1);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
    const initial = target(craftedPersonalArmorFixture(), 'ironHelmet', 2);
    const batch = advance(initial, 100), split = advance(core.reconstructState(core.serializeState(advance(initial, 37))), 63);
    assert.equal(core.serializeState(split), core.serializeState(batch));
});

test('a v3 catalogue with no worn armor preserves actual iron v2 snapshots, resolver outcomes and RNG', () => {
    let before = craftedIronFixture();
    before = equip(equip(before, 'weapon', 'ironSpear'), 'shield', 'ironShield');
    const after = target(before, 'leatherBodyArmor', 0);
    const members = ['founder-1', 'founder-2'];
    const snapshot = smithery.pillageEquipment(before, members, 6000, 1000);
    assert.equal(JSON.stringify(smithery.pillageEquipment(after, members, 6000, 1000)), JSON.stringify(snapshot));
    for (let seed = 1; seed <= 100; seed++) {
        const old = structuredClone(before), current = structuredClone(after);
        old.rngState = current.rngState = seed;
        const mission = { id: 'no-armor-parity', memberIds: members, equipment: snapshot,
            casualtyBps: 1000, successBps: snapshot.successBps };
        assert.deepEqual(resolveExpeditionCrew(current, mission), resolveExpeditionCrew(old, mission));
        assert.equal(current.rngState, old.rngState);
    }
});

test('a transferred active Miner keeps earned history/progress but cannot acquire an unsupported destination job', () => {
    let state = equippedPersonalArmorFixture();
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner' });
    const person = state.personas['founder-1'], dna = structuredClone(person.dna);
    const progress = state.mechanics.people['founder-1'].progress.miner;
    const recipient = Object.values(state.world.targetClans)[0];
    assert.equal(recipient.mining, undefined);
    transferPersona(state, recipient, person.id, 'active-miner-transfer');
    assert.equal(recipient.personas[person.id].occupation, null);
    assert.deepEqual(recipient.personas[person.id].dna, dna);
    assert.equal(recipient.personas[person.id].occupationHistory.at(-1).occupation, 'miner');
    assert.notEqual(recipient.personas[person.id].occupationHistory.at(-1).endedAt, null);
    assert.equal(recipient.mechanics.people[person.id].progress.miner, progress);
    assert.equal(recipient.events.at(-1).details.reason, 'occupation-unavailable-on-arrival');
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
    assert.throws(() => core.applyCommand(recipient, { type: 'AssignOccupation', personaId: person.id, occupation: 'miner' }), /occupation/);
});
