import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { spatialMemberPosition } = load('../src/simulation/SpatialExpeditions.ts');

// This file verifies historical return-time arrival compatibility. New on-site arrivals
// are covered by encounter-cargo/encounter-ui; do not redispatch this historical case under new rules.
const historicalArrival = JSON.parse(gunzipSync(readFileSync(new URL(
    './fixtures/territory-arrival-parent-455481db.json.gz', import.meta.url))));
function capturedArrival() {
    assert.equal(historicalArrival.parentCommit, '455481db00105fdaf67e8e213314eb79da37c7bc');
    const state = core.reconstructState(historicalArrival.serializedState);
    const receipt = state.events.find(event => event.id === historicalArrival.receiptId);
    assert.equal(receipt?.type, 'PersonaTransferredIn');
    return { state, context: structuredClone(historicalArrival.context), receipt };
}


test('a captured resident awaiting an exterior keeps a factual returned-crew arrival reference', () => {
    const { state, context, receipt } = capturedArrival();
    const mission = state.world.spatial.missions[receipt.details.missionId];
    assert.equal(mission.status, 'Returned');
    const returned = spatialMemberPosition(mission, 'founder-2');
    const resident = core.inspectResidentPresence(state, receipt.personaId);
    assert.equal(resident.placement.needsHome, true, 'All real dry home nodes remain reserved');
    assert.notDeepEqual({ x: returned.x, z: returned.z }, context.world.settlement.center);
    assert.ok(Math.hypot(resident.placement.anchor.x - returned.x, resident.placement.anchor.z - returned.z) < 1e-6,
        'The campfire center is not an arrival doorway; the actual returning crew provides the saved reference');
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});


test('a real captured arrival can emerge after a natural vacancy and the actual returning crew clears its exit', () => {
    const setup = capturedArrival();
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 300 }, setup.context);
    assert.equal(state.personas['founder-1'].deathWinter, 801, 'Ordinary mortality makes a real reserved exterior available');
    assert.equal(state.personas[setup.receipt.personaId].deathWinter, null);
    const waiting = core.inspectResidentPresence(state, setup.receipt.personaId);
    assert.ok(waiting.placement, 'A free home does not allow emergence through the still-occupied arrival reference');
    assert.equal(waiting.placement.needsHome, false);
    assert.deepEqual(waiting.home, { x: 56, z: 128 });
    const anchor = { ...waiting.position };
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 128, z: 112 } }, setup.context);
    const restored = core.reconstructState(core.serializeState(state));
    let previous = anchor, emerged = false;
    for (let tick = 0; tick < 75; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const resident = core.inspectResidentPresence(state, setup.receipt.personaId);
        assert.ok(Math.hypot(resident.position.x - previous.x, resident.position.z - previous.z) <= .6 + 1e-6,
            'The pending arrival cannot jump to its allocated home');
        for (const exclusion of setup.context.exclusions)
            assert.equal(resident.position.x >= exclusion.minX && resident.position.x <= exclusion.maxX &&
                resident.position.z >= exclusion.minZ && resident.position.z <= exclusion.maxZ, false,
            'Arrival and emergence retain the physically present campfire obstacle');
        if (!resident.placement) for (const id of Object.keys(state.personas)) {
            if (id === setup.receipt.personaId) continue;
            const other = core.inspectResidentPresence(state, id);
            if (other && !other.placement)
                assert.ok(Math.hypot(resident.position.x - other.position.x,
                    resident.position.z - other.position.z) >= .96 - 1e-6,
                'The recovered arrival cannot emerge or move inside another outdoor resident');
        }
        previous = resident.position;
        emerged ||= !resident.placement;
    }
    assert.equal(emerged, true, 'The recorded real arrival reference permits recovery after its occupant leaves');
    assert.deepEqual(core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 75 }, setup.context), state);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});
