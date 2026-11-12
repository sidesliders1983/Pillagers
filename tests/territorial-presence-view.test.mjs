import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');

function residentFixture() {
    const state = core.createCampaign(32);
    const world = generateWorld({ seed: 32 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const resident = structuredClone(view.entities.find(entity => entity.kind === 'persona' && entity.transform));
    const position = { x: resident.transform.x, z: resident.transform.z };
    resident.status.workEligible = false;
    resident.status.presence = { position, previousPosition: { ...position }, route: [{ ...position }], home: { ...position },
        rotation: resident.transform.rotation, moving: false, updatedAt: 800000,
        mode: 'local', incidentId: null, facing: null, suspended: false };
    const motion = new LivingWorldController(world);
    motion.reconcile([resident], view.ground);
    return { state, world, view, resident, motion, position };
}

test('a resident with canonical presence cannot invent movement during render-only advancement', () => {
    const f = residentFixture();
    const before = core.serializeState(f.state);
    for (let frame = 0; frame < 600; frame++) f.motion.advance(.1, true, true);
    const resident = f.motion.inspect().find(actor => actor.key === f.resident.selectionKey);
    assert.deepEqual({ x: resident.x, z: resident.z }, f.position);
    assert.equal(resident.state, 'Idle');
    assert.equal(resident.destination, null);
    assert.equal(core.serializeState(f.state), before);
});


test('canonical presence follows confirmed bends smoothly and pauses between tick samples', () => {
    const f = residentFixture();
    const corner = { x: f.position.x + .3, z: f.position.z };
    const destination = { x: corner.x, z: corner.z + .3 };
    const sample = structuredClone(f.resident);
    sample.transform.x = destination.x;
    sample.transform.z = destination.z;
    sample.status.presence = { ...sample.status.presence, position: destination,
        route: [f.position, corner, destination], updatedAt: 800001, moving: true };
    const input = JSON.stringify(sample);
    f.motion.reconcile([sample], f.view.ground);
    const actor = () => f.motion.inspect().find(person => person.key === sample.selectionKey);
    assert.deepEqual({ x: actor().x, z: actor().z }, f.position,
        'A new confirmed tick is approached from the displayed position');
    f.motion.advance(.25, true, true);
    assert.ok(Math.abs(actor().x - corner.x) < 1e-8 && Math.abs(actor().z - corner.z) < 1e-8,
        'The halfway sample reaches the actual bend without cutting its corner');
    const paused = actor();
    f.motion.advance(30, false, true);
    assert.deepEqual(actor(), paused);
    f.motion.advance(.25, true, true);
    assert.deepEqual({ x: actor().x, z: actor().z }, destination);
    f.motion.advance(10, true, true);
    assert.deepEqual({ x: actor().x, z: actor().z }, destination);
    assert.equal(actor().state, 'Idle');
    assert.equal(JSON.stringify(sample), input);
});


test('a later canonical route sample starts from reached progress without replaying its old prefix', () => {
    const f = residentFixture();
    const sample = structuredClone(f.resident);
    const update = (x, at) => {
        const destination = { x, z: f.position.z };
        sample.transform.x = x;
        sample.status.presence = { ...sample.status.presence, position: destination,
            route: [f.position, destination], updatedAt: at, moving: true };
        f.motion.reconcile([sample], f.view.ground);
    };
    const actor = () => f.motion.inspect().find(person => person.key === sample.selectionKey);
    update(f.position.x + .6, 800001);
    f.motion.advance(.5, true, true);
    assert.ok(Math.abs(actor().x - f.position.x - .6) < 1e-8);
    update(f.position.x + 1.2, 800002);
    f.motion.advance(.25, true, true);
    assert.ok(Math.abs(actor().x - f.position.x - .9) < 1e-8,
        'Confirmed progress continues forward even when the report retains the whole reached path');
});


function campaignPresenceFixture(landing = {}, mechanics = {}) {
    const { geographyIdentity } = load('../src/fjord-play/FjordProjection.ts');
    const { projectRivalSettlement } = load('../src/fjord-play/RivalSettlement.ts');
    const { createCampaignIsland } = load('../src/fjord-play/CampaignIsland.ts');
    const world = createCampaignIsland(32);
    const worldId = geographyIdentity(world);
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 500, ...landing },
        { fertilityChanceBps: 0, partnershipChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }], ...mechanics },
        { enabled: false }), world, worldId);
    const local = projectFjordSettlement(state, world, createFjordLayout(world, undefined, state.seed));
    const target = state.world.targetClans['island-rival'];
    const rival = projectRivalSettlement(target, world);
    const homes = view => Object.fromEntries(view.entities.filter(entity => entity.kind === 'persona')
        .map(entity => [entity.id, { x: entity.transform.x, z: entity.transform.z }]));
    const context = { world, worldId, presenceSites: [
        { clanId: state.clan.id, center: world.settlement.center, bounds: world.terrain.bounds, homes: homes(local) },
        { clanId: target.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds, homes: homes(rival) },
    ] };
    state = core.initializeTerritorialAwareness(state, context);
    return { state, world, context, local };
}


