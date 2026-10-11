import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load-source.mjs';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');

function settlement() {
    const state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
        { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.kind !== 'cattle'), view.ground);
    return { state, view, motion };
}

test('canonical outdoor residents reserve Talk/Listen pairs for five active seconds without changing Core', () => {
    const { state, motion } = settlement();
    const saved = core.serializeState(state);
    let pair;
    for (let frame = 0; frame < 1800; frame++) {
        motion.advance(.1, true, true);
        const actors = motion.inspect();
        const talking = actors.find(a => a.state === 'Talk');
        if (talking) {
            pair = [talking, actors.find(a => a.key === talking.partnerKey)];
            break;
        }
    }
    assert.ok(pair, 'Roaming residents must use the existing Talk/Listen encounter behavior');
    assert.equal(pair[1].state, 'Listen');
    assert.equal(pair[1].partnerKey, pair[0].key);
    assert.ok(Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z) >= .96);
    const paused = motion.inspect();
    motion.advance(30, false, true);
    motion.advance(30, true, false);
    assert.deepEqual(motion.inspect(), paused);
    for (let frame = 0; frame < 40; frame++) motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.key === pair[0].key).partnerKey, pair[1].key);
    for (let frame = 0; frame < 12; frame++) motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.key === pair[0].key).partnerKey, null);
    assert.equal(core.serializeState(state), saved);
});

test('removing a reserved outdoor identity releases its partner immediately, including while paused', () => {
    const { view, motion } = settlement();
    let pair;
    for (let frame = 0; frame < 1800 && !pair; frame++) {
        motion.advance(.1, true, true);
        pair = motion.inspect().find(a => a.state === 'Talk');
    }
    assert.ok(pair);
    motion.reconcile(view.entities.filter(e => e.kind !== 'cattle' && e.selectionKey !== pair.key), view.ground);
    const partner = motion.inspect().find(a => a.key === pair.partnerKey);
    assert.equal(partner.partnerKey, null);
    assert.equal(partner.state, 'Idle', 'Removed identity must not leave a ghost talking/listening actor');
    motion.advance(60, false, true);
    assert.equal(motion.inspect().find(a => a.key === pair.partnerKey).state, 'Idle');
});

test('residents turn before resuming locomotion after a conversation and pass without body overlap', () => {
    const { motion } = settlement();
    let pair;
    for (let frame = 0; frame < 1800 && !pair; frame++) {
        motion.advance(.1, true, true);
        pair = motion.inspect().find(a => a.state === 'Talk');
    }
    assert.ok(pair);
    let travelled = 0;
    for (let frame = 0; frame < 1200; frame++) {
        const before = motion.inspect();
        motion.advance(.05, true, true);
        const after = motion.inspect();
        for (const key of after.map(a => a.key)) {
            const actor = after.find(a => a.key === key), old = before.find(a => a.key === key);
            const dx = actor.x - old.x, dz = actor.z - old.z;
            travelled += Math.hypot(dx, dz);
            if (Math.hypot(dx, dz) > 1e-7)
                assert.ok(dx * Math.sin(actor.rotation) + dz * Math.cos(actor.rotation) > 0,
                    'Residents cannot walk backwards while returning from the interaction');
        }
        for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++)
            assert.ok(Math.hypot(after[i].x - after[j].x, after[i].z - after[j].z) >= .96 - 1e-6);
    }
    assert.ok(travelled > .5, 'Conversation participants must resume walking');
});

test('an encounter retains the original navigation destination through release and nearby passing', () => {
    const { motion } = settlement();
    let talking;
    for (let frame = 0; frame < 1800 && !talking; frame++) {
        motion.advance(.1, true, true);
        talking = motion.inspect().find(a => a.state === 'Talk');
    }
    assert.ok(talking?.destination);
    assert.ok(Math.hypot(talking.x - talking.destination.x, talking.z - talking.destination.z) > 1);
    for (let frame = 0; frame < 55; frame++) motion.advance(.1, true, true);
    const resumed = motion.inspect().find(a => a.key === talking.key);
    assert.equal(resumed.partnerKey, null);
    assert.deepEqual(resumed.destination, talking.destination,
        'Conversation participants must not discard their destination when a neighbour obstructs resumption');
});

