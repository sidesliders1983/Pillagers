import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const bounds = { minX: 0, maxX: 320, minZ: 0, maxZ: 256 };
function constrainedFixture(blockedExteriors = false, rivalStart = 216) {
    const worldId = 'constrained-resident-exteriors';
    const homes = start => Array.from({ length: 10 }, (_, index) => ({
        x: start + index % 4 * 8, z: 112 + Math.floor(index / 4) * 8,
    }));
    const rootHomes = homes(48), rivalHomes = homes(rivalStart);
    const cells = Array(41 * 33).fill(false);
    for (const home of [...rootHomes, ...rivalHomes]) cells[home.z / 8 * 41 + home.x / 8] = true;
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 41, rows: 33, heights: Array(41 * 33).fill(0) },
        navigation: { bounds, spacing: 8, columns: 41, rows: 33, cells: blockedExteriors ? cells.map(() => true) : cells },
        settlement: { center: { x: 64, z: 120 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'dense-rival', center: { x: rivalStart + 8, z: 120 },
            bounds: { minX: rivalStart - 4, maxX: rivalStart + 28, minZ: 100, maxZ: 132 }, foundations: [], buildableArea: 768 } };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 100000,
        foundingCoupleChanceBps: 10000 }, { mortalityBands: [{ minAge: 0, chanceBps: 0 }],
        fertilityChanceBps: 10000, partnershipChanceBps: 10000, careerReviewWinters: 0 }, { enabled: false }), world, worldId);
    const site = (clan, center, siteBounds, points) => ({ clanId: clan.clan.id, center, bounds: siteBounds,
        homes: Object.fromEntries(Object.keys(clan.personas).sort().map((id, index) => [id, points[index]])) });
    const context = { world, worldId, presenceSites: [
        site(state, world.settlement.center, { minX: 44, maxX: 76, minZ: 100, maxZ: 132 }, rootHomes),
        site(state.world.targetClans['island-rival'], world.rivalSite.center, world.rivalSite.bounds, rivalHomes),
    ] };
    if (blockedExteriors) context.exclusions = [
        { minX: 44, maxX: 76, minZ: 100, maxZ: 108 },
        { minX: rivalStart - 4, maxX: rivalStart + 28, minZ: 100, maxZ: 108 },
        { minX: 60, maxX: 76, minZ: 124, maxZ: 132 },
        { minX: rivalStart + 12, maxX: rivalStart + 28, minZ: 124, maxZ: 132 },
    ];
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    return { state, context };
}

const clans = state => [state, state.world.targetClans['island-rival']];

test('real births on exhausted exterior terrain preserve every identity and keep the canonical clock running', () => {
    const setup = constrainedFixture();
    const before = core.serializeState(setup.state);
    const state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 1000 }, setup.context);
    assert.equal(core.serializeState(setup.state), before);
    assert.deepEqual(state.time, { winter: 801, tick: 0 });
    for (const clan of clans(state)) {
        const births = clan.events.filter(event => event.type === 'ChildBorn');
        assert.ok(births.length > 0, 'Both actual communities must produce real births');
        for (const birth of births) {
            const resident = core.inspectResidentPresence(clan, birth.personaId);
            assert.ok(resident, 'The new named identity retains a saved presence record');
            assert.equal(resident.placement.phase, 'indoor');
            assert.equal(resident.placement.needsHome, true);
            assert.equal(resident.incidentId, null);
            assert.equal(resident.moving, false);
        }
    }
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(state))), core.serializeState(state));
});
test('a real five-year-old waits for a clear connected exit and resumes without a position jump', () => {
    const setup = constrainedFixture(true);
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 6000 }, setup.context);
    const birth = state.events.find(event => event.type === 'ChildBorn');
    assert.ok(birth);
    assert.equal(core.personaAge(state, birth.personaId), 5);
    const indoor = core.inspectResidentPresence(state, birth.personaId);
    assert.equal(indoor.placement.phase, 'indoor');
    const anchor = { ...indoor.position };
    const open = { ...setup.context, exclusions: [] };
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 50 }, open);
    assert.ok(core.inspectResidentPresence(state, birth.personaId).placement,
        'Opening home space alone cannot put a child inside the adult occupying its saved exit');
    const occupantId = Object.keys(state.personas).find(id => id !== birth.personaId &&
        !core.inspectResidentPresence(state, id)?.placement &&
        Math.hypot(core.inspectResidentPresence(state, id).position.x - anchor.x,
            core.inspectResidentPresence(state, id).position.z - anchor.z) < .96);
    assert.ok(occupantId, 'A real outdoor adult occupies the saved household exit');
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Clear the doorway', memberIds: [occupantId] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, open);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 128, z: 120 } }, open);
    let emerged = false;
    let previous = anchor;
    for (let step = 0; step < 75; step++) {
        state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, open);
        const resident = core.inspectResidentPresence(state, birth.personaId);
        assert.ok(Math.hypot(resident.position.x - previous.x, resident.position.z - previous.z) <= .6 + 1e-6,
            'No placement retry teleports through the household connector');
        previous = resident.position;
        if (!resident.placement) { emerged = true; break; }
    }
    assert.equal(emerged, true, 'A pending resident can emerge on the canonical retry after the actual exit clears');
    assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
});
function occupiedCaregiverFixture() {
    const setup = constrainedFixture(true, 88);
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 1000 }, setup.context);
    const birth = state.events.find(event => event.type === 'ChildBorn');
    const mother = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'female');
    const father = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'male');
    const exit = core.inspectResidentPresence(state, mother).position;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: mother, occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Waiting outside', memberIds: [father] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1', testFoodPerMember: 10 }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: exit }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2600 }, setup.context);
    assert.equal(Object.values(state.world.spatial.missions).at(-1).status, 'Returned');
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1', testFoodPerMember: 10 }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: exit }, setup.context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 2400 }, setup.context);
    assert.equal(core.isProvidingCare(state, mother), false, 'The ordinary five-Winter care period has really ended');
    return { state, setup, mother, father, exit };
}