test('Fjord projects saved resident positions after headless movement and exposes only reached route geometry', () => {
    let { state, world, context, local } = campaignPresenceFixture();
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 26 }, context);
    const before = core.serializeState(state);
    const view = projectFjordSettlement(state, world, local.layout);
    const residents = view.entities.filter(entity => entity.kind === 'persona' && entity.transform);
    for (const entity of residents) {
        const presence = core.inspectResidentPresence(state, entity.id);
        assert.deepEqual({ x: entity.transform.x, z: entity.transform.z }, presence.position);
        assert.deepEqual(entity.status.presence.route.at(-1), presence.position);
    }
    const moving = residents.find(entity => entity.status.presence.moving);
    assert.ok(moving, 'The real headless actor must have started a local route');
    const future = core.inspectResidentPresence(state, moving.id).route.at(-1);
    assert.notDeepEqual(moving.status.presence.route.at(-1), future,
        'An unfinished future destination does not become a rendered position');
    assert.equal(core.serializeState(state), before);
});


test('expiry of canonical ceremony presence releases its cosmetic gathering and return ownership', () => {
    const f = residentFixture();
    const sample = structuredClone(f.resident);
    sample.status.presence.suspended = true;
    f.motion.reconcile([sample], f.view.ground);
    const ids = f.motion.beginGathering('accepted-gathering', [sample.selectionKey], 6);
    assert.deepEqual(ids, [sample.selectionKey]);
    assert.equal(f.motion.inspectGathering().participants[0].dropped, false);
    sample.status.presence = { ...sample.status.presence, suspended: false, updatedAt: 800001 };
    f.motion.reconcile([sample], f.view.ground);
    assert.equal(f.motion.inspectGathering().participants[0].dropped, true,
        'The presentation must stop when its canonical availability interval has ended');
    f.motion.releaseGathering();
    f.motion.advance(10, true, true);
    const resident = f.motion.inspect().find(actor => actor.key === sample.selectionKey);
    assert.deepEqual({ x: resident.x, z: resident.z }, f.position);
    assert.equal(resident.state, 'Idle');
});



test('adopted canonical presence retains newborn and caregiver identity without creating outdoor bodies', () => {
    let { state, world, context, local } = campaignPresenceFixture({ initialFood: 10000,
        foundingCoupleChanceBps: 10000 }, { fertilityChanceBps: 10000, careerReviewWinters: 0 });
    for (const id of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id, occupation: 'farmer' }, context);
    state = core.applyCommand(state, { type: 'AdvanceWinter' }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
    const birth = state.events.find(event => event.type === 'ChildBorn');
    assert.ok(birth, 'The public family rules must produce a real birth');
    const mother = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'female');
    const before = core.serializeState(state);
    const view = projectFjordSettlement(state, world, local.layout);
    for (const [id, reason] of [[birth.personaId, 'young-child'], [mother, 'childcare']]) {
        assert.ok(core.inspectResidentPresence(state, id), 'The saved local actor remains canonical');
        const resident = view.entities.find(entity => entity.kind === 'persona' && entity.id === id);
        assert.equal(resident.transform, null, 'Indoor availability wins over a canonical position');
        assert.equal(resident.status.indoorReason, reason);
        assert.equal(resident.status.presence, undefined);
    }
    assert.equal(core.serializeState(state), before);
});



