import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { load } from './load-source.mjs';

const { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } =
    createRequire(import.meta.url)('three');
const { InstancedMesh } = createRequire(import.meta.url)('three');
const { measureBuildEnvelope, unionBuildEnvelope, housingConstructionProfiles } =
    load('../src/construction/BuildEnvelope.ts');
const { generateScaffold } = load('../src/construction/ScaffoldGenerator.ts');
const { ConstructionTransitions, constructionDuration } = load('../src/construction/ConstructionTransition.ts');
const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');

function house(asset = 'hut', width = 5, height = 4, depth = 4) {
    const root = new Group(), body = new Group();
    body.name = asset;
    const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshStandardMaterial());
    mesh.position.y = height / 2;
    body.add(mesh); root.add(body);
    root.userData.asset = asset;
    root.userData.buildEnvelope = measureBuildEnvelope(root, asset);
    return root;
}
function advance(transitions, seconds) {
    for (let i = 0; i < Math.ceil(seconds * 100); i++) transitions.update(.01);
}
function disposeHouse(root) {
    root.traverse(node => {
        if (!(node instanceof Mesh)) return;
        node.geometry.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    });
}

test('a standing scaffold retains instance matrices and uploads again only when dismantling starts', () => {
    const transitions = new ConstructionTransitions(), target = house('greatHall', 13, 7, 8);
    transitions.play('site', target); advance(transitions, 1.2);
    let writes = 0;
    const original = InstancedMesh.prototype.setMatrixAt;
    InstancedMesh.prototype.setMatrixAt = function (...args) {
        if (this.geometry.type !== 'OctahedronGeometry') writes++;
        return original.apply(this, args);
    };
    try {
        for (let frame = 0; frame < 40; frame++) transitions.update(1 / 60);
        assert.equal(writes, 0, 'A standing frame is static while the house reveal/fade runs');
        advance(transitions, .7);
        assert.ok(writes > 0, 'Dismantling still updates the instance transforms');
    } finally {
        InstancedMesh.prototype.setMatrixAt = original;
        transitions.dispose(); disposeHouse(target);
    }
});

test('all house types expose metric envelopes; farm fences and world placement do not inflate them', () => {
    for (const asset of Object.keys(housingConstructionProfiles)) {
        const root = house(asset), yard = new Mesh(new BoxGeometry(20, .1, 20));
        yard.name = 'farmHutTerrain'; root.add(yard);
        root.position.set(200, 45, -100); root.rotation.y = 1.3;
        const envelope = measureBuildEnvelope(root, asset);
        assert.ok(Math.abs(envelope.footprint[1].x - envelope.footprint[0].x - 5) < 1e-8);
        assert.ok(Math.abs(envelope.ridgeHeight - 4) < 1e-8);
        assert.ok(envelope.eaveHeight > 0 && envelope.eaveHeight < envelope.ridgeHeight);
        assert.equal(envelope.scaffoldPreset, ['longhouse', 'greatHall'].includes(asset) ? 'heavy' : 'light');
        disposeHouse(root);
    }
});

test('upgrade envelope contains old and target bounds after a rotation and footprint expansion', () => {
    const old = house('hut', 6), target = house('homestead', 9, 5, 7);
    const transform = new Matrix4().makeRotationY(.8).setPosition(new Vector3(3, -.2, 1));
    const envelope = unionBuildEnvelope(target.userData.buildEnvelope, old.userData.buildEnvelope, transform);
    const box = new Box3();
    for (const point of envelope.footprint) {
        box.expandByPoint(new Vector3(point.x, envelope.baseHeight, point.z));
        box.expandByPoint(new Vector3(point.x, envelope.ridgeHeight, point.z));
    }
    for (const point of old.userData.buildEnvelope.footprint)
        for (const y of [0, 4]) assert.ok(box.containsPoint(new Vector3(point.x, y, point.z).applyMatrix4(transform)));
    assert.ok(box.containsPoint(new Vector3(4.5, 5, 3.5)));
    disposeHouse(old); disposeHouse(target);
});

