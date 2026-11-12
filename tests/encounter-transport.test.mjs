import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const spatial = load('../src/simulation/SpatialExpeditions.ts');
const latestMission = state => Object.values(state.world.spatial.missions).at(-1);

function coastalEncounterFixture() {
    const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 256 };
    const heights = Array.from({ length: 1089 }, (_, index) => {
        const x = index % 33 * 8, z = Math.floor(index / 33) * 8;
        return x >= 80 && x <= 176 && z >= 80 && z <= 176 ? 2 : -4;
    });
    const world = {
        waterLevel: 0,
        terrain: { bounds, spacing: 8, columns: 33, rows: 33, heights },
        navigation: { bounds, spacing: 8, columns: 33, rows: 33, cells: heights.map(height => height > 0) },
        settlement: { center: { x: 112, z: 128 }, harbor: { x: 128, z: 72 } },
        rivalSite: { version: 1, candidateId: 'coastal-encounter-rival', center: { x: 152, z: 128 },
            bounds: { minX: 128, maxX: 176, minZ: 88, maxZ: 168 }, foundations: [], buildableArea: 3840 },
    };
    let state = core.initializeIslandClans(core.createCampaign(32,
        { initialFood: 2000, initialMaterials: 200 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
        { enabled: false }), world, 'coastal-encounter-fixture');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort().map((id, index) =>
        [id, { x: x + index % 4 * 4, z: 112 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId: 'coastal-encounter-fixture',
        longshipOrigins: { 'founding-longship': { x: 128, z: 72, rotation: 0 } },
        presenceSites: [
            { clanId: state.clan.id, center: world.settlement.center,
                bounds: { minX: 80, maxX: 144, minZ: 88, maxZ: 168 }, homes: homes(state, 104) },
            { clanId: rival.clan.id, center: world.rivalSite.center,
                bounds: world.rivalSite.bounds, homes: homes(rival, 148) },
        ],
    };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    return { state, context };
}

test('a genuinely lost embarked crew releases its real remote ship without inventing a homecoming', () => {
    const setup = coastalEncounterFixture();
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 900 }, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coastal scout',
        memberIds: ['founder-1'] }, setup.context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'BoardLongship', groupId: 'group-1',
        shipId: 'founding-longship' }, setup.context);
    for (let tick = 0; tick < 80 && latestMission(state).transport?.phase !== 'embarked'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.equal(latestMission(state).transport?.phase, 'embarked');
    assert.ok(latestMission(state).encounterRules, 'This is a genuinely new opted-in expedition');
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 72, z: 128 } }, setup.context);
    for (let tick = 0; tick < 80 && latestMission(state).status === 'Traveling'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.equal(latestMission(state).status, 'Exploring');
    const remote = { ...state.landing.longships['founding-longship'].transport };
    assert.notDeepEqual({ x: remote.x, z: remote.z }, { x: 128, z: 72 });
    state.mechanics.config.mortalityBands = [{ minAge: 0, chanceBps: 0 }, { minAge: 40, chanceBps: 10000 }];
    state = core.applyCommand(core.reconstructState(core.serializeState(state)),
        { type: 'AdvanceTicks', ticks: 1000 - state.time.tick }, setup.context);
    const mission = latestMission(state), ship = state.landing.longships['founding-longship'];
    assert.equal(state.personas['founder-1'].deathWinter, 801);
    assert.equal(mission.status, 'Lost');
    assert.equal(mission.returnedAt, null);
    assert.equal(state.events.some(event => event.type === 'ExploreAreaReturned' && event.details?.missionId === mission.id), false);
    assert.equal(ship.transport.groupId, null, 'A dead crew cannot reserve the actual ship forever');
    assert.equal(mission.transport, undefined);
    assert.deepEqual({ x: ship.transport.x, z: ship.transport.z, rotation: ship.transport.rotation },
        { x: remote.x, z: remote.z, rotation: remote.rotation }, 'The released hull stays at its real sea position');
    state = core.reconstructState(core.serializeState(state));
    assert.doesNotThrow(() => spatial.assertSpatialWorld(state, setup.context),
        'The historical sea loss reattaches using sea geometry and the real reserved land trail');
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Recovery party',
        memberIds: ['founder-2'] }, setup.context);
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-2' }, setup.context);
    state = core.applyCommand(state, { type: 'BoardLongship', groupId: 'group-2',
        shipId: 'founding-longship' }, setup.context);
    for (let tick = 0; tick < 80 && latestMission(state).transport?.phase !== 'embarked'; tick++)
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.equal(latestMission(state).transport?.phase, 'embarked',
        'A living party recovers the unreserved hull from its real reachable coast');
    assert.equal(state.landing.longships['founding-longship'].transport.groupId, 'group-2');
    state = core.reconstructState(core.serializeState(state));
    assert.doesNotThrow(() => spatial.assertSpatialWorld(state, setup.context));
    assert.equal(state.personas['founder-1'].deathWinter, 801);
    assert.equal(state.world.spatial.missions[mission.id].status, 'Lost');
});
