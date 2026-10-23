import { worldFixture } from './fixtures/wildlife-world.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Box3, Vector3, AnimationMixer, PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
import { createRequire } from 'node:module';
const { wildlifeSpecies, wildlifeTerritoryGap } = load('../src/wildlife/WildlifeSpecies.ts');
const { WildlifePopulation } = load('../src/wildlife/WildlifePopulation.ts');
const { WildlifeLayer } = load('../src/wildlife/WildlifeLayer.ts');
const { wildlifeAssetManifest } = load('../src/wildlife/WildlifeAssetManifest.ts');
const { gullWingMotion, prepareGullWings, gullWingRig, poseGullWings, gullFoldedWings, poseGroundedGull } = load('../src/wildlife/GullWings.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
test('wildlife population is habitat driven, deterministic, complete and does not mutate geography', () => {
    const world = worldFixture(), before = JSON.stringify(world);
    const first = new WildlifePopulation(world), second = new WildlifePopulation(world);
    assert.equal(wildlifeSpecies.length, 13);
    assert.equal(first.actors.length, 28, JSON.stringify(first.diagnostics));
    assert.deepEqual(first.diagnostics.filter(message => !message.includes('visits disabled')), []);
    assert.deepEqual(first.inspect(), second.inspect());
    assert.notDeepEqual(first.inspect(), new WildlifePopulation(worldFixture(214)).inspect());
    assert.equal(JSON.stringify(world), before);
    for (const species of wildlifeSpecies)
        for (const variant of species.variants) {
            assert.equal(first.actors.filter(a => a.species === species.id && a.variant.id === variant.id).length,
                variant.encounter ? 0 : variant.count, 'Shallow fixture has no large marine visitors');
        }
    assert.equal(first.actors.filter(a => a.species === 'great-black-backed-gull' && a.variant.movement === 'air').length, 6);
    assert.equal(first.actors.filter(a => a.species === 'great-black-backed-gull' && a.variant.movement === 'shore').length, 3);
});
test('ground, alpine, marine and airborne constraints survive roaming; pause and camera do not respawn fauna', () => {
    const population = new WildlifePopulation(worldFixture());
    const initial = population.actors.map(a => ({ id: a.id, anchor: { ...a.anchor } }));
    const airborne = population.actors.filter(a => a.variant.movement === 'air');
    assert.ok(new Set(airborne.map(a => a.phase.toFixed(3))).size > 4);
    assert.ok(new Set(airborne.map(a => a.speed.toFixed(3))).size > 4);
    let walked = false;
    for (let frame = 0; frame < 240; frame++) {
        population.advance(.25, true);
        for (const actor of population.actors) {
            const { x, y, z } = actor.position, v = actor.variant;
            assert.ok([x, y, z].every(Number.isFinite));
            assert.ok(population.habitats.inBounds(actor.position));
            if (v.movement === 'air') {
                assert.ok(y >= Math.max(population.world.waterLevel, population.habitats.surface.surfaceHeightAt(x, z)) + 11.99);
            }
            else {
                assert.ok(population.habitats.valid(actor.position, v), actor.id + ' left its habitat');
                if (actor.species === 'reindeer')
                    assert.ok(y >= population.habitats.alpineHeight);
                if (v.movement === 'water')
                    assert.equal(y, 0);
                else
                    assert.equal(y, population.habitats.surface.surfaceHeightAt(x, z));
                walked ||= actor.state === 'roam';
            }
        }
    }
    assert.ok(walked);
    const paused = population.inspect();
    population.advance(1, false);
    assert.deepEqual(population.inspect(), paused);
    assert.deepEqual(population.actors.map(a => ({ id: a.id, anchor: a.anchor })), initial);
    assert.throws(() => population.advance(NaN, true), /delta/);
    assert.throws(() => population.advance(-1, true), /delta/);
});
test('movement checks full segments and dynamic building footprints rather than only endpoints', () => {
    const population = new WildlifePopulation(worldFixture()), v = wildlifeSpecies[1].variants[0];
    const from = { x: 30, z: 80 }, to = { x: 65, z: 80 };
    assert.ok(population.habitats.segmentValid(from, to, v));
    population.habitats.setObstacles([{ x: 47, z: 80, halfWidth: 4, halfDepth: 10, rotation: 0 }]);
    assert.ok(population.habitats.valid(from, v));
    assert.ok(population.habitats.valid(to, v));
    assert.equal(population.habitats.segmentValid(from, to, v), false);
});
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() { } });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const sourceCache = new Map();
const released = [];
const sources = {
    async acquire(id) {
        if (!sourceCache.has(id))
            sourceCache.set(id, (async () => {
                const entry = wildlifeAssetManifest.find(item => item.id === id);
                const bytes = await readFile('public' + entry.path);
                return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
            })());
        return sourceCache.get(id);
    },
    release(id) { released.push(id); },
};
test('compact exports pin source identities, canonical scales, source rigs and authored walk clips', async () => {
    assert.equal(wildlifeAssetManifest.length, 14);
    for (const entry of wildlifeAssetManifest) {
        const bytes = await readFile('public' + entry.path);
        assert.equal(hash(bytes), entry.sha256);
        assert.ok(bytes.length < 200000, entry.id);
        assert.ok(entry.triangles < 5500);
        const source = await sources.acquire(entry.id);
        const box = new Box3().setFromObject(source.scene, true);
        assert.ok(box.getSize(new Vector3()).toArray().every(value => Number.isFinite(value) && value > .1));
        source.scene.traverse(node => {
            if (!node.isMesh)
                return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                assert.equal(material.normalMap, null);
                assert.ok(material.emissive.toArray().every(value => value === 0));
                if (material.map)
                    assert.ok(material.map.image.width <= 512);
            }
        });
        if (entry.id === 'gull-flying')
            assert.ok(Math.abs(box.getSize(new Vector3()).x - 1.6) < .002);
        if (['puffin', 'gull-standing', 'rabbit'].includes(entry.id))
            assert.ok(Math.abs(box.getSize(new Vector3()).y - entry.scaleReference.metres) < .002);
        if (['bear', 'wolf', 'fox', 'lynx', 'reindeer', 'otter', 'seal'].includes(entry.id)) {
            assert.match(entry.source, /animate/);
            assert.ok(entry.joints >= 27);
            assert.equal(source.animations[0].name, 'Walk');
            assert.ok(Math.abs(source.animations[0].duration - 1) < .001);
            const mixer = new AnimationMixer(source.scene), hip = source.scene.getObjectByName('Hips');
            mixer.clipAction(source.animations[0]).play();
            const positions = [];
            for (const time of [0, .2, .5, .8]) {
                mixer.setTime(time);
                source.scene.updateMatrixWorld(true);
                positions.push(hip.getWorldPosition(new Vector3()));
            }
            for (const point of positions)
                assert.ok(Math.hypot(point.x - positions[0].x, point.z - positions[0].z) < .002);
            mixer.stopAllAction();
        }
    }
});
test('moose retarget keeps its own 35-joint proportions, planted hooves, loop seam and neutral rest', async () => {
    const source = await sources.acquire('moose');
    const entry = wildlifeAssetManifest.find(item => item.id === 'moose');
    assert.equal(entry.animationSource.file, 'Lynx-animated.glb');
    assert.equal(entry.animationSource.mappedJoints, 35);
    assert.equal(entry.animationSource.sha256, wildlifeAssetManifest.find(item => item.id === 'lynx').sourceSha256);
    assert.deepEqual(source.animations.map(clip => clip.name), ['Walk', 'Idle']);
    const joints = [];
    source.scene.traverse(node => { if (node.isBone) joints.push(node); });
    assert.equal(joints.length, 35);
    const lengths = joints.map(bone => bone.position.length());
    const root = source.scene.getObjectByName('Bone_000');
    const origin = root.position.clone();
    const mixer = new AnimationMixer(source.scene);
    mixer.clipAction(source.animations[0]).play();
    const feet = ['Bone_023', 'Bone_029', 'Bone_008', 'Bone_013'].map(name => source.scene.getObjectByName(name));
    const sample = time => {
        mixer.setTime(time);
        source.scene.updateMatrixWorld(true);
        return feet.map(bone => bone.getWorldPosition(new Vector3()));
    };
    const start = sample(0), ranges = feet.map(() => ({ min: Infinity, max: -Infinity }));
    for (let frame = 0; frame <= 480; frame++) {
        const points = sample(frame / 480);
        assert.ok(Math.abs(root.position.x - origin.x) < 1e-6 && Math.abs(root.position.z - origin.z) < 1e-6);
        joints.forEach((bone, index) => {
            if (bone !== root) assert.ok(Math.abs(bone.position.length() - lengths[index]) < 1e-6);
        });
        const box = new Box3().setFromObject(source.scene, true);
        assert.ok(Math.abs(box.min.y) < .006, 'At least one hoof must contact the ground: ' + box.min.y);
        assert.ok(box.getSize(new Vector3()).length() < 5, 'No stretched skin or antlers');
        points.forEach((point, index) => {
            assert.ok(point.toArray().every(Number.isFinite));
            ranges[index].min = Math.min(ranges[index].min, point.z);
            ranges[index].max = Math.max(ranges[index].max, point.z);
        });
    }
    assert.ok(ranges.every(range => range.max - range.min > .12), 'All four legs must stride');
    const nearSeam = sample(1 - 1e-5);
    assert.ok(nearSeam.every((point, index) => point.distanceTo(start[index]) < .002),
        'The final stride must approach the first pose without a visible jump');
    const seam = sample(1);
    assert.ok(seam.every((point, index) => point.distanceTo(start[index]) < 1e-6));
    mixer.stopAllAction();
    mixer.clipAction(source.animations[1]).play();
    const idle = sample(.5);
    assert.ok(Math.max(...idle.map(point => point.y)) - Math.min(...idle.map(point => point.y)) < .04,
        'Idle must put all four hooves down rather than freeze mid-stride');
    mixer.stopAllAction();
});

