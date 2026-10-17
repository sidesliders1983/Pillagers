import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';
const { occupationHatAssets } = load('../src/characters/OccupationHatCatalog.ts');
const { characterAsset, assetMeasurement, availableCharacterAssets, validateCharacterRegistry } = load('../src/characters/CharacterAssets.ts');
const { defaultCharacterPresentation, parseCharacterPresentation, presentationChoices } = load('../src/characters/CharacterPresentation.ts');
const { meshyHumanAssetIdentity } = load('../src/characters/MeshyHumanAssetIdentity.ts');
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { snapshotModules } = load('../src/character-lab/LabSnapshot.ts');
const { fjordHeadwearAsset } = load('../src/fjord-play/FjordWardrobe.ts');
const { validateNativeModule } = load('../src/characters/MeshyModuleRuntime.ts');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const publicBytes = path => readFile('public' + path.split('?')[0]);
const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
const hairIds = ['none', 'hair/manual-fitted-short', 'hair/manual-fitted-short2', 'hair/manual-long-braided', 'hair/manual-long-2'];
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
function hatMesh(human, id) { return human.fit.modules.get(id).children[0]; }
function positions(mesh) { const p = mesh.geometry.getAttribute('position'); return Array.from({ length: p.count * 3 }, (_, i) => p.getComponent(Math.floor(i / 3), i % 3)); }
test('four occupation hats retain supplied topology and source colours with exact runtime identities', async () => {
    validateCharacterRegistry(availableCharacterAssets());
    assert.equal(occupationHatAssets.length, 4);
    assert.equal(parseCharacterPresentation({}).headwear, 'none', 'Old presentations remain bare-headed');
    for (const entry of occupationHatAssets) {
        const path = entry.lods[2], bytes = await publicBytes(path);
        const bindingBytes = await publicBytes(entry.metadata.nativeBinding.path), binding = JSON.parse(bindingBytes);
        const receipt = JSON.parse(await publicBytes(path.replace('.glb', '.provenance.json')));
        assert.equal(hash(bytes), assetMeasurement(path).sha256);
        assert.equal(hash(bindingBytes), entry.metadata.nativeBinding.sha256);
        assert.equal(binding.moduleSha256, hash(bytes));
        assert.equal(receipt.source.triangles, entry.budgets.runtimeTriangles);
        assert.equal(receipt.output.triangles, receipt.source.triangles);
        assert.ok(bytes.length < 700000, 'Oversized source textures must not ship');
        assert.equal(binding.skinning, 'rigid-native-head');
        assert.deepEqual(binding.precomputedNative.moduleCoverage, []);
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.ok(!json.skins?.length && !json.animations?.length);
        assert.ok(json.materials.every(m => !m.normalTexture && m.pbrMetallicRoughness.baseColorTexture));
        assert.ok(!presentationChoices('headwear').some(choice => choice.id === entry.id));
        for (const body of meshyHumanAssetIdentity)
            assert.ok(presentationChoices('headwear', { id: 'body/meshy-human', sha256: body.sha256 }).some(choice => choice.id === entry.id));
        const presentation = { ...bare, headwear: entry.id };
        const snapshot = snapshotModules(dna, presentation, 2, { version: 1, preset: 'auto', source: 'meshy' });
        assert.ok(snapshot.some(record => record.id === entry.id && record.binding.sha256 === hash(bindingBytes)));
    }
    assert.throws(() => parseCharacterPresentation({ ...bare, headwear: hairIds[1] }), /asset type/);
    assert.throws(() => parseCharacterPresentation({ ...bare, hair: occupationHatAssets[0].id }), /asset type/);
});
test('occupation headwear is adult-only and independent of hair, tools and generic clothing', () => {
    for (const occupation of ['farmer', 'fisher', 'hunter', 'smith']) {
        const person = { kind: 'persona', dna, status: { occupation } };
        assert.equal(fjordHeadwearAsset(person), 'headwear/occupation-' + occupation);
        assert.equal(fjordHeadwearAsset({ ...person, dna: { ...dna, age: 17 } }), 'none');
        assert.equal(fjordHeadwearAsset({ ...person, dna: { ...dna, sex: 'female' } }), 'headwear/occupation-' + occupation);
    }
    for (const occupation of [null, 'woodworker', 'boatbuilder', 'trader'])
        assert.equal(fjordHeadwearAsset({ kind: 'persona', dna, status: { occupation } }), 'none');
    assert.equal(fjordHeadwearAsset({ kind: 'cattle', dna, status: { occupation: 'farmer' } }), 'none');
    const tool = availableCharacterAssets().find(asset => asset.type === 'equipment').id;
    const parsed = parseCharacterPresentation({ ...bare, headwear: occupationHatAssets[0].id, equipment: tool });
    assert.equal(parsed.headwear, occupationHatAssets[0].id);
    assert.equal(parsed.equipment, tool);
});
test('all hats fit bald and every existing hairstyle without changing native bones, lower locks or cached hair', async () => {
    const { factory, sources } = fixture(), human = await factory.create(dna, 0, undefined, bare);
    try {
        const nativeBones = human.fit.nativeSkeleton.bones.slice(), sourceBody = human.fit.sourceGeometry;
        for (const entry of occupationHatAssets) {
            for (const hair of hairIds) {
                await factory.equip(human, { ...bare, hair });
                const baseline = hair === 'none' ? null : positions(human.fit.modules.get(hair).children[0]);
                const lowerVertices = [];
                if (hair !== 'none') {
                    const mesh = human.fit.modules.get(hair).children[0];
                    human.root.updateMatrixWorld(true);
                    const headY = human.fit.nativeSkeleton.bones[5].getWorldPosition(new Vector3()).y;
                    for (let vertex = 0; vertex < baseline.length / 3; vertex++) {
                        if (mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld).y < headY - .10)
                            lowerVertices.push(vertex);
                    }
                }
                let cachedMesh, cached;
                if (hair !== 'none') {
                    const source = sources.get(characterAsset(hair).lods[2]);
                    source.scene.traverse(node => { if (node.isMesh)
                        cachedMesh = node; });
                    cached = positions(cachedMesh);
                }
                await factory.equip(human, { ...bare, hair, headwear: entry.id });
                const cap = hatMesh(human, entry.id), adjustment = cap.userData.headwearFit;
                assert.equal(cap.skeleton, human.fit.nativeSkeleton);
                assert.deepEqual(human.fit.nativeSkeleton.bones, nativeBones);
                assert.equal(human.fit.mesh.geometry, sourceBody, 'Hats never remove head/body triangles');
                assert.equal(human.root.userData.selectedAssets.headwear, entry.id);
                assert.ok(adjustment.radialScale <= 1.12 + 1e-8, 'The cap must not balloon around voluminous hair');
                assert.ok(adjustment.lift <= .012 + 1e-8);
                assert.ok(cap.material.map, 'Supplied hat colour remains independent of DNA');
                if (hair === 'none') {
                    assert.deepEqual([adjustment.lift, adjustment.radialScale, adjustment.samples, adjustment.tuckedVertices], [0, 1, 0, 0]);
                    assert.equal(adjustment.support, 'head');
                }
                else {
                    assert.equal(adjustment.support, 'hair');
                    const hairMesh = human.fit.modules.get(hair).children[0];
                    assert.notEqual(hairMesh.geometry, cachedMesh.geometry);
                    assert.deepEqual(positions(cachedMesh), cached, 'The shared source hair must remain unchanged');
                    const fitted = positions(hairMesh);
                    assert.ok(fitted.every(Number.isFinite));
                    for (const vertex of lowerVertices) {
                        for (let axis = 0; axis < 3; axis++)
                            assert.equal(fitted[vertex * 3 + axis], baseline[vertex * 3 + axis], 'Exposed lower hair keeps its source shape');
                    }
                    if (hair === 'hair/manual-long-braided') {
                        const sidecar = JSON.parse(await publicBytes(characterAsset(hair).metadata.nativeBinding.path));
                        for (const vertex of sidecar.hairRig.fixedColor.vertices)
                            for (let axis = 0; axis < 3; axis++) {
                                assert.equal(fitted[vertex * 3 + axis], baseline[vertex * 3 + axis], 'The fixed leather strap remains unchanged');
                            }
                        assert.ok(lowerVertices.length > 0);
                    }
                    const hatColour = cap.material.color.getHexString();
                    await factory.equip(human, { ...bare, hair, headwear: entry.id, hairColor: '#123456' });
                    assert.equal(hatMesh(human, entry.id).material.color.getHexString(), hatColour, 'DNA hair colour must not tint hats');
                }
            }
            // Returning to bald resets the seat instead of accumulating the previous hair offset.
            await factory.equip(human, { ...bare, headwear: entry.id });
            const first = positions(hatMesh(human, entry.id));
            await factory.equip(human, { ...bare, hair: hairIds[1], headwear: entry.id });
            await factory.equip(human, { ...bare, headwear: entry.id });
            assert.deepEqual(positions(hatMesh(human, entry.id)), first);
        }
    }
    finally {
        human.dispose();
    }
});
test('hats follow native Head rigidly through Walking and Idle at all body LODs and world transforms', async () => {
    const { factory } = fixture();
    for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod, undefined, bare);
        human.root.position.set(12, 3, -8);
        human.root.rotation.y = .7;
        try {
            for (const entry of occupationHatAssets) {
                await factory.equip(human, { ...bare, headwear: entry.id, hair: hairIds[3] });
                const mesh = hatMesh(human, entry.id), before = positions(mesh);
                let reference;
                const runs = human.modules.fitRuns;
                for (const [clip, time] of [['Walking', 0], ['Walking', .35], ['Walking', .8], ['Idle_02', .5]]) {
                    human.sampleAnimation(clip, time);
                    human.root.updateMatrixWorld(true);
                    const inverseHead = human.fit.nativeSkeleton.bones[5].matrixWorld.clone().invert();
                    const points = [];
                    for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 113) {
                        points.push(mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseHead));
                    }
                    if (reference)
                        points.forEach((point, index) => assert.ok(point.distanceTo(reference[index]) < 1e-5, 'Rigid cap moved relative to its Head'));
                    reference = points;
                }
                assert.equal(human.modules.fitRuns, runs, 'Motion does not refit or deform hats');
                assert.deepEqual(positions(mesh), before);
            }
        }
        finally {
            human.dispose();
        }
    }
});
test('headwear rejects wrong body topology, masking, wrong weights and malformed cavity bindings', async () => {
    const { factory, sources } = fixture(), entry = occupationHatAssets[0];
    const human = await factory.create(dna, 0, undefined, { ...bare, headwear: entry.id });
    try {
        const binding = JSON.parse(await publicBytes(entry.metadata.nativeBinding.path));
        const source = sources.get(entry.lods[2]);
        const candidate = { asset: entry, source, binding };
        assert.doesNotThrow(() => validateNativeModule(candidate, human.fit));
        for (const mutate of [
            b => b.headwearFit.headJoint = 3, b => b.headwearFit.frame[0] = NaN, b => b.headwearFit.frame[4] += .3,
            b => b.headwearFit.maximumLift = .5, b => b.headwearFit.profile[0][1] = 0,
            b => b.precomputedNative.moduleCoverage = [{ regions: ['HEAD'], minimumY: 0, maximumY: 2 }],
            b => b.precomputedNative.bodyBindings = [], b => delete b.headwearFit,
        ]) {
            const changed = structuredClone(binding);
            mutate(changed);
            assert.throws(() => validateNativeModule({ ...candidate, binding: changed }, human.fit));
        }
        const mesh = source.scene.children[0], weights = mesh.geometry.attributes.skinWeight;
        const saved = weights.getX(0);
        weights.setX(0, .5);
        assert.throws(() => validateNativeModule(candidate, human.fit), /Headwear|weights/);
        weights.setX(0, saved);
    }
    finally {
        human.dispose();
    }
});
