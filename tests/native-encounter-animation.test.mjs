import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

function nativeFactory() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile('public' + path.split('?')[0]);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    return new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
}

async function equippedHuman(factory, age = 32, sex = 'male') {
    const dna = { ...defaultDNA(), age, sex };
    const presentation = fjordWardrobePresentation({ kind: 'persona', dna,
        status: { living: true, expedition: 'native-motion-proof',
            equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } });
    return factory.create(dna, 2, undefined, presentation);
}

function spearEnds(human) {
    const mesh = human.fit.modules.get('equipment/native-wooden-spear').children.find(value => value.isSkinnedMesh);
    human.sampleAnimation('Idle', 0);
    human.root.updateMatrixWorld(true);
    const point = vertex => mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld);
    let upper = 0, lower = 0;
    for (let vertex = 1; vertex < mesh.geometry.attributes.position.count; vertex++) {
        if (point(vertex).y > point(upper).y) upper = vertex;
        if (point(vertex).y < point(lower).y) lower = vertex;
    }
    return () => {
        human.root.updateMatrixWorld(true);
        const tip = point(upper), butt = point(lower);
        return { tip, butt, axis: tip.clone().sub(butt).normalize(),
            hand: human.fit.nativeSkeleton.bones[24].getWorldPosition(new Vector3()) };
    };
}

const request = (action, tick) => ({ key: 'recorded-exchange-1', action,
    startedAt: 100, durationTicks: 8, tick, hasSpear: true, hasShield: true });

test('a recorded spear action uses the existing Attack motion, moves the actual fitted spear forward and is repeatable without root drift or refitting', async () => {
    const human = await equippedHuman(nativeFactory());
    try {
        const measure = spearEnds(human), root = human.root.position.clone();
        const rig = human.fit.nativeSkeleton, fitRuns = human.modules.fitRuns;
        human.sampleEncounterPose(request('spear', 100));
        const ready = measure();
        human.sampleEncounterPose(request('spear', 104));
        const extended = measure();
        assert.equal(human.root.userData.clip, 'Attack', 'The supplied native source remains the action base');
        assert.ok(extended.axis.z > .8 && Math.abs(extended.axis.y) < .4,
            'The real spear points forward during the outgoing action');
        assert.ok(extended.tip.z - ready.tip.z > .18, 'The real source tip advances visibly: ' + JSON.stringify({ ready, extended }));
        assert.ok(extended.hand.z - ready.hand.z > .1, 'The carrying hand participates in the motion');
        const expected = rig.bones.map(bone => [...bone.position, ...bone.quaternion]);
        human.sampleEncounterPose(request('spear', 107));
        human.sampleEncounterPose(request('spear', 101));
        human.sampleEncounterPose(request('spear', 104));
        assert.deepEqual(rig.bones.map(bone => [...bone.position, ...bone.quaternion]), expected,
            'The same known presentation tick has exactly the same pose after unordered samples');
        assert.deepEqual(human.root.position, root);
        assert.equal(human.fit.nativeSkeleton, rig);
        assert.equal(human.modules.fitRuns, fitRuns);
    } finally { human.dispose(); }
});

test('a recorded block visibly raises the actual shield and retains its measured hand grip', async () => {
    const human = await equippedHuman(nativeFactory());
    try {
        const shield = human.fit.modules.get('equipment/native-wooden-shield').children.find(mesh => mesh.isSkinnedMesh);
        const left = human.fit.nativeSkeleton.bones[11];
        const centre = () => {
            human.root.updateMatrixWorld(true);
            const point = new Vector3();
            for (let vertex = 0; vertex < shield.geometry.attributes.position.count; vertex += 37)
                point.add(shield.getVertexPosition(vertex, new Vector3()).applyMatrix4(shield.matrixWorld));
            return point.divideScalar(Math.ceil(shield.geometry.attributes.position.count / 37));
        };
        human.sampleEncounterPose(request('ready', 100));
        const resting = centre(), hand = left.getWorldPosition(new Vector3());
        human.sampleEncounterPose(request('shield', 104));
        const blocked = centre(), raised = left.getWorldPosition(new Vector3());
        assert.ok(raised.y - hand.y > .12, 'The actual shield hand rises in a recorded block');
        assert.ok(blocked.y - resting.y > .1, 'The source shield follows that hand into a protective position');
        assert.equal(shield.skeleton, human.fit.nativeSkeleton);
        assert.ok(blocked.toArray().every(Number.isFinite));
    } finally { human.dispose(); }
});

