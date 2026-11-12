import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
const landscape = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};

function fixture(world = landscape, mechanics = {}, expeditions = {}) {
    const worldId = 'territory-fixture';
    const state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0, ...mechanics },
        { enabled: false }, expeditions), world, worldId);
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId, presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center,
            bounds: world.settlement.bounds ?? { minX: 32, maxX: 128, minZ: 64, maxZ: 192 }, homes: homes(state, 48) },
        { clanId: rival.clan.id, center: world.rivalSite.center,
            bounds: world.rivalSite.bounds, homes: homes(rival, world.rivalSite.center.x - 8) },
    ] };
    return { state, context };
}

test('explicit territorial adoption gives both living clans saved presence without replaying the past', () => {
    const { state, context } = fixture();
    const original = core.serializeState(state);
    const adopted = core.initializeTerritorialAwareness(state, context);
    assert.equal(core.serializeState(state), original);
    assert.deepEqual(adopted.stocks, state.stocks);
    assert.equal(adopted.rngState, state.rngState);
    assert.deepEqual(adopted.time, state.time);
    assert.equal(adopted.world.territory.version, 1);
    assert.deepEqual(core.inspectTerritory(adopted).incidents, []);
    for (const clan of [adopted, adopted.world.targetClans['island-rival']]) {
        const id = Object.keys(clan.personas).sort()[0];
        const presence = core.inspectResidentPresence(clan, id);
        assert.ok(presence && Number.isFinite(presence.position.x));
        assert.equal(presence.incidentId, null);
    }
    assert.deepEqual(core.initializeTerritorialAwareness(adopted, context), adopted);
    assert.deepEqual(core.reconstructState(core.serializeState(adopted)), adopted);
});

test('a real party seen at the perimeter is watched before a deeper intrusion receives one warning', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Coast watch', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 188, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 85 }, setup.context);
    const watched = core.inspectTerritory(state).incidents;
    assert.equal(watched.length, 1);
    assert.equal(watched[0].phase, 'Suspicious');
    const incident = state.world.territory.incidents[watched[0].id];
    const rival = state.world.targetClans['island-rival'];
    assert.ok(rival.personas[incident.observation.observerId]);
    assert.ok(incident.responderIds.every(id => rival.personas[id]?.deathWinter === null));
    assert.ok(incident.responderIds.every(id => core.inspectWork(rival, id).productivityBps === 0));
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 20 }, setup.context);
    assert.equal(core.inspectTerritory(state).incidents[0].id, watched[0].id);
    assert.equal(core.inspectTerritory(state).incidents[0].phase, 'Alerted');
    assert.equal(state.events.filter(event => event.type === 'TerritoryIncidentOpened').length, 1);
    assert.equal(state.events.filter(event => event.type === 'TerritoryIncidentChanged').length, 1);
    const before = core.serializeState(state);
    assert.equal(core.serializeState(core.reconstructState(before)), before);
});

test('simultaneous parties reserve different actual responders and corrupted ownership cannot load', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    for (const [number, member] of [[1, 'founder-1'], [2, 'founder-2']]) {
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group ' + number, memberIds: [member] });
        state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-' + number }, setup.context);
        state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-' + number,
            target: { x: 188, z: 128 } }, setup.context);
    }
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 85 }, setup.context);
    const incidents = Object.values(state.world.territory.incidents);
    assert.equal(incidents.length, 2);
    const responders = incidents.flatMap(incident => incident.responderIds);
    assert.ok(incidents.every(incident => incident.responderIds.length));
    assert.equal(new Set(responders).size, responders.length);
    const corrupted = structuredClone(state);
    const changed = Object.values(corrupted.world.territory.incidents);
    changed[1].responderIds[0] = changed[0].responderIds[0];
    assert.throws(() => core.reconstructState(JSON.stringify(corrupted)), /territor|presence|responder/i);
    const forgedSource = structuredClone(state);
    const sourceId = incidents[0].sourceEventIds[0];
    forgedSource.events.find(event => event.id === sourceId).details.observerId = 'invented-person';
    assert.throws(() => core.reconstructState(JSON.stringify(forgedSource)), /territor|presence|observer/i);
});