test('world wildlife shares render resources, owns independent rigs, respects discovery, and releases leases once', async () => {
    const first = await WildlifeLayer.create(worldFixture(), () => true, sources);
    const second = await WildlifeLayer.create(worldFixture(), () => false, sources);
    try {
        assert.equal(first.inspect().instances, 28);
        assert.equal(first.inspect().sharedAssets, 12);
        assert.equal(second.inspect().rendered, 0);
        const meshes = layer => {
            const result = [];
            layer.root.traverse(node => {
                if (node.isSkinnedMesh)
                    result.push(node);
            });
            return result;
        };
        const a = meshes(first)[0], b = meshes(second)[0];
        assert.equal(a.geometry, b.geometry);
        assert.equal(a.material, b.material);
        assert.notEqual(a.skeleton, b.skeleton);
        assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
        const initial = first.population.actors.map(actor => actor.id);
        const bearRoot = first.root.getObjectByName('wildlife:brown-bear:roaming:0');
        const up = new Vector3(0, 1, 0).applyQuaternion(bearRoot.quaternion);
        assert.ok(up.distanceTo(new Vector3(-.25, 1, 0).normalize()) < 1e-6);
        const camera = new PerspectiveCamera(45, 1, .1, 10);
        camera.position.set(100000, 100, 100000);
        camera.lookAt(100100, 100, 100100);
        const populationBeforeCamera = first.population.inspect();
        first.advance(0, false, camera);
        assert.equal(first.inspect().rendered, 0);
        assert.deepEqual(first.population.inspect(), populationBeforeCamera);
        first.advance(.5, true);
        assert.deepEqual(first.population.actors.map(actor => actor.id), initial);
        const before = released.length;
        let skeletonDisposed = false;
        a.skeleton.addEventListener?.('dispose', () => { skeletonDisposed = true; });
        const disposeSkeleton = a.skeleton.dispose.bind(a.skeleton);
        a.skeleton.dispose = () => { skeletonDisposed = true; disposeSkeleton(); };
        first.dispose();
        first.dispose();
        assert.equal(released.length - before, wildlifeAssetManifest.length - 2);
        assert.equal(second.inspect().instances, 28);
        assert.equal(first.root.children.length, 0);
        assert.ok(skeletonDisposed);
    }
    finally {
        first.dispose();
        second.dispose();
    }
});
test('real gull identities reach audio when drawing is culled, while undiscovered birds stay silent', async () => {
    const { SettlementSounds } = load('../src/audio/SettlementSounds.ts');
    const world = worldFixture();
    let known = true;
    const layer = await WildlifeLayer.create(world, () => known, sources);
    try {
        const camera = new PerspectiveCamera(45, 1, .1, 10);
        camera.position.set(100000, 100, 100000);
        camera.lookAt(100100, 100, 100100);
        layer.advance(0, false, camera);
        assert.equal(layer.inspect().rendered, 0);
        const actors = layer.soundActors(() => true).filter(actor => actor.species === 'great-black-backed-gull');
        assert.equal(actors.length, 9, 'The actual population has six flying and three grounded gulls');
        assert.ok(actors.every(actor => actor.species === 'great-black-backed-gull'));
        const projection = new SettlementSounds(world);
        const cues = projection.project({ focus: { x: 0, y: 0, z: 0 }, now: 0,
            season: 'Summer', weather: 'Normal', known: () => true, visible: () => true, actors });
        assert.deepEqual(cues.filter(cue => cue.cue === 'gull').map(cue => cue.id),
            actors.map(actor => actor.id));
        assert.deepEqual(layer.soundActors(() => false), []);
        known = false;
        layer.advance(0, false, camera);
        assert.deepEqual(layer.soundActors(() => true), []);
    } finally { layer.dispose(); }
});