test('generator adapts both presets with deterministic irregular posts, sparse braces, planks and one ladder', () => {
    for (const [asset, width, height] of [['hut', 5, 4], ['greatHall', 13, 7]]) {
        const root = house(asset, width, height, 8);
        const envelope = root.userData.buildEnvelope;
        const plan = generateScaffold(envelope);
        assert.deepEqual(plan, generateScaffold(envelope));
        for (const role of ['post', 'ledger', 'brace', 'platform', 'ladder', 'material', 'lashing'])
            assert.ok(plan.parts.some(part => part.role === role), role);
        const posts = plan.parts.filter(part => part.role === 'post');
        assert.ok(new Set(posts.map(part => part.width)).size > 3, 'Timber is not machine-uniform');
        assert.ok(plan.parts.filter(part => part.role === 'brace').length < posts.length * 2);
        assert.ok(plan.parts.length < 400, 'A large house remains a bounded, instanced frame');
        for (const part of plan.parts) {
            assert.ok(part.length > 0 && Number.isFinite(part.length));
            assert.ok(part.start.toArray().every(Number.isFinite));
        }
        assert.equal(plan.parts.filter(part => part.role === 'ladder' && part.length > 1).length, 2);
        disposeHouse(root);
    }
});

test('new build reveals bottom to top, restores source materials and frees temporary instance buffers', () => {
    const transitions = new ConstructionTransitions(), target = house();
    const mesh = target.children[0].children[0], source = mesh.material;
    let sharedGeometryDisposals = 0, bufferDisposals = 0, clipDisposals = 0;
    transitions.play('home', target);
    assert.notEqual(mesh.material, source);
    const clip = mesh.material;
    clip.addEventListener('dispose', () => clipDisposals++);
    transitions.root.traverse(node => {
        if (!node.isInstancedMesh) return;
        node.addEventListener('dispose', () => bufferDisposals++);
        node.geometry.addEventListener('dispose', () => sharedGeometryDisposals++);
        assert.equal(node.raycast(), undefined, 'Scaffold cannot intercept building selection');
    });
    assert.ok(clip.clippingPlanes[0].distanceToPoint(new Vector3(0, 2, 0)) < 0);
    advance(transitions, 1.5);
    const halfway = clip.clippingPlanes[0].constant;
    assert.ok(halfway > 1 && halfway < 4);
    advance(transitions, 2);
    assert.deepEqual(transitions.inspect(), []);
    assert.equal(transitions.root.children.length, 0);
    assert.equal(mesh.material, source);
    assert.equal(target.visible, true);
    assert.equal(clipDisposals, 1);
    assert.ok(bufferDisposals >= 4);
    assert.equal(sharedGeometryDisposals, 0, 'Shared resources survive individual transitions');
    transitions.dispose(); disposeHouse(target);
});

test('upgrade builds the target bottom-to-top while fading the old model, then restores both owners', () => {
    const transitions = new ConstructionTransitions(), old = house(), target = house('homestead', 9, 5, 7);
    const oldMesh = old.children[0].children[0], targetMesh = target.children[0].children[0];
    const oldSource = oldMesh.material, targetSource = targetMesh.material;
    let releases = 0;
    transitions.play('home', target, old, () => {
        assert.equal(oldMesh.material, oldSource, 'Restore source bindings before releasing their owner');
        releases++;
    });
    assert.equal(old.visible, true); assert.equal(target.visible, false);
    assert.equal(oldMesh.material.transparent, oldSource.transparent);
    assert.equal(oldMesh.material.depthWrite, oldSource.depthWrite);
    advance(transitions, 1);
    assert.equal(releases, 0); assert.equal(target.visible, false);
    advance(transitions, .5);
    assert.equal(releases, 0, 'Old geometry remains alive for the entire fade');
    assert.equal(old.visible, true); assert.equal(target.visible, true);
    assert.ok(Math.abs(oldMesh.material.opacity - .5) < 1e-8);
    assert.ok(Math.abs(targetMesh.material.opacity - .5) < 1e-8);
    const plane = targetMesh.material.clippingPlanes[0];
    assert.ok(plane.distanceToPoint(new Vector3(0, 1, 0)) > 0, 'Target foundation is already revealed');
    assert.ok(plane.distanceToPoint(new Vector3(0, 4.8, 0)) < 0, 'Target roof is still being built');
    assert.ok(oldMesh.material.transparent && targetMesh.material.transparent);
    assert.equal(oldMesh.material.depthWrite, false);
    assert.equal(oldSource.opacity, 1); assert.equal(targetSource.opacity, 1);
    assert.ok(Math.abs(transitions.inspect()[0].fadeProgress - .5) < 1e-8);
    advance(transitions, .5);
    assert.equal(releases, 1); assert.equal(old.visible, false); assert.equal(target.visible, true);
    assert.equal(oldMesh.material, oldSource);
    assert.notEqual(targetMesh.material, targetSource, 'Roof reveal outlives the old model fade');
    assert.equal(targetMesh.material.transparent, targetSource.transparent);
    assert.equal(targetMesh.material.opacity, targetSource.opacity);
    assert.ok(plane.distanceToPoint(new Vector3(0, 5, 0)) < 0);
    advance(transitions, .1);
    assert.ok(plane.distanceToPoint(new Vector3(0, 5, 0)) > 0, 'Roof is complete before scaffold dismantling');
    assert.ok(transitions.inspect()[0].drawCalls <= 5);
    advance(transitions, constructionDuration);
    transitions.finish('home'); transitions.dispose();
    assert.equal(targetMesh.material, targetSource);
    assert.equal(releases, 1);
    disposeHouse(old); disposeHouse(target);
});

