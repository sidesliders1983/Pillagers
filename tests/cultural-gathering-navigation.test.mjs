import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { settlementCampfire } = load('../src/fjord-play/SettlementCampfire.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const core = load('../src/simulation/SimulationCore.ts');

function fixture(count = 2, mapped) {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const people = view.entities.filter(entity => entity.kind === 'persona' && entity.transform).slice(0, count);
    const entities = [...view.entities.filter(entity => entity.plot), ...people];
    const motion = new LivingWorldController(world, mapped);
    motion.reconcile(entities, view.ground);
    return { state, world, view, people, entities, motion, campfire: settlementCampfire(world) };
}

function pose(actor) { return [actor.key, actor.x, actor.y, actor.z]; }

test('fresh gathering residents walk safely to separate campfire slots without changing Core', () => {
    const { state, people, motion, campfire } = fixture();
    const saved = core.serializeState(state);
    const initial = motion.inspect().map(pose);
    const keys = people.map(person => person.selectionKey);
    assert.deepEqual(motion.beginGathering('gathering-1', keys, 6), keys);
    assert.deepEqual(motion.inspect().map(pose), initial, 'Staging intent must not teleport existing actors');
    for (let frame = 0; frame < 1000 &&
        !motion.inspectGathering().participants.every(person => person.arrived); frame++) {
        motion.advance(.1, true, true);
        assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
        assert.ok(motion.inspect().every(actor => actor.walkable));
    }
    const gathering = motion.inspectGathering();
    assert.equal(gathering.eventId, 'gathering-1');
    assert.ok(gathering.participants.every(person => person.arrived && !person.dropped));
    for (const actor of motion.inspect()) {
        const distance = Math.hypot(actor.x - campfire.transform.x, actor.z - campfire.transform.z);
        assert.ok(distance >= 5.49 && distance <= 7.01);
        assert.equal(actor.state, 'Idle');
        const heading = Math.atan2(campfire.transform.x - actor.x, campfire.transform.z - actor.z);
        assert.ok(Math.cos(heading - actor.rotation) > .99);
    }
    assert.ok(core.serializeState(state) === saved);
});

test('pause freezes gathering travel and reconciliation drops absent or caregiving actors', () => {
    const { people, motion, entities, view } = fixture(3);
    const keys = people.map(person => person.selectionKey);
    motion.beginGathering('gathering-lifecycle', keys, 6);
    for (let frame = 0; frame < 10; frame++) motion.advance(.1, true, true);
    const before = motion.inspect();
    const gathering = motion.inspectGathering();
    motion.advance(60, false, true);
    motion.advance(60, true, false);
    assert.deepEqual(motion.inspect(), before);
    assert.deepEqual(motion.inspectGathering(), gathering);
    const changed = structuredClone(entities).filter(entity => entity.selectionKey !== keys[0]);
    const departing = changed.find(entity => entity.selectionKey === keys[1]);
    departing.status.expedition = 'new-expedition';
    const caregiver = changed.find(entity => entity.selectionKey === keys[2]);
    caregiver.status.indoorReason = 'childcare';
    delete caregiver.transform;
    motion.reconcile(changed, view.ground);
    assert.ok(motion.inspectGathering().participants.every(person => person.dropped));
    assert.equal(motion.inspectGathering().eventId, 'gathering-lifecycle');
});

test('a newly blocked gathering path drops presentation without a render-time route search', () => {
    const { motion, entities, people, view } = fixture(1);
    const key = people[0].selectionKey;
    assert.deepEqual(motion.beginGathering('gathering-blocked', [key], 6), [key]);
    const initial = motion.inspect().find(actor => actor.key === key);
    const destination = initial.destination;
    const blocker = structuredClone(entities.find(entity => entity.plot));
    blocker.id = 'new-obstacle';
    blocker.selectionKey = 'building:new-obstacle';
    blocker.plot = { ...blocker.plot, x: (initial.x + destination.x) / 2,
        z: destination.z, halfWidth: .1, halfDepth: 12 };
    motion.reconcile([...entities, blocker], view.ground);
    const planned = motion.inspectMetrics().routeAttempts;
    for (let frame = 0; frame < 1000 && !motion.inspectGathering().participants[0].dropped; frame++)
        motion.advance(.1, true, true);
    assert.equal(motion.inspectGathering().participants[0].dropped, true);
    assert.equal(motion.inspectMetrics().routeAttempts, planned);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
});

test('gathering staging is bounded, idempotent and explicitly released without moving bodies', () => {
    const { motion, people } = fixture(10);
    const keys = people.map(person => person.selectionKey);
    const origins = new Map(motion.inspect().map(actor => [actor.key, { x: actor.x, z: actor.z }]));
    const staged = motion.beginGathering('gathering-low', keys, 6);
    assert.ok(staged.length > 0 && staged.length <= 6);
    assert.equal(motion.inspectGathering().participants.length, 6);
    const searches = motion.inspectMetrics().routeAttempts;
    assert.ok(searches <= 24, 'At most four bounded candidate routes per staged actor');
    assert.deepEqual(motion.beginGathering('gathering-low', keys, 8), staged);
    assert.equal(motion.inspectMetrics().routeAttempts, searches);
    for (let frame = 0; frame < 20; frame++) motion.advance(.1, true, true);
    const positions = motion.inspect().map(pose);
    motion.releaseGathering();
    assert.ok(motion.inspectGathering() === null);
    assert.deepEqual(motion.inspect().map(pose), positions);
    assert.ok(motion.inspect().filter(actor => staged.includes(actor.key)).every(actor =>
        !actor.destination || Math.hypot(actor.destination.x - origins.get(actor.key).x,
            actor.destination.z - origins.get(actor.key).z) < 1e-6));
    motion.beginGathering('gathering-standard', keys, 8);
    assert.equal(motion.inspectGathering().participants.length, 8);
    motion.releaseGathering();
});

test('production seed 91 returns its actual interrupted fisher before resuming reachable shore work', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { loadBakedCampaignIsland } = load('../src/fjord-play/BakedCampaignIsland.ts');
    const { inspectClanDiscovery, discoveryAt } = load('../src/simulation/ClanDiscovery.ts');
    const { CulturalPresentation } = load('../src/fjord-play/CulturalPresentation.ts');
    const seed = 91;
    const { world } = await loadBakedCampaignIsland(seed, undefined, undefined,
        async url => new Response(readFileSync(resolve('public', '.' + url.split('?')[0]))));
    let before = core.createCampaign(seed, {}, {}, {}, {}, { enabled: true }, {},
        'summer-800-v1', undefined, undefined, { enabled: true });
    before = core.initializeIslandClans(before, world, 'cultural-performance:' + seed);
    const offer = core.gatheringOffer(before);
    const paid = core.applyCommand(before, { type: 'SponsorGathering', occasion: offer.occasion,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost,
        expectedParticipantIds: offer.participantIds });
    const saved = core.serializeState(paid);
    const view = projectFjordSettlement(paid, world, createFjordLayout(world, undefined, seed));
    const known = inspectClanDiscovery(paid.discovery, paid.clan.id);
    const motion = new LivingWorldController(world, (x, z) => discoveryAt(known, x, z) !== 'unknown');
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 50; frame++) motion.advance(.1, true, true);
    const key = 'persona:founder-3';
    const interrupted = motion.inspect().find(actor => actor.key === key);
    assert.equal(view.entities.find(entity => entity.selectionKey === key).status.occupation, 'fisher');
    const show = new CulturalPresentation(before, motion, view.campfire.transform);
    assert.equal(show.accept(paid, 6, true), true);
    for (let frame = 0; frame < 1300 && show.inspect(); frame++) {
        motion.advance(.1, true, true);
        show.advance(.1, true, true);
    }
    assert.ok(show.inspect() === null);
    const retained = motion.inspectMetrics();
    assert.ok(retained.returningGatheringActors > 0 && retained.returningGatheringActors <= 6);
    assert.ok(retained.retainedGatheringWaypoints > 0 && retained.retainedGatheringWaypoints <= 6 * (512 + 4096));
    const released = motion.inspect().find(actor => actor.key === key);
    assert.ok(released.destination && Math.hypot(released.destination.x - interrupted.x,
        released.destination.z - interrupted.z) < 1e-6, 'Release must retain a physical return to the actual prior reached point');
    let homeReached = false, shoreReached = false, prematureOccupationSearches = 0;
    motion.setRouteObserver(row => {
        if (row.agent === key && row.purpose === 'occupation' && !homeReached) prematureOccupationSearches++;
    });
    for (let frame = 0; frame < 2400 && !shoreReached; frame++) {
        const previous = motion.inspect().find(actor => actor.key === key);
        motion.advance(.1, true, true);
        const actor = motion.inspect().find(actor => actor.key === key);
        const distance = Math.hypot(actor.x - previous.x, actor.z - previous.z);
        assert.ok(distance <= .081, 'Returning uses ordinary bounded walking, without teleportation');
        if (Math.hypot(actor.x - interrupted.x, actor.z - interrupted.z) < .15) homeReached = true;
        if (homeReached && actor.visit?.phase === 'activity' && actor.visit.source.startsWith('shore:'))
            shoreReached = true;
    }
    assert.equal(homeReached, true);
    assert.equal(shoreReached, true, 'The returned fisher must remain capable of reaching a real shore activity');
    assert.equal(prematureOccupationSearches, 0);
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
    assert.ok(core.serializeState(paid) === saved);
    show.dispose();
});