test('a failed model load releases every acquired asset after outstanding loads settle', async () => {
    const releases = [];
    const failing = {
        async acquire(id) {
            if (id === 'bear')
                throw new Error('Missing bear fixture');
            await new Promise(resolve => setTimeout(resolve, 10));
            return sources.acquire(id);
        },
        release(id) { releases.push(id); },
    };
    await assert.rejects(WildlifeLayer.create(worldFixture(), () => true, failing), /Missing bear fixture/);
    assert.equal(releases.length, wildlifeAssetManifest.length - 2);
    assert.equal(new Set(releases).size, wildlifeAssetManifest.length - 2);
});
test('missing habitats are reported without invalid forced spawns', () => {
    const world = worldFixture();
    const underwater = { ...world, terrain: { ...world.terrain, heights: world.terrain.heights.map(() => -3) },
        navigation: { ...world.navigation, cells: world.navigation.cells.map(() => false) } };
    const population = new WildlifePopulation(underwater);
    assert.ok(population.diagnostics.some(message => message.startsWith('reindeer:')));
    assert.equal(population.actors.some(actor => actor.variant.movement === 'ground'), false);
    for (const actor of population.actors)
        assert.ok(population.habitats.valid(actor.anchor, actor.variant));
});
test('inland species reserve separate roaming territories away from human settlements', () => {
    const population = new WildlifePopulation(worldFixture());
    const mammals = population.actors.filter(actor => wildlifeSpecies.find(species => species.id === actor.species).group === 'solo');
    assert.equal(mammals.length, 6);
    for (const actor of mammals) {
        assert.ok(Math.hypot(actor.anchor.x - population.world.settlement.center.x, actor.anchor.z - population.world.settlement.center.z) >= actor.variant.avoidSettlement + actor.variant.radius);
        for (const other of mammals)
            if (actor !== other) {
                assert.ok(Math.hypot(actor.anchor.x - other.anchor.x, actor.anchor.z - other.anchor.z)
                    >= actor.variant.radius + other.variant.radius + wildlifeTerritoryGap);
            }
    }
    const harbour = population.world.settlement.harbor;
    for (const actor of population.actors.filter(actor => actor.variant.movement === 'air')) {
        assert.ok(Math.hypot(actor.anchor.x - harbour.x, actor.anchor.z - harbour.z) < 70, 'Flying gulls must stay around the settlement harbour');
    }
});
test('nearby people trigger a valid escape without teleporting or advancing while paused', () => {
    const population = new WildlifePopulation(worldFixture());
    const fox = population.actors.find(actor => actor.species === 'red-fox');
    const human = { x: fox.position.x - 8, z: fox.position.z };
    const before = { ...fox.position };
    population.setHumans([human]);
    population.advance(.25, false);
    assert.deepEqual(fox.position, before);
    let previous = { ...fox.position }, escaped = false;
    for (let frame = 0; frame < 30; frame++) {
        population.advance(.1, true);
        assert.ok(population.habitats.valid(fox.position, fox.variant));
        assert.ok(Math.hypot(fox.position.x - previous.x, fox.position.z - previous.z) <= fox.variant.fleeSpeed * .1 + 1e-6);
        escaped ||= fox.state === 'flee';
        previous = { ...fox.position };
    }
    assert.ok(escaped);
    assert.ok(Math.hypot(fox.position.x - human.x, fox.position.z - human.z) > 11);
    population.setHumans([]);
    for (let frame = 0; frame < 80; frame++)
        population.advance(.1, true);
    assert.notEqual(fox.state, 'flee');
    assert.notEqual(fox.state, 'alert');
});
test('flying gull wing effort follows measured ascent and fades to gliding while descending', () => {
    const population = new WildlifePopulation(worldFixture());
    let climbing = false, gliding = false;
    for (let frame = 0; frame < 800; frame++) {
        population.advance(.1, true);
        for (const gull of population.actors.filter(actor => actor.variant.movement === 'air')) {
            climbing ||= gull.climbRate > .6 && gull.flapEffort > .7;
            gliding ||= gull.climbRate < -.1 && gull.flapEffort < .02;
            assert.ok(gull.flapEffort >= 0 && gull.flapEffort <= 1);
        }
    }
    assert.ok(climbing);
    assert.ok(gliding);
    assert.equal(gullWingMotion(10, 1, false, 0).flap, 0);
    assert.ok(Math.abs(gullWingMotion(10, 1, false, 1).flap) > .1);
});
test('grounded gulls spend most time folded, occasionally spread, and keep feet and beak in place', async () => {
    let folded = 0, stretched = false;
    for (let time = 0; time < 120; time += .1) {
        const pose = gullWingMotion(time, 1, true);
        if (pose.fold > .95)
            folded++;
        stretched ||= pose.fold < .1;
    }
    assert.ok(folded > 1000);
    assert.ok(stretched);
    const source = await sources.acquire('gull-standing');
    prepareGullWings(source.scene, true);
    const model = source.scene.clone(true), meshes = gullFoldedWings(model);
    poseGroundedGull(meshes, 0);
    model.updateMatrixWorld(true);
    const open = new Box3().setFromObject(model, true);
    const mesh = meshes[0], positions = mesh.geometry.getAttribute('position');
    const fixed = [];
    for (let i = 0; i < positions.count; i++)
        if (Math.abs(positions.getX(i)) < .15 || positions.getY(i) < -.13 && Math.abs(positions.getX(i)) < .35)
            fixed.push([i, mesh.getVertexPosition(i, new Vector3())]);
    poseGroundedGull(meshes, 1);
    model.updateMatrixWorld(true);
    const closed = new Box3().setFromObject(model, true);
    assert.ok(closed.getSize(new Vector3()).x < open.getSize(new Vector3()).x * .45);
    for (const [vertex, point] of fixed)
        assert.ok(mesh.getVertexPosition(vertex, new Vector3()).distanceTo(point) < 1e-7);
    for (const attr of [mesh.geometry.morphAttributes.position[0], mesh.geometry.morphAttributes.normal[0]]) {
        assert.ok([...attr.array].every(Number.isFinite));
    }
});
test('grounded gulls lift closed wings before spreading and lower them along the flanks afterward', async () => {
    // Phase 1 begins its stretch at t=21 in the existing 30-second schedule.
    const rest = gullWingMotion(20, 1, true);
    const lifting = gullWingMotion(21.3, 1, true);
    const raised = gullWingMotion(21.6, 1, true);
    const spread = gullWingMotion(22.8, 1, true);
    const settling = gullWingMotion(24.3, 1, true);
    const settled = gullWingMotion(24.6, 1, true);
    assert.equal(rest.lower, 1);
    assert.equal(lifting.fold, 1);
    assert.ok(lifting.lower > .4 && lifting.lower < .6);
    assert.ok(raised.fold > .999 && raised.lower < .001);
    assert.ok(spread.fold < .001 && spread.lower === 0);
    assert.equal(settling.fold, 1);
    assert.ok(settling.lower > .4 && settling.lower < .6);
    assert.equal(settled.lower, 1);
    for (const boundary of [21, 21.6, 22.8, 24, 24.6, 51]) {
        const before = gullWingMotion(boundary - .0001, 1, true);
        const after = gullWingMotion(boundary + .0001, 1, true);
        for (const key of ['fold', 'lower']) assert.ok(Math.abs(before[key] - after[key]) < .001);
    }
    const source = await sources.acquire('gull-standing');
    prepareGullWings(source.scene, true);
    const meshes = gullFoldedWings(source.scene.clone(true));
    const mesh = meshes[0], positions = mesh.geometry.getAttribute('position');
    const wings = [];
    for (let i = 0; i < positions.count; i++) {
        if (Math.abs(positions.getX(i)) > .35) wings.push(i);
    }
    poseGroundedGull(meshes, 1, 0, 0);
    const lifted = wings.map(i => mesh.getVertexPosition(i, new Vector3()));
    poseGroundedGull(meshes, 1, 0, 1);
    const lowered = wings.map(i => mesh.getVertexPosition(i, new Vector3()));
    const average = (points, component) => points.reduce((sum, p) => sum + Math.abs(p[component]), 0) / points.length;
    const meanY = points => points.reduce((sum, p) => sum + p.y, 0) / points.length;
    assert.ok(meanY(lowered) < meanY(lifted) - .09);
    assert.ok(average(lowered, 'x') < average(lifted, 'x'));
    for (let i = 0; i < lowered.length; i++) {
        assert.ok(lowered[i].y > -.2, 'folded feathers must stay above the feet');
        assert.ok(Math.abs(lowered[i].z - lifted[i].z) < 1e-7, 'feathers retain rearward order');
    }
    for (const attributes of Object.values(mesh.geometry.morphAttributes)) {
        for (const attribute of attributes) assert.ok([...attribute.array].every(Number.isFinite));
    }
});
test('human proximity reads displayed resident and expedition positions without including cattle or hidden models', () => {
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const { Group } = createRequire(import.meta.url)('three');
    const layer = new FjordEntities({ release: () => false });
    for (const [id, kind, x, z, visible] of [['resident', 'persona', 12, 34, true], ['expedition', 'persona', 87, 66, true],
        ['cow', 'cattle', 5, 5, true], ['hidden', 'persona', 3, 3, false]]) {
        const model = new Group();
        model.userData.canonical = { kind };
        model.position.set(x, 0, z);
        model.visible = visible;
        layer.entries.set(id, { signature: id, model });
        layer.root.add(model);
    }
    try {
        assert.deepEqual(layer.humanPositions(), [{ x: 12, z: 34 }, { x: 87, z: 66 }]);
    }
    finally {
        layer.dispose();
    }
});

