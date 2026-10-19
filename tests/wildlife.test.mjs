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
const { freezeBlueprint } = load('../src/world-generation/WorldBlueprint.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function worldFixture(seed = 213) {
    const bounds = { minX: -400, maxX: 400, minZ: -400, maxZ: 400 };
    const heights = [], cells = [], biomes = [], moisture = [], forest = [], rock = [];
    for (let z = -400; z <= 400; z += 4)
        for (let x = -400; x <= 400; x += 4) {
            const height = x < -92 ? -3 : (x + 80) * .25;
            heights.push(height);
            cells.push(height > .2);
            biomes.push(height < 0 ? 'water' : x < -60 ? 'shore' : x < 70 ? 'forest' : 'rock');
            moisture.push(.8);
            forest.push(x > -60 && x < 70 ? .7 : 0);
            rock.push(x > 70 || x < -60 ? .6 : .1);
        }
    const terrain = { bounds, spacing: 4, columns: 201, rows: 201, heights };
    return freezeBlueprint({
        config: { seed, width: 800, depth: 800 }, waterLevel: 0, terrain,
        navigation: { ...terrain, heights: undefined, cells },
        coast: [{ a: { x: -80, z: -400 }, b: { x: -80, z: 400 } }],
        settlement: { center: { x: -40, z: 0 }, harbor: { x: -80, z: 0 }, buildings: [], accessPaths: [], bounds },
        biomes: { cells: biomes, moisture, waterDistance: heights.map(h => Math.abs(h) * 4), worn: heights.map(() => 0), coverage: {} },
        environment: { spacing: 4, columns: 201, rows: 201, fields: { forestCover: forest, moisture, rockExposure: rock } },
        placementPlan: [],
    });
}
test('wildlife population is habitat driven, deterministic, complete and does not mutate geography', () => {
    const world = worldFixture(), before = JSON.stringify(world);
    const first = new WildlifePopulation(world), second = new WildlifePopulation(world);
    assert.equal(wildlifeSpecies.length, 11);
    assert.equal(first.actors.length, 28, JSON.stringify(first.diagnostics));
    assert.deepEqual(first.diagnostics, []);
    assert.deepEqual(first.inspect(), second.inspect());
    assert.notDeepEqual(first.inspect(), new WildlifePopulation(worldFixture(214)).inspect());
    assert.equal(JSON.stringify(world), before);
    for (const species of wildlifeSpecies)
        for (const variant of species.variants) {
            assert.equal(first.actors.filter(a => a.species === species.id && a.variant.id === variant.id).length, variant.count);
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
test('compact exports pin source identities, canonical scales, source rigs and seven authored walk clips', async () => {
    assert.equal(wildlifeAssetManifest.length, 12);
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
        assert.equal(released.length - before, wildlifeAssetManifest.length);
        assert.equal(second.inspect().instances, 28);
        assert.equal(first.root.children.length, 0);
        assert.ok(skeletonDisposed);
    }
    finally {
        first.dispose();
        second.dispose();
    }
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
    assert.equal(releases.length, wildlifeAssetManifest.length);
    assert.equal(new Set(releases).size, wildlifeAssetManifest.length);
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

test('the five newly animated species use their source clips on land and water and freeze on pause', async () => {
    const layer = await WildlifeLayer.create(worldFixture(), () => true, sources);
    try {
        const species = ['red-fox', 'lynx', 'reindeer', 'otter', 'seal'];
        const records = layer.records.filter(record => species.includes(record.actor.species));
        assert.equal(records.length, 9);
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
            let maximumMotion = 0;
            for (const time of [.2, .4, .6, .8, 1]) {
                layer.population.time = time;
                layer.advance(0, false);
                const points = capture();
                assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
                assert.ok(new Box3().setFromPoints(points).getSize(new Vector3()).length() < 3.5);
                maximumMotion = Math.max(maximumMotion,
                    ...points.map((point, index) => point.distanceTo(before[index])));
            }
            if (record.actor.speed > 0)
                assert.ok(maximumMotion > .015, record.actor.id + ' must visibly deform');
            else
                assert.ok(maximumMotion < 1e-9, 'Hauled-out seals must retain their resting pose');
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
