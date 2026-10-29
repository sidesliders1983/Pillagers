import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { loadDOMSource as load } from './load-dom-source.mjs';

const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const { GameplaySession } = load('../src/gameplay-lab/GameplaySession.ts');
const { spatialMemberPosition } = load('../src/simulation/SpatialExpeditions.ts');
const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
const world = {
    config: { seed: 32 }, placementPlan: [],
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
    navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
    settlement: { center: { x: 16, z: 64 }, harbor: null },
};
const fire = { transform: { x: 16, z: 100 }, obstacleRadius: 4.4, clearingRadius: 7 };
const models = {
    async create() {
        const root = new Group();
        root.add(new Mesh(new BoxGeometry(.6, 1.5, .6), new MeshBasicMaterial()));
        return root;
    },
    async reconcile() {}, boundsShape: () => 'fixed', pace: () => 1,
    animate(model, clip, speed) { model.userData.testClip = clip; model.userData.testSpeed = speed; },
    release(root) {
        root.traverse(node => { node.geometry?.dispose(); node.material?.dispose(); });
        return true;
    },
};
function departure() {
    const session = new GameplaySession(32);
    session.initializeDiscovery(world, 'travel-cadence-fixture');
    for (const command of [
        { type: 'CreateExplorationGroup' },
        { type: 'SetExplorationMember', groupId: 'group-1', personaId: 'founder-1', included: true },
        { type: 'StartExpedition', groupId: 'group-1' },
        { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } },
    ]) session.command(command);
    session.setRunning(true);
    return session;
}

test('expedition running has no repeated standstill between 500 ms updates of a 600 ms Core tick', async () => {
    const session = departure(), layer = new FjordEntities(models);
    const motion = new LivingWorldController(world, () => true, fire);
    const refresh = async () => {
        const state = session.readSnapshot(), mission = state.world.spatial.missions['explore-1'];
        layer.prepareExpeditions(state, world, .5,
            session.effectiveMinutesPerWinter * 60 / state.ticksPerWinter);
        const point = spatialMemberPosition(mission, 'founder-1');
        const entities = [{ kind: 'persona', id: 'founder-1', selectionKey: 'persona:founder-1',
            asset: 'resident', transform: { ...point, y: 0, scale: 1 },
            status: { living: true, expedition: mission.id } }];
        await layer.sync(entities);
        motion.reconcile(entities, { plots: [], paths: [] });
        layer.advance(motion, 0, false);
    };
    try {
        await refresh();
        const resident = layer.root.getObjectByName('persona:founder-1');
        let previous = resident.position.x, standstillFrames = 0;
        for (let frame = 1; frame <= 120; frame++) {
            layer.advance(motion, .1, true);
            if (frame > 20 && Math.abs(resident.position.x - previous) < 1e-6) standstillFrames++;
            const mission = session.readSnapshot().world.spatial.missions['explore-1'];
            assert.ok(resident.position.x <= spatialMemberPosition(mission, 'founder-1').x + 1e-6,
                'Presentation never predicts travel beyond the confirmed route position');
            previous = resident.position.x;
            if (frame % 5 === 0) { session.elapse(500); await refresh(); }
        }
        assert.equal(standstillFrames, 0, 'A running resident must keep progressing between ordinary clock batches');
        const before = session.saveJSON(), paused = resident.position.clone();
        layer.advance(motion, 3, false);
        assert.deepEqual(resident.position, paused, 'Pausing holds the displayed position');
        assert.equal(session.saveJSON(), before, 'Rendering cannot spend provisions or advance Core');
    } finally { layer.dispose(); }
});