test('puffins deform their supplied skins while waddling, paddling and resting; pause preserves the pose', async () => {
    const { poseCoastalAnimal } = load('../src/wildlife/CoastalAnimalMotion.ts');
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const records = layer.records.filter(record => record.coastal);
        assert.equal(records.length, 5);
        for (const record of records) {
            const rig = record.coastal;
            let mesh;
            record.root.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
            assert.ok(mesh, record.actor.id);
            const capture = () => {
                record.root.updateMatrixWorld(true);
                return Array.from({ length: mesh.geometry.attributes.position.count }, (_, vertex) =>
                    mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld));
            };
            const frame = { delta: .1, phase: record.actor.phase, moving: true,
                water: record.actor.variant.movement === 'water', speed: record.actor.speed };
            rig.activity = 1;
            poseCoastalAnimal(rig, { ...frame, time: 0 });
            const before = capture();
            let after;
            const displacement = before.map(() => 0);
            for (const time of [.2, .4, .6, .8, 1]) {
                poseCoastalAnimal(rig, { ...frame, time });
                after = capture();
                after.forEach((point, index) => {
                    displacement[index] = Math.max(displacement[index], point.distanceTo(before[index]));
                });
            }
            assert.ok(Math.max(...displacement) > .01, record.actor.id + ' must visibly deform');
            if (frame.water) {
                const exposed = displacement.filter((_, index) => before[index].y > 0 && after[index].y > 0);
                assert.ok(Math.max(...exposed) > .003, record.actor.id + ' must animate above water');
            }
            assert.ok(after.every(point => point.toArray().every(Number.isFinite)));
            const body = new Box3().setFromPoints(after).getSize(new Vector3());
            assert.ok(body.length() < 2, record.actor.id + ' must retain a compact body');
            poseCoastalAnimal(rig, { ...frame, delta: 0, time: 1 });
            assert.deepEqual(capture(), after, 'A paused pose must not drift');

            rig.activity = 0;
            poseCoastalAnimal(rig, { ...frame, moving: false, time: 1 });
            const resting = capture();
            poseCoastalAnimal(rig, { ...frame, moving: false, time: 2 });
            assert.ok(capture().some((point, index) => point.distanceTo(resting[index]) > .002),
                record.actor.id + ' should retain breathing/head motion while resting');
        }
    } finally {
        layer.dispose();
    }
});

test('land puffins perch above the waterline and can waddle within the coastal colony', () => {
    const population = new WildlifePopulation(worldFixture());
    const puffins = population.actors.filter(actor => actor.species === 'puffin');
    assert.equal(puffins.length, 5);
    let waddled = false;
    for (let frame = 0; frame < 600; frame++) {
        population.advance(.1, true);
        for (const puffin of puffins.filter(actor => actor.variant.id === 'land')) {
            assert.ok(puffin.position.y >= population.world.waterLevel + .6);
            assert.ok(population.habitats.valid(puffin.position, puffin.variant));
            waddled ||= puffin.state === 'roam';
        }
    }
    assert.ok(waddled, 'Land puffins should not remain frozen throughout the review');
});