test('real newborns receive separate reachable home exteriors before becoming visible at age five', () => {
    const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
    const { FjordCampaign } = load('../src/fjord-play/FjordCampaign.ts');
    const session = new GameplaySession(32);
    session.loadJSON(core.serializeState(core.createCampaign(32, { initialFood: 100000,
        foundingCoupleChanceBps: 10000 }, { fertilityChanceBps: 10000, partnershipChanceBps: 0,
        careerReviewWinters: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false })));
    const campaign = new FjordCampaign(session, 'island-pool-v3');
    campaign.enableDiscovery();
    campaign.enableTerritorialAwareness();
    const separateHomes = state => {
        for (const clan of [state, state.world.targetClans['island-rival']]) {
            const actors = Object.values(clan.residentPresence.residents);
            for (let first = 0; first < actors.length; first++) for (let second = first + 1; second < actors.length; second++)
                assert.ok(Math.hypot(actors[first].home.x - actors[second].home.x,
                    actors[first].home.z - actors[second].home.z) >= .96 - 1e-6,
                'Every living resident reserves a separate exterior on the real island');
        }
    };
    separateHomes(session.snapshot());
    for (const id of Object.keys(session.snapshot().personas))
        session.command({ type: 'AssignOccupation', personaId: id, occupation: 'farmer' });
    const batched = new GameplaySession(32);
    new FjordCampaign(batched, 'island-pool-v3', campaign.exportJSON());
    batched.command({ type: 'AdvanceTicks', ticks: 6003 });
    session.command({ type: 'AdvanceTicks', ticks: 1002 });
    const birth = session.snapshot().events.find(event => event.type === 'ChildBorn');
    assert.ok(birth);
    session.command({ type: 'AdvanceTicks', ticks: 1 });
    separateHomes(session.snapshot());
    const indoor = core.inspectResidentPresence(session.snapshot(), birth.personaId);
    assert.deepEqual(indoor.position, indoor.home, 'The still-hidden child is prepared at its own safe exterior');
    assert.equal(campaign.project().entities.find(entity => entity.id === birth.personaId).transform, null);
    session.command({ type: 'AdvanceTicks', ticks: 5000 });
    const state = session.snapshot();
    const grown = campaign.project().entities.find(entity => entity.id === birth.personaId);
    assert.equal(core.personaAge(state, birth.personaId), 5);
    assert.ok(grown.transform, 'The five-year-old emerges through the regular public projection');
    const others = campaign.project().entities.filter(entity => entity.kind === 'persona' && entity.id !== birth.personaId && entity.transform);
    assert.ok(others.every(entity => Math.hypot(entity.transform.x - grown.transform.x,
        entity.transform.z - grown.transform.z) >= .96 - 1e-6), 'The visible child cannot emerge inside another body');
    assert.equal(session.saveJSON(), batched.saveJSON(),
        'New homes cannot depend on the command boundary that refreshes the scene context');
    const origin = { ...core.inspectResidentPresence(state, birth.personaId).position };
    let moved = false;
    for (let tick = 0; tick < 100; tick++) {
        session.command({ type: 'AdvanceTicks', ticks: 1 });
        const position = core.inspectResidentPresence(session.snapshot(), birth.personaId).position;
        moved ||= Math.hypot(position.x - origin.x, position.z - origin.z) > .01;
    }
    assert.ok(moved, 'The emerged child can take a normal collision-checked local route');
    batched.command({ type: 'AdvanceTicks', ticks: 100 });
    assert.equal(session.saveJSON(), batched.saveJSON());
    assert.equal(core.serializeState(core.reconstructState(session.saveJSON())), session.saveJSON());
});