test('a caregiver with a genuinely occupied exit stays indoor and unavailable for outdoor work or assignments', () => {
    const { state, setup, mother, exit } = occupiedCaregiverFixture();
    const resident = core.inspectResidentPresence(state, mother);
    assert.equal(resident.placement.reason, 'awaiting-exterior');
    assert.deepEqual(resident.position, exit, 'Re-entry retains the saved reached point instead of moving through the visitor');
    assert.equal(core.inspectWork(state, mother).reason, 'awaiting-exterior');
    assert.equal(core.inspectWork(state, mother).productivityBps, 0);
    assert.equal(core.availableCulturalParticipants(state).some(person => person.id === mother), false);
    assert.throws(() => core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Indoor member', memberIds: [mother] }), /eligible|available/i);
    assert.equal(core.territorialContact(state, setup.context, 'island-rival', state.clan.id, mother), undefined,
        'A saved indoor household reference is not a visible intruder');
    const before = core.serializeState(state);
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const generated = generateWorld({ seed: 32 });
    const presentationWorld = { ...generated, ...setup.context.world,
        settlement: { ...generated.settlement, ...setup.context.world.settlement } };
    const projected = projectFjordSettlement(state, presentationWorld, createFjordLayout(presentationWorld,
        { x: 64, y: 0, z: 120, rotation: 0, scale: 1 }));
    const entity = projected.entities.find(entity => entity.id === mother);
    assert.equal(entity.transform, null);
    assert.equal(entity.status.indoorReason, 'awaiting-exterior');
    assert.equal(core.serializeState(state), before);
});
test('placement saves reject malformed or outdoor-owned indoor state and keep older actor records compatible', () => {
    const setup = constrainedFixture(true);
    const legacy = core.serializeState(setup.state);
    assert.equal(core.serializeState(core.reconstructState(legacy)), legacy,
        'The optional placement field is not injected into older adopted records during import');
    let state = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 1000 }, setup.context);
    const birth = state.events.find(event => event.type === 'ChildBorn');
    const edit = change => {
        const corrupt = structuredClone(state);
        change(corrupt.residentPresence.residents[birth.personaId]);
        assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /presence|placement|territor/i);
    };
    edit(actor => { actor.placement = null; });
    edit(actor => { actor.placement.phase = 'outdoor'; });
    edit(actor => { actor.placement.reason = 'unknown'; });
    edit(actor => { actor.placement.anchor.x += 1; });
    edit(actor => { actor.placement.needsHome = 'yes'; });
    edit(actor => { actor.placement.since = 801001; });
    edit(actor => { actor.placement.retryAt = 801026; });
    edit(actor => { actor.route.push({ x: actor.position.x + 8, z: actor.position.z }); actor.distance = 8; });
    const father = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'male');
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Real outdoor body', memberIds: [father] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, setup.context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 128, z: 120 } }, setup.context);
    const corrupt = structuredClone(state);
    const actor = corrupt.residentPresence.residents[father];
    actor.placement = { ...corrupt.residentPresence.residents[birth.personaId].placement,
        anchor: { ...actor.position }, needsHome: false, reason: 'awaiting-exterior' };
    assert.throws(() => core.reconstructState(JSON.stringify(corrupt)), /presence|placement|territor/i,
        'One identity cannot have an indoor placeholder and an active physical expedition body');
});
test('multiple genuine births and ageing remain exact across saved retries, batches and both clans', () => {
    const setup = constrainedFixture();
    const whole = core.applyCommand(setup.state, { type: 'AdvanceTicks', ticks: 6000 }, setup.context);
    let split = setup.state;
    for (const ticks of [999, 1, 25, 2975, 2000]) {
        split = core.applyCommand(core.reconstructState(core.serializeState(split)), { type: 'AdvanceTicks', ticks }, setup.context);
    }
    assert.deepEqual(split, whole);
    for (const clan of clans(whole)) {
        const births = clan.events.filter(event => event.type === 'ChildBorn');
        assert.ok(births.length > 2, 'The real default cooldown/care rules produce multiple births');
        assert.ok(births.some(birth => core.personaAge(clan, birth.personaId) >= 5));
        assert.ok(births.some(birth => core.personaAge(clan, birth.personaId) < 5));
        for (const person of Object.values(clan.personas).filter(person => person.deathWinter === null))
            assert.ok(core.inspectResidentPresence(clan, person.id), 'Every living named identity retains its local record');
        const bodies = Object.keys(clan.personas).map(id => core.inspectResidentPresence(clan, id))
            .filter(resident => resident && !resident.placement);
        for (let first = 0; first < bodies.length; first++) for (let second = first + 1; second < bodies.length; second++)
            assert.ok(Math.hypot(bodies[first].position.x - bodies[second].position.x,
                bodies[first].position.z - bodies[second].position.z) >= .96 - 1e-6);
    }
});
test('strict resident routing chooses a supported alternate connector while legacy routing stays unchanged', () => {
    const { planRoute } = load('../src/world-generation/LandRoutes.ts');
    const bounds = { minX: 0, maxX: 40, minZ: 0, maxZ: 40 };
    const cells = Array(36).fill(false);
    for (const [x, z] of [[8, 8], [16, 8], [16, 16], [24, 16], [24, 24], [16, 24], [8, 24]])
        cells[z / 8 * 6 + x / 8] = true;
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 6, rows: 6, heights: Array(36).fill(0) },
        navigation: { bounds, spacing: 8, columns: 6, rows: 6, cells },
        settlement: { center: { x: 8, z: 8 }, harbor: null } };
    const context = { world, exclusions: [[8, 8], [16, 8], [16, 16]].map(([x, z]) => ({
        minX: x - .2, maxX: x + .2, minZ: z - .2, maxZ: z + .2 })) };
    const origin = { x: 8.6, z: 8 }, target = { x: 8, z: 24 };
    const legacy = planRoute(context, target, origin, true);
    assert.deepEqual(legacy.route[1], target, 'The legacy connector contract remains unchanged');
    const strict = planRoute(context, target, origin, true, { strictNavigation: true });
    assert.deepEqual(strict.route[1], { x: 24, z: 16 },
        'Canonical residents must take the reachable alternate connector instead of cutting the blocked middle cell');
    assert.deepEqual(strict.route.at(-1), target);
});
test('public caregiver reassignment synchronizes an indoor reason without moving or resetting its retry', () => {
    let { state, mother } = occupiedCaregiverFixture();
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: mother, occupation: null });
    const recipient = Object.keys(state.personas).find(id => id !== mother && core.isProvidingCare(state, id));
    assert.ok(recipient, 'A different real mother still needs ordinary childcare');
    const before = core.inspectResidentPresence(state, mother).placement;
    const reassigned = core.applyCommand(state, { type: 'AssignCaregiver', motherId: recipient, caregiverId: mother });
    const caring = core.inspectResidentPresence(reassigned, mother).placement;
    assert.equal(core.isProvidingCare(reassigned, mother), true);
    assert.equal(caring.reason, 'childcare');
    assert.deepEqual({ ...caring, reason: before.reason }, before);
    const released = core.applyCommand(reassigned, { type: 'AssignCaregiver', motherId: recipient, caregiverId: null });
    const waiting = core.inspectResidentPresence(released, mother).placement;
    assert.equal(core.isProvidingCare(released, mother), false);
    assert.deepEqual(waiting, before);
    assert.equal(core.serializeState(core.reconstructState(core.serializeState(released))), core.serializeState(released));
});