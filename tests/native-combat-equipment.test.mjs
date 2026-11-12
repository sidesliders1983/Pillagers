import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

const { characterAsset, assetMeasurement, availableCharacterAssets, validateCharacterRegistry } = load('../src/characters/CharacterAssets.ts');
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const bytesFor = path => readFile('public' + path.split('?')[0]);
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

function nativeFactory() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    return new MeshyHumanFactory(async path => loader.parseAsync(buffer(await bytesFor(path)), ''),
        async path => buffer(await bytesFor(path)));
}

test('the review wooden spear fits the existing native right hand without replacing the resident rig', async () => {
    const asset = characterAsset('equipment/native-wooden-spear');
    assert.equal(asset.reviewStatus, 'preview');
    assert.equal(asset.metadata.anchor, 'socket_hand_R');
    const human = await nativeFactory().create({ ...defaultDNA(), age: 32 }, 2, undefined,
        { hair: 'none', beard: 'none', outfit: 'none', equipment: asset.id });
    try {
        assert.equal(human.fit.nativeSkeleton.bones.length, 44);
        assert.ok(human.fit.modules.has(asset.id));
        const binding = JSON.parse(await bytesFor(asset.metadata.nativeBinding.path));
        assert.equal(binding.supportedAges.min, 16);
        assert.equal(binding.materialPolicy.kind, 'provider-original');
        assert.equal(binding.materialPolicy.provider, 'Meshy');
        assert.equal(binding.rigidEquipment.parts.every(part => part.joint === 24), true);
        const original = human.fit.nativeSkeleton.bones.slice();
        const runs = human.modules.fitRuns;
        for (const [clip, time] of [['Idle_02', .6], ['Walking', .3], ['Running', .4]]) {
            human.sampleAnimation(clip, time);
            human.root.updateMatrixWorld(true);
            assert.deepEqual(human.fit.nativeSkeleton.bones, original);
        }
        assert.equal(human.modules.fitRuns, runs);
    } finally {
        human.dispose();
    }
});


test('both actual source shields use the existing native left hand for eligible residents', async () => {
    const factory = nativeFactory();
    for (const assetId of ['equipment/native-wooden-shield', 'equipment/native-leather-shield']) {
        const asset = characterAsset(assetId);
        assert.equal(asset.metadata.anchor, 'socket_hand_L');
        const binding = JSON.parse(await bytesFor(asset.metadata.nativeBinding.path));
        assert.equal(binding.rigidEquipment.parts.every(part => part.joint === 11), true);
        assert.equal(binding.precomputedNative.moduleCoverage.length, 0);
        for (const age of [16, 17, 32, 80]) {
            const human = await factory.create({ ...defaultDNA(), age }, 2, undefined,
                { hair: 'none', beard: 'none', outfit: 'none', equipment: asset.id });
            try {
                assert.equal(human.fit.nativeSkeleton.bones.length, 44);
                assert.ok(human.fit.modules.has(asset.id));
                const fitRuns = human.modules.fitRuns;
                human.sampleAnimation('Walking', .3);
                human.sampleAnimation('Running', .4);
                human.root.updateMatrixWorld(true);
                assert.equal(human.modules.fitRuns, fitRuns, 'Carrying motion cannot rebuild the body or prop fit');
            } finally {
                human.dispose();
            }
        }
    }
});


test('supplied prop provenance and native rigid transforms survive all existing body LODs', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    const expected = [
        ['wooden-spear', 3098, 24, 'f643ee1d240c2e0006caa66e60e45d512c6fd4a49533369d10965ded3e0a0fe6'],
        ['wooden-shield', 2914, 11, '30b7d88b41b7b78550a54a217518561939ebbf745f6b50c9deb862c8916b9ea1'],
        ['leather-shield', 3020, 11, '9a8513cba8e15bdf76d86707849528b3bb6dfaa1eb2c88eef8d764026a3833a6'],
    ];
    const factory = nativeFactory();
    for (const [name, triangles, joint, sourceHash] of expected) {
        const asset = characterAsset('equipment/native-' + name), path = asset.lods[2];
        const bytes = await bytesFor(path), receipt = JSON.parse(await bytesFor(path.replace('.glb', '.provenance.json')));
        const bindingBytes = await bytesFor(asset.metadata.nativeBinding.path), binding = JSON.parse(bindingBytes);
        const hash = value => createHash('sha256').update(value).digest('hex');
        assert.equal(hash(bytes), assetMeasurement(path).sha256);
        assert.equal(hash(bindingBytes), asset.metadata.nativeBinding.sha256);
        assert.equal(receipt.source.sha256, sourceHash);
        assert.equal(receipt.reviewRequired, true);
        assert.equal(receipt.reviewStatus, 'pending-combined-owner-QA');
        assert.equal(receipt.output.triangles, triangles, 'Preparation preserves every real source triangle');
        assert.equal(receipt.output.materials, 1);
        assert.ok(bytes.length < 900000, 'Original multi-megabyte source textures cannot ship unchanged');
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.equal(json.skins?.length ?? 0, 0);
        assert.equal(json.animations?.length ?? 0, 0);
        assert.equal(json.images.length, 2);
        for (const lod of [0, 1, 2]) {
            const human = await factory.create({ ...defaultDNA(), age: 32 }, lod, undefined,
                { hair: 'none', beard: 'none', outfit: 'none', equipment: asset.id });
            try {
                human.root.position.set(7, 2, -3);
                human.root.rotation.y = .4;
                const module = human.fit.modules.get(asset.id), part = module.getObjectByName(binding.rigidEquipment.parts[0].mesh);
                const bones = human.fit.nativeSkeleton.bones.slice();
                assert.equal(part.skeleton, human.fit.nativeSkeleton);
                assert.equal(bones.length, 44);
                assert.equal(human.fit.mesh.geometry, human.fit.sourceGeometry, 'A prop cannot replace or mask the tunic body');
                const fitRuns = human.modules.fitRuns;
                let reference;
                for (const [clip, time] of [['Idle_02', .6], ['Walking', .2], ['Walking', .7], ['Running', .15], ['Running', .45]]) {
                    human.sampleAnimation(clip, time);
                    human.root.updateMatrixWorld(true);
                    const inverse = bones[joint].matrixWorld.clone().invert(), points = [];
                    for (let vertex = 0; vertex < part.geometry.attributes.position.count; vertex += 97) {
                        const point = part.getVertexPosition(vertex, new Vector3()).applyMatrix4(part.matrixWorld);
                        assert.ok(point.toArray().every(Number.isFinite));
                        assert.ok(point.y > 2.01, 'Carried source props stay above the real ground');
                        points.push(point.applyMatrix4(inverse));
                    }
                    if (reference) points.forEach((point, index) =>
                        assert.ok(point.distanceTo(reference[index]) < 1e-5, 'The prop stays rigidly in its measured hand'));
                    reference = points;
                }
                assert.equal(human.modules.fitRuns, fitRuns);
                assert.deepEqual(human.fit.nativeSkeleton.bones, bones);
            } finally {
                human.dispose();
            }
        }
    }
});
