import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Box3, LoopOnce, Quaternion, Vector3 } from 'three';

const core = load('../src/simulation/SimulationCore.ts');
const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createFjordLayout, projectFjordSettlement } = load('../src/fjord-play/FjordProjection.ts');
const profile = {
    youngAdultAge: 1, adultAge: 2, adultFood: 1, youngFood: 0,
    femaleFoodPerWinter: 4, maleFoodPerWinter: 0, femaleMaterialsPerWinter: 0, maleMaterialsPerWinter: 0,
    exposedProductivityBps: 5000, youngSlaughterFood: 2, youngAdultSlaughterFood: 4, slaughterFood: 8,
    birthChanceBps: 10000, fertileMinAge: 2, fertileMaxAge: 6, birthInterval: 2,
    mortalityBands: [{ minAge: 0, chanceBps: 0 }], crowdingBps: 0,
    weatherMortalityBps: 0, capacityWeightBps: 10000,
};
const rules = {
    version: 2, profiles: Object.fromEntries(['chicken', 'pig', 'sheep', 'goat', 'goose'].map(id => [id, profile])),
    founding: { version: 1 }, breeding: { requireFed: true, capacityLimited: true, unassignedCapacityUnits: 60000 },
    hides: { cattle: 1, chicken: 0, pig: 1, sheep: 1, goat: 1, goose: 0 },
};
function campaign(species) {
    for (let seed = 0; seed < 48; seed++) {
        const state = core.createCampaign(seed, { initialFood: 10000, initialMaterials: 1000 },
            { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] },
            { enabled: false }, {}, {}, {}, 'summer-800-v1', undefined, { player: rules });
        if (Object.values(state.landing.cattle)[0].species === species) return state;
    }
    throw new Error('A deterministic founding fixture is required');
}

test('Fjord uses supplied sex and age models for Goat, Pig and Sheep without changing the campaign', () => {
    for (const species of ['goat', 'pig', 'sheep']) {
        const state = campaign(species);
        const world = generateWorld({ seed: state.seed });
        const layout = createFjordLayout(world);
        const before = core.serializeState(state);
        const view = projectFjordSettlement(state, world, layout);
        const animals = view.entities.filter(entity => entity.kind === 'cattle');
        assert.equal(animals.length, 3, species + ' founders must be visible');
        assert.deepEqual(animals.map(entity => entity.asset), [species + '/adult-female',
            species + '/adult-female', species + '/adult-male']);
        assert.ok(animals.every(entity => entity.status.species === species));
        assert.equal(core.serializeState(state), before);
        const born = core.advanceWinter(state);
        const newborns = projectFjordSettlement(born, world, view.layout).entities
            .filter(entity => entity.kind === 'cattle' && entity.status.age === 0);
        assert.ok(newborns.length > 0, 'The actual Core must produce the fixture offspring');
        assert.ok(newborns.every(entity => entity.asset === species + '/baby'));
    }
});