test('livestock plays its available twelve-second Graze clip in active time and retains canonical identity', () => {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const cattle = view.entities.find(e => e.kind === 'cattle');
    const motion = new LivingWorldController(world);
    const saved = core.serializeState(state);
    motion.reconcile([cattle], view.ground);
    motion.setActivityClips(cattle.selectionKey, { Graze: 12 });
    let grazing;
    for (let frame = 0; frame < 900 && !grazing; frame++) {
        motion.advance(.1, true, true);
        grazing = motion.inspect().find(a => a.state === 'Graze');
    }
    assert.ok(grazing, 'Available authored grazing must be selected instead of a generic Idle pause');
    const paused = motion.inspect();
    motion.advance(20, false, true);
    motion.advance(20, true, false);
    assert.deepEqual(motion.inspect(), paused);
    for (let frame = 0; frame < 115; frame++) motion.advance(.1, true, true);
    assert.equal(motion.inspect()[0].state, 'Graze');
    for (let frame = 0; frame < 7; frame++) motion.advance(.1, true, true);
    assert.notEqual(motion.inspect()[0].state, 'Graze');
    assert.ok(motion.inspect()[0].walkable);
    assert.equal(core.serializeState(state), saved);
});

test('a reachable outdoor resident and grazing animal share one six-second interaction then resume prior activity', () => {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const cow = view.entities.find(e => e.kind === 'cattle');
    const person = structuredClone(view.entities.find(e => e.kind === 'persona' && e.transform));
    const motion = new LivingWorldController(world);
    const saved = core.serializeState(state);
    motion.reconcile([cow], view.ground);
    motion.setActivityClips(cow.selectionKey, { Graze: 12, HumanInteraction: 6 });
    for (let frame = 0; frame < 900 && motion.inspect()[0].state !== 'Graze'; frame++)
        motion.advance(.1, true, true);
    const grazing = motion.inspect()[0];
    assert.equal(grazing.state, 'Graze');
    person.transform = { ...person.transform, x: grazing.x + 1.6, z: grazing.z, y: grazing.y };
    motion.reconcile([cow, person], view.ground);
    motion.advance(.1, true, true);
    const animals = motion.inspect(), interacting = animals.find(a => a.kind === 'cattle');
    const listening = animals.find(a => a.kind === 'persona');
    assert.equal(interacting.state, 'HumanInteraction');
    assert.equal(listening.state, 'Listen', 'Reuse the existing Cow preview human Listen behavior');
    assert.equal(interacting.partnerKey, listening.key);
    assert.equal(listening.partnerKey, interacting.key);
    assert.ok(interacting.walkable && listening.walkable);
    const paused = motion.inspect();
    motion.advance(10, false, true);
    motion.advance(10, true, false);
    assert.deepEqual(motion.inspect(), paused);
    for (let frame = 0; frame < 55; frame++) motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.kind === 'cattle').state, 'HumanInteraction');
    for (let frame = 0; frame < 7; frame++) motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.kind === 'cattle').state, 'Graze');
    assert.equal(motion.inspect().find(a => a.kind === 'persona').partnerKey, null);
    assert.equal(core.serializeState(state), saved);
});

test('a changed source enclosure interrupts both cattle and human reservations without moving canonical anchors', () => {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const cow = view.entities.find(e => e.kind === 'cattle');
    const person = structuredClone(view.entities.find(e => e.kind === 'persona' && e.transform));
    person.transform = { ...person.transform, x: cow.transform.x + 1.6, z: cow.transform.z };
    const motion = new LivingWorldController(world);
    motion.reconcile([cow, person], view.ground);
    motion.setActivityClips(cow.selectionKey, { Graze: 12, HumanInteraction: 6 });
    motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.kind === 'cattle').state, 'HumanInteraction');
    const original = structuredClone(cow.transform);
    const blocked = motion.inspect().find(a => a.kind === 'cattle');
    motion.setYardSurface(cow.selectionKey, (x, z) =>
        Math.hypot(x - blocked.x, z - blocked.z) < .45 ? null : blocked.y);
    assert.ok(motion.inspect().every(a => a.partnerKey === null), 'Confinement changes release both actors');
    assert.ok(motion.inspect().every(a => !['HumanInteraction', 'Listen'].includes(a.state)));
    assert.deepEqual(cow.transform, original);
});


test('a working farmer reaches real farm terrain, plays a short Farm activity and leaves without producing resources', () => {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
        { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const farmer = view.entities.find(e => e.selectionKey === 'persona:founder-1');
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.kind !== 'persona' || e.id === 'founder-1'), view.ground);
    motion.setOccupationClips(farmer.selectionKey, { Farm: 4 });
    const saved = core.serializeState(state);
    let activity;
    for (let frame = 0; frame < 2400 && !activity; frame++) {
        motion.advance(.1, true, true);
        activity = motion.inspect().find(a => a.state === 'Farm');
    }
    assert.ok(activity, 'An eligible farmer must arrive at a reachable spot near its actual farm');
    assert.equal(activity.partnerKey, null);
    assert.equal(activity.visit.phase, 'activity');
    assert.ok(Math.hypot(activity.x - activity.visit.target.x, activity.z - activity.visit.target.z) < .15);
    const paused = motion.inspect();
    motion.advance(30, false, true);
    assert.deepEqual(motion.inspect(), paused);
    for (let frame = 0; frame < 50; frame++) motion.advance(.1, true, true);
    assert.notEqual(motion.inspect().find(a => a.key === farmer.selectionKey).state, 'Farm');
    assert.equal(core.serializeState(state), saved);
});