test('either living clan uses the same actual eligible observers and a terrain ridge hides the same visitor', () => {
    const nearbyWorld = structuredClone(landscape);
    nearbyWorld.settlement.bounds = { minX: 32, maxX: 80, minZ: 64, maxZ: 192 };
    nearbyWorld.rivalSite.center = { x: 96, z: 128 };
    nearbyWorld.rivalSite.bounds = { minX: 80, maxX: 160, minZ: 64, maxZ: 192 };
    const setup = fixture(nearbyWorld);
    const state = core.initializeTerritorialAwareness(setup.state, setup.context, { ambientRadius: 0 });
    const rival = state.world.targetClans['island-rival'];
    const rivalId = Object.keys(rival.personas).sort()[0];
    const rootContact = core.territorialContact(state, setup.context, state.clan.id, rival.clan.id, rivalId);
    const rivalContact = core.territorialContact(state, setup.context, rival.clan.id, state.clan.id, rootContact?.observerId);
    assert.ok(rootContact && state.personas[rootContact.observerId]);
    assert.ok(rivalContact && rival.personas[rivalContact.observerId]);
    const hiddenWorld = structuredClone(nearbyWorld);
    for (let row = 0; row < hiddenWorld.terrain.rows; row++)
        hiddenWorld.terrain.heights[row * hiddenWorld.terrain.columns + 10] = 40;
    assert.equal(core.territorialContact(state, { ...setup.context, world: hiddenWorld },
        state.clan.id, rival.clan.id, rivalId), undefined, 'The stored ridge at x80 blocks actual residents');
    const children = fixture(nearbyWorld, { workAge: 100 });
    const unavailable = core.initializeTerritorialAwareness(children.state, children.context);
    assert.equal(core.territorialContact(unavailable, children.context, unavailable.clan.id,
        'island-rival', Object.keys(unavailable.world.targetClans['island-rival'].personas).sort()[0]), undefined);
});

test('ignoring a real warning requests engagement once and withdrawal closes it without replay or damage', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visitors', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 130 }, setup.context);
    const active = core.inspectTerritory(state).incidents[0];
    assert.equal(active.phase, 'Hostile');
    assert.equal(active.engagementRequested, true);
    assert.equal(state.events.filter(event => event.type === 'TerritoryIncidentChanged' && event.details.phase === 'Hostile').length, 1);
    assert.equal(state.personas['founder-1'].deathWinter, null);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    const split = core.reconstructState(core.serializeState(state));
    const once = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, setup.context);
    let stepped = split;
    for (let index = 0; index < 80; index++) stepped = core.applyCommand(stepped, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
    assert.deepEqual(stepped, once);
    assert.equal(core.inspectTerritory(once).incidents[0].phase, 'Closed');
    assert.equal(once.events.filter(event => event.type === 'TerritoryIncidentClosed').length, 1);
    assert.ok(Object.values(once.world.targetClans['island-rival'].residentPresence.residents)
        .every(actor => actor.incidentId === null));
    assert.equal(once.personas['founder-1'].deathWinter, null);
});

test('responders retain body clearance while approaching the same real intrusion', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visitors', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    for (let tick = 0; tick < 140; tick++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, setup.context);
        const actors = Object.values(state.world.targetClans['island-rival'].residentPresence.residents);
        for (let first = 0; first < actors.length; first++) for (let second = first + 1; second < actors.length; second++) {
            const a = actors[first].position, b = actors[second].position;
            assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= .7 - 1e-6,
                'Canonical local bodies may wait or reroute but cannot pass through each other');
        }
    }
});

test('world binding rejects a structurally consistent saved route outside its island', () => {
    const setup = fixture();
    const state = core.initializeTerritorialAwareness(setup.state, setup.context);
    const actor = state.residentPresence.residents['founder-1'];
    actor.route = [actor.home, { x: -8, z: actor.home.z }];
    actor.distance = actor.home.x + 8;
    const saved = core.reconstructState(core.serializeState(state));
    assert.throws(() => core.initializeTerritorialAwareness(saved, setup.context), /route|terrain|presence/i);
});

