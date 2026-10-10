import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const core = load('../src/simulation/SimulationCore.ts');
const quiet = {
    fertilityChanceBps: 0,
    partnershipChanceBps: 0,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }],
    careerReviewWinters: 0,
};
test('new campaigns release actual childcare after two Winters while saved five-Winter rules remain canonical', () => {
    let current = core.createSettlement(32, quiet);
    current = core.applyCommand(current, { type: 'AssignOccupation', personaId: 'liv', occupation: 'farmer' });
    assert.equal(current.mechanics.config.childcareWinters, 2);
    assert.equal(core.inspectWork(current, 'liv').reason, 'childcare');
    current = core.applyCommand(current, { type: 'AdvanceWinter' });
    assert.equal(core.inspectWork(current, 'liv').reason, 'childcare');
    const save = core.serializeState(current);
    current = core.applyCommand(current, { type: 'AdvanceWinter' });
    assert.equal(core.inspectWork(current, 'liv').reason, null);
    assert.equal(core.serializeState(core.applyCommand(core.reconstructState(save), { type: 'AdvanceWinter' })), core.serializeState(current));
    let legacy = core.createSettlement(32, { ...quiet, childcareWinters: 5 });
    legacy = core.applyCommand(legacy, { type: 'AssignOccupation', personaId: 'liv', occupation: 'farmer' });
    legacy = core.reconstructState(core.serializeState(legacy));
    for (let winter = 0; winter < 2; winter++)
        legacy = core.applyCommand(legacy, { type: 'AdvanceWinter' });
    assert.equal(legacy.mechanics.config.childcareWinters, 5);
    assert.equal(core.inspectWork(legacy, 'liv').reason, 'childcare');
});
test('outdoor projection hides young children and the actual caregiver without removing canonical identity', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createSettlement(32, quiet);
    const world = generateWorld({ seed: 32 });
    let layout = createFjordLayout(world);
    const project = () => {
        const saved = core.serializeState(state);
        const view = projectFjordSettlement(state, world, layout);
        layout = view.layout;
        assert.equal(core.serializeState(state), saved, 'Visibility cannot change gameplay.');
        return view;
    };
    let view = project();
    const child = view.entities.find(e => e.id === 'astrid');
    assert.equal(child.transform, null);
    assert.equal(child.status.indoorReason, 'young-child');
    assert.equal(view.entities.find(e => e.id === 'liv').transform, null);
    assert.equal(view.entities.find(e => e.id === 'liv').status.indoorReason, 'childcare');
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    assert.equal(project().entities.find(e => e.id === 'liv').transform, null);
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    assert.ok(project().entities.find(e => e.id === 'liv').transform);
    for (let winter = 0; winter < 2; winter++)
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
    assert.equal(project().entities.find(e => e.id === 'astrid').transform, null, 'Age four remains indoors.');
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = project();
    assert.equal(view.entities.find(e => e.id === 'astrid').status.age, 5);
    assert.ok(view.entities.find(e => e.id === 'astrid').transform, 'Age five has an outdoor agent.');
    assert.equal(state.personas.astrid.deathWinter, null);
    assert.deepEqual(projectFjordSettlement(core.reconstructState(core.serializeState(state)), world, layout), view);
});
test('transferring canonical care immediately exchanges indoor visibility between mother and actual donor', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(32, { initialFood: 10000, foundingCoupleChanceBps: 10000 }, { ...quiet, fertilityChanceBps: 10000 }, { enabled: false });
    for (const id of Object.keys(state.personas))
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: id, occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const birth = state.events.find(e => e.type === 'ChildBorn');
    assert.ok(birth);
    const mother = birth.details.parentIds.find(id => state.personas[id].dna.sex === 'female');
    const donor = Object.values(state.personas).find(p => p.id !== mother && p.dna.sex === 'female' && !core.isProvidingCare(state, p.id) && core.personaAge(state, p.id) >= 16).id;
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: donor, occupation: null });
    const world = generateWorld({ seed: 32 });
    let layout = createFjordLayout(world);
    const project = () => {
        const view = projectFjordSettlement(state, world, layout);
        layout = view.layout;
        return view.entities;
    };
    assert.equal(project().find(e => e.kind === 'persona' && e.id === mother).transform, null);
    state = core.applyCommand(state, { type: 'AssignCaregiver', motherId: mother, caregiverId: donor });
    assert.ok(project().find(e => e.kind === 'persona' && e.id === mother).transform);
    assert.equal(project().find(e => e.kind === 'persona' && e.id === donor).transform, null);
    state = core.reconstructState(core.serializeState(state));
    assert.equal(project().find(e => e.kind === 'persona' && e.id === donor).status.indoorReason, 'childcare');
    state = core.applyCommand(state, { type: 'AssignCaregiver', motherId: mother, caregiverId: null });
    assert.equal(project().find(e => e.kind === 'persona' && e.id === mother).transform, null);
    assert.ok(project().find(e => e.kind === 'persona' && e.id === donor).transform);
});
test('Farmyard capacity splits stable assigned identities into an inner herd and nearby overflow', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000,
        cattleBirthChanceBps: 10000, cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0,
        cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const farm = Object.keys(state.buildings)[0];
    for (const id of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId: id, farmyardId: farm });
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const cattle = () => view.entities.filter(e => e.kind === 'cattle');
    assert.equal(cattle().length, 5);
    const inside = cattle().filter(e => e.status.grazingZone === 'yard');
    const outside = cattle().filter(e => e.status.grazingZone === 'overflow');
    assert.equal(inside.length, 4);
    assert.equal(outside.length, 1);
    assert.deepEqual(inside.map(e => e.id), Object.keys(state.landing.cattle).sort().slice(0, 4));
    assert.ok(cattle().every(e => e.status.assignment === farm && e.status.sheltered && e.status.overcrowding === 1));
    const plot = view.entities.find(e => e.kind === 'building' && e.id === farm).plot;
    assert.ok(outside.every(e => Math.abs(e.transform.x - plot.x) > plot.halfWidth || Math.abs(e.transform.z - plot.z) > plot.halfDepth));
    assert.deepEqual(projectFjordSettlement(core.reconstructState(core.serializeState(state)), world, view.layout), view);
    state = core.applyCommand(state, { type: 'SlaughterCattle', cattleId: outside[0].id });
    view = projectFjordSettlement(state, world, view.layout);
    assert.equal(cattle().filter(e => e.status.grazingZone === 'overflow').length, 0);
    assert.equal(cattle().filter(e => e.status.grazingZone === 'yard').length, 4);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    view = projectFjordSettlement(state, world, view.layout);
    assert.ok(cattle().every(e => e.status.grazingZone === 'exposed' && e.status.assignment === null));
});
test('living agents move on dry routes with a separate repeatable clock and no canonical effects', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const state = core.createCampaign(17, {}, quiet, { enabled: false });
    const saved = core.serializeState(state);
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const surface = createBlueprintSurface(world);
    const first = new LivingWorldController(world);
    const repeat = new LivingWorldController(world);
    first.reconcile(view.entities, view.ground);
    repeat.reconcile(view.entities, view.ground);
    const initial = first.inspect();
    assert.equal(initial.length, 13);
    for (let frame = 0; frame < 300; frame++) {
        first.advance(.1, true, true);
        repeat.advance(.1, true, true);
        for (const agent of first.inspect()) {
            assert.ok(surface.surfaceHeightAt(agent.x, agent.z) > world.waterLevel + .2);
            assert.ok(surface.slopeAt(agent.x, agent.z) <= .55);
            assert.ok(Math.abs(agent.y - surface.surfaceHeightAt(agent.x, agent.z)) < 1e-6);
            assert.ok(view.entities.filter(e => e.plot).every(e => Math.abs(agent.x - e.plot.x) > e.plot.halfWidth + .6 || Math.abs(agent.z - e.plot.z) > e.plot.halfDepth + .6));
        }
    }
    assert.ok(first.inspect().some(agent => Math.hypot(agent.x - initial.find(a => a.key === agent.key).x, agent.z - initial.find(a => a.key === agent.key).z) > .5));
    assert.deepEqual(first.inspect(), repeat.inspect());
    assert.equal(core.serializeState(state), saved);
    const paused = first.inspect();
    first.advance(60, false, true);
    first.advance(60, true, false);
    assert.deepEqual(first.inspect(), paused);
    assert.equal(core.serializeState(core.applyCommand(state, { type: 'AdvanceWinter' })), core.serializeState(core.applyCommand(core.reconstructState(saved), { type: 'AdvanceWinter' })));
});
test('resident presentation reuses canonical DNA while age and stored names stay current', () => {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const state = core.createCampaign(17, {}, quiet, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    for (const entity of view.entities.filter(e => e.kind === 'persona')) {
        const canonical = state.personas[entity.id];
        assert.deepEqual(entity.dna, { ...canonical.dna, age: core.personaAge(state, entity.id) });
        assert.equal(entity.label, canonical.name);
        entity.dna.traits.agility = 0;
        assert.notEqual(canonical.dna.traits.agility, 0);
    }
});
test('reconciliation retains live positions across ticks and removes indoor, dead and absent agents', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createSettlement(32, quiet);
    const world = generateWorld({ seed: 32 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    for (let frame = 0; frame < 100; frame++)
        motion.advance(.1, true, true);
    const moved = motion.inspect();
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(view.entities, view.ground);
    assert.deepEqual(motion.inspect(), moved);
    for (let i = 0; i < 5; i++)
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(view.entities, view.ground);
    assert.ok(motion.inspect().some(a => a.key === 'persona:astrid'));
    assert.ok(motion.inspect().some(a => a.key === 'persona:liv'));
    // The controller receives only public presentation identities, never canonical mutation access.
    motion.reconcile(view.entities.filter(e => e.selectionKey !== 'persona:astrid'), view.ground);
    assert.ok(!motion.inspect().some(a => a.key === 'persona:astrid'));
});
test('overflow grazing remains within twenty metres of its farm even from a peripheral safe anchor', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, cattleBirthChanceBps: 10000,
        cattleMortalityYoungBps: 0, cattleMortalityAdultBps: 0, cattleMortalityOlderBps: 0, cattleMortalityOldBps: 0, cattleCrowdingBps: 0 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const id = Object.keys(state.buildings)[0];
    for (const cattleId of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: id });
    for (let i = 0; i < 5; i++)
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const world = generateWorld({ seed: 17 }), surface = createBlueprintSurface(world);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farm = view.entities.find(e => e.kind === 'building' && e.id === id).plot;
    const overflow = structuredClone(view.entities.find(e => e.status.grazingZone === 'overflow'));
    const parcels = view.entities.filter(e => e.plot);
    const boundary = Array.from({ length: 36 }, (_, i) => ({ x: farm.x + Math.cos(i * Math.PI / 18) * 19,
        z: farm.z + Math.sin(i * Math.PI / 18) * 19 })).find(p => surface.surfaceHeightAt(p.x, p.z) > world.waterLevel + .3 &&
        surface.slopeAt(p.x, p.z) < .5 && parcels.every(e => Math.abs(p.x - e.plot.x) > e.plot.halfWidth + 1 || Math.abs(p.z - e.plot.z) > e.plot.halfDepth + 1));
    assert.ok(boundary);
    overflow.transform = { ...overflow.transform, ...boundary, y: surface.surfaceHeightAt(boundary.x, boundary.z) };
    const motion = new LivingWorldController(world);
    motion.reconcile([...parcels, overflow], view.ground);
    for (let frame = 0; frame < 600; frame++) {
        motion.advance(.1, true, true);
        for (const a of motion.inspect())
            assert.ok(Math.hypot(a.x - farm.x, a.z - farm.z) <= 20, 'Overflow must not drift away from its farm');
    }
});
test('Farmyard deactivation drops source-floor confinement and returns cattle to exposed movement', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const farmId = Object.keys(state.buildings)[0];
    for (const cattleId of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId, farmyardId: farmId });
    const world = generateWorld({ seed: 17 });
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    const subset = () => view.entities.filter(e => e.plot || e.kind === 'cattle');
    const motion = new LivingWorldController(world);
    motion.reconcile(subset(), view.ground);
    const farm = view.entities.find(e => e.id === farmId && e.kind === 'building').plot;
    for (const cow of view.entities.filter(e => e.kind === 'cattle'))
        motion.setYardSurface(cow.selectionKey, (x, z) => Math.abs(x - farm.x) < farm.halfWidth && Math.abs(z - farm.z) < farm.halfDepth ? farm.y + .1 : null);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    view = projectFjordSettlement(state, world, view.layout);
    motion.reconcile(subset(), view.ground);
    const fresh = new LivingWorldController(world);
    fresh.reconcile(subset(), view.ground);
    for (let frame = 0; frame < 150; frame++) {
        motion.advance(.1, true, true);
        fresh.advance(.1, true, true);
    }
    assert.deepEqual(motion.inspect(), fresh.inspect(), 'Old yard samplers must not constrain exposed cattle');
});
test('a source yard floor hole relocates the initial presentation safely without changing canonical anchors', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const farm = Object.keys(state.buildings)[0];
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: farm });
    const world = generateWorld({ seed: 17 }), view = projectFjordSettlement(state, world, createFjordLayout(world));
    const cow = view.entities.find(e => e.kind === 'cattle' && e.id === 'cattle-1'), original = structuredClone(cow.transform);
    const saved = core.serializeState(state), motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setYardSurface(cow.selectionKey, (x, z) => Math.hypot(x - original.x, z - original.z) < .45 ? null : original.y + .1);
    const actual = motion.inspect().find(a => a.key === cow.selectionKey);
    assert.ok(Math.hypot(actual.x - original.x, actual.z - original.z) >= .45);
    assert.ok(Math.hypot(actual.x - original.x, actual.z - original.z) <= 3);
    assert.equal(actual.y, original.y + .1);
    assert.deepEqual(cow.transform, original);
    assert.equal(core.serializeState(state), saved);
});