test('rabbit strides gather, travel in flight and finish landing independent of frame subdivision', () => {
    const { advanceRabbitHop, rabbitHopProgress, rabbitHopLift } = load('../src/wildlife/RabbitGait.ts');
    const actor = () => ({ position: { x: 0, y: 1, z: 0 }, target: { x: 0, z: 4 }, heading: 0 });
    const first = actor();
    advanceRabbitHop(first, .08, .65, () => true);
    assert.equal(first.position.z, 0, 'Gathering feet must not slide forward');
    assert.equal(first.hop.lift, 0);
    advanceRabbitHop(first, .3, .65, () => true);
    assert.ok(first.position.z > .05 && first.hop.lift > .04);
    const run = step => {
        const rabbit = actor();
        for (let t = 0; t < 600; t++) advanceRabbitHop(rabbit, step, .65, () => true);
        return rabbit;
    };
    const coarse = run(.05), fine = run(.01);
    // Both finish their bounded destination, then rest with no residual airborne offset.
    assert.deepEqual(coarse.position, { x: 0, y: 1, z: 4 });
    // Compare equal elapsed time before the destination as well.
    const a = actor(), b = actor();
    for (let i = 0; i < 60; i++) advanceRabbitHop(a, .05, .65, () => true);
    for (let i = 0; i < 300; i++) advanceRabbitHop(b, .01, .65, () => true);
    assert.ok(Math.abs(a.position.z - b.position.z) < 1e-8);
    assert.ok(Math.abs(a.hop.lift - b.hop.lift) < 1e-8);
    assert.equal(coarse.hop.active, false);
    assert.equal(coarse.hop.lift, 0);
    let previous = 0;
    for (let i = 0; i <= 100; i++) {
        const phase = i / 100, progress = rabbitHopProgress(phase), lift = rabbitHopLift(phase);
        assert.ok(progress >= previous && progress <= 1);
        assert.ok(lift >= 0 && lift <= 1);
        previous = progress;
    }
    assert.equal(rabbitHopProgress(.18), 0);
    assert.equal(rabbitHopProgress(.86), 1);
    assert.equal(rabbitHopLift(0), 0);
    assert.equal(rabbitHopLift(1), 0);
    assert.ok(fine.position.z > 3.8);
});

test('rabbit skins stay compact, support paws stay on the slope and paused poses do not drift', async () => {
    const { rabbitHopProgress, rabbitHopLift, rabbitHopDuration } = load('../src/wildlife/RabbitGait.ts');
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const records = layer.records.filter(record => record.rabbit);
        assert.equal(records.length, 2);
        const record = records[0], actor = record.actor, rig = record.rabbit;
        const from = { ...actor.anchor }, duration = rabbitHopDuration(actor.speed);
        const to = { x: from.x, z: from.z + actor.speed * duration };
        let mesh;
        record.root.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
        let maximumContactError = 0, minimumClearance = Infinity;
        for (const phase of [0, .1, .3, .5, .7, .9, .999]) {
            const progress = rabbitHopProgress(phase);
            actor.position.x = from.x;
            actor.position.z = from.z + (to.z - from.z) * progress;
            actor.position.y = layer.population.habitats.surface.surfaceHeightAt(actor.position.x, actor.position.z);
            actor.heading = 0;
            actor.hop = { phase, duration, amplitude: .06, lift: rabbitHopLift(phase) * .06,
                active: true, from, to, startHeading: 0 };
            layer.advance(0, false);
            record.root.updateMatrixWorld(true);
            for (const paw of rig.paws) {
                const point = paw.end.getWorldPosition(new Vector3());
                const planted = paw.fore ? phase <= .12 || phase >= .70 : phase <= .28 || phase >= .84;
                if (planted) {
                    const floor = layer.population.habitats.surface.surfaceHeightAt(point.x, point.z);
                    maximumContactError = Math.max(maximumContactError, Math.abs(point.y - floor - paw.rest.y));
                }
            }
            const points = [];
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
                assert.ok(point.toArray().every(Number.isFinite));
                minimumClearance = Math.min(minimumClearance,
                    point.y - layer.population.habitats.surface.surfaceHeightAt(point.x, point.z));
                points.push(point);
            }
            assert.ok(new Box3().setFromPoints(points).getSize(new Vector3()).length() < .9);
            const paused = [...rig.joints.values()].map(joint => joint.bone.quaternion.toArray());
            layer.advance(.5, false);
            assert.deepEqual([...rig.joints.values()].map(joint => joint.bone.quaternion.toArray()), paused);
        }
        assert.ok(maximumContactError < .005, 'Support paw contact error: ' + maximumContactError);
        assert.ok(minimumClearance > -.02, 'Rabbit penetrated the ground: ' + minimumClearance);
        assert.notEqual(records[0].rabbit.joints.get('Bone_010').bone,
            records[1].rabbit.joints.get('Bone_010').bone);
    } finally {
        layer.dispose();
    }
});

test('rabbit population pauses its hop exactly and responds to people without teleporting', () => {
    const population = new WildlifePopulation(worldFixture());
    const rabbit = population.actors.find(actor => actor.species === 'rabbit');
    assert.ok(rabbit);
    population.setHumans([{ x: rabbit.position.x - 8, z: rabbit.position.z }]);
    let airborne = false;
    for (let i = 0; i < 100; i++) {
        const before = { ...rabbit.position };
        population.advance(.05, true);
        assert.ok(population.habitats.valid(rabbit.position, rabbit.variant));
        assert.ok(Math.hypot(before.x - rabbit.position.x, before.z - rabbit.position.z) < .21);
        airborne ||= (rabbit.hop?.lift ?? 0) > .04;
    }
    assert.ok(airborne);
    const paused = JSON.stringify(rabbit);
    population.advance(.5, false);
    assert.equal(JSON.stringify(rabbit), paused);
});