test('a bespoke occupational building uses its metadata and target height independently of an older larger envelope', () => {
    const transitions = new ConstructionTransitions();
    const old = house('greatHall', 12, 9, 8), target = house('blacksmith-workshop', 7, 5, 6);
    target.position.y = 12; target.scale.setScalar(1.5);
    const metadata = target.userData.buildEnvelope;
    metadata.scaffoldPreset = 'heavy'; metadata.materialProfile = 'timber';
    const before = structuredClone(metadata);
    const mesh = target.children[0].children[0], source = mesh.material;
    transitions.play('smith', target, old);
    advance(transitions, 1.525);
    const plane = mesh.material.clippingPlanes[0];
    // Half of the fitted target (12m foundation, 19.5m ridge), rather than the old/new union.
    assert.ok(Math.abs(plane.constant - 15.75) < .04);
    assert.ok(plane.distanceToPoint(new Vector3(0, 13, 0)) > 0);
    assert.ok(plane.distanceToPoint(new Vector3(0, 19, 0)) < 0);
    assert.equal(transitions.inspect()[0].preset, 'heavy');
    assert.deepEqual(metadata, before, 'The shared animation cannot change occupational building metadata');
    transitions.finish('smith');
    assert.equal(mesh.material, source);
    transitions.dispose(); disposeHouse(old); disposeHouse(target);
});

test('interrupted fades restore material arrays, authored opacity and seasonal hooks without shared mutation', () => {
    const transitions = new ConstructionTransitions(), old = house(), target = house('homestead');
    const mesh = target.children[0].children[0], first = mesh.material;
    first.opacity = .4;
    const hook = () => {}, key = () => 'seasonal-source';
    first.onBeforeCompile = hook; first.customProgramCacheKey = key;
    const second = first.clone(); second.opacity = .8; second.alphaTest = .5;
    const originals = [first, second]; mesh.material = originals;
    let disposed = 0, released = 0;
    transitions.play('home', target, old, () => released++);
    assert.equal(mesh.material[0].onBeforeCompile, hook);
    assert.equal(mesh.material[0].customProgramCacheKey(), 'seasonal-source');
    mesh.material.forEach(material => material.addEventListener('dispose', () => disposed++));
    advance(transitions, 1.5);
    assert.ok(Math.abs(mesh.material[0].opacity - .2) < 1e-8);
    assert.ok(Math.abs(mesh.material[1].opacity - .4) < 1e-8);
    assert.ok(Math.abs(mesh.material[1].alphaTest - .25) < 1e-8);
    assert.equal(first.opacity, .4); assert.equal(second.opacity, .8);
    assert.equal(second.alphaTest, .5);
    transitions.finish('home'); transitions.finish('home');
    assert.equal(mesh.material, originals);
    assert.equal(disposed, 2); assert.equal(released, 1); assert.equal(target.visible, true);
    assert.equal(first.transparent, false); assert.equal(first.depthWrite, true);
    transitions.dispose(); disposeHouse(old); disposeHouse(target);
});

test('concurrent builds reuse geometry/materials and rapid replacement or teardown cleans every owner', () => {
    const transitions = new ConstructionTransitions(), roots = [house(), house('homestead'), house('greatHall')];
    let released = 0;
    transitions.play('a', roots[0]); transitions.play('b', roots[1]);
    const first = transitions.root.children[0].children[0], second = transitions.root.children[1].children[0];
    assert.equal(first.geometry, second.geometry); assert.equal(first.material, second.material);
    transitions.play('a', roots[2], roots[0], () => released++);
    assert.equal(transitions.inspect().length, 2);
    transitions.dispose();
    assert.equal(released, 1); assert.equal(transitions.root.children.length, 0);
    assert.ok(roots.every(root => root.visible));
    for (const root of roots) disposeHouse(root);
});