test('an obstructed source anchor can recover to another safe part of the same actual yard', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const farmId = Object.keys(state.buildings)[0];
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: farmId });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farm = view.entities.find(e => e.kind === 'building' && e.id === farmId).plot;
    const cow = view.entities.find(e => e.kind === 'cattle' && e.id === 'cattle-1');
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setYardSurface(cow.selectionKey, (x, z) => x >= farm.x + 3.2 &&
        Math.abs(z - farm.z) < 1.5 ? farm.y + .1 : null);
    const actual = motion.inspect().find(a => a.key === cow.selectionKey);
    assert.ok(actual.x >= farm.x + 3.2, 'A blocked anchor must not leave cattle outside their source enclosure');
    assert.ok(Math.abs(actual.z - farm.z) < 1.5);
    assert.ok(Math.abs(actual.x - farm.x) < farm.halfWidth);
});

test('cattle can take short grounded steps inside narrow safe source-yard spaces', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    let state = core.createCampaign(17, { initialMaterials: 1000 }, quiet, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const householdId = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    const farmId = Object.keys(state.buildings)[0];
    state = core.applyCommand(state, { type: 'AssignCattle', cattleId: 'cattle-1', farmyardId: farmId });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farm = view.entities.find(e => e.kind === 'building' && e.id === farmId).plot;
    const cow = view.entities.find(e => e.kind === 'cattle' && e.id === 'cattle-1');
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.plot || e.selectionKey === cow.selectionKey), view.ground);
    motion.setYardSurface(cow.selectionKey, (x, z) => Math.hypot(x - farm.x - 3.2, z - farm.z) < .4 ? farm.y + .1 : null);
    const initial = motion.inspect()[0];
    let displacement = 0;
    for (let frame = 0; frame < 200; frame++) {
        motion.advance(.1, true, true);
        const actual = motion.inspect()[0];
        displacement = Math.max(displacement, Math.hypot(actual.x - initial.x, actual.z - initial.z));
        assert.ok(actual.walkable);
    }
    assert.ok(displacement > .1, 'A one-metre waypoint grid must not freeze a usable narrow grazing space');
});
