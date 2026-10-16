import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Color, Vector3} from 'three';
import {NodeIO} from '@gltf-transform/core';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {load} from './load-source.mjs';

const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile} = load('../src/characters/UniversalHumanProfile.ts');
const {longHairAsset} = load('../src/characters/LongHairCatalog.ts');
const {availableCharacterAssets, validateCharacterRegistry} = load('../src/characters/CharacterAssets.ts');
const id = longHairAsset.id;
const publicBytes = path => readFile(new URL('../public' + path.split('?')[0], import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = JSON.parse(await publicBytes(longHairAsset.metadata.nativeBinding.path));
const presentation = {hair: id, beard: 'none', outfit: 'garment/meshy-grid-trial-001', equipment: 'none'};
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
const bytes = await publicBytes(longHairAsset.lods[2]);
const document = await new NodeIO().readBinary(bytes);
const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
const positions = primitive.getAttribute('POSITION');
const indices = primitive.getIndices().getArray();

test('long hair retains its source topology, exact receipts and textureless DNA material', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    assert.equal(document.getRoot().listTextures().length, 0);
    assert.equal(document.getRoot().listSkins().length, 0);
    assert.equal(document.getRoot().listAnimations().length, 0);
    assert.equal(positions.getCount(), 8016);
    assert.equal(indices.length / 3, 5742);
    assert.equal(primitive.getAttribute('TEXCOORD_0'), null);
    assert.equal(binding.moduleSha256, hash(bytes));
    const bindingBytes = await publicBytes(longHairAsset.metadata.nativeBinding.path);
    assert.equal(hash(bindingBytes), longHairAsset.metadata.nativeBinding.sha256);
    const receipt = JSON.parse(await publicBytes(longHairAsset.lods[2].replace('.glb', '.provenance.json')));
    assert.equal(receipt.output.sha256, hash(bytes));
    assert.equal(receipt.bindingSha256, hash(bindingBytes));
    assert.equal(receipt.pipeline.sha256, hash(await readFile(new URL('../' + receipt.pipeline.path, import.meta.url))));
    assert.ok(bytes.length < 400000);
    for (const lod of Object.values(binding.lods)) {
        assert.ok(lod.weights.some(value => value.weights[2] > .9));
        for (let vertex = 0; vertex < positions.getCount(); vertex++) {
            const value = lod.weights[vertex];
            assert.deepEqual(value.joints, [5, 4, 3, 0]);
            if (positions.getElement(vertex, [])[1] >= 1.48) assert.equal(value.weights[0], 1);
        }
    }
});

test('the scalp stays on Head while lower locks deform continuously with Neck and Spine2 at all LODs', async () => {
    for (const lod of [0, 1, 2]) {
        const dna = defaultDNA();
        const human = await factory.create(dna, lod, undefined, presentation);
        try {
            const hair = human.fit.modules.get(id).children[0];
            assert.equal(hair.skeleton, human.fit.nativeSkeleton);
            assert.equal(hair.skeleton.bones.length, 44);
            assert.equal(hair.material.map, null);
            const head = hair.skeleton.bones[5];
            const sample = () => {
                human.root.updateMatrixWorld(true);
                hair.skeleton.update();
                return Array.from({length: positions.getCount()}, (_, vertex) =>
                    head.worldToLocal(hair.localToWorld(hair.getVertexPosition(vertex, new Vector3()))));
            };
            human.sampleAnimation('NativeNeutral', 0);
            const reference = sample();
            let lowerMovement = 0;
            for (const [clip, time] of [['Idle', .2], ['Idle', .7], ['Walk', .2], ['Walk', .6], ['Walk', .9]]) {
                human.sampleAnimation(clip, time);
                const points = sample();
                for (let vertex = 0; vertex < points.length; vertex++) {
                    assert.ok(points[vertex].toArray().every(Number.isFinite));
                    const distance = points[vertex].distanceTo(reference[vertex]);
                    if (binding.lods[lod].weights[vertex].weights[0] === 1) assert.ok(distance < 1e-5);
                    else lowerMovement = Math.max(lowerMovement, distance);
                }
                // Check every source edge, including split corners, for local spikes.
                for (let face = 0; face < indices.length; face += 3) {
                    for (let edge = 0; edge < 3; edge++) {
                        const a = indices[face + edge], b = indices[face + (edge + 1) % 3];
                        const length = reference[a].distanceTo(reference[b]);
                        const posed = points[a].distanceTo(points[b]);
                        assert.ok(posed <= length * 1.65 + .0001, clip + ' stretched an edge at ' + a);
                    }
                }
            }
            assert.ok(lowerMovement > .001, 'Lower locks must follow more than a rigid Head transform');
            for (const changed of [
                {...dna, sex: 'female', morphology: {masculinity: .15, height: 1.2}},
                {...dna, age: 85, morphology: {masculinity: .85, height: 1.6}},
            ]) {
                human.applyDNA(changed);
                human.sampleAnimation('Walk', .4);
                const points = sample();
                assert.ok(points.every(point => point.toArray().every(Number.isFinite)));
                const expected = new Color(universalHumanProfile(changed).appearance.color).toArray();
                const colors = hair.geometry.attributes.color;
                for (let vertex = 0; vertex < colors.count; vertex++) {
                    for (let channel = 0; channel < 3; channel++) {
                        assert.ok(Math.abs(colors.getComponent(vertex, channel) - expected[channel]) < 1e-6);
                    }
                }
            }
            await factory.equip(human, {...presentation, hair: 'hair/manual-long-braided'});
            assert.equal(human.fit.modules.has(id), false);
            assert.equal(human.fit.modules.get('hair/manual-long-braided').children[0].skeleton.bones.length, 50);
            await factory.equip(human, {...presentation, hair: id, hairColor: '#172b46'});
            const replacement = human.fit.modules.get(id).children[0];
            assert.equal(replacement.skeleton.bones.length, 44);
            const expected = new Color('#172b46').toArray();
            const actual = new Color().fromBufferAttribute(replacement.geometry.attributes.color, 0).toArray();
            assert.ok(actual.every((value, channel) => Math.abs(value - expected[channel]) < 1e-6));
        } finally {human.dispose();}
    }
});