test('a woodworker reaches a standing tree, uses one Attack cycle, and cancels a removed target', () => {
    let state = core.createCampaign(17, { initialFood: 10000 }, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-5', occupation: 'woodworker' });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setOccupationClips('persona:founder-5', { Attack: 1.5 });
    const trees = world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId))
        .map(p => ({ key: p.assetId + '@' + p.x + ',' + p.z, x: p.x, z: p.z, clearance: p.clearance }));
    motion.setStandingTrees(trees);
    let chopping;
    for (let frame = 0; frame < 3000 && !chopping; frame++) {
        motion.advance(.1, true, true);
        chopping = motion.inspect().find(a => a.state === 'Attack');
    }
    assert.ok(chopping, 'An eligible woodworker arrives beside a standing tree');
    const tree = trees.find(t => t.key === chopping.visit.source);
    assert.ok(tree);
    assert.ok(Math.hypot(chopping.x - tree.x, chopping.z - tree.z) > tree.clearance);
    assert.equal(chopping.partnerKey, null);
    motion.setStandingTrees(trees.filter(t => t.key !== tree.key));
    assert.equal(motion.inspect().find(a => a.key === chopping.key).visit, null);
    assert.equal(motion.inspect().find(a => a.key === chopping.key).state, 'Idle');
});


test('a fisher visits dry water frontage with an explicit missing-Doze fallback without changing canonical state', () => {
    let state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: 'fisher' });
    const world = generateWorld({ seed: 17 });
    const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
    const surface = createBlueprintSurface(world);
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const fisher = structuredClone(view.entities.find(e => e.selectionKey === 'persona:founder-2'));
    // Public presentation fixture: shore resident, no invented Core economic command.
    const coast = world.coast[0], x = (coast.a.x + coast.b.x) / 2, z = (coast.a.z + coast.b.z) / 2;
    let dry;
    for (let dx = -5; dx <= 5 && !dry; dx++) for (let dz = -5; dz <= 5 && !dry; dz++)
        if (surface.surfaceHeightAt(x + dx, z + dz) > world.waterLevel + .3 &&
            surface.slopeAt(x + dx, z + dz) < .4) dry = { x: x + dx, z: z + dz };
    assert.ok(dry);
    fisher.transform = { ...fisher.transform, ...dry, y: surface.surfaceHeightAt(dry.x, dry.z) };
    const motion = new LivingWorldController(world);
    motion.reconcile([fisher], { plots: [], paths: [] });
    let visit;
    for (let frame = 0; frame < 3000 && !visit; frame++) {
        motion.advance(.1, true, true);
        visit = motion.inspect().find(a => a.visit?.phase === 'activity');
    }
    assert.ok(visit, 'Fisher reaches an accessible dry shore approach');
    assert.match(visit.visit.source, /^shore:/);
    assert.equal(visit.state, 'Idle', 'Missing Doze binding must not fabricate another clip');
    assert.ok(surface.surfaceHeightAt(visit.x, visit.z) > world.waterLevel + .2);
    assert.ok(motion.diagnostics.some(reason => /Doze/.test(reason)));
});


test('hunter visits pause at a forest edge, then return home; independent visits preserve deterministic Core replay', () => {
    let state = core.createCampaign(17, { initialFood: 10000 }, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-5', occupation: 'hunter' });
    const saved = core.serializeState(state), world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const trees = world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId))
        .map(p => ({ key: p.assetId + '@' + p.x + ',' + p.z, x: p.x, z: p.z, clearance: p.clearance }));
    const a = new LivingWorldController(world), b = new LivingWorldController(world);
    for (const motion of [a, b]) { motion.reconcile(view.entities, view.ground); motion.setStandingTrees(trees); }
    let sawActivity = false, sawReturn = false;
    for (let frame = 0; frame < 3000; frame++) {
        a.advance(.1, true, true); b.advance(.1, true, true);
        const hunter = a.inspect().find(p => p.key === 'persona:founder-5');
        if (hunter.visit?.phase === 'activity') {
            sawActivity = true;
            assert.equal(hunter.state, 'Idle');
            assert.equal(hunter.partnerKey, null);
            assert.ok(trees.some(t => t.key === hunter.visit.source));
        }
        if (sawActivity && hunter.visit?.phase === 'home') sawReturn = true;
    }
    assert.ok(sawActivity && sawReturn);
    assert.deepEqual(a.inspect(), b.inspect());
    assert.equal(core.serializeState(state), saved);
    const ticks = { type: 'AdvanceTicks', ticks: 1000 };
    assert.deepEqual(core.applyCommand(state, ticks), core.applyCommand(core.reconstructState(saved), ticks));
});