test('canonical build/upgrade sync triggers once, loaded houses and occupation changes remain silent', async () => {
    const roots = [], releases = [];
    const models = {
        async create(entity) { const root = house(entity.asset); roots.push(root); return root; },
        async reconcile() {}, boundsShape() {}, release(root) { releases.push(root); return false; }
    };
    const entity = (level, asset = ['hut', 'homestead', 'longhouse'][level]) => ({
        id: 'house-1', kind: 'building', selectionKey: 'building:house-1', label: 'Home', asset,
        transform: { x: 0, y: 0, z: 0, rotation: .6, scale: 1 },
        plot: { halfWidth: 8, halfDepth: 8 }, status: { living: true, level }
    });
    const layer = new FjordEntities(models);
    await layer.sync([entity(0)]);
    assert.deepEqual(layer.inspectConstruction(), [], 'Restored homes do not rebuild');
    await layer.sync([entity(1)]);
    assert.equal(layer.inspectConstruction().length, 1);
    layer.select([{ selectionKey: 'building:house-1', role: 'selected' }]);
    layer.select([]);
    assert.equal(layer.inspectConstruction().length, 1, 'Closing selection must not finish construction');
    for (let i = 0; i < 4; i++) await layer.sync([entity(1)]);
    assert.equal(layer.inspectConstruction()[0].time, 0, 'Unchanged snapshots cannot replay or advance the transition');
    for (let i = 0; i < 40; i++) layer.updateConstruction(.1);
    assert.equal(releases.length, 1);
    assert.deepEqual(layer.inspectConstruction(), []);
    await layer.sync([entity(1, 'farmHomestead')]);
    assert.deepEqual(layer.inspectConstruction(), [], 'A specialization swap is not a housing upgrade');
    await layer.sync([]);
    await layer.sync([entity(0)]);
    assert.equal(layer.inspectConstruction().length, 1, 'A new canonical building plays once');
    await layer.sync([]);
    assert.deepEqual(layer.inspectConstruction(), [], 'Salvage during construction releases the scaffold');
    await layer.sync([entity(0)]);
    layer.resetConstructionBaseline();
    await layer.sync([entity(2)]);
    assert.deepEqual(layer.inspectConstruction(), [], 'World replacement establishes a new baseline');
    layer.dispose();
    const observed = new FjordEntities(models, undefined, undefined, false);
    await observed.sync([]);
    await observed.sync([entity(0)]);
    await observed.sync([entity(1)]);
    assert.deepEqual(observed.inspectConstruction(), [], 'Rival observations do not invent a construction event');
    observed.dispose();
    assert.equal(new Set(releases).size, releases.length, 'Each retained building is released once');
    for (const root of roots) disposeHouse(root);
});

test('real Core builds, all three upgrades and salvage retain exact state and navigation footprints', async () => {
    const core = load('../src/simulation/SimulationCore.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
    const world = generateWorld({ seed: 32 });
    let state = core.createCampaign(32, { initialMaterials: 1000 }, undefined, { enabled: false });
    let layout = createFjordLayout(world);
    const roots = [];
    const layer = new FjordEntities({
        async create(entity) { const root = house(entity.asset); roots.push(root); return root; },
        async reconcile() {}, boundsShape() {}, release() { return false; }
    });
    const sync = async () => {
        const before = core.serializeState(state);
        const view = projectFjordSettlement(state, world, layout);
        layout = view.layout;
        const buildings = view.entities.filter(entity => entity.kind === 'building');
        const plots = structuredClone(buildings.map(entity => entity.plot));
        await layer.sync(buildings);
        for (let i = 0; i < 34; i++) layer.updateConstruction(.1);
        assert.equal(core.serializeState(state), before, 'Presentation cannot change costs, RNG, time, events or saves');
        assert.deepEqual(buildings.map(entity => entity.plot), plots, 'Temporary scaffold never changes navigation');
    };
    await sync();
    const home = Object.values(state.households).find(home => home.memberIds.length);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: home.memberIds[0], occupation: 'farmer' });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
    const buildingId = state.residences[state.households[home.id].residenceId].buildingId;
    await sync();
    state = core.applyCommand(state, { type: 'SpecializeBuilding', buildingId, occupation: 'farmer' });
    for (let i = 0; i < 3; i++) {
        state = core.applyCommand(state, { type: 'UpgradeBuilding', buildingId });
        await sync();
    }
    state = core.applyCommand(state, { type: 'SalvageBuilding', buildingId });
    await sync();
    assert.deepEqual(layer.inspectConstruction(), []);
    layer.dispose(); for (const root of roots) disposeHouse(root);
});
