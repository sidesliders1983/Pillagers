import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {BufferGeometry, BufferAttribute, Vector3, Raycaster} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {loadTypeScript} from '../scripts/load-typescript.mjs';

const {additionalOutfitAssets} = loadTypeScript(new URL('../src/characters/AdditionalOutfitCatalog.ts', import.meta.url));
const {characterAssets, characterAssetFitsBody, availableCharacterAssets} = loadTypeScript(new URL('../src/characters/CharacterAssets.ts', import.meta.url));
const {defaultCharacterPresentation, resolveCharacterPresentation} = loadTypeScript(new URL('../src/characters/CharacterPresentation.ts', import.meta.url));
const {defaultDNA} = loadTypeScript(new URL('../src/characters/CharacterDNA.ts', import.meta.url));
const {meshyHumanAssetIdentity} = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('new clothing items are separate Lab clothing choices bound to the existing Human', () => {
    assert.deepEqual(additionalOutfitAssets.map(asset => asset.id).sort(), [
        'garment/meshy-high-shoes-005',
        'garment/meshy-long-skirt-005',
        'garment/meshy-low-shoes-005', 'garment/meshy-short-trousers-006',
    ]);
    const body = {id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[2].sha256};
    for (const asset of additionalOutfitAssets) {
        assert.ok(availableCharacterAssets().some(candidate => candidate.id === asset.id));
        assert.ok(!characterAssets.some(candidate => candidate.id === asset.id));
        assert.ok(characterAssetFitsBody(asset, body));
        assert.ok(!characterAssetFitsBody(asset, {...body, sha256: '0'.repeat(64)}));
    }
    for (const shoe of ['low', 'high']) {
        const selected = resolveCharacterPresentation({...defaultDNA(), age: 32}, {
            ...defaultCharacterPresentation, outfit: 'none', trousers: 'garment/meshy-long-skirt-005',
            shoes: 'garment/meshy-' + shoe + '-shoes-005',
        }, body);
        assert.equal(selected.outfitId, null);
        assert.equal(selected.garmentIds.length, 2);
    }
});

test('every mirrored shoe preserves UVs and reverses geometry, winding and the native joints', async () => {
    for (const asset of additionalOutfitAssets.filter(asset => asset.metadata.slot === 'footwear')) {
        const bytes = await readFile('public' + asset.lods[2]);
        const bindingBytes = await readFile('public' + asset.metadata.nativeBinding.path);
        assert.equal(hash(bindingBytes), asset.metadata.nativeBinding.sha256);
        const binding = JSON.parse(bindingBytes);
        assert.equal(hash(bytes), binding.moduleSha256);
        const document = await new NodeIO().readBinary(bytes);
        assert.equal(document.getRoot().listSkins().length, 0);
        assert.equal(document.getRoot().listAnimations().length, 0);
        const [left, right] = document.getRoot().listMeshes().sort((a, b) => a.getName().localeCompare(b.getName()));
        assert.ok(left.getName().includes('_left_') && right.getName().endsWith('_right'));
        for (const [index, original] of left.listPrimitives().entries()) {
            const mirror = right.listPrimitives()[index];
            for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'WEIGHTS_0', 'JOINTS_0']) {
                const a = original.getAttribute(semantic), b = mirror.getAttribute(semantic);
                assert.equal(a.getCount(), b.getCount());
                const originalArray = a.getArray(), mirroredArray = b.getArray();
                for (let offset = 0; offset < originalArray.length; offset++) {
                    let expected = originalArray[offset];
                    if (['POSITION', 'NORMAL'].includes(semantic) && offset % a.getElementSize() === 0) expected *= -1;
                    if (semantic === 'JOINTS_0' && expected >= 34 && expected <= 38) expected += 5;
                    assert.ok(Math.abs(mirroredArray[offset] - expected) < 1e-7);
                }
            }
            const originalIndices = original.getIndices().getArray(), mirroredIndices = mirror.getIndices().getArray();
            for (let offset = 0; offset < originalIndices.length; offset += 3) {
                assert.deepEqual(Array.from(mirroredIndices.slice(offset, offset + 3)),
                    [originalIndices[offset], originalIndices[offset + 2], originalIndices[offset + 1]]);
            }
        }
    }
});

test("independent clothing coverage retains other modules’ masks and uncovered torso", () => {
    const {preparedModuleCoverage} = loadTypeScript(new URL('../src/characters/PreparedNativeOutfit.ts', import.meta.url));
    const geometry = new BufferGeometry();
    const positions = [0, 1, 0, .1, 1, 0, 0, 1.1, 0,
        0, .4, 0, .1, .4, 0, 0, .5, 0,
        0, 1.4, 0, .1, 1.4, 0, 0, 1.5, 0];
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(Float32Array.from({length: 27}, (_, i) => i % 3 === 2 ? 1 : 0), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(36), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(Float32Array.from({length: 36}, (_, i) => i % 4 === 0 ? 1 : 0), 4));
    geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const source = {positions, indices: [0, 1, 2, 3, 4, 5, 6, 7, 8], triangles: 3,
        regions: ['TORSO_UPPER', 'TORSO_UPPER', 'TORSO_UPPER',
            'LOWER_LEG_L', 'LOWER_LEG_L', 'LOWER_LEG_L', 'HEAD', 'HEAD', 'HEAD']};
    const clothing = {binding: {precomputedNative: {version: 3,
        moduleCoverage: [{regions: ['LOWER_LEG_L'], minimumY: .1, maximumY: .9}]},
    lods: {2: {coverageTriangles: []}}}};
    const headwear = {binding: {lods: {2: {coverageTriangles: [2]}}}};
    const result = preparedModuleCoverage([clothing, headwear], {source, sourceGeometry: geometry, body: {lod: 2}});
    assert.equal(result.index.count, 3, 'Only the uncovered torso triangle must remain');
    result.dispose(); geometry.dispose();
});

