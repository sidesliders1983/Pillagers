import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Color, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {load} from './load-source.mjs';

const {manualHairAssets} = load('../src/characters/ManualHairCatalog.ts');
const {availableCharacterAssets, validateCharacterRegistry} = load('../src/characters/CharacterAssets.ts');
const {presentationChoices} = load('../src/characters/CharacterPresentation.ts');
const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {meshyHumanAssetIdentity} = load('../src/characters/MeshyHumanAssetIdentity.ts');
const {generateCharacterDNA} = load('../src/characters/generateCharacterDNA.ts');
const {universalHumanProfile} = load('../src/characters/UniversalHumanProfile.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const publicBytes = path => readFile(new URL('../public' + path.split('?')[0], import.meta.url));
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function asset(path) {
    const bytes = await publicBytes(path);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('manual hair is discovered only on its exact native body and has textureless exports', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    assert.equal(manualHairAssets.length, 2);
    for (const entry of manualHairAssets) {
        for (const body of meshyHumanAssetIdentity) {
            assert.ok(presentationChoices('hair', {id: 'body/meshy-human', sha256: body.sha256})
                .some(choice => choice.id === entry.id));
        }
        assert.ok(!presentationChoices('hair').some(choice => choice.id === entry.id));
        const bytes = await publicBytes(entry.lods[2]);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.ok(!json.images?.length && !json.textures?.length && !json.skins?.length && !json.animations?.length);
        assert.equal(json.meshes.length, 1);
        assert.equal(json.materials.length, 1);
        const primitive = json.meshes[0].primitives[0];
        assert.ok(primitive.attributes.COLOR_0 !== undefined);
        assert.equal(primitive.attributes.TEXCOORD_0, undefined);
        const bindingBytes = await publicBytes(entry.metadata.nativeBinding.path);
        const binding = JSON.parse(bindingBytes);
        assert.equal(hash(bindingBytes), entry.metadata.nativeBinding.sha256);
        assert.equal(binding.moduleSha256, hash(bytes));
        assert.equal(binding.skinning, 'rigid-native-head');
        for (const lod of Object.values(binding.lods)) {
            assert.equal(lod.coverageTriangles.length, 0);
            assert.ok(lod.weights.every(value => value.joints[0] === 5 && value.weights[0] === 1));
        }
        const receipt = JSON.parse(await publicBytes(entry.lods[2].replace('.glb', '.provenance.json')));
        assert.equal(receipt.output.sha256, hash(bytes));
        assert.equal(receipt.bindingSha256, hash(bindingBytes));
        assert.equal(receipt.output.triangles, entry.budgets.runtimeTriangles);
        assert.equal(receipt.reviewStatus, 'preview');
        assert.equal(receipt.pipeline.sha256,
            hash(await readFile(new URL('../' + receipt.pipeline.path, import.meta.url))));
        assert.ok(bytes.length < 400000);
    }
});

test('both styles follow the existing Head through neutral, Idle and Walk at every body LOD', async () => {
    const factory = new MeshyHumanFactory(asset, async path => {
        const bytes = await publicBytes(path);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    });
    const dna = generateCharacterDNA(1983);
    dna.age = 32;
    for (const lod of [0, 1, 2]) {
        for (const entry of manualHairAssets) {
            const model = await factory.create(dna, lod, undefined,
                {hair: entry.id, beard: 'none', outfit: 'none', equipment: 'none'});
            try {
                const hair = model.fit.modules.get(entry.id).children[0];
                assert.equal(hair.skeleton, model.fit.nativeSkeleton);
                assert.equal(hair.material.map, null);
                assert.equal(hair.material.normalMap, null);
                assert.equal(model.fit.mesh.geometry, model.fit.sourceGeometry);
                const head = model.fit.nativeSkeleton.bones[5];
                const points = () => {
                    model.root.updateMatrixWorld(true);
                    model.fit.nativeSkeleton.update();
                    return [0, 101, hair.geometry.attributes.position.count - 1].map(vertex =>
                        head.worldToLocal(hair.localToWorld(hair.getVertexPosition(vertex, new Vector3()))));
                };
                const reference = points();
                for (const [clip, time] of [['NativeNeutral', 0], ['Idle', .4], ['Walk', .2], ['Walk', .8]]) {
                    model.sampleAnimation(clip, time);
                    points().forEach((point, index) => assert.ok(point.distanceTo(reference[index]) < 1e-5,
                        entry.id + ' drifted away from Head during ' + clip));
                }
                for (const changed of [{...dna, age: 6}, {...dna, age: 85},
                    {...dna, morphology: {...dna.morphology, masculinity: .15, height: 1.3}}]) {
                    model.applyDNA(changed);
                    const expected = new Color(universalHumanProfile(changed).appearance.color);
                    const colors = hair.geometry.attributes.color;
                    for (let channel = 0; channel < 3; channel++) {
                        assert.ok(Math.abs(colors.getComponent(0, channel) - expected.toArray()[channel]) < 1e-6);
                    }
                    points().forEach((point, index) => assert.ok(point.distanceTo(reference[index]) < 1e-5));
                }
            } finally {
                model.dispose();
            }
        }
    }
});
