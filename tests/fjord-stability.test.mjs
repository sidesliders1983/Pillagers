import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const quiet = { fertilityChanceBps: 0, careerReviewWinters: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }] };

test('a surviving calf keeps its safe moving position when its source model changes stage', () => {
    let state = core.createCampaign(17, { initialFood: 10000, cattleBirthChanceBps: 10000,
        cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const calf = Object.values(state.landing.cattle).find(c => c.origin === 'reproduction');
    assert.ok(calf, 'The fixture uses a real canonical calf birth');
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 600; frame++) motion.advance(.1, true, true);
    const before = motion.inspect().find(a => a.key === 'cattle:' + calf.id);
    const old = view.entities.find(e => e.id === calf.id);
    assert.ok(Math.hypot(before.x - old.transform.x, before.z - old.transform.z) > .1);
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.equal(view.entities.find(e => e.id === calf.id).status.stage, 'Young Adult');
    motion.reconcile(view.entities, view.ground);
    const after = motion.inspect().find(a => a.key === before.key);
    assert.equal(after.x, before.x, 'A larger source model must not teleport a safe survivor');
    assert.equal(after.z, before.z);
    assert.ok(after.walkable);
});

test('salvaging a home cancels its trip without teleporting a resident on safe open ground', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const buildingId = state.households[householdId].residenceId;
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setOccupationClips('persona:founder-1', { Farm: 8 });
    let before;
    for (let frame = 0; frame < 1000; frame++) {
        motion.advance(.1, true, true);
        before = motion.inspect().find(a => a.key === 'persona:founder-1');
        if (before.visit?.phase === 'approach') break;
    }
    assert.ok(before.visit, 'The farmer had a real planned Farmyard visit');
    state = core.applyCommand(state, { type: 'SalvageBuilding', buildingId });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(view.entities, view.ground);
    const after = motion.inspect().find(a => a.key === before.key);
    assert.equal(after.visit, null, 'The removed Farmyard cannot retain an occupation reservation');
    assert.ok(after.walkable);
    assert.equal(after.x, before.x);
    assert.equal(after.z, before.z);
});

test('controller diagnostics expose bounded search and ownership without advancing paused actors', () => {
    const state = core.createCampaign(17, {}, quiet, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 400; frame++) motion.advance(.1, true, true);
    const metrics = motion.inspectMetrics();
    assert.equal(metrics.agents, 13);
    assert.equal(metrics.updates, 400);
    assert.ok(metrics.routeNodes > 0);
    assert.ok(metrics.maxRouteNodes > 0);
    assert.ok(metrics.routeAttempts > 0, 'Moving residents perform actual bounded searches');
    assert.ok(metrics.maxRouteNodes <= 2004, 'No search may escape the existing node budget');
    assert.ok(metrics.rejectedRoutes <= metrics.routeAttempts);
    assert.equal(metrics.outOfZone, 0);
    assert.equal(metrics.bodyOverlaps, 0);
    assert.equal(metrics.reservations, motion.inspect().filter(a => a.partnerKey).length / 2);
    assert.ok(metrics.lastUpdateMs >= 0 && metrics.maxUpdateMs >= metrics.lastUpdateMs);
    const snapshot = motion.inspect();
    motion.advance(10, false, true);
    motion.advance(10, true, false);
    assert.deepEqual(motion.inspect(), snapshot);
    assert.deepEqual(motion.inspectMetrics(), metrics);
    assert.equal(core.serializeState(state), core.serializeState(core.reconstructState(core.serializeState(state))));
});