test('loss of an occupation clip releases an active work visit immediately, even while paused', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 }, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const world = generateWorld({ seed: 17 }), layout = createFjordLayout(world);
    let view = projectFjordSettlement(state, world, layout);
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setOccupationClips('persona:founder-1', { Farm: 4 });
    for (let frame = 0; frame < 2400 && motion.inspect().find(a => a.key === 'persona:founder-1').state !== 'Farm'; frame++)
        motion.advance(.1, true, true);
    assert.equal(motion.inspect().find(a => a.key === 'persona:founder-1').state, 'Farm');
    motion.setOccupationClips('persona:founder-1', {});
    assert.equal(motion.inspect().find(a => a.key === 'persona:founder-1').visit, null);
    assert.equal(motion.inspect().find(a => a.key === 'persona:founder-1').state, 'Idle');
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    view = projectFjordSettlement(state, world, layout);
    motion.reconcile(view.entities, view.ground);
    assert.ok(motion.inspect().every(a => a.partnerKey === null || motion.inspect().some(b => b.key === a.partnerKey)));
});


test('a founding fisher can actually reach the local coast from its canonical home exterior', () => {
    let state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: 'fisher' });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.kind !== 'persona' || e.id === 'founder-2'), view.ground);
    let arrived;
    for (let frame = 0; frame < 3600 && !arrived; frame++) {
        motion.advance(.1, true, true);
        arrived = motion.inspect().find(a => a.visit?.phase === 'activity');
    }
    assert.ok(arrived, 'Local occupation adapter must connect the real home to accessible water frontage');
    assert.match(arrived.visit.source, /^shore:/);
    assert.ok(arrived.walkable);
});


test('occupation changes cancel a visit without teleporting the outdoor resident back to its spawn', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 }, { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const world = generateWorld({ seed: 17 }), layout = createFjordLayout(world);
    let view = projectFjordSettlement(state, world, layout);
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setOccupationClips('persona:founder-1', { Farm: 4 });
    for (let frame = 0; frame < 2400 && motion.inspect().find(a => a.key === 'persona:founder-1').state !== 'Farm'; frame++)
        motion.advance(.1, true, true);
    const before = motion.inspect().find(a => a.key === 'persona:founder-1');
    assert.equal(before.state, 'Farm');
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    view = projectFjordSettlement(state, world, layout);
    motion.reconcile(view.entities, view.ground);
    const after = motion.inspect().find(a => a.key === before.key);
    assert.equal(after.visit, null);
    assert.deepEqual([after.x, after.y, after.z], [before.x, before.y, before.z]);
    assert.equal(after.state, 'Idle');
});


test('an occupation trip that cannot make timely progress releases its target and takes a break', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 },
        { fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    const home = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id;
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities.filter(e => e.kind !== 'cattle' &&
        (e.kind !== 'persona' || e.id === 'founder-1')), view.ground);
    motion.setOccupationClips('persona:founder-1', { Farm: 4 });
    motion.setPace('persona:founder-1', .001);
    for (let second = 0; second < 60 && !motion.inspect()[0].visit; second++)
        motion.advance(1, true, true);
    assert.equal(motion.inspect()[0].visit?.phase, 'approach');
    let released = false;
    for (let second = 0; second < 600 && !released; second++) {
        motion.advance(1, true, true);
        released = motion.inspect()[0].visit === null;
    }
    assert.ok(released, 'A blocked trip must not retain an occupation target indefinitely');
    assert.equal(motion.inspect()[0].partnerKey, null);
});