// Substitute only Vite's base constant; the production model owner and real public bytes run unchanged.
async function nativeRuntimeClass(path, name) {
    const [{ readFileSync }, { createRequire }, { default: ts }] = await Promise.all([
        import('node:fs'), import('node:module'), import('typescript')]);
    const url = new URL('../src/' + path, import.meta.url), module = { exports: {} };
    const nativeRequire = createRequire(import.meta.url);
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const { loadTypeScript } = await import('../scripts/load-typescript.mjs');
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports[name];
}

test('the production model owner samples a known recorded action without its own clock and normal walking resumes afterward', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async url => String(url).startsWith('blob:') ? previousFetch(url) :
        new Response(await readFile('public' + String(url).split('?')[0]));
    const Models = await nativeRuntimeClass('fjord-play/FjordModels.ts', 'FjordModels');
    const Assets = await nativeRuntimeClass('core/AssetManager.ts', 'AssetManager');
    const models = new Models(new Assets());
    try {
        const entity = { kind: 'persona', id: 'motion-proof', dna: { ...defaultDNA(), age: 32 },
            transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
            status: { living: true, expedition: 'public-native-motion',
                equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } };
        const model = await models.create(entity);
        assert.deepEqual(models.diagnostics, []);
        assert.equal(models.animateEncounter(model, request('strike', 104)), true);
        assert.equal(model.userData.motion.sourceClip, 'Attack');
        assert.equal(model.userData.motion.presentationTick, 104);
        const time = model.userData.motion.clipTime;
        models.animateEncounter(model, request('strike', 104));
        assert.equal(model.userData.motion.clipTime, time, 'A paused canonical tick cannot advance the action');
        models.animate(model, 'Walk', models.pace(model), .1);
        assert.equal(model.userData.motion.sourceClip, 'Walking');
        assert.equal(model.userData.encounterPose, undefined, 'Ordinary movement releases the action layer');
    } finally { models.dispose(); globalThis.fetch = previousFetch; }
});

