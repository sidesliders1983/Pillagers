import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { Color, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

test('three female hairstyles publish only the selected mesh and a textureless DNA colour material', async () => {
    const { femaleHairAssets } = load('../src/characters/FemaleHairCatalog.ts');
    assert.equal(femaleHairAssets.length, 3);
    const expectedTriangles = [3088, 2874, 6182];
    for (const [index, asset] of femaleHairAssets.entries()) {
        const bytes = await readFile('public' + asset.lods[2]);
        const document = await new NodeIO().readBinary(bytes);
        const root = document.getRoot();
        assert.equal(root.listMeshes().length, 1, 'No reference body or older hair may ship');
        assert.equal(root.listTextures().length, 0);
        assert.equal(root.listSkins().length, 0);
        assert.equal(root.listAnimations().length, 0);
        const primitive = root.listMeshes()[0].listPrimitives()[0];
        assert.equal(primitive.getIndices().getCount() / 3, expectedTriangles[index]);
        assert.equal(primitive.getAttribute('TEXCOORD_0'), null);
        assert.deepEqual(primitive.getMaterial().getBaseColorFactor(), [1, 1, 1, 1]);
        assert.ok(bytes.length < 300000, 'Texture-free hair must not retain the large scene payload');
        const hash = value => createHash('sha256').update(value).digest('hex');
        const receipt = JSON.parse(await readFile('public' + asset.lods[2].replace('.glb', '.provenance.json')));
        assert.equal(receipt.source.selectedNode, ['low_poly_unwrapped', 'low_poly_unwrapped.001', 'low_poly_unwrapped.002'][index]);
        assert.equal(receipt.output.sha256, hash(bytes));
        assert.equal(receipt.bindingSha256, hash(await readFile('public' + asset.metadata.nativeBinding.path)));
        assert.equal(receipt.pipeline.sha256, hash(await readFile(receipt.pipeline.path)));
    }
});

test('adult women select all three new hairstyles deterministically without changing children or campaign DNA', () => {
    const { fjordHairAsset, fjordShortHairAssets } = load('../src/fjord-play/FjordWardrobe.ts');
    const { femaleHairAssets } = load('../src/characters/FemaleHairCatalog.ts');
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const ids = femaleHairAssets.map(asset => asset.id);
    const choices = new Set();
    for (let seed = 0; seed < 40; seed++) {
        const entity = { kind: 'persona', dna: { ...defaultDNA(), seed, age: 18, sex: 'female' },
            status: { living: true, occupation: 'farmer' } };
        const before = structuredClone(entity);
        const selected = fjordHairAsset(entity);
        assert.ok(ids.includes(selected));
        choices.add(selected);
        assert.equal(fjordHairAsset({ ...entity, dna: { ...entity.dna, age: 85 } }), selected);
        assert.equal(fjordHairAsset({ ...entity, status: { ...entity.status, occupation: 'smith' } }), selected);
        assert.ok(fjordShortHairAssets.includes(fjordHairAsset({ ...entity, dna: { ...entity.dna, age: 17 } })));
        assert.deepEqual(entity, before);
    }
    assert.equal(choices.size, 3);
});

test('female hair uses DNA colour and greying on the native rig across ages, faces, hats, LODs and motion', async () => {
    const { femaleHairAssets } = load('../src/characters/FemaleHairCatalog.ts');
    const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
    const { founderFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const publicBytes = async url => {
        const bytes = await readFile('public' + url.split('?')[0]);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    };
    const factory = new MeshyHumanFactory(async url => loader.parseAsync(await publicBytes(url), ''), publicBytes);
    const dna = { ...defaultDNA(), sex: 'female', morphology: { masculinity: .15, height: 1.51 } };
    const face = founderFacialIdentity(dna.seed);
    const presentation = { beard: 'none', outfit: 'none', equipment: 'none' };
    for (const asset of femaleHairAssets) for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod, undefined, { ...presentation, hair: asset.id }, face);
        try {
            human.root.position.set(12, 3, -18);
            human.root.rotation.y = .7;
            for (const age of [18, 55, 85]) {
                const current = { ...dna, age };
                human.applyDNA(current, undefined, { face: { ...face,
                    axes: { ...face.axes, faceWidth: age === 18 ? -1 : 1 } } });
                for (const hat of ['none', ...['farmer', 'fisher', 'hunter', 'smith'].map(role => 'headwear/occupation-' + role)]) {
                    await factory.equip(human, { ...presentation, hair: asset.id, headwear: hat });
                    const hair = human.fit.modules.get(asset.id).children[0];
                    assert.equal(hair.skeleton, human.fit.nativeSkeleton);
                    assert.equal(hair.skeleton.bones.length, 44);
                    assert.equal(hair.material.map, null);
                    const expected = new Color(universalHumanProfile(current).appearance.color).toArray();
                    const actual = new Color().fromBufferAttribute(hair.geometry.getAttribute('color'), 0).toArray();
                    assert.ok(actual.every((value, channel) => Math.abs(value - expected[channel]) < 1e-6));
                    for (const clip of ['Idle', 'Walk', 'Run']) {
                        human.sampleAnimation(clip, .4);
                        human.root.updateMatrixWorld(true);
                        const head = hair.skeleton.bones[5].getWorldPosition(new Vector3());
                        for (let vertex = 0; vertex < hair.geometry.getAttribute('position').count; vertex += 23) {
                            const point = hair.localToWorld(hair.getVertexPosition(vertex, new Vector3()));
                            assert.ok(point.toArray().every(Number.isFinite));
                            assert.ok(point.distanceTo(head) < .85, asset.id + ' detached from the native head');
                        }
                    }
                }
            }
        } finally { human.dispose(); }
    }
});