test('a real slaughter publishes death evidence without resurrecting an animal or altering its history', () => {
    const state = campaign('sheep');
    const world = generateWorld({ seed: state.seed });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const animal = Object.values(state.landing.cattle)[0];
    const dead = core.applyCommand(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    const before = core.serializeState(dead);
    const projection = projectFjordSettlement(dead, world, view.layout);
    assert.ok(projection.livestockDeaths.some(fact => fact.id === animal.id));
    assert.ok(!projection.entities.some(entity => entity.kind === 'cattle' && entity.id === animal.id));
    assert.equal(core.serializeState(dead), before);
    const reloaded = projectFjordSettlement(core.reconstructState(before), world, projection.layout);
    assert.deepEqual(reloaded.livestockDeaths, [], 'Loading history must not replay an old death');
    assert.equal(core.reconstructState(before).landing.cattle[animal.id].deathWinter, dead.time.winter);
});

test('death falls once, holds its final pose, then fades only its own materials and releases them', () => {
    const { LivestockDeath } = load('../src/fjord-play/LivestockDeath.ts');
    const { AnimationClip, AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial,
        NumberKeyframeTrack } = createRequire(import.meta.url)('three');
    const material = new MeshStandardMaterial();
    const geometry = new BoxGeometry();
    const root = new Group();
    root.add(new Mesh(geometry, material));
    const sibling = new Mesh(geometry, material);
    const clip = new AnimationClip('Death', 2.4, [new NumberKeyframeTrack('.rotation[z]', [0, 2.4], [0, -Math.PI / 2])]);
    const death = new LivestockDeath(root, new AnimationMixer(root), clip);
    const instance = root.children[0].material;
    let disposed = 0;
    instance.addEventListener('dispose', () => { disposed++; });
    death.advance(2.4, true);
    assert.ok(Math.abs(root.rotation.z + Math.PI / 2) < 1e-6);
    death.advance(2, true);
    assert.equal(death.inspect().opacity, 1);
    death.advance(2.5, true);
    assert.equal(death.inspect().opacity, .5);
    assert.equal(instance.opacity, .5);
    assert.equal(sibling.material.opacity, 1);
    assert.equal(material.transparent, false);
    const frozen = death.inspect();
    death.advance(60, false);
    assert.deepEqual(death.inspect(), frozen);
    assert.ok(Math.abs(root.rotation.z + Math.PI / 2) < 1e-6, 'The fallen animal must never stand or loop');
    death.advance(2.5, true);
    assert.equal(death.inspect().complete, true);
    assert.equal(instance.opacity, 0);
    death.dispose();
    death.dispose();
    assert.equal(disposed, 1);
    assert.equal(root.children[0].material, material);
    geometry.dispose(); material.dispose();
});

test('the public scene layer retains only confirmed deaths and cancels them on rollback or disposal', async () => {
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const { LivestockDeath } = load('../src/fjord-play/LivestockDeath.ts');
    const { AnimationClip, AnimationMixer, BoxGeometry, Group, Mesh, MeshStandardMaterial,
        NumberKeyframeTrack } = createRequire(import.meta.url)('three');
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const clip = new AnimationClip('Death', 2.4, [new NumberKeyframeTrack('.rotation[z]', [0, 2.4], [0, -Math.PI / 2])]);
    let releases = 0;
    const models = {
        async create() { const root = new Group(); root.add(new Mesh(geometry, material)); return root; },
        reconcile() {}, boundsShape() {}, release() { releases++; return false; },
        beginDeath(model) { return new LivestockDeath(model, new AnimationMixer(model), clip); },
    };
    const entity = { kind: 'cattle', id: 'sheep-1', selectionKey: 'cattle:sheep-1', label: 'Livestock 1',
        asset: 'sheep/adult-female', transform: { x: 3, y: 0, z: 4, rotation: .7, scale: 1 },
        status: { living: true, species: 'sheep', sex: 'female', stage: 'Adult' } };
    const layer = new FjordEntities(models);
    const motion = { inspect: () => [] };
    await layer.sync([entity]);
    await layer.sync([], undefined, () => true, [{ id: entity.id, position: { x: 3, z: 4 } }]);
    assert.equal(layer.describe().length, 0, 'Dead animals leave selection and production immediately');
    assert.equal(layer.root.children.length, 1, 'The same rendered body must remain during its death');
    layer.advance(motion, 3, true);
    assert.deepEqual(layer.root.children[0].position.toArray(), [3, 0, 4]);
    await layer.sync([]);
    assert.equal(layer.root.children.length, 1, 'Repeated reconciliation must retain one death');
    layer.advance(motion, 7, true);
    assert.equal(layer.root.children.length, 0);
    assert.equal(releases, 1);
    await layer.sync([entity]);
    await layer.sync([]);
    assert.equal(layer.root.children.length, 0, 'Removal without death evidence must be immediate');
    await layer.sync([entity]);
    await layer.sync([], undefined, () => true, [{ id: entity.id }]);
    await layer.sync([entity]);
    assert.equal(layer.root.children.length, 1, 'Rollback restores one living animal');
    assert.equal(layer.describe().length, 1);
    await layer.sync([], undefined, () => true, [{ id: entity.id }]);
    layer.retainVisibleDeaths(() => false);
    assert.equal(layer.root.children.length, 0, 'A corpse cannot outlive the rival visibility mask');
    layer.dispose();
    assert.equal(layer.root.children.length, 0);
    geometry.dispose(); material.dispose();
});

test('visible goats alternate grazing and authored rest without advancing the canonical herd', () => {
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const state = campaign('goat');
    const world = generateWorld({ seed: state.seed });
    const view = projectFjordSettlement(state, world, createFjordLayout(world));
    const motion = new LivingWorldController(world);
    const animals = view.entities.filter(entity => entity.kind === 'cattle');
    motion.reconcile(animals, view.ground);
    for (const animal of animals) {
        motion.setActivityClips(animal.selectionKey, { Graze: 1, Rest: 2 });
        motion.setPace(animal.selectionKey, .4);
    }
    const before = core.serializeState(state);
    const observed = new Set();
    for (let frame = 0; frame < 2400; frame++) {
        motion.advance(.1, true, true);
        for (const actor of motion.inspect()) observed.add(actor.state);
        if (observed.has('Graze') && observed.has('Rest')) break;
    }
    assert.ok(observed.has('Graze'));
    assert.ok(observed.has('Rest'));
    const paused = motion.inspect();
    motion.advance(20, false, true);
    assert.deepEqual(motion.inspect(), paused);
    assert.equal(core.serializeState(state), before);
});

test('published skins have bounded geometry, upright walks and an actual non-looping fallen end pose', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const originalSelf = globalThis.self;
    const originalBitmap = globalThis.createImageBitmap;
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
    try {
        for (const species of ['goat', 'pig', 'sheep', 'cattle']) {
            const variants = species === 'cattle' ? ['baby', 'young-adult', 'adult-female', 'adult-male'] :
                ['baby', 'adult-female', 'adult-male'];
            for (const variant of variants) {
                const directory = '../public/game-assets/' + (species === 'cattle' ? 'cattle/' : 'livestock/' + species + '/') + variant + '/';
                const manifest = JSON.parse(await readFile(new URL(directory + 'manifest.json', import.meta.url), 'utf8'));
                const bytes = await readFile(new URL(directory + manifest.file, import.meta.url));
                assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
                assert.equal(bytes.length, manifest.bytes);
                assert.ok(bytes.length < 1200000);
                assert.ok(manifest.triangles < 7000);
                const document = await io.readBinary(bytes);
                const names = document.getRoot().listAnimations().map(clip => clip.getName()).sort();
                assert.deepEqual(names, (species === 'cattle' ? ['Idle', 'Walk', 'Graze', 'HumanInteraction', 'Death'] :
                    ['Idle', 'Walk', 'Graze', 'HumanInteraction', 'Rest', 'Death']).sort());
                const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
                    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
                const mixer = new AnimationMixer(gltf.scene);
                const idle = gltf.animations.find(clip => clip.name === 'Idle');
                mixer.clipAction(idle).play(); mixer.setTime(0);
                gltf.scene.updateMatrixWorld(true);
                const standing = new Box3().setFromObject(gltf.scene, true);
                const trunk = gltf.scene.getObjectByName(species === 'cattle' ? 'Bone_000' : 'Hips');
                const localVertical = new Vector3(0, 1, 0).applyQuaternion(trunk.getWorldQuaternion(new Quaternion()).invert());
                const hips = gltf.scene.getObjectByName('Hips');
                const standingHip = hips?.getWorldPosition(new Vector3());
                mixer.stopAllAction();
                if (species !== 'cattle') {
                    const walk = gltf.animations.find(clip => clip.name === 'Walk');
                    mixer.clipAction(walk).play();
                    for (const phase of [0, .25, .5, .75]) {
                        mixer.setTime(walk.duration * phase); gltf.scene.updateMatrixWorld(true);
                        assert.ok(Math.abs(hips.getWorldPosition(new Vector3()).y - standingHip.y) < manifest.height * .12,
                            species + '/' + variant + ': walk must retain the upright trunk');
                    }
                    mixer.stopAllAction();
                }
                const death = gltf.animations.find(clip => clip.name === 'Death');
                const action = mixer.clipAction(death).reset().setLoop(LoopOnce, 1);
                action.clampWhenFinished = true; action.play();
                mixer.update(death.duration); gltf.scene.updateMatrixWorld(true);
                const fallen = new Box3().setFromObject(gltf.scene, true);
                const fallenVertical = localVertical.clone().applyQuaternion(trunk.getWorldQuaternion(new Quaternion()));
                assert.ok(Math.abs(fallenVertical.y) < .05,
                    species + '/' + variant + ': the actual trunk must lie on its side, including wide-horned rams');
                assert.ok(fallen.min.y > -.015, species + '/' + variant + ': fallen body must meet the ground');
                mixer.update(4); gltf.scene.updateMatrixWorld(true);
                assert.ok(new Box3().setFromObject(gltf.scene, true).equals(fallen));
                mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
            }
        }
    } finally {
        globalThis.self = originalSelf;
        globalThis.createImageBitmap = originalBitmap;
    }
});