test('all eight walking species use their clips on land and water and freeze on pause', async () => {
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const species = ['brown-bear', 'wolf', 'moose', 'red-fox', 'lynx', 'reindeer', 'otter', 'seal'];
        const records = layer.records.filter(record => species.includes(record.actor.species));
        assert.equal(records.length, 12);
        for (const record of records) {
            assert.ok(record.mixer, record.actor.id + ' must play its authored clip');
            assert.equal(record.coastal, undefined);
            assert.deepEqual(record.legs, []);
            record.actor.state = record.actor.variant.movement === 'water' ? 'swim'
                : record.actor.speed > 0 ? 'roam' : 'idle';
            let mesh;
            record.root.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
            const capture = () => {
                record.root.updateMatrixWorld(true);
                const actorInverse = record.root.matrixWorld.clone().invert();
                return Array.from({ length: mesh.geometry.attributes.position.count }, (_, vertex) =>
                    mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld)
                        .applyMatrix4(actorInverse));
            };
            layer.population.time = 0;
            layer.advance(0, false);
            const before = capture();
            const origin = { ...record.actor.position };
            let maximumMotion = 0;
            for (const time of [.2, .4, .6, .8, 1]) {
                if (record.motion && record.actor.speed > 0)
                    record.actor.position.z = origin.z + time * record.actor.speed;
                layer.population.time = time;
                layer.advance(0, false);
                const points = capture();
                assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
                const sizeLimit = record.actor.species === 'moose' ? 5 : 3.5;
                assert.ok(new Box3().setFromPoints(points).getSize(new Vector3()).length() < sizeLimit);
                maximumMotion = Math.max(maximumMotion,
                    ...points.map((point, index) => point.distanceTo(before[index])));
            }
            if (record.actor.speed > 0)
                assert.ok(maximumMotion > .015, record.actor.id + ' must visibly deform');
            else
                assert.ok(maximumMotion > .005 && maximumMotion < .15,
                    'Hauled-out seals should retain subtle head/breathing motion');
            const paused = capture();
            layer.advance(.5, false);
            assert.deepEqual(capture(), paused, record.actor.id + ' must keep its paused pose');
            record.actor.state = record.actor.variant.movement === 'water' ? 'swim' : 'idle';
        }
    } finally {
        layer.dispose();
    }
});

test('repaired reindeer keeps both hind chains on their own side throughout the walk', async () => {
    const source = await sources.acquire('reindeer');
    const mixer = new AnimationMixer(source.scene);
    mixer.clipAction(source.animations[0]).play();
    let mesh;
    source.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
    const positions = mesh.geometry.attributes.position;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    for (let vertex = 0; vertex < positions.count; vertex++) {
        let sum = 0;
        for (let slot = 0; slot < 4; slot++) {
            const weight = weights.getComponent(vertex, slot);
            sum += weight;
            const name = mesh.skeleton.bones[indices.getComponent(vertex, slot)].name;
            if (weight > .01 && name.startsWith('R_backleg'))
                assert.ok(positions.getX(vertex) <= 0, 'Right hind weights crossed onto the left surface');
        }
        assert.ok(Math.abs(sum - 1) < .002, 'Skin weights must stay normalized');
    }
    let largestEdge = 0;
    for (let frame = 0; frame < 40; frame++) {
        mixer.setTime(frame / 40);
        source.scene.updateMatrixWorld(true);
        // Hooves adduct during a trot; compare against the pelvis midpoint, not a fixed hip offset.
        const leftHip = source.scene.getObjectByName('backleg').getWorldPosition(new Vector3());
        const rightHip = source.scene.getObjectByName('R_backleg').getWorldPosition(new Vector3());
        const centreX = (leftHip.x + rightHip.x) * .5;
        for (const name of ['backleg1', 'backleg2', 'R_backleg1', 'R_backleg2']) {
            const point = source.scene.getObjectByName(name).getWorldPosition(new Vector3());
            const side = name.startsWith('R_') ? -1 : 1;
            assert.ok((point.x - centreX) * side > .05, name + ' crossed the body');
        }
        const index = mesh.geometry.index;
        for (let triangle = 0; triangle < index.count; triangle += 3) {
            const points = [0, 1, 2].map(slot => mesh.getVertexPosition(index.getX(triangle + slot),
                new Vector3()).applyMatrix4(mesh.matrixWorld));
            for (let edge = 0; edge < 3; edge++)
                largestEdge = Math.max(largestEdge, points[edge].distanceTo(points[(edge + 1) % 3]));
        }
    }
    assert.ok(largestEdge < .50, 'Reindeer has a stretched triangle: ' + largestEdge);
    mixer.stopAllAction();
});

test('resting otters breathe and look around without drifting, then resume the unmodified Meshy pose', async () => {
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    const control = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const record = layer.records.find(item => item.actor.id === 'otter:shore:0');
        const baseline = control.records.find(item => item.actor.id === record.actor.id);
        const actor = record.actor;
        actor.wait = Infinity;
        actor.target = null;
        actor.state = 'idle';
        const origin = { ...actor.position };
        let mesh;
        record.root.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
        const capture = () => {
            record.root.updateMatrixWorld(true);
            const inverse = record.root.matrixWorld.clone().invert();
            return Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) =>
                mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        };
        layer.advance(0, true);
        const before = capture();
        let displacement = 0;
        for (let frame = 0; frame < 40; frame++) {
            layer.advance(.2, true);
            const points = capture();
            assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
            displacement = Math.max(displacement, ...points.map((point, index) => point.distanceTo(before[index])));
        }
        assert.ok(displacement > .005 && displacement < .15, 'Resting motion must be visible and subtle');
        assert.deepEqual(actor.position, origin, 'Idle must not translate the actor');
        const paused = capture();
        layer.advance(.5, false);
        assert.deepEqual(capture(), paused, 'Pause must freeze the idle overlay exactly');

        actor.state = baseline.actor.state = 'roam';
        layer.population.time = control.population.time = 5;
        layer.advance(0, false);
        control.advance(0, false);
        for (const [name, joint] of record.resting.joints) {
            const expected = baseline.root.getObjectByName(name);
            assert.ok(joint.bone.quaternion.toArray().every((value, index) =>
                Math.abs(value - expected.quaternion.toArray()[index]) < 1e-7),
                'Idle overlay leaked into locomotion: ' + name
                + JSON.stringify({ actual: joint.bone.quaternion.toArray(), expected: expected.quaternion.toArray() }));
        }
        const walking = capture();
        layer.advance(.5, false);
        assert.deepEqual(capture(), walking, 'Repeated moving-pose evaluation must not reset animated joints');
    } finally {
        layer.dispose();
        control.dispose();
    }
});

test('shore otters roam autonomously while running and freeze their position on pause', () => {
    const population = new WildlifePopulation(worldFixture());
    const otter = population.actors.find(actor => actor.id === 'otter:shore:0');
    let travelled = 0, walking = false;
    for (let frame = 0; frame < 600; frame++) {
        const before = { ...otter.position };
        population.advance(.1, true);
        travelled += Math.hypot(otter.position.x - before.x, otter.position.z - before.z);
        walking ||= otter.state === 'roam';
        assert.ok(population.habitats.valid(otter.position, otter.variant));
    }
    assert.ok(walking && travelled > 1, 'The shore otter must choose and walk its own valid routes');
    const paused = JSON.stringify(otter);
    population.advance(.5, false);
    assert.equal(JSON.stringify(otter), paused);
});

