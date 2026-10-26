import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
const { occupationToolAssets } = load('../src/characters/OccupationToolCatalog.ts');
const { assetMeasurement, availableCharacterAssets, validateCharacterRegistry } = load('../src/characters/CharacterAssets.ts');
const { defaultCharacterPresentation, presentationChoices } = load('../src/characters/CharacterPresentation.ts');
const { meshyHumanAssetIdentity } = load('../src/characters/MeshyHumanAssetIdentity.ts');
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { snapshotModules } = load('../src/character-lab/LabSnapshot.ts');
const { fjordToolAsset } = load('../src/fjord-play/FjordWardrobe.ts');
const { validateNativeModule } = load('../src/characters/MeshyModuleRuntime.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const publicBytes = path => readFile('public' + path.split('?')[0]);
const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
const dna = { ...defaultDNA(), age: 32 };
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() { } });
function fixture() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), sources = new Map();
    const factory = new MeshyHumanFactory(async (path) => {
        const gltf = await loader.parseAsync(buffer(await publicBytes(path)), '');
        sources.set(path.split('?')[0], gltf);
        return gltf;
    }, async (path) => buffer(await publicBytes(path)));
    return { factory, sources };
}
function positions(mesh) { const p = mesh.geometry.getAttribute('position'); return Array.from({ length: p.count * 3 }, (_, i) => p.getComponent(Math.floor(i / 3), i % 3)); }
const { validateModule, moduleAtEquipmentSocket } = load('../src/characters/AttachmentContract.ts');
test('four source-bound tools preserve source topology, UVs and colours with small runtime textures', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    assert.equal(occupationToolAssets.length, 4);
    for (const entry of occupationToolAssets) {
        const path = entry.lods[2], bytes = await publicBytes(path), bindingBytes = await publicBytes(entry.metadata.nativeBinding.path);
        const binding = JSON.parse(bindingBytes), receipt = JSON.parse(await publicBytes(path.replace('.glb', '.provenance.json')));
        assert.equal(hash(bytes), assetMeasurement(path).sha256);
        assert.equal(hash(bindingBytes), entry.metadata.nativeBinding.sha256);
        assert.equal(binding.moduleSha256, hash(bytes));
        assert.equal(receipt.output.triangles, receipt.source.triangles + (entry.id.endsWith('hunter') ? 16 : 0));
        assert.equal(receipt.output.triangles, entry.budgets.runtimeTriangles);
        assert.ok(bytes.length < 900000, 'Oversized source maps must not ship');
        assert.equal(binding.skinning, 'rigid-native-equipment');
        assert.deepEqual(binding.precomputedNative.moduleCoverage, []);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.ok(!json.skins?.length && !json.animations?.length, 'Tools reuse the existing native bones and clips');
        assert.ok(json.meshes.every(mesh => mesh.primitives.every(p => p.attributes.TEXCOORD_0 !== undefined)));
        assert.ok(json.materials.every(mat => !mat.normalTexture && !mat.occlusionTexture));
        assert.doesNotThrow(() => validateModule(entry.metadata));
        assert.doesNotThrow(() => moduleAtEquipmentSocket(entry.metadata, entry.metadata.anchor));
        assert.throws(() => moduleAtEquipmentSocket(entry.metadata, entry.metadata.anchor === 'socket_hand_R' ? 'socket_hand_L' : 'socket_hand_R'), /Unsupported/);
        const bad = structuredClone(entry.metadata);
        bad.equipmentBindings.grip.quaternion = [0, 0, 0, 2];
        assert.throws(() => validateModule(bad));
        for (const body of meshyHumanAssetIdentity)
            assert.ok(presentationChoices('equipment', { id: 'body/meshy-human', sha256: body.sha256 }).some(choice => choice.id === entry.id));
        const snapshot = snapshotModules(dna, { ...bare, equipment: entry.id }, 2, { version: 1, preset: 'auto', source: 'meshy' });
        assert.ok(snapshot.some(record => record.id === entry.id && record.binding.sha256 === hash(bindingBytes)));
    }
});
test('occupation tools are adult-only for the four canonical jobs, independent of clothing, sex and hats', () => {
    for (const occupation of ['farmer', 'fisher', 'hunter', 'smith']) {
        const person = { kind: 'persona', dna, status: { occupation } };
        assert.equal(fjordToolAsset(person), 'equipment/occupation-' + occupation);
        assert.equal(fjordToolAsset({ ...person, dna: { ...dna, sex: 'female' } }), 'equipment/occupation-' + occupation);
        assert.equal(fjordToolAsset({ ...person, dna: { ...dna, age: 17 } }), 'none');
    }
    for (const occupation of [null, 'woodworker', 'boatbuilder', 'trader'])
        assert.equal(fjordToolAsset({ kind: 'persona', dna, status: { occupation } }), 'none');
    assert.equal(fjordToolAsset({ kind: 'cattle', dna, status: { occupation: 'farmer' } }), 'none');
});
test('all tool parts remain rigid to their declared hand/back joint across LODs, Walking and Idle', async () => {
    const { factory } = fixture();
    for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod, undefined, bare);
        human.root.position.set(12, 3, -8);
        human.root.rotation.y = .7;
        try {
            const nativeBones = human.fit.nativeSkeleton.bones.slice(), sourceBody = human.fit.sourceGeometry;
            for (const entry of occupationToolAssets) {
                await factory.equip(human, { ...bare, equipment: entry.id });
                const binding = JSON.parse(await publicBytes(entry.metadata.nativeBinding.path)), group = human.fit.modules.get(entry.id);
                assert.equal(human.fit.mesh.geometry, sourceBody, 'Tools must never mask the body');
                assert.deepEqual(human.fit.nativeSkeleton.bones, nativeBones);
                assert.equal(nativeBones.length, 44);
                const references = new Map(), originals = new Map();
                for (const spec of binding.rigidEquipment.parts) {
                    const mesh = group.getObjectByName(spec.mesh);
                    originals.set(mesh, positions(mesh));
                    assert.equal(mesh.skeleton, human.fit.nativeSkeleton);
                    for (let i = 0; i < mesh.geometry.attributes.skinIndex.count; i++) {
                        assert.equal(mesh.geometry.attributes.skinIndex.getX(i), spec.joint);
                        assert.equal(mesh.geometry.attributes.skinWeight.getX(i), 1);
                    }
                }
                const runs = human.modules.fitRuns;
                for (const [clip, time] of [['Walking', 0], ['Walking', .3], ['Walking', .6], ['Walking', .9], ['Walking', 1.2], ['Idle_02', .2], ['Idle_02', .7]]) {
                    human.sampleAnimation(clip, time);
                    human.root.updateMatrixWorld(true);
                    for (const spec of binding.rigidEquipment.parts) {
                        const mesh = group.getObjectByName(spec.mesh), inverse = nativeBones[spec.joint].matrixWorld.clone().invert(), points = [];
                        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 79) {
                            const world = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
                            assert.ok(world.toArray().every(Number.isFinite));
                            assert.ok(world.y > 3.03, 'Carried equipment must remain above the ground');
                            points.push(world.applyMatrix4(inverse));
                        }
                        if (references.has(spec.mesh))
                            points.forEach((point, i) => assert.ok(point.distanceTo(references.get(spec.mesh)[i]) < 1e-5, 'A rigid part moved relative to its native parent'));
                        references.set(spec.mesh, points);
                        assert.deepEqual(positions(mesh), originals.get(mesh), 'Animation must not edit the tool mesh');
                    }
                }
                assert.equal(human.modules.fitRuns, runs, 'Motion must not refit rigid equipment');
            }
        }
        finally {
            human.dispose();
        }
    }
});
test('tool clones retain fixed colours, coexist with hats and long hair, and restore cleanly after None', async () => {
    const { factory, sources } = fixture(), entry = occupationToolAssets.find(asset => asset.id.endsWith('hunter'));
    const presentation = { ...bare, equipment: entry.id, headwear: 'headwear/occupation-hunter', hair: 'hair/manual-long-braided' };
    const human = await factory.create(dna, 2, undefined, presentation);
    try {
        const group = human.fit.modules.get(entry.id), source = sources.get(entry.lods[2]), saved = new Map();
        source.scene.traverse(mesh => {
            if (mesh.isMesh)
                saved.set(mesh.name, positions(mesh));
        });
        const colours = [];
        group.traverse(mesh => {
            if (mesh.isMesh) {
                const cached = source.scene.getObjectByName(mesh.name);
                assert.notEqual(mesh.geometry, cached.geometry);
                assert.notEqual(mesh.material, cached.material);
                colours.push(mesh.material.color.getHexString());
            }
        });
        await factory.equip(human, { ...presentation, hairColor: '#123456' });
        const next = [];
        human.fit.modules.get(entry.id).traverse(mesh => {
            if (mesh.isMesh)
                next.push(mesh.material.color.getHexString());
        });
        assert.deepEqual(next, colours, 'DNA hair colour must not tint tools');
        human.sampleAnimation('Walking', .6);
        await factory.equip(human, bare);
        assert.ok(!human.fit.modules.has(entry.id));
        assert.equal(human.fit.mesh.geometry, human.fit.sourceGeometry);
        await factory.equip(human, presentation);
        for (const [name, vertices] of saved)
            assert.deepEqual(positions(source.scene.getObjectByName(name)), vertices, 'Cached tool geometry changed');
        assert.ok(human.fit.modules.has(presentation.hair) && human.fit.modules.has(presentation.headwear));
    }
    finally {
        human.dispose();
    }
});
test('native tools reject wrong weights, UVs, body identities, body masks and forged part sockets', async () => {
    const { factory, sources } = fixture(), entry = occupationToolAssets[0], human = await factory.create(dna, 0, undefined, { ...bare, equipment: entry.id });
    try {
        const binding = JSON.parse(await publicBytes(entry.metadata.nativeBinding.path)), source = sources.get(entry.lods[2]), candidate = { asset: entry, source, binding };
        assert.doesNotThrow(() => validateNativeModule(candidate, human.fit));
        for (const mutate of [
            b => b.rigidEquipment.parts[0].joint = 3,
            b => b.rigidEquipment.parts[0].socket = 'socket_back',
            b => b.rigidEquipment.parts[0].grip = [NaN, 0, 0],
            b => b.rigidEquipment.parts.push(b.rigidEquipment.parts[0]),
            b => b.precomputedNative.moduleCoverage = [{ regions: ['HEAD'], minimumY: 0, maximumY: 2 }],
            b => b.precomputedNative.bodyBindings = [],
            b => delete b.rigidEquipment,
            b => delete b.rigidEquipment.gripPose,
            b => b.rigidEquipment.gripPose.wristJoint = 5,
            b => b.rigidEquipment.gripPose.fingers[0].joint = 0,
            b => b.rigidEquipment.gripPose.wristRotation = [0, 0, 0, 2],
            b => b.rigidEquipment.gripPose.forearmJoint = 3,
            b => b.rigidEquipment.gripPose.upperArmBlend = 2,
            b => b.rigidEquipment.gripPose.axis = [0, 0, 0],
        ]) {
            const changed = structuredClone(binding);
            mutate(changed);
            assert.throws(() => validateNativeModule({ ...candidate, binding: changed }, human.fit));
        }
        const mesh = source.scene.children[0], weights = mesh.geometry.attributes.skinWeight, uv = mesh.geometry.attributes.uv;
        weights.setX(0, .5);
        assert.throws(() => validateNativeModule(candidate, human.fit));
        weights.setX(0, 1);
        mesh.geometry.deleteAttribute('uv');
        assert.throws(() => validateNativeModule(candidate, human.fit), /UV/);
        mesh.geometry.setAttribute('uv', uv);
    }
    finally {
        human.dispose();
    }
});
test('equipment survives short, tall, feminine and older DNA refits without stale geometry or ground penetration', async () => {
    const { fitPreset } = load('../src/characters/FitPresets.ts'), { factory } = fixture();
    const human = await factory.create(dna, 2, undefined, bare);
    try {
        for (const preset of ['short', 'tall', 'feminine', 'older']) {
            human.applyDNA(fitPreset(preset, dna));
            for (const entry of occupationToolAssets) {
                await factory.equip(human, { ...bare, equipment: entry.id });
                for (const clip of ['Walking', 'Idle_02']) {
                    human.sampleAnimation(clip, .6);
                    human.root.updateMatrixWorld(true);
                    human.fit.modules.get(entry.id).traverse(mesh => {
                        if (!mesh.isSkinnedMesh)
                            return;
                        for (let i = 0; i < mesh.geometry.attributes.position.count; i += 79) {
                            const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
                            assert.ok(point.toArray().every(Number.isFinite));
                            assert.ok(point.y > .03, preset + ' tool penetrated the ground');
                        }
                    });
                }
            }
        }
    }
    finally {
        human.dispose();
    }
});
test('shafts pass through the measured curved finger cavity through Idle and Walking, rather than along the fingers', async () => {
    const { factory, sources } = fixture(), human = await factory.create(dna, 0, undefined, bare);
    const circle = (a, b, c) => {
        const ab = b.clone().sub(a), ac = c.clone().sub(a), n = ab.clone().cross(ac);
        const centre = a.clone().add(n.clone().cross(ab).multiplyScalar(ac.lengthSq()).add(ac.clone().cross(n).multiplyScalar(ab.lengthSq())).divideScalar(2 * n.lengthSq()));
        return { centre, normal: n.normalize() };
    };
    try {
        for (const entry of occupationToolAssets) {
            await factory.equip(human, { ...bare, equipment: entry.id });
            const binding = JSON.parse(await publicBytes(entry.metadata.nativeBinding.path)), pose = binding.rigidEquipment.gripPose;
            const part = binding.rigidEquipment.parts.find(part => part.joint === pose.wristJoint), mesh = human.fit.modules.get(entry.id).getObjectByName(part.mesh);
            const sourceMesh = sources.get(entry.lods[2]).scene.getObjectByName(part.mesh), p = sourceMesh.geometry.attributes.position;
            const axis = new Vector3(...pose.axis), centre = new Vector3(...part.grip);
            let samples = 0, maxRadius = 0;
            for (let i = 0; i < p.count; i++) {
                const delta = new Vector3().fromBufferAttribute(p, i).sub(centre), along = delta.dot(axis);
                if (Math.abs(along) < .025) {
                    samples++;
                    maxRadius = Math.max(maxRadius, delta.addScaledVector(axis, -along).length());
                }
            }
            assert.ok(samples > 4, 'The grip needs an actual authored handle section');
            assert.ok(maxRadius < .035, 'The handle must fit inside the large native fingers');
            const bones = human.fit.nativeSkeleton.bones, middle = pose.wristJoint === 11 ? [17, 18, 19] : [30, 31, 32];
            for (const clip of ['Walking', 'Idle_02'])
                for (const time of [0, .3, .6, .9, 1.2]) {
                    human.sampleAnimation(clip, time);
                    human.root.updateMatrixWorld(true);
                    const finger = circle(...middle.map(index => bones[index].getWorldPosition(new Vector3())));
                    const world = point => point.clone().applyMatrix4(human.fit.encoding.clone().invert())
                        .applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[pose.wristJoint])
                        .applyMatrix4(bones[pose.wristJoint].matrixWorld).applyMatrix4(mesh.bindMatrixInverse).applyMatrix4(mesh.matrixWorld);
                    const grip = world(centre), shaft = world(centre.clone().addScaledVector(axis, .1)).sub(grip).normalize();
                    assert.ok(Math.abs(shaft.dot(finger.normal)) > .98, 'Shaft is not transverse to the curved fingers');
                    assert.ok(grip.distanceTo(finger.centre) < .004, 'Handle escaped the actual finger cavity');
                }
        }
    }
    finally {
        human.dispose();
    }
});
test('carry overlays do not accumulate and None or switching hands restores the original animated arm', async () => {
    const { factory } = fixture(), human = await factory.create(dna, 2, undefined, bare), control = await factory.create(dna, 2, undefined, bare);
    const rotations = model => model.fit.nativeSkeleton.bones.map(bone => bone.quaternion.clone());
    const compare = (a, b) => a.forEach((q, i) => assert.ok(1 - Math.abs(q.dot(b[i])) < 1e-6, 'Unexpected pose difference at joint ' + i));
    try {
        for (const clip of ['Idle_02', 'Walking']) {
            human.sampleAnimation(clip, .6);
            control.sampleAnimation(clip, .6);
            const original = rotations(control);
            for (const id of ['equipment/occupation-farmer', 'equipment/occupation-hunter', 'equipment/occupation-smith', 'equipment/occupation-fisher']) {
                await factory.equip(human, { ...bare, equipment: id });
                human.sampleAnimation(clip, .6);
                const posed = rotations(human);
                for (let frame = 0; frame < 40; frame++)
                    human.update(0);
                compare(rotations(human), posed);
                const opposite = id.endsWith('hunter') ? [22, 23, 24, 26, 27, 28, 30, 31, 32] : [9, 10, 11, 13, 14, 15, 17, 18, 19];
                for (const joint of opposite)
                    assert.ok(1 - Math.abs(rotations(human)[joint].dot(original[joint])) < 1e-6, 'Empty arm inherited a tool grasp');
                await factory.equip(human, bare);
                compare(rotations(human), original);
            }
        }
        await factory.equip(human, { ...bare, equipment: 'equipment/occupation-hunter' });
        human.sampleAnimation('Walking', .6);
        control.sampleAnimation('Walking', .6);
        human.update(.2);
        control.update(.2);
        await factory.equip(human, bare);
        compare(rotations(human), rotations(control));
        await factory.equip(human, { ...bare, equipment: 'equipment/occupation-hunter' });
        human.sampleAnimation('Attack', .3);
        control.sampleAnimation('Attack', .3);
        compare(rotations(human), rotations(control));
        human.sampleNativeNeutral();
        control.sampleNativeNeutral();
        compare(rotations(human), rotations(control));
        const changed = { ...dna, morphology: { masculinity: .01, height: 1.16 }, sex: 'female' };
        human.applyDNA(changed);
        control.applyDNA(changed);
        human.sampleAnimation('Walking', .6);
        control.sampleAnimation('Walking', .6);
        await factory.equip(human, bare);
        compare(rotations(human), rotations(control));
    }
    finally {
        human.dispose();
        control.dispose();
    }
});

