import test from 'node:test';
import assert from 'node:assert/strict';
import { core, equippedPersonalArmorVariantsFixture } from './personal-armor-variants-fixture.mjs';
import { ironEncounterFixture } from './metalworking-fixture.mjs';

function prepare(lethal = false) {
    const initialState = equippedPersonalArmorVariantsFixture({ physical: true, nearbyRival: true });
    if (lethal) for (const field of ['leatherBodyArmorProtectionBps', 'ironHelmetProtectionBps',
        'leatherHelmetProtectionBps', 'ironBodyArmorProtectionBps']) initialState.smithery.config[field] = 0;
    return ironEncounterFixture({ lethal, initialState, shield: lethal ? 'ironShield' : null });
}
function firstExchange(setup) {
    let state = setup.state;
    for (let ticks = 0; ticks < 1500; ticks++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const entry = Object.values(state.world.encounters?.records ?? {}).find(value => value.exchangeIndex > 0);
        if (entry) return { state, entry };
    }
    throw new Error('The genuine variant-equipped party must reach a real on-site defender.');
}

test('an actual reached encounter freezes policy v2 for worn variants and applies both wearer factors once', () => {
    const setup = prepare();
    const mission = Object.values(setup.state.world.spatial.missions).at(-1);
    assert.equal(mission.task.equipment.version, 4);
    const wearer = mission.task.encounterRules.attackerEquipment['founder-1'];
    assert.equal(wearer.personalArmor.version, 2);
    assert.equal(wearer.bodyArmor, 'ironBodyArmor');
    assert.equal(wearer.headgear, 'leatherHelmet');
    assert.equal(wearer.shield, null);
    assert.equal(wearer.personalArmor.ironBodyArmorProtectionBps, 3000);
    assert.equal(wearer.personalArmor.leatherHelmetProtectionBps, 500);
    assert.equal(mission.task.encounterRules.attackerEquipment['founder-2'].personalArmor, undefined);
    const { state, entry } = firstExchange(setup);
    const incoming = entry.exchanges[0].actions.find(action => action.targetId === 'founder-1');
    assert.equal(incoming.probabilityBps, 166, '250 × .70 × .95 floors once to166, above the100bps residual cap.');
    const saved = core.serializeState(state), restored = core.reconstructState(saved);
    assert.equal(core.serializeState(restored), saved);
    assert.equal(core.serializeState(core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 25 }, setup.context)),
        core.serializeState(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 25 }, setup.context)));
    const corrupt = structuredClone(setup.state);
    Object.values(corrupt.world.spatial.missions).at(-1).task.encounterRules.attackerEquipment['founder-1'].personalArmor.version = 1;
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /encounter/i);
});

test('a genuine on-site death loses both new variants at the death tick with no returned-stock grant', () => {
    const { state, entry } = firstExchange(prepare(true));
    const death = state.events.find(event => event.type === 'PersonaDied' && event.personaId === 'founder-1' &&
        event.details?.encounterId === entry.id);
    const lost = state.events.find(event => event.type === 'EquipmentLost' && event.personaId === 'founder-1');
    assert.ok(death);
    assert.ok(lost);
    assert.deepEqual(lost.time, death.time);
    assert.deepEqual(lost.details.items, ['ironSpear', 'ironShield', 'ironBodyArmor', 'leatherHelmet']);
    assert.equal(lost.details.personalArmorVersion, 2);
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    assert.equal(state.smithery.stored.ironBodyArmor, 0);
    assert.equal(state.smithery.stored.leatherHelmet, 0);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