test('grounded gulls scan with their heads while folded wings and feet remain fixed', async () => {
    const { gullHeadLook } = load('../src/wildlife/GullWings.ts');
    let left = false, right = false, neutral = 0;
    for (let time = 0; time < 60; time += .1) {
        const head = gullHeadLook(time, 1);
        left ||= head > .9;
        right ||= head < -.9;
        if (head === 0) neutral++;
    }
    assert.ok(left && right && neutral > 300, 'Head scans should have substantial quiet intervals');
    const source = await sources.acquire('gull-standing');
    prepareGullWings(source.scene, true);
    const model = source.scene.clone(true), other = source.scene.clone(true);
    const meshes = gullFoldedWings(model), others = gullFoldedWings(other);
    const mesh = meshes[0], positions = mesh.geometry.attributes.position;
    const capture = () => Array.from({ length: positions.count }, (_, index) => mesh.getVertexPosition(index, new Vector3()));
    poseGroundedGull(meshes, 1, 0);
    const before = capture();
    poseGroundedGull(meshes, 1, 1);
    const turned = capture();
    let headMotion = 0;
    for (let index = 0; index < positions.count; index++) {
        const distance = before[index].distanceTo(turned[index]);
        if (positions.getY(index) < .025 || Math.abs(positions.getX(index)) > .35)
            assert.ok(distance < 1e-7, 'Head look moved a foot or folded wing');
        if (positions.getZ(index) > .35 && positions.getY(index) > .125 && Math.abs(positions.getX(index)) < .08)
            headMotion = Math.max(headMotion, distance);
        assert.ok(turned[index].toArray().every(Number.isFinite));
    }
    assert.ok(headMotion > .05, 'The beak/head must visibly turn independently');
    poseGroundedGull(meshes, 1, 1);
    assert.deepEqual(capture(), turned);
    poseGroundedGull(others, 1, -1);
    assert.notEqual(meshes[0].morphTargetInfluences, others[0].morphTargetInfluences);
    assert.equal(meshes[0].morphTargetInfluences[2], 1);
    assert.equal(others[0].morphTargetInfluences[3], 1);
});

test('hauled-out seals look around independently, remain in place and preserve their paused poses', async () => {
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const seals = layer.records.filter(record => record.actor.species === 'seal' && record.actor.variant.movement === 'shore');
        assert.equal(seals.length, 2);
        const origins = seals.map(record => ({ ...record.actor.position }));
        layer.advance(0, true);
        const heads = seals.map(record => record.root.getObjectByName('head'));
        const before = heads.map(head => head.quaternion.toArray());
        for (let frame = 0; frame < 40; frame++) layer.advance(.1, true);
        for (let index = 0; index < seals.length; index++) {
            assert.ok(heads[index].quaternion.toArray().some((value, axis) => Math.abs(value - before[index][axis]) > .01));
            assert.deepEqual(seals[index].actor.position, origins[index]);
        }
        assert.notDeepEqual(heads[0].quaternion.toArray(), heads[1].quaternion.toArray());
        const paused = heads.map(head => head.quaternion.toArray());
        layer.advance(.5, false);
        assert.deepEqual(heads.map(head => head.quaternion.toArray()), paused);
    } finally {
        layer.dispose();
    }
});

test('all eight walking species retain resting motion and hand joint control back to their clip', async () => {
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    const control = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const records = layer.records.filter(record => record.resting && record.actor.variant.movement !== 'water');
        assert.equal(records.length, 9);
        assert.equal(new Set(records.map(record => record.actor.species)).size, 8);
        for (const record of records) record.actor.state = 'idle';
        const capture = record => {
            record.root.updateMatrixWorld(true);
            const inverse = record.root.matrixWorld.clone().invert();
            let mesh;
            record.root.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
            return Array.from({ length: mesh.geometry.attributes.position.count }, (_, index) =>
                mesh.getVertexPosition(index, new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        };
        layer.population.time = 0;
        layer.advance(0, false);
        const before = records.map(capture), motion = records.map(() => 0);
        for (const time of [.5, 1.5, 3, 5]) {
            layer.population.time = time;
            layer.advance(0, false);
            records.forEach((record, index) => {
                const points = capture(record);
                assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
                motion[index] = Math.max(motion[index],
                    ...points.map((point, vertex) => point.distanceTo(before[index][vertex])));
            });
        }
        records.forEach((record, index) => {
            assert.ok(motion[index] > .003 && motion[index] < .35,
                record.actor.id + ' should have subtle, visible idle motion: ' + motion[index]);
        });
        const paused = records.map(capture);
        layer.advance(.5, false);
        assert.deepEqual(records.map(capture), paused);
        const baselines = records.map(record => control.records.find(item => item.actor.id === record.actor.id));
        for (const record of [...records, ...baselines]) record.actor.state = 'roam';
        layer.population.time = control.population.time = 7;
        layer.advance(0, false);
        control.advance(0, false);
        records.forEach((record, index) => {
            for (const [name, joint] of record.resting.joints) {
                const expected = baselines[index].root.getObjectByName(joint.bone.name).quaternion.toArray();
                assert.ok(joint.bone.quaternion.toArray().every((value, axis) => Math.abs(value - expected[axis]) < 1e-7),
                    record.actor.id + ': rest overlay leaked into clip at ' + name);
            }
        });
    } finally {
        layer.dispose();
        control.dispose();
    }
});


for (const species of ['red-fox', 'moose'])
test(`canonical ${species} motion keeps fleeing speed, rendered distance and clip phase synchronized across batched ticks`, async () => {
    const { captureWildlife } = load('../src/wildlife/WildlifeSnapshot.ts');
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const record = layer.records.find(record => record.actor.species === species);
        const snapshot = { actors: captureWildlife(layer.population) };
        snapshot.actors.find(actor => actor.id === record.actor.id).state = 'roam';
        layer.useCanonical(snapshot, .5);
        layer.advance(0, false);
        const initial = record.root.position.clone();
        const before = record.mixer.time;
        const flee = structuredClone(snapshot);
        const animal = flee.actors.find(actor => actor.id === record.actor.id);
        animal.state = 'flee';
        layer.useCanonical(flee, .5);
        layer.advance(.01, true);
        assert.equal(record.mixer.time, before, 'Entering flee cannot jump the animation to time × new speed');
        animal.position.z += record.actor.variant.fleeSpeed * .5;
        const next = structuredClone(flee), saved = structuredClone(next);
        layer.useCanonical(next, .5);
        let previous = record.root.position.z;
        for (let frame = 0; frame < 30; frame++) {
            layer.advance(1 / 60, true);
            const step = record.root.position.z - previous;
            assert.ok(Math.abs(step - record.actor.variant.fleeSpeed / 60) < 1e-9,
                'A fleeing body must keep moving evenly between canonical updates');
            previous = record.root.position.z;
            assert.ok(Math.abs(record.mixer.time - before - Math.abs(previous - initial.z)) < 1e-9,
                'Clip time must advance with actual displayed metres');
        }
        const paused = [record.root.position.toArray(), record.mixer.time];
        layer.advance(5, false);
        assert.deepEqual([record.root.position.toArray(), record.mixer.time], paused);
        layer.advance(.5, true);
        assert.equal(record.mixer.time, paused[1], 'Without new body travel the feet stop cycling');
        assert.deepEqual(next, saved, 'Presentation must not change authoritative wildlife');
    } finally { layer.dispose(); }
});

