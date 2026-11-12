import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { spatialMemberPosition } = load('../src/simulation/SpatialExpeditions.ts');

function walkingParty(outsideId = 'founder-1', reversed = false, hiddenInside = false) {
    const insideId = outsideId === 'founder-1' ? 'founder-2' : 'founder-1';
    const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
        navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'party-rival', center: { x: 224, z: 128 },
            bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 } };
    if (hiddenInside) {
        // Separate dry routes keep the northern member beyond every observer's sight range.
        for (let column = 0; column <= 24; column++) world.navigation.cells[18 * 65 + column] = false;
    }
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }), world, 'party-observation');
    const rival = state.world.targetClans['island-rival'];
    const localHomes = Object.fromEntries(Object.keys(state.personas).sort()
        .map((id, index) => [id, { x: 32 + index * 8, z: 80 }]));
    localHomes[outsideId] = { x: 48, z: 128 };
    localHomes[insideId] = { x: 72, z: hiddenInside ? 160 : 128 };
    const remoteHomes = Object.fromEntries(Object.keys(rival.personas).sort()
        .map((id, index) => [id, hiddenInside
            ? { x: 196 + Math.floor(index / 4) * 8, z: 104 + index % 4 * 8 }
            : { x: 196 + Math.floor(index / 5) * 8, z: 96 + index % 5 * 8 }]));
    const context = { world, worldId: 'party-observation', presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center, bounds, homes: localHomes },
        { clanId: rival.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds, homes: remoteHomes },
    ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0, ...(hiddenInside ? { sightRadius: 20 } : {}) });
    const roster = reversed ? [insideId, outsideId] : [outsideId, insideId];
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Shore party', memberIds: roster }, context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: hiddenInside ? 160 : 128 } }, context);
    return { state, context, outsideId, insideId };
}

test('an observed party member inside the settlement triggers one real warning regardless of roster or ID order', () => {
    for (const outsideId of ['founder-1', 'founder-2']) for (const reversed of [false, true]) {
        const setup = walkingParty(outsideId, reversed);
        let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 65 }, setup.context);
        const outside = core.territorialContact(state, setup.context, 'island-rival', state.clan.id, setup.outsideId);
        const inside = core.territorialContact(state, setup.context, 'island-rival', state.clan.id, setup.insideId);
        assert.ok(outside && inside, 'Both named members have an actual eligible observer');
        assert.ok(outside.intruderPosition.x < 194);
        assert.ok(inside.intruderPosition.x >= 194);
        const incident = core.inspectTerritory(state).incidents[0];
        assert.equal(incident.phase, 'Alerted', 'An observed intruder inside cannot be masked by the outside roster member');
        const warnings = state.events.filter(event => event.type === 'TerritoryIncidentChanged' && event.details.phase === 'Alerted');
        assert.equal(warnings.length, 1);
        assert.deepEqual(warnings[0].details.observation, inside, 'The warning cites the real sighting that justified intrusion');
        assert.equal(warnings[0].details.incidentId, incident.id);
        const restored = core.reconstructState(core.serializeState(state));
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 25 }, setup.context);
        assert.deepEqual(core.applyCommand(restored, { type: 'AdvanceTicks', ticks: 25 }, setup.context), state);
        assert.equal(core.inspectTerritory(state).incidents[0].id, incident.id);
        assert.equal(core.inspectTerritory(state).incidents[0].phase, 'Hostile');
        const engagements = state.events.filter(event => event.type === 'TerritoryIncidentChanged' && event.details.phase === 'Hostile');
        assert.equal(engagements.length, 1);
        assert.equal(engagements[0].details.incidentId, incident.id);
        assert.ok(engagements[0].details.observation.intruderPosition.x >= 194);
        assert.equal(engagements[0].details.intruderId, 'founder-1',
            'When both members are seen inside, stable identity breaks ties independently of roster order');
        assert.equal(state.world.territory.incidents[incident.id].engagement.sourceEventId, engagements[0].id);
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 10 }, setup.context);
        assert.equal(state.events.filter(event => event.type === 'TerritoryIncidentChanged' && event.details.phase === 'Hostile').length, 1);
    }
});


test('an unobserved member inside cannot escalate a party whose only sighting remains outside', () => {
    for (const reversed of [false, true]) {
        const setup = walkingParty('founder-1', reversed, true);
        const state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 70 }, setup.context);
        const mission = Object.values(state.world.spatial.missions)[0];
        const hiddenPosition = spatialMemberPosition(mission, setup.insideId);
        assert.ok(hiddenPosition.x >= 194 && hiddenPosition.z >= 66 && hiddenPosition.z <= 190,
            'The real second route has reached the settlement interior');
        const outside = core.territorialContact(state, setup.context, 'island-rival', state.clan.id, setup.outsideId);
        assert.ok(outside && outside.intruderPosition.x < 194);
        assert.equal(core.territorialContact(state, setup.context, 'island-rival', state.clan.id, setup.insideId), undefined);
        const incident = core.inspectTerritory(state).incidents[0];
        assert.equal(incident.phase, 'Suspicious');
        assert.equal(incident.engagementRequested, false);
        assert.equal(state.events.some(event => event.type === 'TerritoryIncidentChanged'), false);
        const opened = state.events.find(event => event.type === 'TerritoryIncidentOpened');
        assert.equal(opened.details.intruderId, setup.outsideId);
        assert.ok(opened.details.observation.intruderPosition.x < 194);
        assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
    }
});
