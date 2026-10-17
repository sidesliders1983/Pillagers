import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const { fishermanOutfitAssets } = loadTypeScript(new URL('../src/characters/FishermanOutfitCatalog.ts', import.meta.url));
const { assetMeasurement, characterAssets, characterAssetFitsBody } = loadTypeScript(new URL('../src/characters/CharacterAssets.ts', import.meta.url));
const { meshyHumanAssetIdentity } = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const { MeshyHumanFactory } = loadTypeScript(new URL('../src/characters/MeshyHuman.ts', import.meta.url));
const { defaultDNA } = loadTypeScript(new URL('../src/characters/CharacterDNA.ts', import.meta.url));
const { resolveCharacterPresentation } = loadTypeScript(new URL('../src/characters/CharacterPresentation.ts', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const choices = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none',
    top: 'garment/meshy-fisherman-tunic-009', trousers: 'garment/meshy-fisherman-trousers-009',
    shoes: 'garment/meshy-fisherman-shoe-009' };
const bytesAt = url => readFile(new URL('../public' + url.split('?')[0], import.meta.url));
test('fisherman pieces are exact native-body previews in separate existing clothing slots', async () => {
    assert.deepEqual(fishermanOutfitAssets.map(asset => asset.metadata.slot).sort(), ['footwear', 'lower', 'upper']);
    for (const asset of fishermanOutfitAssets) {
        assert.ok(!characterAssets.some(published => published.id === asset.id));
        assert.equal(asset.reviewStatus, 'preview');
        assert.ok(characterAssetFitsBody(asset, { id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[2].sha256 }));
        assert.ok(!characterAssetFitsBody(asset, { id: 'body/meshy-human', sha256: '0'.repeat(64) }));
        assert.equal(hash(await bytesAt(asset.lods[2])), assetMeasurement(asset.lods[2]).sha256);
        const bindingBytes = await bytesAt(asset.metadata.nativeBinding.path);
        assert.equal(hash(bindingBytes), asset.metadata.nativeBinding.sha256);
        const binding = JSON.parse(bindingBytes);
        assert.equal(binding.moduleSha256, assetMeasurement(asset.lods[2]).sha256);
        const document = await new NodeIO().readBinary(await bytesAt(asset.lods[2]));
        assert.equal(document.getRoot().listSkins().length, 0, 'The module must not bring its own skeleton');
        assert.equal(document.getRoot().listAnimations().length, 0);
    }
    const identity = { id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[2].sha256 };
    assert.equal(resolveCharacterPresentation({ ...defaultDNA(), age: 32 }, choices, identity).garmentIds.length, 3);
});
test('one canonical fisherman shoe reconstructs as an exact mirrored pair in authoring space', async () => {
    const recipe = JSON.parse(await readFile(new URL('./fixtures/clothing/fisherman-authoring-matrices.json', import.meta.url)));
    const matrices = recipe.matrices.map(values => new Matrix4().fromArray(values));
    const document = await new NodeIO().read('public/character-lab/candidates/meshy-fisherman-009/shoe.glb');
    const [left, right] = document.getRoot().listMeshes();
    assert.match(left.getName(), /_left_/);
    assert.match(right.getName(), /_right$/);
    function posed(primitive, vertex) {
        const joints = primitive.getAttribute('JOINTS_0').getElement(vertex, []);
        const weights = primitive.getAttribute('WEIGHTS_0').getElement(vertex, []);
        const matrix = new Matrix4();
        matrix.elements.fill(0);
        for (let channel = 0; channel < 4; channel++) {
            matrices[joints[channel]].elements.forEach((value, element) => matrix.elements[element] += value * weights[channel]);
        }
        return new Vector3(...primitive.getAttribute('POSITION').getElement(vertex, [])).applyMatrix4(matrix);
    }
    for (let part = 0; part < left.listPrimitives().length; part++) {
        const a = left.listPrimitives()[part], b = right.listPrimitives()[part];
        assert.deepEqual(a.getAttribute('TEXCOORD_0').getArray(), b.getAttribute('TEXCOORD_0').getArray());
        assert.deepEqual(a.getAttribute('WEIGHTS_0').getArray(), b.getAttribute('WEIGHTS_0').getArray());
        const jointsA = a.getAttribute('JOINTS_0').getArray(), jointsB = b.getAttribute('JOINTS_0').getArray();
        for (let i = 0; i < jointsA.length; i++) {
            assert.equal(jointsB[i], jointsA[i] >= 34 && jointsA[i] <= 38 ? jointsA[i] + 5 : jointsA[i]);
        }
        for (let vertex = 0; vertex < a.getAttribute('POSITION').getCount(); vertex++) {
            const expected = posed(a, vertex), actual = posed(b, vertex);
            expected.x = recipe.reflectionTranslationX - expected.x;
            assert.ok(expected.distanceTo(actual) < 1e-6, 'Mirroring must survive native-pose inversion');
        }
        const indicesA = a.getIndices().getArray(), indicesB = b.getIndices().getArray();
        for (let i = 0; i < indicesA.length; i += 3) {
            assert.deepEqual(Array.from(indicesB.subarray(i, i + 3)), [indicesA[i], indicesA[i + 2], indicesA[i + 1]]);
        }
    }
});
test('all three fisherman pieces reuse the existing 44-bone skeleton at each body LOD', async () => {
    globalThis.self ??= globalThis;
    globalThis.createImageBitmap ??= async () => ({ width: 2048, height: 2048, close() { } });
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async (url) => {
        const bytes = await bytesAt(url);
        return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    }, async (url) => {
        const bytes = await bytesAt(url);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    });
    for (const lod of [0, 1, 2]) {
        const model = await factory.create({ ...defaultDNA(), age: 32 }, lod, undefined, choices);
        assert.equal(model.fit.nativeSkeleton.bones.length, 44);
        assert.equal(model.fit.modules.size, 3);
        for (const group of model.fit.modules.values())
            group.traverse(mesh => {
                if (mesh.isSkinnedMesh)
                    assert.equal(mesh.skeleton, model.fit.nativeSkeleton);
            });
        model.sampleAnimation('Walking', .65);
        model.sampleAnimation('Idle_02', .65);
        model.dispose();
    }
    const child = await factory.create({ ...defaultDNA(), age: 12 }, 2, undefined, choices);
    assert.equal(child.fit.modules.size, 0, 'Adult review garments must not be fitted on children');
    child.dispose();
});

test('the replacement tunic does not rewrite the reviewed trousers or mirrored shoes', async () => {
    const expected = {
    "trousers.glb": "9d4be04a6c5fb98812dc74a9a8ffbde93d48da74896777faa768aa293ef4c576",
    "trousers.binding.json": "5f7395d4d0f197881fe6df51628bdad086c3206d54311aea253b19dc7842dcb8",
    "shoe.glb": "171358ff4718aac7747160228538de02a8313092d61a161e0c4f5912b0bf046f",
    "shoe.binding.json": "563fd3b507df4a44c916ff477016092b3e7dc7321a4974588ec4f9983047f0a8"
};
    for (const [filename, sha256] of Object.entries(expected)) {
        assert.equal(hash(await bytesAt('/character-lab/candidates/meshy-fisherman-009/' + filename)), sha256);
    }
});