test('low-shoe posterior sole reproduces the reported failure and fits after correction', async () => {
    const sourcePath = 'tests/fixtures/clothing/low-shoes-before-heel-fix.glb';
    const io = new NodeIO();
    const original = await io.read(sourcePath);
    const corrected = await io.read('public/character-lab/candidates/meshy-additional-005/low-shoes.glb');
    const rear = document => Math.min(...document.getRoot().listMeshes().flatMap(mesh =>
        mesh.listPrimitives().flatMap(primitive => Array.from(primitive.getAttribute('POSITION')
            .getArray()).filter((_, index) => index % 3 === 2))));
    assert.ok(rear(original) < -.24, 'Negative control must contain the heel flap');
    assert.ok(rear(corrected) >= -.177, 'No sole tab beyond the approved posterior contour');
    for (const [meshIndex, mesh] of original.getRoot().listMeshes().entries()) {
        for (const [primitiveIndex, primitive] of mesh.listPrimitives().entries()) {
            const result = corrected.getRoot().listMeshes()[meshIndex].listPrimitives()[primitiveIndex];
            for (const semantic of ['TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
                assert.deepEqual(result.getAttribute(semantic).getArray(), primitive.getAttribute(semantic).getArray());
            }
            assert.deepEqual(result.getIndices().getArray(), primitive.getIndices().getArray());
            assert.equal(result.getAttribute('POSITION').getCount(), primitive.getAttribute('POSITION').getCount());
        }
    }
    assert.deepEqual(corrected.getRoot().listTextures().map(texture => hash(texture.getImage())),
        original.getRoot().listTextures().map(texture => hash(texture.getImage())));
    const unchanged = {
    "long-skirt": "77f3957563e94b01211a8204e85621e2196a619380b7b1dd9d7719cfa259a1a0",
    "high-shoes": "4b5250ee6b1a06b6f148a21f7428ea570632ab88f636c3a458d0904441d4d688"
};
    for (const [id, expectedHash] of Object.entries(unchanged)) {
        assert.equal(hash(await readFile('public/character-lab/candidates/meshy-additional-005/' + id + '.glb')), expectedHash);
    }
});

test('short trousers bind both leg openings and preserve the approved source material', async () => {
    const asset = additionalOutfitAssets.find(asset => asset.id === 'garment/meshy-short-trousers-006');
    const bytes = await readFile('public' + asset.lods[2]);
    const bindingBytes = await readFile('public' + asset.metadata.nativeBinding.path);
    const binding = JSON.parse(bindingBytes);
    assert.equal(hash(bytes), binding.moduleSha256);
    assert.equal(hash(bindingBytes), asset.metadata.nativeBinding.sha256);
    const io = new NodeIO();
    const document = await io.readBinary(bytes);
    const source = await io.read('tests/fixtures/clothing/short-trousers-source.glb');
    assert.deepEqual(document.getRoot().listTextures().map(texture => hash(texture.getImage())),
        source.getRoot().listTextures().map(texture => hash(texture.getImage())));
    assert.equal(document.getRoot().listSkins().length, 0);
    assert.equal(document.getRoot().listAnimations().length, 0);
    const openings = {left: 0, right: 0, waist: 0};
    for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        const positions = primitive.getAttribute('POSITION');
        const joints = primitive.getAttribute('JOINTS_0'), weights = primitive.getAttribute('WEIGHTS_0');
        for (let vertex = 0; vertex < positions.getCount(); vertex++) {
            const [x, y] = positions.getElement(vertex, []);
            const vertexJoints = joints.getElement(vertex, []);
            const vertexWeights = weights.getElement(vertex, []);
            assert.ok(Math.abs(vertexWeights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-6);
            for (let influence = 0; influence < 4; influence++) if (vertexWeights[influence] > 0) {
                assert.ok([0, 34, 39].includes(vertexJoints[influence]));
            }
            if (y < .62 && Math.abs(x) > .06) {
                const joint = x > 0 ? 34 : 39;
                assert.ok(vertexWeights[vertexJoints.indexOf(joint)] > .99);
                openings[x > 0 ? 'left' : 'right']++;
            }
            if (y > .935) {
                assert.ok(vertexWeights[0] > .99);
                openings.waist++;
            }
        }
    }
    assert.ok(Object.values(openings).every(count => count > 10));
    const bands = binding.precomputedNative.moduleCoverage;
    assert.ok(bands.every(band => band.minimumY > .59 && band.maximumY < .95));
    assert.ok(bands.every(band => !band.regions.includes('LOWER_LEG_L')));
    const body = {id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[2].sha256};
    const selection = resolveCharacterPresentation({...defaultDNA(), age: 32}, {
        ...defaultCharacterPresentation, outfit: 'none', trousers: asset.id,
        shoes: 'garment/meshy-high-shoes-005',
    }, body);
    assert.equal(selection.outfitId, null);
    assert.deepEqual(new Set(selection.garmentIds), new Set([asset.id, 'garment/meshy-high-shoes-005']));
});