test('canonical gull flight moves evenly in 3D with continuous turns and wing effort between snapshots', async () => {
    const { captureWildlife } = load('../src/wildlife/WildlifeSnapshot.ts');
    const world = worldFixture(), simulation = new WildlifePopulation(world);
    const layer = await WildlifeLayer.create(world, () => true, sources);
    try {
        const gulls = layer.records.filter(record => record.actor.variant.movement === 'air');
        assert.equal(gulls.length, 6);
        let snapshot = { actors: captureWildlife(simulation) };
        layer.useCanonical(snapshot, .5);
        layer.advance(0, false);
        for (const [interval, frames] of [[.18, 11], [.5, 15], [.5, 30], [.6, 36]]) {
            const before = gulls.map(record => ({ position: record.root.position.clone(),
                heading: record.motion.heading, flight: { ...record.motion.flight } }));
            simulation.advance(.6, true);
            snapshot = { actors: captureWildlife(simulation) };
            const saved = structuredClone(snapshot);
            layer.useCanonical(snapshot, interval);
            for (let frame = 1; frame <= frames; frame++) {
                layer.advance(interval / frames, true);
                const ratio = frame / frames;
                gulls.forEach((record, index) => {
                    const target = record.actor, previous = before[index];
                    const expected = previous.position.clone().lerp(new Vector3(
                        target.position.x, target.position.y, target.position.z), ratio);
                    assert.ok(record.root.position.distanceTo(expected) < 1e-8,
                        'No rush-and-stall; retain flight altitude instead of snapping onto the ground');
                    const turn = Math.atan2(Math.sin(target.heading - previous.heading),
                        Math.cos(target.heading - previous.heading));
                    assert.ok(Math.abs(record.root.rotation.y - previous.heading - turn * ratio) < 1e-8);
                    for (const key of ['bank', 'climbRate', 'flapEffort']) {
                        const expectedPose = previous.flight[key] + (target[key] - previous.flight[key]) * ratio;
                        assert.ok(Math.abs(record.motion.flight[key] - expectedPose) < 1e-8,
                            key + ' must transition continuously with the displayed flight');
                    }
                    assert.ok(Math.abs(record.root.rotation.z - record.motion.flight.bank) < 1e-8);
                    const pitch = -Math.atan2(record.motion.flight.climbRate, target.speed) * .3;
                    assert.ok(Math.abs(record.root.rotation.x - pitch) < 1e-8);
                    const flap = gullWingMotion(layer.population.time, target.phase,
                        false, record.motion.flight.flapEffort).flap;
                    const wing = record.wings[0];
                    assert.ok(Math.abs(wing.shoulder.quaternion.z - Math.sin(wing.side * flap / 2)) < 1e-8,
                        'Wingbeat amplitude must use the interpolated climb effort');
                });
            }
            assert.deepEqual(snapshot, saved, 'Flight presentation cannot change saved animals or sightings');
        }
        simulation.advance(.6, true);
        layer.useCanonical({ actors: captureWildlife(simulation) }, .5);
        layer.advance(.1, true);
        const capture = () => gulls.map(record => ({ position: record.root.position.toArray(),
            rotation: record.root.rotation.toArray(), flight: { ...record.motion.flight },
            wing: record.wings[0].shoulder.quaternion.toArray() }));
        const paused = capture();
        layer.advance(5, false);
        assert.deepEqual(capture(), paused, 'Pausing freezes the position, attitude and wings together');
    } finally { layer.dispose(); }
});

test('canonical wildlife is unchanged by render frames, camera culling or rendered human positions', async () => {
    const { captureWildlife } = load('../src/wildlife/WildlifeSnapshot.ts');
    const world = worldFixture(), canonical = { actors: captureWildlife(new WildlifePopulation(world)) };
    const layer = await WildlifeLayer.create(world, () => false, sources);
    try {
        layer.useCanonical(canonical);
        const before = structuredClone(canonical);
        const actors = layer.population.actors.slice();
        layer.setHumans([{ x: 0, z: 0 }]);
        const camera = new PerspectiveCamera(45, 1, .1, 1000);
        for (let frame = 0; frame < 120; frame++) {
            camera.position.set(frame * 10, 50, -frame * 10);
            layer.advance(frame % 2 ? .016 : .1, true, camera);
        }
        assert.deepEqual(captureWildlife(layer.population), before.actors);
        assert.deepEqual(canonical, before);
        assert.ok(layer.population.actors.every((actor, index) => actor === actors[index]), 'Render bindings keep actor identity');
        const pausedTime = layer.population.time;
        layer.advance(.5, false, camera);
        assert.equal(layer.population.time, pausedTime);
        const next = structuredClone(canonical), record = layer.records[0];
        const oldX = record.root.position.x;
        next.actors.find(actor => actor.id === record.actor.id).position.x += 2;
        layer.useCanonical(next);
        layer.advance(.02, true);
        assert.ok(record.root.position.x > oldX && record.root.position.x < oldX + 2,
            'Rendering interpolates between tick poses without moving the canonical actor');
        const pausedPosition = record.root.position.clone();
        layer.advance(.5, false);
        assert.deepEqual(record.root.position, pausedPosition);
        assert.deepEqual(captureWildlife(layer.population), next.actors);
    } finally { layer.dispose(); }
});


test('actual visible hauled-out seals call occasionally; swimming seals and hidden shores stay silent', async () => {
    const { SettlementSounds } = load('../src/audio/SettlementSounds.ts');
    const world = worldFixture();
    const layer = await WildlifeLayer.create(world, () => true, sources);
    try {
        const actors = layer.soundActors(() => true);
        const projection = new SettlementSounds(world);
        const frame = { focus: { x: 0, y: 0, z: 0 }, now: 0,
            season: 'Summer', weather: 'Normal', known: () => true, visible: () => true, actors };
        const calls = projection.project(frame).filter(source => source.cue === 'seal');
        assert.deepEqual(calls.map(source => source.id).sort(), ['seal:haul-out:0', 'seal:haul-out:1']);
        assert.deepEqual(projection.project({ ...frame, visible: () => false })
            .filter(source => source.cue === 'seal'), []);
    } finally { layer.dispose(); }
});