test('an exact recorded casualty retains its field tunic and historical gear, then stays fallen at and beyond the source death endpoint', async () => {
    const human = await equippedHuman(nativeFactory());
    const { FjordWardrobe, fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
    try {
        const wardrobe = new FjordWardrobe(nativeFactory(), message => assert.fail(message));
        const casualty = { kind: 'persona', id: 'recorded-casualty', dna: human.dna,
            status: { living: false, occupation: 'fisher', equipment: { weapon: null, shield: null },
                combatDeath: { version: 1, key: 'exact-combat-death', encounterId: 'encounter-1', tick: 100,
                    durationTicks: 5, expiresAt: 115,
                    equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } } };
        await wardrobe.reconcile(human, casualty);
        assert.ok(human.fit.modules.has('garment/meshy-grid-trial-001'), 'The casualty keeps the normal field tunic');
        assert.ok(human.fit.modules.has('equipment/native-wooden-spear'));
        assert.ok(human.fit.modules.has('equipment/native-wooden-shield'));
        assert.equal(human.fit.modules.has('garment/meshy-fisherman-tunic-009'), false);
        const ordinaryDead = fjordWardrobePresentation({ ...casualty,
            status: { ...casualty.status, combatDeath: undefined } });
        assert.deepEqual(ordinaryDead.equipmentItems, [], 'A historical receipt cannot add gear to an unrelated dead resident');
        human.root.position.set(13, 2, -7);
        human.root.rotation.y = .7;
        const root = human.root.position.clone(), rotation = human.root.quaternion.clone();
        human.sampleEncounterPose({ ...request('death', 100), durationTicks: 5 });
        const bones = human.fit.nativeSkeleton.bones, hips = bones[0].position.clone();
        const head = human.root.getObjectByName('mixamorigHead');
        const standing = head.getWorldPosition(new Vector3()).y;
        const fitRuns = human.modules.fitRuns;
        human.sampleEncounterPose({ ...request('death', 105), durationTicks: 5 });
        assert.equal(human.root.userData.clip, 'Fall_Dead_from_Abdominal_Injury');
        assert.ok(standing - head.getWorldPosition(new Vector3()).y > .5, 'The actual native body falls');
        assert.ok(head.getWorldPosition(new Vector3()).y < root.y + .5);
        assert.equal(bones[0].position.x, hips.x);
        assert.equal(bones[0].position.z, hips.z, 'Source death root motion cannot slide the casualty away');
        const fallen = bones.map(bone => [...bone.position, ...bone.quaternion]);
        human.sampleEncounterPose({ ...request('death', 200), durationTicks: 5 });
        assert.deepEqual(bones.map(bone => [...bone.position, ...bone.quaternion]), fallen,
            'A completed fall holds its final source frame instead of repeating or standing up');
        assert.deepEqual(human.root.position, root);
        assert.deepEqual(human.root.quaternion.toArray(), rotation.toArray());
        assert.equal(human.modules.fitRuns, fitRuns);
    } finally { human.dispose(); }
});

test('recorded survived contact and withdrawal have distinct restrained poses without inventing equipment', async () => {
    const factory = nativeFactory(), dna = { ...defaultDNA(), age: 32 };
    const human = await factory.create(dna, 2, undefined,
        { hair: 'none', beard: 'none', outfit: 'garment/meshy-grid-trial-001', equipment: 'none' });
    try {
        const torso = human.root.getObjectByName('mixamorigSpine2');
        const bare = { ...request('ready', 104), hasSpear: false, hasShield: false };
        human.sampleEncounterPose(bare);
        const ready = torso.quaternion.clone();
        human.sampleEncounterPose({ ...bare, action: 'brace' });
        assert.ok(torso.quaternion.angleTo(ready) > .08, 'A recorded survived hit visibly braces the existing body');
        human.sampleEncounterPose({ ...bare, action: 'withdraw' });
        assert.ok(torso.quaternion.angleTo(ready) > .05, 'A recorded withdrawal has a restrained guarded stance');
        assert.equal([...human.fit.modules.keys()].some(id => id.startsWith('equipment/')), false);
        assert.deepEqual(human.root.position.toArray(), [0, 0, 0]);
    } finally { human.dispose(); }
});

test('the raised real shield presents its protective face toward the observed opponent rather than its thin edge', async () => {
    const human = await equippedHuman(nativeFactory());
    try {
        const { Box3 } = await import('three');
        human.sampleEncounterPose(request('shield', 104));
        human.root.updateMatrixWorld(true);
        const shield = human.fit.modules.get('equipment/native-wooden-shield').children.find(mesh => mesh.isSkinnedMesh);
        const bounds = new Box3();
        for (let vertex = 0; vertex < shield.geometry.attributes.position.count; vertex++)
            bounds.expandByPoint(human.root.worldToLocal(shield.getVertexPosition(vertex, new Vector3()).applyMatrix4(shield.matrixWorld)));
        const size = bounds.getSize(new Vector3());
        assert.ok(size.x > .45 && size.z < .25,
            'The actual source disc faces forward in a block: ' + JSON.stringify(size));
    } finally { human.dispose(); }
});

test('eligible field bodies keep the real tunic covered and attached through the actual combat poses without severe sleeve stretch or motion refits', async () => {
    const { createArmStretchMeasure } = await import('../scripts/qa/outfit-arm-stretch.js');
    const factory = nativeFactory();
    for (const age of [16, 17]) for (const sex of ['male', 'female']) {
        const human = await equippedHuman(factory, age, sex);
        try {
            human.sampleAnimation('Idle', 0);
            const tunic = human.fit.modules.get('garment/meshy-grid-trial-001');
            const measure = createArmStretchMeasure({ meshes: tunic.children.filter(mesh => mesh.isSkinnedMesh)
                .map(mesh => ({ mesh, vertices: Array.from({ length: mesh.geometry.attributes.position.count },
                    (_, vertex) => mesh.getVertexPosition(vertex, new Vector3())) })) });
            const fitRuns = human.modules.fitRuns;
            for (const action of ['ready', 'spear', 'shield', 'brace', 'withdraw', 'death']) {
                for (const phase of [0, .25, .5, .75, 1]) {
                    human.sampleEncounterPose({ ...request(action, 100 + 8 * phase) });
                    human.root.updateMatrixWorld(true);
                    const stretch = measure();
                    assert.equal(stretch.stretchedTriangles, 0,
                        sex + ' ' + age + ' ' + action + ' phase ' + phase + ': ' + JSON.stringify(stretch));
                    assert.ok(human.fit.mesh.geometry.index.count < human.fit.sourceGeometry.index.count);
                    for (const group of human.fit.modules.values()) group.traverse(mesh => {
                        if (!mesh.isSkinnedMesh) return;
                        assert.equal(mesh.skeleton, human.fit.nativeSkeleton);
                        for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 211)
                            assert.ok(mesh.getVertexPosition(vertex, new Vector3()).toArray().every(Number.isFinite));
                    });
                }
            }
            assert.equal(human.modules.fitRuns, fitRuns);
        } finally { human.dispose(); }
    }
});

