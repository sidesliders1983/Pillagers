import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const core = load('../src/simulation/SimulationCore.ts');

function fixture() {
    const state = core.createCampaign(17, {}, { fertilityChanceBps: 0 }, { enabled: false });
    const world = generateWorld({ seed: 17 });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    const actors = [...motion.agents.values()];
    for (const actor of actors) {
        actor.wait = 1000; actor.visitDelay = 1000;
        motion.setSocialEnabled(actor.key, false);
    }
    return { state, world, view, motion, actor: actors.find(actor => actor.kind === 'persona') };
}

test('equivalent failed goals expire in active presentation time and never catch up while paused or hidden', () => {
    const { motion, actor, world, state } = fixture();
    const canonical = core.serializeState(state);
    const goal = { x: world.terrain.bounds.minX, z: world.terrain.bounds.minZ };
    assert.deepEqual(motion.route(actor, goal), []);
    assert.equal(motion.inspectMetrics().failedRouteReuse, 0);
    motion.route(actor, goal);
    assert.equal(motion.inspectMetrics().failedRouteReuse, 1);
    motion.advance(60, false, true); motion.advance(60, true, false);
    motion.route(actor, goal);
    assert.equal(motion.inspectMetrics().failedRouteReuse, 2);
    motion.advance(1, true, true);
    motion.route(actor, goal);
    assert.equal(motion.inspectMetrics().failedRouteReuse, 2, 'A one-second active TTL must permit a fresh search');
    assert.equal(core.serializeState(state), canonical);
});

test('obstacles, assignment, occupation, stage, targets and source-yard changes invalidate failed routes', () => {
    const { motion, actor, world, view } = fixture();
    const goal = { x: world.terrain.bounds.minX, z: world.terrain.bounds.minZ };
    const reject = () => { motion.route(actor, goal); motion.route(actor, goal); };
    reject();
    let expected = motion.inspectMetrics().failedRouteReuse;
    for (const change of [
        entities => { entities[0].status.occupation = 'fisher'; },
        entities => { entities[0].status.assignment = 'new-home'; },
        entities => { entities[0].status.stage = 'new-stage'; },
        entities => { entities.pop(); },
    ]) {
        const entities = structuredClone(view.entities);
        change(entities);
        motion.reconcile(entities, view.ground);
        reject();
        assert.equal(motion.inspectMetrics().failedRouteReuse, ++expected);
    }
    motion.setYardSurface(actor.key, () => actor.y, 'yard-v1');
    reject(); assert.equal(motion.inspectMetrics().failedRouteReuse, ++expected);
    motion.setYardSurface(actor.key, () => actor.y, 'yard-v1');
    motion.route(actor, goal); assert.equal(motion.inspectMetrics().failedRouteReuse, ++expected);
    motion.setYardSurface(actor.key, () => actor.y, 'yard-v2');
    reject(); assert.equal(motion.inspectMetrics().failedRouteReuse, ++expected);
    motion.setStandingTrees([{ key: 'new-tree', x: actor.x + 3, z: actor.z, clearance: 1 }]);
    reject(); assert.equal(motion.inspectMetrics().failedRouteReuse, ++expected);
});

test('moving neighbours and reservation changes retry occupied endpoints, and failure memory stays bounded', () => {
    const { motion, actor, world } = fixture();
    const other = [...motion.agents.values()].find(other => other !== actor);
    const goal = { x: other.x, z: other.z };
    assert.deepEqual(motion.route(actor, goal), []);
    motion.route(actor, goal);
    const reused = motion.inspectMetrics().failedRouteReuse;
    other.x += .1;
    motion.route(actor, goal);
    assert.equal(motion.inspectMetrics().failedRouteReuse, reused);
    motion.reservationGeneration++;
    motion.route(actor, goal);
    assert.equal(motion.inspectMetrics().failedRouteReuse, reused);
    for (let i = 0; i < 30; i++) motion.route(actor, { x: world.terrain.bounds.minX - i, z: world.terrain.bounds.minZ });
    assert.ok(actor.failedRoutes.size <= 8);
    motion.reconcile([], { plots: [], paths: [] });
    assert.equal(motion.inspectMetrics().agents, 0);
});