test('care and a changed canonical home cancel retained gathering returns immediately', () => {
    const { motion, entities, people, view } = fixture(2);
    const keys = people.map(person => person.selectionKey);
    motion.beginGathering('gathering-return-cancel', keys, 6);
    for (let frame = 0; frame < 100; frame++) motion.advance(.1, true, true);
    motion.releaseGathering();
    assert.ok(motion.inspectMetrics().returningGatheringActors > 0);
    const positions = motion.inspect();
    const changed = structuredClone(entities);
    const caregiver = changed.find(entity => entity.selectionKey === keys[0]);
    caregiver.status.indoorReason = 'childcare';
    delete caregiver.transform;
    const movedHome = changed.find(entity => entity.selectionKey === keys[1]);
    movedHome.status.assignment = 'changed-canonical-home';
    motion.reconcile(changed, view.ground);
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
    const actor = motion.inspect().find(actor => actor.key === keys[1]);
    assert.deepEqual(pose(actor), pose(positions.find(previous => previous.key === actor.key)));
    motion.advance(60, false, true);
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
});

test('a new obstruction cancels a retained return without teleport or a replacement route search', () => {
    const { motion, entities, people, view } = fixture(1);
    const key = people[0].selectionKey;
    motion.beginGathering('gathering-return-obstructed', [key], 6);
    for (let frame = 0; frame < 100; frame++) motion.advance(.1, true, true);
    motion.releaseGathering();
    const returning = motion.inspect().find(actor => actor.key === key);
    assert.ok(returning.destination);
    const blocker = structuredClone(entities.find(entity => entity.plot));
    blocker.id = 'return-corridor-obstacle';
    blocker.selectionKey = 'building:return-corridor-obstacle';
    blocker.plot = { ...blocker.plot, x: (returning.x + returning.destination.x) / 2,
        z: returning.destination.z, halfWidth: .1, halfDepth: 12 };
    motion.reconcile([...entities, blocker], view.ground);
    const searches = motion.inspectMetrics().routeAttempts;
    for (let frame = 0; frame < 1000 && motion.inspectMetrics().returningGatheringActors; frame++) {
        const before = motion.inspect().find(actor => actor.key === key);
        motion.advance(.1, true, true);
        const after = motion.inspect().find(actor => actor.key === key);
        assert.ok(Math.hypot(after.x - before.x, after.z - before.z) <= .081);
    }
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
    assert.equal(motion.inspectMetrics().routeAttempts, searches);
});

