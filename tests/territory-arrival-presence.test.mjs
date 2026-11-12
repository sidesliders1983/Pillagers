import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { spatialMemberPosition } = load('../src/simulation/SpatialExpeditions.ts');
const { settlementCampfire } = load('../src/fjord-play/SettlementCampfire.ts');

function capturedArrival() {
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    const homeBounds = { minX: 44, maxX: 84, minZ: 108, maxZ: 148 };
    const points = [{ x: 56, z: 128 }, ...Array.from({ length: 8 }, (_, index) => ({
        x: 48 + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8,
    })), { x: 48, z: 128 }];
    const cells = Array(2145).fill(true);
    for (let row = 0; row < 33; row++) for (let column = 0; column < 65; column++) {
        const point = { x: column * 8, z: row * 8 };
        if (point.x < homeBounds.minX || point.x > homeBounds.maxX ||
            point.z < homeBounds.minZ || point.z > homeBounds.maxZ) continue;
        if (!points.some(home => home.x === point.x && home.z === point.z) &&
            !(point.x === 64 && point.z === 128)) cells[row * 65 + column] = false;
    }
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells },
        settlement: { center: { x: 64, z: 128 }, bounds: homeBounds, harbor: null },
        rivalSite: { version: 1, candidateId: 'arrival-rival', center: { x: 224, z: 128 },
            bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 } };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 100000 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }, { minAge: 41, chanceBps: 10000 }],
            fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0 }, { enabled: false },
        { durations: { Recon: 250, Surveillance: 250, Pillage: 250 },
            successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
            casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } }), world, 'arrival-reference');
    const targetClan = state.world.targetClans['island-rival'];
    const fire = settlementCampfire(world);
    const context = { world, worldId: 'arrival-reference', exclusions: [{
        minX: fire.transform.x - fire.obstacleRadius, maxX: fire.transform.x + fire.obstacleRadius,
        minZ: fire.transform.z - fire.obstacleRadius, maxZ: fire.transform.z + fire.obstacleRadius,
    }], presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center, bounds: homeBounds,
            homes: Object.fromEntries(Object.keys(state.personas).sort().map((id, index) => [id, points[index]])) },
        { clanId: targetClan.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds,
            homes: Object.fromEntries(Object.keys(targetClan.personas).sort().map((id, index) => [id,
                { x: 216 + index % 4 * 8, z: 104 + Math.floor(index / 4) * 8 }])) },
    ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    const command = next => { state = core.applyCommand(state, next, context); };
    command({ type: 'CreateExpeditionGroup', name: 'Returning crew', memberIds: ['founder-2'] });
    command({ type: 'StartExpedition', groupId: 'group-1' });
    command({ type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
    command({ type: 'AdvanceTicks', ticks: 100 });
    command({ type: 'RecallExpedition', groupId: 'group-1' });
    command({ type: 'AdvanceTicks', ticks: 100 });
    const target = { kind: 'site', siteId: world.rivalSite.candidateId };
    command({ type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' });
    command({ type: 'AdvanceTicks', ticks: 250 });
    command({ type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Pillage', priorities: ['People'] });
    command({ type: 'AdvanceTicks', ticks: 250 });
    const receipt = state.events.find(event => event.type === 'PersonaTransferredIn');
    assert.ok(receipt, 'An actual successful People Pillage must return a new resident');
    return { state, context, receipt };
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