test('arrived expedition members settle beside one another on known safe land without changing Core', async () => {
    const core = load('../src/simulation/SimulationCore.ts');
    const landscape = { ...world, placementPlan: [{ x: 216, z: 65.6, clearance: .5 }] };
    const context = { world: landscape, worldId: 'arrival-spacing-fixture' };
    let state = core.createCampaign(32, { initialFood: 500 }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, landscape, context.worldId);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts',
        memberIds: ['founder-1', 'founder-2', 'founder-3'] });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 216, z: 64 } }, context);
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 105 }, context);
    const layer = new FjordEntities(models), motion = new LivingWorldController(landscape, (x, z) => x <= 217, fire);
    const refresh = async (targetLayer = layer, targetMotion = motion) => {
        const mission = state.world.spatial.missions['explore-1'];
        targetLayer.prepareExpeditions(state, landscape, .5, .6, { known: (x, z) => x <= 217 });
        const entities = mission.memberIds.map(id => ({ kind: 'persona', id,
            selectionKey: 'persona:' + id, asset: 'resident',
            transform: { ...spatialMemberPosition(mission, id), y: 0, scale: 1 },
            status: { living: true, expedition: mission.id } }));
        await targetLayer.sync(entities);
        targetMotion.reconcile(entities, { plots: [], paths: [] });
        targetLayer.advance(targetMotion, 0, false);
    };
    const positions = () => ['founder-1', 'founder-2', 'founder-3'].map(id =>
        layer.root.getObjectByName('persona:' + id).position.clone());
    try {
        assert.equal(state.world.spatial.missions['explore-1'].status, 'Exploring');
        await refresh();
        const before = core.serializeState(state);
        for (let i = 0; i < 150; i++) {
            const previous = positions();
            layer.advance(motion, .1, true);
            for (const [index, p] of positions().entries()) {
                const actor = layer.root.getObjectByName('persona:founder-' + (index + 1));
                const speed = p.distanceTo(previous[index]) / .1;
                if (actor.userData.testClip === 'Walk' && speed > 1.5)
                    assert.ok(Math.abs(actor.userData.testSpeed - speed) < .01,
                        'Step-aside animation follows the actual walking speed');
                assert.ok(p.x <= 217, 'Standing slots cannot enter unexplored ground');
                assert.ok(Math.hypot(p.x - 216, p.z - 65.6) >= .85, 'A tree keeps its body clearance');
                assert.ok(Math.hypot(p.x - 216, p.z - 64) <= 5, 'Spacing stays local to the reached goal');
            }
            if (i % 5 === 0) await refresh();
        }
        const settled = positions();
        for (let i = 0; i < settled.length; i++) for (let j = i + 1; j < settled.length; j++)
            assert.ok(settled[i].distanceTo(settled[j]) >= 1.2, 'Residents must have distinct standing room');
        layer.advance(motion, 2, false);
        assert.deepEqual(positions(), settled, 'Pause holds formation');
        assert.equal(core.serializeState(state), before, 'Formation never changes discovery, routes, stocks or RNG');
        const loaded = new FjordEntities(models);
        try {
            const loadedMotion = new LivingWorldController(landscape, (x, z) => x <= 217, fire);
            await refresh(loaded, loadedMotion);
            for (let i = 0; i < 150; i++) loaded.advance(loadedMotion, .1, true);
            assert.deepEqual(loaded.describe().map(actor => actor.position),
                layer.describe().map(actor => actor.position), 'Loaded arrivals recover the same stable standing slots');
            assert.deepEqual(core.reconstructState(core.serializeState(state)), state);
        } finally { loaded.dispose(); }
        state = core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
        await refresh();
        assert.deepEqual(positions(), settled, 'Recall starts at the displayed standing position');
        for (let i = 0; i < 30; i++) {
            layer.advance(motion, .1, true);
            if (i % 5 === 4) {
                state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 1 }, context);
                await refresh();
            }
        }
        assert.ok(positions().every(p => p.x < 216), 'Every member joins the actual homeward route');
    } finally { layer.dispose(); }
});