test('25 seeded Winters reconcile deaths, births, care, weather and home changes without stale agents or Core effects', () => {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000,
        foundingCoupleChanceBps: 10000 });
    let visualOff = core.reconstructState(core.serializeState(state));
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    const command = action => {
        state = core.applyCommand(state, action);
        visualOff = core.applyCommand(visualOff, action);
    };
    command({ type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    for (const h of Object.values(state.households).filter(h => h.memberIds.length))
        command({ type: 'BuildHouse', householdId: h.id });
    const farm = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).residenceId;
    for (const cattleId of Object.keys(state.landing.cattle))
        command({ type: 'AssignCattle', cattleId, farmyardId: farm });
    const weather = new Set();
    for (let winter = 0; winter <= 25; winter++) {
        view = projectFjordSettlement(state, world, view.layout);
        motion.reconcile(view.entities, view.ground);
        const wanted = view.entities.filter(e => e.transform && ['persona', 'cattle'].includes(e.kind));
        assert.deepEqual(motion.inspect().map(a => a.key).sort(), wanted.map(e => e.selectionKey).sort());
        for (const a of motion.inspect()) {
            motion.setOccupationClips(a.key, { Farm: 8, Attack: 2, Doze: 16 });
            motion.setActivityClips(a.key, { Graze: 12, HumanInteraction: 6 });
        }
        for (let frame = 0; frame < 100; frame++) motion.advance(.1, true, true);
        const metrics = motion.inspectMetrics();
        assert.equal(metrics.outOfZone, 0, 'All agents stay in their current valid zone in Winter ' + state.time.winter);
        assert.equal(new Set(motion.inspect().map(a => a.key)).size, wanted.length);
        for (const a of motion.inspect().filter(a => a.partnerKey))
            assert.equal(motion.inspect().find(b => b.key === a.partnerKey)?.partnerKey, a.key);
        weather.add(view.weather.class);
        assert.equal(core.serializeState(state), core.serializeState(visualOff), 'Visuals cannot affect RNG, progress, events or stocks');
        state = core.reconstructState(core.serializeState(state));
        if (winter === 2) {
            command({ type: 'SpecializeBuilding', buildingId: farm, occupation: 'farmer' });
            command({ type: 'UpgradeBuilding', buildingId: farm });
        }
        if (winter === 4) {
            const occupied = Object.values(state.households).find(h => h.residenceId === farm);
            if (occupied) command({ type: 'AssignResidence', householdId: occupied.id, residenceId: null });
        }
        if (winter < 25) command({ type: 'AdvanceWinter' });
    }
    for (const event of ['ChildBorn', 'PersonaDied', 'CattleBorn', 'CattleDied'])
        assert.ok(state.events.some(e => e.type === event), event + ' occurs through the real default lifecycle');
    assert.ok(weather.size > 1);
});

test('moving into another nearby home retains a safe resident position and cancels the old trip', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000, foundingCoupleChanceBps: 0 }, quiet, { enabled: false });
    for (const householdId of ['founder-1', 'founder-3'])
        state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 100; frame++) motion.advance(.1, true, true);
    const before = motion.inspect().find(a => a.key === 'persona:founder-1');
    const newHome = state.households['founder-3'].residenceId;
    state = core.applyCommand(state, { type: 'AssignResidence', householdId: 'founder-3', residenceId: null });
    state = core.applyCommand(state, { type: 'AssignResidence', householdId: 'founder-1', residenceId: newHome });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(view.entities, view.ground);
    const after = motion.inspect().find(a => a.key === before.key);
    assert.ok(after.walkable);
    assert.equal(after.visit, null);
    assert.equal(after.x, before.x, 'Changing the home destination cannot teleport a safe resident');
    assert.equal(after.z, before.z);
});

test('departure and slaughter immediately release outdoor ownership while canonical history stays intact', () => {
    let state = core.createCampaign(17, { initialFood: 10000 }, quiet, { enabled: false });
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    for (const a of motion.inspect()) motion.setActivityClips(a.key, { Graze: 12, HumanInteraction: 6 });
    for (let frame = 0; frame < 600; frame++) motion.advance(.1, true, true);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: ['founder-1'] });
    state = core.applyCommand(state, { type: 'DispatchExpedition', groupId: 'group-1',
        regionId: 'region-east', mission: 'Recon' });
    state = core.applyCommand(state, { type: 'SlaughterCattle', cattleId: 'cattle-1' });
    const saved = core.serializeState(state);
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(view.entities, view.ground);
    const actors = motion.inspect();
    assert.ok(!actors.some(a => ['persona:founder-1', 'cattle:cattle-1'].includes(a.key)));
    assert.ok(actors.every(a => !['persona:founder-1', 'cattle:cattle-1'].includes(a.partnerKey)));
    assert.equal(state.personas['founder-1'].deathWinter, null);
    assert.ok(state.events.some(e => e.type === 'CattleSlaughtered'));
    motion.advance(60, false, true);
    assert.equal(core.serializeState(state), saved);
    assert.deepEqual(core.reconstructState(saved), state);
});

