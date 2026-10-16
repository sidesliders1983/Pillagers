import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Color, Matrix4, Ray, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {load} from './load-source.mjs';
import {accessorValues, readGLB} from '../scripts/characters/glb-inspection.mjs';

const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile} = load('../src/characters/UniversalHumanProfile.ts');
const {meshyNativeRig} = load('../src/characters/MeshyNativeRig.ts');
const {braidedHairAsset} = load('../src/characters/BraidedHairCatalog.ts');
const {availableCharacterAssets, validateCharacterRegistry} = load('../src/characters/CharacterAssets.ts');
const id = braidedHairAsset.id;
const publicBytes = path => readFile(new URL('../public' + path.split('?')[0], import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = JSON.parse(await publicBytes(braidedHairAsset.metadata.nativeBinding.path));
const rearAt = y => {
    const profile = binding.hairRig.rearProfile;
    for (let i = 1; i < profile.length; i++) if (y <= profile[i][0]) {
        const a = profile[i - 1], b = profile[i];
        return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    return profile.at(-1)[1];
};
const presentation = {hair: id, beard: 'none', outfit: 'none', equipment: 'none'};
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const factory = new MeshyHumanFactory(async path => {
    const bytes = await publicBytes(path);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}, async path => {
    const bytes = await publicBytes(path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
});

test('braid geometry, fixed leather and owned-chain recipe have exact source receipts', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    const bytes = await publicBytes(braidedHairAsset.lods[2]);
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    assert.ok(!json.images?.length && !json.textures?.length && !json.skins?.length && !json.animations?.length);
    assert.equal(json.meshes.length, 1);
    assert.equal(binding.moduleSha256, hash(bytes));
    const bindingBytes = await publicBytes(braidedHairAsset.metadata.nativeBinding.path);
    assert.equal(hash(bindingBytes), braidedHairAsset.metadata.nativeBinding.sha256);
    const receipt = JSON.parse(await publicBytes(braidedHairAsset.lods[2].replace('.glb', '.provenance.json')));
    assert.equal(receipt.output.sha256, hash(bytes));
    assert.equal(receipt.bindingSha256, hash(bindingBytes));
    assert.equal(receipt.pipeline.sha256, hash(await readFile(new URL('../' + receipt.pipeline.path, import.meta.url))));
    assert.equal(binding.hairRig.bones.length, 6);
    assert.equal(binding.hairRig.fixedColor.color, '#684c33');
    assert.ok(binding.hairRig.fixedColor.vertices.length > 200);
    assert.ok(bytes.length < 300000);
    const record = readGLB(braidedHairAsset.lods[2]);
    const positions = accessorValues(record.json, record.binary, json.meshes[0].primitives[0].attributes.POSITION);
    const pointKey = point => point.map(value => Math.round(value * 1e6)).join(',');
    const strapContacts = new Set(binding.hairRig.fixedColor.vertices.map(vertex => pointKey(positions[vertex])));
    for (let vertex = 0; vertex < positions.length; vertex++) {
        if (!strapContacts.has(pointKey(positions[vertex]))) continue;
        for (const lod of [0, 1, 2]) assert.deepEqual(binding.lods[lod].weights[vertex],
            {joints: [47, 0, 0, 0], weights: [1, 0, 0, 0]}, 'Colour seams must not open under animation');
    }
});

test('the braid owns six extra bones while preserving the native rig through DNA and clip changes', async () => {
    for (const lod of [0, 1, 2]) {
        const dna = {...defaultDNA(), age: 32};
        const human = await factory.create(dna, lod, undefined, presentation);
        try {
            const mesh = human.fit.modules.get(id).children[0];
            assert.equal(human.fit.nativeSkeleton.bones.length, 44);
            assert.equal(mesh.skeleton.bones.length, 50);
            for (let bone = 0; bone < 44; bone++) {
                assert.equal(mesh.skeleton.bones[bone], human.fit.nativeSkeleton.bones[bone]);
            }
            assert.equal(mesh.skeleton.bones[44].parent, human.fit.nativeSkeleton.bones[5]);
            for (let bone = 45; bone < 50; bone++) assert.equal(mesh.skeleton.bones[bone].parent, mesh.skeleton.bones[bone - 1]);
            assert.equal(human.fit.mesh.geometry, human.fit.sourceGeometry);
            const baselineHead = new Vector3();
            for (const [clip, time] of [['NativeNeutral', 0], ['Idle', .2], ['Walk', .3], ['Walk', .8], ['Run', .5]]) {
                human.sampleAnimation(clip, time);
                human.root.updateMatrixWorld(true);
                mesh.skeleton.update();
                const inverseBack = human.fit.nativeSkeleton.bones[3].matrixWorld.clone()
                    .multiply(new Matrix4().fromArray(meshyNativeRig[3].matrix).invert()).invert();
                const points = [];
                let checked = 0;
                for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
                    const point = mesh.localToWorld(mesh.getVertexPosition(vertex, new Vector3()));
                    assert.ok(point.toArray().every(Number.isFinite));
                    points.push(point);
                    const weights = binding.lods[lod].weights[vertex];
                    const fixed = binding.hairRig.fixedColor.vertices.includes(vertex);
                    if (weights.weights[0] === 0 || fixed) {
                        const backPoint = point.clone().applyMatrix4(inverseBack);
                        if (backPoint.y > 1.12 && backPoint.y < 1.44) {
                            const clearance = rearAt(backPoint.y) + binding.hairRig.radius
                                + binding.hairRig.clearance - backPoint.z;
                            assert.ok(clearance > 0, clip + ' must retain clearance from the measured back');
                            checked++;
                        }
                    }
                }
                assert.ok(checked > 500);
                assert.ok(Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) < 1);
                human.fit.nativeSkeleton.bones[5].getWorldPosition(baselineHead);
                for (const bone of mesh.skeleton.bones.slice(44)) {
                    assert.ok(bone.getWorldPosition(new Vector3()).distanceTo(baselineHead) < .8);
                }
            }
            const root = mesh.skeleton.bones[44];
            human.applyDNA({...dna, age: 85, morphology: {...dna.morphology, masculinity: .15, height: 1.25}});
            human.sampleAnimation('Walk', .4);
            assert.equal(mesh.skeleton.bones[44], root);
            assert.equal(human.fit.nativeSkeleton.bones.length, 44);
            const dnaColor = new Color(universalHumanProfile(human.dna).appearance.color);
            const fixed = new Set(binding.hairRig.fixedColor.vertices);
            const colors = mesh.geometry.attributes.color;
            for (let vertex = 0; vertex < colors.count; vertex++) {
                const expected = fixed.has(vertex) ? new Color(binding.hairRig.fixedColor.color) : dnaColor;
                for (let channel = 0; channel < 3; channel++) {
                    assert.ok(Math.abs(colors.getComponent(vertex, channel) - expected.toArray()[channel]) < 1e-6);
                }
            }
            await factory.equip(human, {...presentation, hair: 'none'});
            assert.equal(root.parent, null);
            assert.equal(human.fit.modules.size, 0);
        } finally {human.dispose();}
    }
});

test('DNA/manual hair colour never recolours the leather, and instances own their hair chains', async () => {
    const a = await factory.create({...defaultDNA(), age: 32}, 2, undefined, {...presentation, hairColor: '#ffcc66'});
    const b = await factory.create({...defaultDNA(), age: 72}, 2, undefined, {...presentation, hairColor: '#172b46'});
    try {
        const meshA = a.fit.modules.get(id).children[0], meshB = b.fit.modules.get(id).children[0];
        assert.notEqual(meshA.skeleton, meshB.skeleton);
        assert.notEqual(meshA.skeleton.bones[44], meshB.skeleton.bones[44]);
        assert.notEqual(meshA.geometry, meshB.geometry);
        const fixed = new Set(binding.hairRig.fixedColor.vertices);
        for (const [mesh, hair] of [[meshA, '#ffcc66'], [meshB, '#172b46']]) {
            const colors = mesh.geometry.attributes.color;
            const leather = new Color(binding.hairRig.fixedColor.color), selected = new Color(hair);
            for (let vertex = 0; vertex < colors.count; vertex++) {
                const expected = fixed.has(vertex) ? leather : selected;
                for (let channel = 0; channel < 3; channel++) {
                    assert.ok(Math.abs(colors.getComponent(vertex, channel) - expected.toArray()[channel]) < 1e-6);
                }
            }
        }
        a.dispose();
        b.sampleAnimation('Walk', .6);
        assert.equal(b.fit.modules.size, 1);
    } finally {a.dispose(); b.dispose();}
});

test('the draped braid stays outside the actual tunic surface during neutral, Idle and Walk', async () => {
    const human = await factory.create({...defaultDNA(), age: 32}, 2, undefined,
        {...presentation, outfit: 'garment/meshy-grid-trial-001'});
    try {
        const hair = human.fit.modules.get(id).children[0];
        const garment = human.fit.modules.get('garment/meshy-grid-trial-001');
        const ray = new Ray(new Vector3(), new Vector3(0, 0, 1)), hit = new Vector3();
        for (const [clip, time] of [['NativeNeutral', 0], ['Idle', .6], ['Walk', .2], ['Walk', .6]]) {
            human.sampleAnimation(clip, time);
            human.root.updateMatrixWorld(true);
            const inverseBack = human.fit.nativeSkeleton.bones[3].matrixWorld.clone()
                .multiply(new Matrix4().fromArray(meshyNativeRig[3].matrix).invert()).invert();
            const surfaces = garment.children.map(mesh => ({indices: mesh.geometry.index?.array,
                points: Array.from({length: mesh.geometry.attributes.position.count}, (_, vertex) =>
                    mesh.localToWorld(mesh.getVertexPosition(vertex, new Vector3())).applyMatrix4(inverseBack))}));
            let tested = 0;
            for (let vertex = 0; vertex < hair.geometry.attributes.position.count; vertex += 17) {
                const point = hair.localToWorld(hair.getVertexPosition(vertex, new Vector3())).applyMatrix4(inverseBack);
                if (point.y < 1.15 || point.y > 1.43) continue;
                ray.origin.set(point.x, point.y, -2);
                let rear = Infinity;
                for (const surface of surfaces) {
                    const count = surface.indices?.length ?? surface.points.length;
                    for (let i = 0; i < count; i += 3) {
                        const a = surface.points[surface.indices?.[i] ?? i];
                        const b = surface.points[surface.indices?.[i + 1] ?? i + 1];
                        const c = surface.points[surface.indices?.[i + 2] ?? i + 2];
                        if (ray.intersectTriangle(a, b, c, false, hit)) rear = Math.min(rear, hit.z);
                    }
                }
                if (!Number.isFinite(rear)) continue;
                assert.ok(point.z < rear, clip + ' braid vertex crosses the actual tunic: '
                    + JSON.stringify({vertex, point: point.toArray(), rear}));
                tested++;
            }
            assert.ok(tested > 30);
        }
    } finally {human.dispose();}
});
