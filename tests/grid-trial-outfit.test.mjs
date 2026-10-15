import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';
import {createArmStretchMeasure} from '../scripts/qa/outfit-arm-stretch.js';
const require = createRequire(import.meta.url);
const {Vector3} = require('three');
const {GLTFLoader} = require('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder} = require('three/addons/libs/meshopt_decoder.module.js');
const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {validateNativeModule} = load('../src/characters/MeshyModuleRuntime.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {defaultCharacterPresentation, presentationChoices} = load('../src/characters/CharacterPresentation.ts');
const {gridTrialOutfitAsset, gridTrialOutfitId} = load('../src/characters/GridTrialOutfitCatalog.ts');
const {characterAssets} = load('../src/characters/CharacterAssets.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const publicBytes = async url => readFile(new URL('../public' + url.split('?')[0], import.meta.url));
const factory = () => new MeshyHumanFactory(async url => loader.parseAsync(buffer(await publicBytes(url)), ''),
    async url => buffer(await publicBytes(url)));
const bare = {...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none'};
const outfit = {...bare, outfit: gridTrialOutfitId};
const dna = {...defaultDNA(), age: 32};

test('prepared grid outfit is a Lab-only full clothing choice with shared native bones and reversible exact coverage', async () => {
    const owner = factory();
    const model = await owner.create(dna, 2, undefined, outfit);
    model.sampleNativeNeutral();
    assert.ok(presentationChoices('garment', model.fit.body, 'outfit').some(choice => choice.id === gridTrialOutfitId));
    assert.ok(!characterAssets.some(asset => asset.id === gridTrialOutfitId));
    const group = model.fit.modules.get(gridTrialOutfitId);
    assert.equal(group.children.length, 2);
    for (const mesh of group.children) assert.equal(mesh.skeleton, model.fit.nativeSkeleton);
    assert.notEqual(model.fit.mesh.geometry, model.fit.sourceGeometry);
    assert.ok(model.fit.mesh.geometry.index.count > 0);
    const masked = model.fit.mesh.geometry;
    const posedWithMask = model.fit.surface('posed').positions;
    model.fit.mesh.geometry = model.fit.sourceGeometry;
    const posedWithoutMask = model.fit.surface('posed').positions;
    model.fit.mesh.geometry = masked;
    assert.ok(posedWithMask.every((value, index) => Math.abs(value - posedWithoutMask[index]) < 1e-6),
        'Masking must preserve native socket/debug vertex correspondence');
    const coverageMaterial = model.fit.mesh.material;
    const measure = createArmStretchMeasure({meshes: group.children.filter(mesh => mesh.name.includes('_top_')).map(mesh => ({mesh,
        vertices: Array.from({length: mesh.geometry.getAttribute('position').count}, (_, vertex) => mesh.getVertexPosition(vertex, new Vector3()))}))});
    for (const clip of ['Walking', 'Idle_02']) for (let phase = 0; phase < 12; phase++) {
        const duration = model.clips.find(value => value.name === clip).duration;
        model.sampleAnimation(clip, duration * phase / 12);
        const stretch = measure();
        assert.ok(stretch.checkedTriangles > 0);
        assert.equal(stretch.stretchedTriangles, 0, clip + ' phase ' + phase);
    }
    await owner.equip(model, bare);
    assert.equal(model.fit.modules.size, 0);
    assert.equal(model.fit.mesh.geometry, model.fit.sourceGeometry);
    assert.notEqual(model.fit.mesh.material, coverageMaterial);
    await owner.equip(model, outfit);
    model.sampleNativeNeutral();
    assert.notEqual(model.fit.mesh.geometry, masked);
    assert.ok(model.fit.mesh.geometry.index.count > 0);
    model.dispose();
});

test('prepared contract rejects incorrect body identities, rig copies and corrupt native influences', async () => {
    const model = await factory().create(dna, 2, undefined, bare);
    const source = await loader.parseAsync(buffer(await publicBytes(gridTrialOutfitAsset.lods[2])), '');
    const binding = JSON.parse((await publicBytes(gridTrialOutfitAsset.metadata.nativeBinding.path)).toString());
    const candidate = {source, binding, asset: gridTrialOutfitAsset};
    validateNativeModule(candidate, model.fit);
    const stale = structuredClone(binding);
    stale.precomputedNative.bodyBindings.forEach(body => {body.bodySha256 = '0'.repeat(64);});
    assert.throws(() => validateNativeModule({...candidate, binding: stale}, model.fit), /body\/LOD/);
    const invalidCoverage = structuredClone(binding);
    invalidCoverage.precomputedNative.coverage.chestAbove = NaN;
    assert.throws(() => validateNativeModule({...candidate, binding: invalidCoverage}, model.fit),
        /finite measured boundaries/);
    const mesh = source.scene.getObjectByName(binding.precomputedNative.meshes[0].mesh);
    const weights = mesh.geometry.getAttribute('skinWeight');
    const original = weights.getX(0);
    weights.setX(0, -1);
    assert.throws(() => validateNativeModule(candidate, model.fit), /native influence/);
    weights.setX(0, original);
    const coverage = mesh;
    const uv = coverage.geometry.getAttribute('uv');
    coverage.geometry.deleteAttribute('uv');
    assert.throws(() => validateNativeModule(candidate, model.fit), /normals and UVs/);
    coverage.geometry.setAttribute('uv', uv);
    const {Bone} = require('three');
    source.scene.add(new Bone());
    assert.throws(() => validateNativeModule(candidate, model.fit), /copy body bones/);
    model.dispose();
});


test('each existing Meshy LOD retains its own chest, rig, source vertices and material', async () => {
    for (const lod of [0, 1, 2]) {
        const owner = factory();
        const model = await owner.create(dna, lod, undefined, bare);
        const originalBody = model.fit.mesh;
        const identity = {...model.fit.body};
        const material = originalBody.material;
        const originalTexture = material.map;
        await owner.equip(model, outfit);
        assert.equal(model.fit.mesh, originalBody);
        assert.deepEqual(model.fit.body, identity);
        assert.equal(model.fit.mesh.material.map, originalTexture);
        model.sampleNativeNeutral();
        const mask = model.fit.mesh.geometry;
        const rendered = new Set(mask.index.array);
        let exposedChest = 0;
        const positions = mask.getAttribute('position');
        for (const vertex of rendered) {
            const point = new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(model.fit.encoding);
            if (point.y > 1.16 && point.y < 1.29 && Math.abs(point.x) < .12 && point.z > 0) exposedChest++;
        }
        assert.ok(exposedChest > 0, 'Low neckline must retain actual native chest below the old cutoff');
        for (const [name, attribute] of Object.entries(model.fit.sourceGeometry.attributes)) {
            const masked = mask.getAttribute(name);
            for (let vertex = 0; vertex < attribute.count; vertex++) for (let k = 0; k < attribute.itemSize; k++) {
                assert.ok(Math.abs(masked.getComponent(vertex, k) - attribute.getComponent(vertex, k)) < 1e-6);
            }
        }
        await owner.equip(model, bare);
        assert.equal(model.fit.mesh.material, material);
        assert.equal(model.fit.mesh.geometry, model.fit.sourceGeometry);
        model.dispose();
    }
});


test('prepared clothing follows DNA height and body build while native neutral stays a reference', async () => {
    const model = await factory().create(dna, 2, undefined, outfit);
    const group = model.fit.modules.get(gridTrialOutfitId);
    const {Box3} = require('three');
    const bounds = input => {
        model.applyDNA(input);
        model.sampleAnimation('Idle_02', .75);
        model.root.updateMatrixWorld(true);
        model.fit.nativeSkeleton.update();
        const box = new Box3();
        for (const mesh of group.children) {
            const count = mesh.geometry.getAttribute('position').count;
            for (let vertex = 0; vertex < count; vertex += 20) {
                box.expandByPoint(mesh.localToWorld(mesh.getVertexPosition(vertex, new Vector3())));
            }
        }
        return box.getSize(new Vector3());
    };
    const short = bounds({...dna, morphology: {masculinity: .77, height: 1.16}});
    const tall = bounds({...dna, morphology: {masculinity: .77, height: 1.60}});
    assert.ok(Math.abs(tall.y / short.y - 1.60 / 1.16) < 1e-5,
        'Garment height must follow the same DNA scale as the body');
    const light = bounds({...dna, traits: {...dna.traits, intelligence: 1}});
    const heavy = bounds({...dna, traits: {...dna.traits, intelligence: 0}});
    assert.ok(heavy.distanceTo(light) > .001, 'Garment proportions must respond to body build');
    model.sampleNativeNeutral();
    const reference = group.children[0].getVertexPosition(0, new Vector3());
    bounds({...dna, morphology: {masculinity: .01, height: 1.16}, sex: 'female'});
    model.sampleNativeNeutral();
    assert.ok(group.children[0].getVertexPosition(0, new Vector3()).distanceTo(reference) < 1e-6,
        'Native neutral intentionally ignores DNA shape changes for source QA');
    model.dispose();
});