test('a distant actual pass and a ridge-obstructed approach create no incident', () => {
    for (const blocked of [false, true]) {
        const world = structuredClone(landscape);
        if (blocked) for (let row = 0; row < world.terrain.rows; row++) world.terrain.heights[row * world.terrain.columns + 25] = 40;
        const setup = fixture(world);
        let state = core.initializeTerritorialAwareness(setup.state, setup.context, { ambientRadius: 0 });
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Passing group', memberIds: ['founder-1'] });
        state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
        state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
            target: blocked ? { x: 188, z: 128 } : { x: 184, z: 224 } }, setup.context);
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 100 }, setup.context);
        assert.deepEqual(core.inspectTerritory(state).incidents, []);
        assert.equal(state.events.some(event => event.type === 'TerritoryIncidentOpened'), false);
    }
});

test('adopting awareness does not change the rules of a mission that was already under way', () => {
    const setup = fixture();
    let legacy = core.applyCommand(setup.state, { type: 'CreateExpeditionGroup', name: 'Earlier party', memberIds: ['founder-1'] });
    legacy = core.applyCommand(legacy, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    legacy = core.applyCommand(legacy, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    const adopted = core.initializeTerritorialAwareness(legacy, setup.context);
    const expected = core.applyCommand(legacy, { type: 'AdvanceTicks', ticks: 150 }, setup.context);
    const observed = core.applyCommand(adopted, { type: 'AdvanceTicks', ticks: 150 }, setup.context);
    assert.deepEqual(observed.world.spatial.missions, expected.world.spatial.missions);
    assert.equal(Object.values(observed.world.spatial.missions)[0].territoryVersion, undefined);
    assert.deepEqual(core.inspectTerritory(observed).incidents, []);
});

test('a hidden Pillage order escalates only when actual observers witness its on-site operation', () => {
    const setup = fixture(landscape, {}, { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } });
    let state = core.applyCommand(setup.state, { type: 'CreateExpeditionGroup', name: 'Raiding group', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, setup.context);
    state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 80 }, setup.context);
    const target = { kind: 'site', siteId: 'rival-pocket-1' };
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1', target, mission: 'Recon' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    assert.ok(core.inspectIslandMissions(state).sites[0].knowledge.settlementName);
    state = core.initializeTerritorialAwareness(state, setup.context, { ambientRadius: 0, warningTicks: 250 });
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1', target,
        mission: 'Pillage', priorities: ['Food'] }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 55 }, setup.context);
    assert.deepEqual(core.inspectTerritory(state).incidents, [], 'An unseen mission order cannot alert the rival');
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 40 }, setup.context);
    const incident = core.inspectTerritory(state).incidents[0];
    assert.equal(incident.phase, 'Hostile');
    assert.equal(incident.reason, 'observed-pillage');
    assert.equal(incident.engagementRequested, true);
    assert.equal(state.events.filter(event => event.type === 'TerritoryIncidentChanged' && event.details.reason === 'observed-pillage').length, 1);
    assert.equal(state.personas['founder-1'].deathWinter, null);
    assert.equal(core.inspectSpatialExpeditions(state).missions.at(-1).result, null);
});

test('canonical presence cannot be injected into a legacy campaign without its world adoption', () => {
    const setup = fixture();
    const adopted = core.initializeTerritorialAwareness(setup.state, setup.context);
    const injected = structuredClone(setup.state);
    injected.residentPresence = adopted.residentPresence;
    assert.throws(() => core.reconstructState(JSON.stringify(injected)), /territor|presence|adopt/i);
    const injectedRival = structuredClone(setup.state);
    injectedRival.world.targetClans['island-rival'].residentPresence = adopted.world.targetClans['island-rival'].residentPresence;
    assert.throws(() => core.reconstructState(JSON.stringify(injectedRival)), /territor|presence|adopt/i);
});

test('newly required childcare releases real responding residents at the canonical Winter transition', () => {
    const setup = fixture(landscape, { fertilityChanceBps: 10000, partnershipChanceBps: 10000 });
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visitors', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1000 }, setup.context);
    const rival = state.world.targetClans['island-rival'];
    const caregivers = Object.keys(rival.personas).filter(id => core.isProvidingCare(rival, id));
    assert.ok(caregivers.length > 0, 'This seeded fixture must produce actual childcare');
    for (const id of caregivers) {
        assert.equal(core.inspectResidentPresence(rival, id).incidentId, null);
        assert.equal(core.inspectWork(rival, id).productivityBps, 0);
        assert.ok(Object.values(state.world.territory.incidents).every(incident => !incident.responderIds.includes(id)));
    }
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});