for (const opposingCrew of [false, true]) test(`real expedition bodies keep clearance during ${opposingCrew ? 'crossing groups and home traffic' : 'departure, travel and arrival'}`, async t => {
    const core = load('../src/simulation/SimulationCore.ts');
    const landscape = { ...world, config: { seed: 32 }, placementPlan: [] };
    const context = { world: landscape, worldId: 'expedition-body-fixture' };
    const ids = ['founder-1', 'founder-2', 'founder-3'];
    const allIds = opposingCrew ? [...ids, 'founder-4', 'founder-5', 'founder-6'] : ids;
    let state = core.createCampaign(32, { initialFood: 500 }, {}, { enabled: false });
    state = core.initializePhysicalDiscovery(state, landscape, context.worldId);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Scouts', memberIds: ids });
    state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
    state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
        target: { x: 112, z: 64 }, origins: Object.fromEntries(ids.map((id, i) =>
            [id, { x: 16, z: 61 + i * 3 }])) }, context);
    if (opposingCrew) {
        state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Returning scouts',
            memberIds: ['founder-4', 'founder-5'] });
        state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-2' }, context);
        state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-2',
            target: { x: 8, z: 64 }, origins: { 'founder-4': { x: 64, z: 61 },
                'founder-5': { x: 64, z: 67 } } }, context);
    }
    const fire = { transform: { x: 16, z: 100 }, obstacleRadius: 4.4, clearingRadius: 7 };
    const motion = new LivingWorldController(landscape, () => true, fire), layer = new FjordEntities(models);
    const positions = () => allIds.map(id => layer.root.getObjectByName('persona:' + id).position.clone());
    const refresh = async () => {
        const entities = Object.values(state.world.spatial.missions).flatMap(mission =>
            mission.memberIds.map(id => ({ kind: 'persona', id, selectionKey: 'persona:' + id, asset: 'resident',
                transform: { ...spatialMemberPosition(mission, id), y: 0, scale: 1 },
                status: { living: true, expedition: mission.id } })));
        if (opposingCrew) entities.push({ kind: 'persona', id: 'founder-6', selectionKey: 'persona:founder-6',
            asset: 'resident', transform: { x: 40, z: 64, y: 0, rotation: 0, scale: 1 }, status: { living: true } });
        layer.prepareExpeditions(state, landscape, .5, .6);
        await layer.sync(entities);
        motion.reconcile(entities, { plots: [], paths: [] });
        layer.advance(motion, 0, false);
    };
    try {
        await refresh();
        let previous = positions(), ticks = 0, minimumDistance = Infinity, maximumStep = 0;
        for (let frame = 1; frame <= 2100; frame++) {
            if (frame === 1301) {
                state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1',
                    target: { x: 144, z: 88 } }, context);
                if (opposingCrew) state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-2',
                    target: { x: 40, z: 88 } }, context);
                const held = positions();
                await refresh();
                assert.deepEqual(positions(), held, 'A new order retains the existing collision bodies');
            }
            motion.advance(.05, true, true);
            layer.advance(motion, .05, true);
            const current = positions();
            for (let i = 0; i < current.length; i++) {
                maximumStep = Math.max(maximumStep, current[i].distanceTo(previous[i]));
                assert.ok(current[i].distanceTo(previous[i]) <= .4, 'No correction may teleport a resident');
                for (let j = i + 1; j < current.length; j++) {
                    const distance = current[i].distanceTo(current[j]);
                    minimumDistance = Math.min(minimumDistance, distance);
                    assert.ok(distance >= .96 - 1e-6, `Resident bodies overlap at frame ${frame}: ${i}/${j}`);
                }
            }
            previous = current;
            if (frame % 10 === 0) {
                const count = Math.floor(frame * .05 / .6) - ticks;
                ticks += count;
                state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: count }, context);
                const saved = core.serializeState(state);
                await refresh();
                assert.equal(core.serializeState(state), saved);
                for (let i = 0; i < allIds.length; i++)
                    assert.ok(positions()[i].distanceTo(previous[i]) < 1e-6,
                        'A Core reconciliation cannot snap a body through its neighbours');
            }
        }
        assert.equal(state.world.spatial.missions['explore-1'].status, 'Exploring');
        assert.ok(positions().slice(0, 3).every(p => Math.hypot(p.x - 144, p.z - 88) < 6), 'All members reach the destination');
        if (opposingCrew) assert.ok(positions().slice(3, 5).every(p => Math.hypot(p.x - 40, p.z - 88) < 6),
            'The opposing crew reaches its own destination without a deadlock');
        assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
        t.diagnostic(JSON.stringify({ frames: 2100, minimumDistance, maximumStep, opposingCrew }));
        const paused = positions();
        motion.advance(2, false, true); layer.advance(motion, 2, false);
        assert.deepEqual(positions(), paused);
    } finally { layer.dispose(); }
});