test('every supported occupation completes a finite activity and actually returns home in active time', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000, initialFood: 10000 }, quiet, { enabled: false });
    const roles = [['founder-1', 'farmer', 'Farm'], ['founder-2', 'fisher', 'Doze'],
        ['founder-5', 'woodworker', 'Attack'], ['founder-4', 'hunter', 'Idle']];
    for (const [personaId, occupation] of roles)
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const saved = core.serializeState(state);
    for (const [id, role, clip] of roles) {
        const motion = new LivingWorldController(world);
        const entity = view.entities.find(e => e.kind === 'persona' && e.id === id);
        motion.reconcile(view.entities.filter(e => e.plot || e.selectionKey === entity.selectionKey), view.ground);
        motion.setStandingTrees(world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId))
            .map(p => ({ key: p.assetId + '@' + p.x + ',' + p.z, x: p.x, z: p.z, clearance: p.clearance })));
        motion.setOccupationClips(entity.selectionKey, { Farm: 4, Attack: 3, Doze: 18 });
        motion.setPace(entity.selectionKey, 1.1);
        let active = false, returned = false;
        for (let frame = 0; frame < 6000 && !returned; frame++) {
            motion.advance(.1, true, true);
            const a = motion.inspect()[0];
            if (a.visit?.phase === 'activity' && a.state === clip) active = true;
            if (active && a.visit === null && Math.hypot(a.x - entity.transform.x,
                a.z - entity.transform.z) < .2) returned = true;
            assert.ok(a.walkable);
        }
        assert.ok(active, role + ' reaches and plays the supported activity');
        assert.ok(returned, role + ' physically returns to the home exterior');
    }
    assert.equal(core.serializeState(state), saved);
});


test('source yard geometry permits safe floor slots beside an irregular house footprint', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const farmId = state.households[householdId].residenceId;
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: farmId });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farm = view.entities.find(e => e.kind === 'building' && e.id === farmId).plot;
    const cow = view.entities.find(e => e.kind === 'cattle' && e.id === 'cattle-1');
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.plot || e.selectionKey === cow.selectionKey), view.ground);
    // The source geometry exposes a usable alcove inside the conservative rectangular proxy.
    motion.setYardSurface(cow.selectionKey, (x, z) =>
        Math.hypot(x - (farm.x - 2.2), z - (farm.z + 2.2)) < .35 ? farm.y + .1 : null);
    const actual = motion.inspect()[0];
    assert.ok(actual.walkable, 'Actual source floor and walls take precedence over the approximate house rectangle');
    assert.equal(actual.y, farm.y + .1);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
});


test('a growing calf can reclaim a safe yard slot by minimally separating its herd mates', () => {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000,
        cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0,
        cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 },
        quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const farmId = state.households[householdId].residenceId;
    for (const cattleId of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: farmId });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const calf = Object.values(state.landing.cattle).find(c => c.origin === 'reproduction');
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farm = view.entities.find(e => e.kind === 'building' && e.id === farmId).plot;
    const fixture = entities => entities.filter(e => e.plot ||
        e.selectionKey === 'cattle:cattle-1' || e.selectionKey === 'cattle:' + calf.id)
        .map(e => e.kind !== 'cattle' ? e : { ...e, transform: { ...e.transform,
            x: farm.x + (e.id === calf.id ? 5.6 : 4.1), z: farm.z } });
    const motion = new LivingWorldController(world);
    motion.reconcile(fixture(view.entities), view.ground);
    motion.setYardSurface('cattle:cattle-1', (x, z) => x >= farm.x + 3.5 &&
        x <= farm.x + 4.3 && Math.abs(z - farm.z) < .15 ? farm.y + .1 : null);
    motion.setYardSurface('cattle:' + calf.id, (x, z) =>
        Math.abs(x - farm.x - 5.6) < .05 && Math.abs(z - farm.z) < .15 ? farm.y + .1 : null);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(fixture(view.entities), view.ground);
    motion.setYardSurface('cattle:' + calf.id, (x, z) => x >= farm.x + 5.3 &&
        x <= farm.x + 5.5 && Math.abs(z - farm.z) < .15 ? farm.y + .1 : null);
    assert.equal(motion.inspectMetrics().outOfZone, 0, 'A bigger body still requires actual source support');
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0, 'Recovery must separate the whole affected herd');
    assert.equal(motion.inspect().length, 2, 'No animal can be hidden or reassigned to avoid recovery');
});


test('a returning outdoor identity cannot overlap a resident who retained that safe moving position', () => {
    const state = core.createCampaign(17, {}, quiet, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const first = view.entities.find(e => e.selectionKey === 'persona:founder-1');
    const other = view.entities.find(e => e.selectionKey === 'persona:founder-2');
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.selectionKey !== other.selectionKey), view.ground);
    motion.reconcile(view.entities.map(e => e !== other ? e : { ...e, transform: { ...first.transform } }), view.ground);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
    assert.ok(motion.inspect().find(a => a.key === other.selectionKey));
});
