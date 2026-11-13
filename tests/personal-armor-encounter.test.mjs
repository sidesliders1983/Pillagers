import test from 'node:test';
import assert from 'node:assert/strict';
import { core, equippedPersonalArmorFixture } from './personal-armor-fixture.mjs';
import { ironEncounterFixture } from './metalworking-fixture.mjs';

function firstExchange(setup) {
    let state = setup.state;
    for (let elapsed = 0; elapsed < 1500; elapsed++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const entry = Object.values(state.world.encounters?.records ?? {}).find(value => value.exchangeIndex > 0);
        if (entry) return { state, entry };
    }
    throw new Error('The actual armored party must reach a real defender and exchange on site.');
}
function setupArmor(lethal = false) {
    return ironEncounterFixture({ lethal,
        initialState: equippedPersonalArmorFixture({ physical: true, nearbyRival: true }) });
}

test('actual on-site four-slot commitments apply the bounded personal reduction once and survive interruption', () => {
    const setup = setupArmor();
    const dispatched = Object.values(setup.state.world.spatial.missions).at(-1);
    assert.equal(dispatched.task.equipment.version, 3);
    const snapshot = dispatched.task.encounterRules.attackerEquipment;
    assert.equal(snapshot['founder-1'].personalArmor.version, 1);
    assert.equal(snapshot['founder-1'].bodyArmor, 'leatherBodyArmor');
    assert.equal(snapshot['founder-1'].headgear, 'ironHelmet');
    assert.equal(snapshot['founder-2'].personalArmor, undefined);
    assert.throws(() => core.applyCommand(setup.state, { type: 'AssignEquipment', personaId: 'founder-1',
        slot: 'bodyArmor', item: null }, setup.context), /home/);
    const result = firstExchange(setup), { state, entry } = result;
    const actions = entry.exchanges[0].actions;
    assert.equal(actions.find(action => action.actorId === 'founder-1').probabilityBps, 287);
    assert.equal(actions.find(action => action.targetId === 'founder-1').probabilityBps, 100,
        'Iron shield plus both armor pieces caps the actual 250bps incoming action at 40% remaining risk');
    assert.deepEqual(entry.equipment['founder-1'], snapshot['founder-1']);
    const restored = core.reconstructState(core.serializeState(state));
    assert.equal(core.serializeState(core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 25 }, setup.context)),
        core.serializeState(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 25 }, setup.context)));
});

test('an actual on-site casualty loses body armor and helmet with its spear/shield at the death tick', () => {
    const { state, entry } = firstExchange(setupArmor(true));
    const death = state.events.find(event => event.type === 'PersonaDied' && event.personaId === 'founder-1' &&
        event.details?.encounterId === entry.id);
    assert.ok(death);
    const lost = state.events.find(event => event.type === 'EquipmentLost' && event.personaId === 'founder-1');
    assert.ok(lost);
    assert.deepEqual(lost.time, death.time);
    assert.deepEqual(lost.details.items, ['ironSpear', 'ironShield', 'leatherBodyArmor', 'ironHelmet']);
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    for (const item of lost.details.items) assert.equal(state.smithery.stored[item], 0);
    const mission = Object.values(state.world.spatial.missions).at(-1);
    assert.equal(mission.status, 'Lost');
    assert.equal(mission.returnedAt, null);
    const recorded = mission.task.result.equipment.lost.find(member => member.personaId === 'founder-1');
    assert.equal(recorded.bodyArmor, 'leatherBodyArmor');
    assert.equal(recorded.headgear, 'ironHelmet');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('a free Explore save cannot move committed personal armor to another away owner', () => {
    const setup = ironEncounterFixture({ mission: 'Explore',
        initialState: equippedPersonalArmorFixture({ physical: true, nearbyRival: true }) });
    const mission = Object.values(setup.state.world.spatial.missions).at(-1);
    assert.equal(mission.task, undefined);
    assert.equal(mission.encounterRules.attackerEquipment['founder-1'].bodyArmor, 'leatherBodyArmor');
    const corrupted = structuredClone(setup.state);
    corrupted.smithery.assignments['founder-1'].bodyArmor = null;
    corrupted.smithery.assignments['founder-2'] = { weapon: null, shield: null,
        bodyArmor: 'leatherBodyArmor', headgear: null };
    assert.throws(() => core.reconstructState(JSON.stringify(corrupted)), /encounter/i);
});