test('a fisher in a built-up mixed settlement reaches shore after passing around other actors and the farm', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000 },
        { fertilityChanceBps: 0 }, { enabled: false });
    for (const [personaId, occupation] of [['founder-1', 'farmer'], ['founder-2', 'fisher'],
        ['founder-5', 'woodworker'], ['founder-4', 'hunter']])
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation });
    state = core.applyCommand(state, { type: 'BuildHouse',
        householdId: Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id });
    const world = generateWorld({ seed: 17, conifers: 'ez-tree' });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    for (const dt of [1 / 30, .073, .1, 1]) {
        const motion = new LivingWorldController(world);
        motion.reconcile(view.entities, view.ground);
        for (const entity of view.entities.filter(e => e.kind === 'persona'))
            motion.setOccupationClips(entity.selectionKey, { Farm: 4, Attack: 3, Doze: 18 });
        motion.setStandingTrees(world.placementPlan.filter(p => /conifer|deciduous/.test(p.assetId))
            .map(p => ({ key: p.assetId + '@' + p.x + ',' + p.z, x: p.x, z: p.z, clearance: p.clearance })));
        for (const entity of view.entities.filter(e => e.kind === 'persona'))
            motion.setPace(entity.selectionKey, 1.1);
        let arrived;
        for (let frame = 0; frame < 400 / dt && !arrived; frame++) {
            motion.advance(dt, true, true);
            arrived = motion.inspect().find(a => a.key === 'persona:founder-2' && a.state === 'Doze');
        }
        assert.ok(arrived, 'A passing detour around the farm must not permanently lose the valid shore trip');
        assert.ok(arrived.walkable);
    }
});


test('a busy settlement does not spend the whole first shore trip circling a passing neighbour', () => {
    let state = core.createCampaign(17, { initialMaterials: 1000, initialFood: 10000 },
        { fertilityChanceBps: 0, careerReviewWinters: 0,
            mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    for (const [personaId, occupation] of [['founder-1', 'farmer'], ['founder-2', 'fisher'],
        ['founder-5', 'woodworker'], ['founder-4', 'hunter']])
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId, occupation });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId:
        Object.values(state.households).find(h => h.memberIds.includes('founder-1')).id });
    const world = generateWorld({ seed: 17, conifers: 'ez-tree' });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    // Recorded native walking paces from the seed-17 source bodies, not a uniform crowd.
    const paces = [1.1142194036955182, 1.0972167413849556, 1.1069034339178552,
        1.2556870756945762, 1.1404182151630784, 1.1629225761834798,
        1.1741939995215438, 1.1619461043054875, 1.1345084803796086, 1.132162320909915];
    const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
    for (const entity of view.entities.filter(e => e.kind === 'persona')) {
        const index = Number(entity.id.split('-')[1]) - 1;
        const cadence = universalHumanProfile(entity.dna).motion.cadence;
        motion.setPace(entity.selectionKey, paces[index]);
        motion.setOccupationClips(entity.selectionKey, { Farm: 4.708333492279053 / cadence,
            Attack: 2.8333332538604736 / cadence, Doze: 16.7 / cadence });
    }
    for (const entity of view.entities.filter(e => e.kind === 'cattle')) {
        motion.setSocialEnabled(entity.selectionKey, false);
        motion.setPace(entity.selectionKey, .35);
        motion.setActivityClips(entity.selectionKey, { Graze: 12, HumanInteraction: 6 });
    }
    motion.setStandingTrees(JSON.parse(readFileSync(new URL(
        './fixtures/fjord-mixed-standing-trees.json', import.meta.url))));
    const fisher = () => motion.inspect().find(a => a.key === 'persona:founder-2');
    for (let second = 0; second < 180 && !fisher().visit; second++) motion.advance(1, true, true);
    assert.equal(fisher().visit?.phase, 'approach');
    let reached = false;
    for (let second = 0; second < 400 && fisher().visit; second++) {
        motion.advance(1, true, true);
        reached = fisher().state === 'Doze';
        if (reached) break;
    }
    assert.ok(reached, 'Replan a stalled passing detour while retaining the valid shore target');
    assert.ok(fisher().walkable);
});

test('founding cattle blocked by their herd resume grazing without losing body clearance', () => {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    const cattle = view.entities.filter(e => e.kind === 'cattle');
    motion.reconcile(cattle, view.ground);
    for (const cow of cattle) motion.setActivityClips(cow.selectionKey, { Graze: 12 });
    const grazing = new Set();
    for (let frame = 0; frame < 1800; frame++) {
        motion.advance(.1, true, true);
        const herd = motion.inspect();
        if (frame > 600) for (const cow of herd) if (cow.state === 'Graze') grazing.add(cow.key);
        assert.ok(herd.every(cow => cow.walkable));
        for (let i = 0; i < herd.length; i++) for (let j = i + 1; j < herd.length; j++)
            assert.ok(Math.hypot(herd[i].x - herd[j].x, herd[i].z - herd[j].z) >= 1.8 - 1e-6);
    }
    assert.equal(grazing.size, cattle.length, 'A herd obstruction must not leave cattle stuck in Idle forever');
});