test('a changed home during the gathering never creates an obsolete return on release', () => {
    const { motion, entities, people, view } = fixture(1);
    const key = people[0].selectionKey;
    motion.beginGathering('gathering-home-before-release', [key], 6);
    for (let frame = 0; frame < 40; frame++) motion.advance(.1, true, true);
    const changed = structuredClone(entities);
    changed.find(entity => entity.selectionKey === key).status.assignment = 'new-home-before-release';
    motion.reconcile(changed, view.ground);
    const positions = motion.inspect().map(pose);
    motion.releaseGathering();
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
    assert.deepEqual(motion.inspect().map(pose), positions);
});

test('a second gathering replaces pending returns without nesting retained intentions', () => {
    const { motion, people } = fixture(2);
    const keys = people.map(person => person.selectionKey);
    motion.beginGathering('gathering-return-first', keys, 6);
    for (let frame = 0; frame < 80; frame++) motion.advance(.1, true, true);
    motion.releaseGathering();
    assert.ok(motion.inspectMetrics().returningGatheringActors > 0);
    const currentOrigins = new Map(motion.inspect().map(actor => [actor.key, { x: actor.x, z: actor.z }]));
    const staged = motion.beginGathering('gathering-return-second', keys, 6);
    assert.ok(staged.length > 0);
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.ok(motion.inspectMetrics().retainedGatheringWaypoints <= 2 * (512 + 4096));
    for (let frame = 0; frame < 40; frame++) motion.advance(.1, true, true);
    motion.releaseGathering();
    assert.ok(motion.inspectMetrics().returningGatheringActors <= 2);
    for (const actor of motion.inspect().filter(actor => staged.includes(actor.key))) {
        const origin = currentOrigins.get(actor.key);
        assert.ok(actor.destination && Math.hypot(actor.destination.x - origin.x, actor.destination.z - origin.z) < 1e-6);
    }
    motion.reconcile([], { plots: [], paths: [] });
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
});