test('optimized routes keep dry segment clearance and allow valid movement after a failed destination', () => {
    const { motion, actor, world, state } = fixture();
    const canonical = core.serializeState(state);
    motion.reconcile([actor.entity], { plots: [], paths: [] });
    motion.route(actor, { x: world.terrain.bounds.minX, z: world.terrain.bounds.minZ });
    const wander = motion.route(actor);
    assert.ok(wander.length > 0);
    const goal = wander.at(-1), path = motion.route(actor, goal);
    assert.ok(path.length > 0);
    let previous = actor;
    for (const point of path) {
        assert.ok(motion.segment(actor, previous, point));
        assert.ok(motion.bodyClearance(actor, point, previous));
        previous = point;
    }
    const initial = { x: actor.x, z: actor.z };
    actor.path = path;
    for (let i = 0; i < 300; i++) motion.advance(.1, true, true);
    assert.ok(Math.hypot(actor.x - initial.x, actor.z - initial.z) > .5);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
    assert.equal(core.serializeState(state), canonical);
});



test('an arrived worker can follow its verified outbound corridor home without repeating a distant search', () => {
    const { motion, actor, state } = fixture();
    const canonical = core.serializeState(state);
    motion.reconcile([actor.entity], { plots: [], paths: [] });
    const start = { x: actor.x, z: actor.z }, outbound = motion.route(actor);
    assert.ok(outbound.length > 0);
    actor.homeTrail = [start, ...outbound.map(point => ({ ...point }))];
    actor.path = outbound;
    const destination = { ...outbound.at(-1) };
    for (let frame = 0; frame < 1500 && Math.hypot(actor.x - destination.x, actor.z - destination.z) > .15; frame++)
        motion.advance(.1, true, true);
    assert.ok(Math.hypot(actor.x - destination.x, actor.z - destination.z) < .15);
    const before = motion.inspectMetrics();
    actor.path = motion.route(actor, actor.anchor);
    assert.equal(motion.inspectMetrics().homeTrailReuse, before.homeTrailReuse + 1);
    assert.equal(motion.inspectMetrics().routeNodes, before.routeNodes, 'A verified corridor needs no second graph search');
    for (let frame = 0; frame < 1500 && Math.hypot(actor.x - start.x, actor.z - start.z) > .15; frame++)
        motion.advance(.1, true, true);
    assert.ok(Math.hypot(actor.x - start.x, actor.z - start.z) < .15);
    assert.equal(motion.inspectMetrics().bodyOverlaps, 0);
    assert.equal(motion.inspectMetrics().outOfZone, 0);
    assert.equal(core.serializeState(state), canonical);
    motion.reconcile([], { plots: [], paths: [] });
    assert.equal(motion.inspectMetrics().retainedHomeWaypoints, 0);
});

test('return corridors revalidate new obstacles and are released when the canonical home changes', () => {
    const { motion, actor, state, view } = fixture();
    const canonical = core.serializeState(state);
    motion.reconcile([actor.entity], { plots: [], paths: [] });
    const outbound = motion.route(actor);
    assert.ok(outbound.length > 4);
    actor.homeTrail = [{ x: actor.x, z: actor.z }, ...outbound.map(point => ({ ...point }))];
    actor.x = outbound.at(-1).x;
    actor.z = outbound.at(-1).z;
    assert.ok(motion.homeTrailPath(actor));
    const blocked = actor.homeTrail[Math.floor(actor.homeTrail.length / 2)];
    const obstacle = { ...actor.entity, kind: 'building', id: 'new-obstacle',
        selectionKey: 'building:new-obstacle',
        plot: { x: blocked.x, z: blocked.z, halfWidth: .5, halfDepth: .5 } };
    motion.reconcile([actor.entity, obstacle], { plots: [], paths: [] });
    assert.equal(motion.homeTrailPath(actor), null, 'A saved route cannot bypass a newly occupied static corridor');
    motion.reconcile([actor.entity], { plots: [], paths: [] });
    assert.ok(motion.homeTrailPath(actor));
    const moved = structuredClone(actor.entity);
    moved.transform.x += 1;
    motion.reconcile([moved], view.ground);
    assert.equal(actor.homeTrail.length, 0);
    assert.equal(core.serializeState(state), canonical);
});