test('ceremony attendance hides the actual occupation tool and its carry grip without rebuilding the resident', async () => {
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const { factory } = fixture();
    const human = await factory.create(dna, 2, undefined, bare);
    const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
    try {
        human.sampleAnimation('Idle_02', .25);
        const natural = human.fit.nativeSkeleton.bones.map(bone => bone.quaternion.clone());
        const tool = occupationToolAssets.find(asset => asset.id === 'equipment/occupation-farmer');
        await factory.equip(human, { ...bare, equipment: tool.id });
        human.sampleAnimation('Idle_02', .25);
        const group = human.fit.modules.get(tool.id);
        const revision = human.equipRevision, fits = human.modules.fitRuns;
        const body = human.fit.mesh.geometry;
        assert.equal(group.visible, true);
        wardrobe.setToolsVisible(human, false);
        human.sampleAnimation('Idle_02', .25);
        assert.equal(group.visible, false);
        const binding = JSON.parse(await publicBytes(tool.metadata.nativeBinding.path));
        const pose = binding.rigidEquipment.gripPose;
        for (const index of [pose.upperArmJoint, pose.forearmJoint, pose.wristJoint,
            ...pose.fingers.map(finger => finger.joint)]) {
            assert.deepEqual(human.fit.nativeSkeleton.bones[index].quaternion.toArray(), natural[index].toArray(),
                'A hidden tool must not impose a carry grip on the ceremony pose');
        }
        wardrobe.setToolsVisible(human, true);
        human.sampleAnimation('Idle_02', .25);
        assert.equal(group.visible, true);
        assert.equal(human.fit.modules.get(tool.id), group);
        assert.equal(human.equipRevision, revision);
        assert.equal(human.modules.fitRuns, fits);
        assert.equal(human.fit.mesh.geometry, body);
    } finally { human.dispose(); }
});

test('occupation changes during a ceremony retain hidden tools and restore the current tool afterward', async () => {
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const { factory } = fixture(), human = await factory.create(dna, 2, undefined, bare);
    const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
    const entity = occupation => ({ id: 'resident-1', kind: 'persona', dna, status: { occupation } });
    try {
        await wardrobe.reconcile(human, entity('farmer'));
        assert.equal(human.fit.modules.get('equipment/occupation-farmer').visible, true);
        wardrobe.setToolsVisible(human, false);
        await wardrobe.reconcile(human, entity('fisher'));
        const current = human.fit.modules.get('equipment/occupation-fisher');
        assert.ok(current);
        assert.equal(current.visible, false);
        for (const [id, group] of human.fit.modules)
            if (!id.startsWith('equipment/occupation-')) assert.equal(group.visible, true, id);
        wardrobe.setToolsVisible(human, true);
        assert.equal(current.visible, true);
        assert.equal(human.fit.modules.has('equipment/occupation-farmer'), false);
    } finally { human.dispose(); }
});
