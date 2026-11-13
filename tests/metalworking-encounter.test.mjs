import test from 'node:test';
import assert from 'node:assert/strict';
import { core, ironEncounterFixture } from './metalworking-fixture.mjs';

function firstExchange(setup) {
    let state = setup.state;
    for (let elapsed = 0; elapsed < 1500; elapsed++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const entry = Object.values(state.world.encounters?.records ?? {}).find(value => value.exchangeIndex > 0);
        if (entry) return { state, entry };
    }
    throw new Error('The actual iron party must reach a real defender and exchange on site.');
}

test('actual iron carrier snapshots influence only their real on-site attack and own protection', () => {
    const setup = ironEncounterFixture();
    const mission = Object.values(setup.state.world.spatial.missions).at(-1);
    const dispatch = mission.task.encounterRules.attackerEquipment;
    assert.equal(dispatch['founder-1'].metalworking.version, 1);
    assert.equal(dispatch['founder-1'].weapon, 'ironSpear');
    assert.equal(dispatch['founder-1'].shield, 'ironShield');
    assert.equal(dispatch['founder-2'].metalworking, undefined, 'An ally never inherits iron coefficients');
    const { state, entry } = firstExchange(setup);
    const actions = entry.exchanges[0].actions;
    const attack = actions.find(action => action.actorId === 'founder-1');
    assert.ok(attack, 'The real iron holder acts, rather than adding an anonymous pooled bonus');
    assert.equal(attack.probabilityBps, 287);
    const incoming = actions.find(action => action.targetId === 'founder-1');
    assert.ok(incoming, 'A real reached defender targets the equipped person');
    assert.equal(incoming.probabilityBps, 125);
    assert.ok(actions.filter(action => action.actorId !== 'founder-1' && action.targetId !== 'founder-1')
        .every(action => action.probabilityBps === 250));
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    const corrupt = structuredClone(state);
    corrupt.world.encounters.records[entry.id].exchanges[0].actions[0].probabilityBps++;
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /encounter/i);
});

test('on-site iron casualties lose their carried items at the actual death tick before homecoming', () => {
    const { state, entry } = firstExchange(ironEncounterFixture({ lethal: true }));
    const death = state.events.find(event => event.type === 'PersonaDied' && event.personaId === 'founder-1' &&
        event.details?.encounterId === entry.id);
    assert.ok(death);
    const loss = state.events.find(event => event.type === 'EquipmentLost' && event.personaId === 'founder-1');
    assert.ok(loss);
    assert.deepEqual(loss.time, death.time);
    assert.deepEqual(loss.details.items, ['ironSpear', 'ironShield']);
    assert.equal(state.smithery.assignments['founder-1'], undefined);
    assert.equal(state.smithery.stored.ironSpear, 1);
    assert.equal(state.smithery.stored.ironShield, 1);
    const mission = Object.values(state.world.spatial.missions).at(-1);
    assert.equal(mission.status, 'Lost');
    assert.equal(mission.returnedAt, null);
    assert.equal(state.events.some(event => event.type === 'ExpeditionReturned' && event.details?.missionId === mission.id), false);
    assert.equal(loss.details.missionId, mission.id);
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