test('sponsored ceremony participants cannot acquire territorial reservations during a real intrusion', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context, { ambientRadius: 0 });
    let rival = core.applyCommand(state.world.targetClans['island-rival'], { type: 'UseCulturalOccasions' });
    const offer = core.gatheringOffer(rival, 'communal_ceremony');
    assert.equal(offer.allowed, true);
    rival = core.applyCommand(rival, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        quotedMaterials: offer.materialsCost, expectedParticipantIds: offer.participantIds });
    const participants = rival.events.at(-1).details.participants;
    assert.equal(participants.length, 8);
    state.world.targetClans['island-rival'] = rival;
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visitors', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 224, z: 128 } }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 100 }, setup.context);
    assert.ok(core.inspectTerritory(state).incidents.length > 0, 'The remaining real observers see the intrusion');
    const defenders = state.world.targetClans['island-rival'];
    for (const id of participants) {
        assert.equal(core.inspectResidentPresence(defenders, id).incidentId, null,
            'An active sponsored participant cannot also receive a withdrawal or response duty');
        assert.ok(Object.values(state.world.territory.incidents).every(incident => !incident.responderIds.includes(id)));
    }
});
test('a newly departing adopted expedition starts at its saved body rather than presentation coordinates', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Visitors', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 25 }, setup.context);
    const departure = core.inspectResidentPresence(state, 'founder-1').position;
    const launched = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 224, z: 128 }, origins: { 'founder-1': { x: 120, z: 128 } } }, setup.context);
    const mission = Object.values(launched.world.spatial.missions).at(-1);
    assert.deepEqual(mission.memberRoutes['founder-1'][0], departure);
    assert.deepEqual(mission.homeOrigins['founder-1'], departure);
});
test('a real sponsored participant cannot start an expedition until the saved cultural absence ends', () => {
    const setup = fixture();
    let state = core.initializeTerritorialAwareness(setup.state, setup.context);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'After the ceremony', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'UseCulturalOccasions' });
    const offer = core.gatheringOffer(state, 'communal_ceremony');
    assert.ok(offer.participantIds.includes('founder-1'));
    state = core.applyCommand(state, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        quotedMaterials: offer.materialsCost, expectedParticipantIds: offer.participantIds });
    const before = core.serializeState(state);
    assert.throws(() => core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context), /eligible|available|ceremon/i);
    assert.equal(core.serializeState(state), before);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, setup.context);
    const started = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    assert.equal(Object.values(started.world.spatial.missions).at(-1).status, 'Prepared');
});
test('canonical origins also govern island missions and boarding while legacy departures keep their contract', () => {
    for (const transport of ['mission', 'longship']) for (const adopted of [false, true]) {
        const world = structuredClone(landscape);
        if (transport === 'longship') {
            world.waterLevel = 0;
            world.settlement.harbor = { x: 64, z: 56 };
            world.terrain.heights = world.terrain.heights.map((_, index) => Math.floor(index / 65) * 8 <= 56 ? -2 : 2);
            world.navigation.cells = world.terrain.heights.map(height => height > 0);
        }
        const setup = fixture(world);
        setup.context.longshipOrigins = { 'founding-longship': { x: 64, z: 56, rotation: 0 } };
        let state = adopted ? core.initializeTerritorialAwareness(setup.state, setup.context) : setup.state;
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Departure test', memberIds: ['founder-1'] });
        if (transport === 'longship')
            state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
        const supplied = { x: 120, z: 128 };
        const expected = adopted ? core.inspectResidentPresence(state, 'founder-1').position : supplied;
        const origins = { 'founder-1': supplied };
        const command = transport === 'mission'
            ? { type: 'DispatchIslandMission', groupId: 'group-1', mission: 'Recon',
                target: { kind: 'area', position: { x: 96, z: 128 } }, origins }
            : { type: 'BoardLongship', groupId: 'group-1', shipId: 'founding-longship', origins };
        state = core.applyCommand(state, command, setup.context);
        const mission = Object.values(state.world.spatial.missions).at(-1);
        assert.deepEqual(mission.memberRoutes['founder-1'][0], expected,
            transport + (adopted ? ' must use the canonical body' : ' preserves pre-adoption origins'));
        assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
    }
});