test('leaving a held ready pose restores the exact native Idle translations even when the ordinary clock delta is zero', async () => {
    const factory = nativeFactory(), human = await equippedHuman(factory), reference = await equippedHuman(factory);
    try {
        human.sampleEncounterPose(request('ready', 104));
        const time = human.animationState.time;
        reference.sampleAnimation('Idle', time);
        human.setAnimation('Idle');
        human.update(0);
        const positions = value => value.fit.nativeSkeleton.bones.map(bone => bone.position.toArray());
        assert.deepEqual(positions(human), positions(reference),
            'An unchanged mixer translation must not retain a constrained combat hip position');
        human.sampleEncounterPose(request('death', 108));
        human.setAnimation('Walk');
        human.update(.3);
        reference.sampleAnimation('Walk', human.animationState.time);
        const actual = positions(human), expected = positions(reference);
        actual.forEach((point, index) => point.forEach((coordinate, axis) =>
            assert.ok(Math.abs(coordinate - expected[index][axis]) < 1e-6)));
    } finally { human.dispose(); reference.dispose(); }
});

test('the actual scene and native model restore the same recorded pose after ordinary animation despite scene diagnostics sharing userData', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async url => String(url).startsWith('blob:') ? previousFetch(url) :
        new Response(await readFile('public' + String(url).split('?')[0]));
    const Models = await nativeRuntimeClass('fjord-play/FjordModels.ts', 'FjordModels');
    const Assets = await nativeRuntimeClass('core/AssetManager.ts', 'AssetManager');
    const { FjordEntities } = load('../src/fjord-play/FjordEntities.ts');
    const { LivingWorldController } = load('../src/fjord-play/LivingWorldController.ts');
    const { encounterFixture } = await import('./encounter-fixture.mjs');
    const physicalWorld = encounterFixture().context.world;
    const world = { ...physicalWorld, config: { seed: 32 }, placementPlan: [], settlement: { ...physicalWorld.settlement,
        bounds: { minX: 24, maxX: 112, minZ: 80, maxZ: 184 } } };
    const models = new Models(new Assets()), layer = new FjordEntities(models);
    try {
        const entity = { kind: 'persona', id: 'actual-native-scene', label: 'Recorded participant',
            selectionKey: 'persona:actual-native-scene', asset: 'human', dna: { ...defaultDNA(), age: 32 },
            transform: { x: 160, y: 0, z: 128, rotation: 0, scale: 1 },
            status: { living: true, expedition: 'motion-proof',
                equipment: { weapon: 'woodenSpear', shield: 'woodenShield' },
                encounter: { version: 1, id: 'known-scene-encounter', phase: 'engaging', active: true,
                    snapshotTick: 104, startedAt: 100, exchangeTicks: 8, withdrawing: false,
                    withdrawalStartedAt: null, withdrawalTicks: 5, facing: { x: 160, z: 132 },
                    outgoing: { key: 'known-scene-exchange', tick: 100, facing: { x: 160, z: 132 }, outcome: 'survived' } } } };
        layer.prepareEncounterPresentation(104);
        await layer.sync([entity]);
        const motion = new LivingWorldController(world);
        motion.reconcile([entity], { plots: [], paths: [] });
        layer.configureMotion(motion);
        layer.advance(motion, 0, false);
        const model = layer.root.children.find(child => child.userData.canonical?.id === entity.id);
        assert.ok(model && !model.userData.placeholder);
        const bones = model.getObjectByName('mixamorigHips');
        const pose = () => {
            const points = [];
            bones.traverse(bone => { if (bone.isBone) points.push([...bone.position, ...bone.quaternion]); });
            return points;
        };
        const expected = pose();
        models.animate(model, 'Idle', 0, 0);
        layer.advance(motion, 0, false);
        assert.deepEqual(pose(), expected,
            'A diagnostic request object cannot be mistaken for an already installed native pose');
        assert.equal(model.userData.motion.sourceClip, 'Attack');
        assert.equal(model.userData.motion.presentationTick, 104);
        assert.deepEqual(models.diagnostics, []);
    } finally { layer.dispose(); models.dispose(); globalThis.fetch = previousFetch; }
});

test('a public direct source sample invalidates the held recorded-action pose before the same known tick is requested again', async () => {
    const human = await equippedHuman(nativeFactory());
    try {
        const bones = human.fit.nativeSkeleton.bones;
        const pose = () => bones.map(bone => [...bone.position, ...bone.quaternion]);
        human.sampleEncounterPose(request('spear', 104));
        const expected = pose();
        human.sample(.4);
        assert.notDeepEqual(pose(), expected, 'The public source sampler actually changes the native pose');
        human.sampleEncounterPose(request('spear', 104));
        assert.deepEqual(pose(), expected,
            'A direct source sample cannot leave the recorded-action cache falsely installed');
    } finally { human.dispose(); }
});