test('native Run approach freezes on pause and releases ordinary walking on cancellation and changed eligibility', () => {
    const { motion, people, entities, view, world } = fixture(3);
    const keys = people.map(person => person.selectionKey);
    for (const key of keys) motion.setPace(key, .8, 3.5051535998518575);
    motion.beginGathering('running-approach-lifecycle', keys, 6);
    for (let frame = 0; frame < 10; frame++) motion.advance(.1, true, true);
    assert.ok(motion.inspect().some(actor => actor.state === 'Run'));
    const paused = motion.inspect();
    motion.advance(60, false, true);
    motion.advance(60, true, false);
    assert.deepEqual(motion.inspect(), paused);
    motion.releaseGathering();
    assert.ok(motion.inspect().every(actor => actor.state !== 'Run'));
    for (let frame = 0; frame < 20; frame++) {
        const previous = new Map(motion.inspect().map(actor => [actor.key, actor]));
        motion.advance(.1, true, true);
        for (const actor of motion.inspect()) {
            const before = previous.get(actor.key);
            assert.notEqual(actor.state, 'Run');
            assert.ok(Math.hypot(actor.x - before.x, actor.z - before.z) <= .081);
        }
    }
    motion.beginGathering('running-approach-ineligible', keys, 6);
    for (let frame = 0; frame < 10; frame++) motion.advance(.1, true, true);
    const changed = structuredClone(entities);
    changed.find(entity => entity.selectionKey === keys[0]).status.indoorReason = 'childcare';
    changed.find(entity => entity.selectionKey === keys[1]).status.expedition = 'new-expedition';
    changed.find(entity => entity.selectionKey === keys[2]).status.living = false;
    motion.reconcile(changed, view.ground);
    assert.ok(motion.inspectGathering().participants.every(person => person.dropped));
    assert.ok(motion.inspect().every(actor => actor.state !== 'Run'));
    motion.releaseGathering();
    assert.equal(motion.inspectMetrics().retainedGatheringWaypoints, 0);
    assert.equal(motion.inspectMetrics().returningGatheringActors, 0);
    const rebuilt = new LivingWorldController(world);
    rebuilt.reconcile(entities, view.ground);
    for (const key of keys) rebuilt.setPace(key, .8, 3.5051535998518575);
    assert.equal(rebuilt.inspectGathering(), null);
    rebuilt.advance(.1, true, true);
    assert.ok(rebuilt.inspect().every(actor => actor.state !== 'Run'));
});
