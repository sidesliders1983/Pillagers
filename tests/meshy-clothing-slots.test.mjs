import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {load} from './load-source.mjs';

const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {characterAssets, characterAsset} = load('../src/characters/CharacterAssets.ts');
const {meshyModuleMeasurements} = load('../src/characters/MeshyModuleMeasurements.ts');
const {meshyHumanAssetIdentity} = load('../src/characters/MeshyHumanAssetIdentity.ts');
const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {parseCharacterPresentation, resolveCharacterPresentation, presentationChoices,
    defaultCharacterPresentation} = load('../src/characters/CharacterPresentation.ts');
const {parseLabSnapshot, snapshotModules, fixedLabViews} = load('../src/character-lab/LabSnapshot.ts');
const {validateLabBodyUsage} = load('../src/characters/LabBodySources.ts');
const {validateModule} = load('../src/characters/AttachmentContract.ts');
const {parseNativeModuleAgeRange, loadNativeModuleAgeRange, moduleAvailableAtAge} =
    load('../src/characters/NativeModuleAgePolicy.ts');
const body = {id: 'body/meshy-human', sha256: meshyHumanAssetIdentity[2].sha256};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bare = {hair: 'none', beard: 'none', outfit: 'none', equipment: 'none'};
const adult = {...defaultDNA(), age: 32, morphology: {height: 1.5, masculinity: .77}};

/**
 * Registry entries exist only in this test process. Reusing a verified native proof
 * tests slot composition and lifecycle; it does not represent clothing artwork or fit QA.
 */
async function fixture(t) {
    const original = characterAsset('hair/meshy-short-angular');
    const sourceBytes = await readFile(new URL('../public' + original.lods[2], import.meta.url));
    const sourceBinding = JSON.parse(await readFile(
        new URL('../public' + original.metadata.nativeBinding.path, import.meta.url), 'utf8'));
    const records = new Map();
    const entries = [];
    for (const [key, slot, min] of [['shoes', 'footwear', 6], ['trousers', 'lower', 6], ['top', 'upper', 18]]) {
        const id = 'garment/technical-slot-' + key;
        const path = '/technical/' + key + '.glb';
        const binding = {...structuredClone(sourceBinding), id, supportedAges: {min, max: 90}};
        const bindingBytes = Buffer.from(JSON.stringify(binding));
        const asset = {...structuredClone(original), id, type: 'garment', label: 'Technical ' + key,
            style: key, lods: {2: path}, reviewStatus: 'preview',
            metadata: {...structuredClone(original.metadata), id, type: 'garment',
                anchor: 'socket_chest', fitMode: 'drape', slot,
                nativeBinding: {path: path.replace('.glb', '.binding.json'),
                    sha256: digest(bindingBytes), rigSignature: binding.rigSignature}}};
        characterAssets.push(asset);
        meshyModuleMeasurements[path] = {...meshyModuleMeasurements[original.lods[2]]};
        entries.push(asset);
        records.set(path, {sourceBytes, bindingBytes, binding, asset});
        records.set(asset.metadata.nativeBinding.path, {sourceBytes, bindingBytes, binding, asset});
    }
    t.after(() => {
        for (const asset of entries) {
            characterAssets.splice(characterAssets.indexOf(asset), 1);
            delete meshyModuleMeasurements[asset.lods[2]];
        }
    });
    return {entries, records, choices: {...bare,
        shoes: entries[0].id, trousers: entries[1].id, top: entries[2].id}};
}

test('legacy presentations and snapshots fill empty separate slots without changing full outfits', () => {
    const legacy = {...bare, outfit: 'garment/meshy-tunic-trousers'};
    const parsed = parseCharacterPresentation(legacy);
    for (const slot of ['shoes', 'trousers', 'top']) assert.equal(parsed[slot], 'none');
    const modules = snapshotModules(adult, parsed, 2, {version: 1, preset: 'auto', source: 'meshy'});
    const saved = {
        version: 'pillagers-lab-snapshot/1', styleVersion: 'pillagers-meshy-human/1',
        contractVersion: 1, fitVersion: 'pillagers-fit/0.2', dna: adult, presentation: legacy,
        body: {version: 1, preset: 'auto', source: 'meshy'}, lod: 2,
        pose: {animation: 'Walk', time: .25, paused: true},
        camera: {...fixedLabViews.front, type: 'orthographic', scale: 2.4, fov: 38},
        lighting: 'lab-neutral/1', modules,
    };
    const restored = parseLabSnapshot(JSON.parse(JSON.stringify(saved)));
    assert.deepEqual(restored.presentation, parsed);
    assert.deepEqual(restored.modules, modules);
    assert.equal(restored.presentation.outfit, legacy.outfit);
});

test('separate choices enforce native slots, occupancy, source identity and exact snapshot hashes', async t => {
    const {entries, choices} = await fixture(t);
    for (const asset of entries) assert.equal(validateModule(asset.metadata), asset.metadata);
    const selected = resolveCharacterPresentation(adult, choices, body);
    assert.deepEqual(selected.garmentIds, entries.map(asset => asset.id));
    assert.equal(selected.outfitId, null);
    assert.equal(selected.shoesId, entries[0].id);
    assert.equal(selected.trousersId, entries[1].id);
    assert.equal(selected.topId, entries[2].id);
    assert.deepEqual(parseCharacterPresentation(JSON.parse(JSON.stringify(selected.presentation))), selected.presentation);
    assert.throws(() => parseCharacterPresentation({...choices, outfit: 'garment/meshy-tunic-trousers'}),
        /full outfit cannot be combined/);
    assert.throws(() => parseCharacterPresentation({...choices, shoes: entries[1].id}), /shoes slot/);
    assert.throws(() => parseCharacterPresentation({...choices, top: entries[0].id}), /top slot/);
    assert.throws(() => parseCharacterPresentation({...choices, outfit: entries[2].id}), /outfit slot/);
    assert.throws(() => resolveCharacterPresentation(adult, choices, {...body, sha256: '0'.repeat(64)}),
        /exact body source/);
    assert.throws(() => validateLabBodyUsage('published', 2, selected.presentation), /exact body source/);
    const modules = snapshotModules(adult, selected.presentation, 2, {version: 1, preset: 'auto', source: 'meshy'});
    assert.deepEqual(modules.slice(1).map(module => module.id), selected.garmentIds);
    assert.ok(modules.slice(1).every(module => /^[a-f0-9]{64}$/.test(module.binding.sha256)));
    const snapshot = {
        version: 'pillagers-lab-snapshot/1', styleVersion: 'pillagers-meshy-human/1',
        contractVersion: 1, fitVersion: 'pillagers-fit/0.2', dna: adult, presentation: selected.presentation,
        body: {version: 1, preset: 'auto', source: 'meshy'}, lod: 2,
        pose: {animation: 'Idle', time: 0, paused: true},
        camera: {...fixedLabViews.front, type: 'orthographic', scale: 2.4, fov: 38},
        lighting: 'lab-neutral/1', modules,
    };
    assert.deepEqual(parseLabSnapshot(structuredClone(snapshot)).modules, modules);
    snapshot.modules[2].binding.sha256 = '0'.repeat(64);
    assert.throws(() => parseLabSnapshot(snapshot), /assets differ/);
    assert.deepEqual(presentationChoices('garment', body, 'shoes').map(entry => entry.id), [
        entries[0].id, 'garment/meshy-low-shoes-005', 'garment/meshy-high-shoes-005',
    ]);
    assert.deepEqual(presentationChoices('garment', body, 'top').map(entry => entry.id), [
        entries[2].id,
    ]);
});

test('automatic slot composition is opt-in and accepted-only, and equipment resolves its actual garment', async t => {
    const {entries, choices} = await fixture(t);
    const auto = {...bare, outfit: 'auto', shoes: 'auto', trousers: 'auto', top: 'auto'};
    assert.deepEqual(resolveCharacterPresentation(adult, auto, body).garmentIds, []);
    for (const asset of entries) asset.reviewStatus = 'accepted';
    const selected = resolveCharacterPresentation(adult, auto, body);
    assert.equal(selected.outfitId, null);
    assert.deepEqual(selected.garmentIds, entries.map(asset => asset.id));
    assert.equal(resolveCharacterPresentation(adult, defaultCharacterPresentation, body).garmentIds.length, 0,
        'The legacy Auto outfit never silently selects one separate garment');
    const equipment = characterAsset('equipment/meshy-belt-pouch');
    const previous = equipment.metadata.dependency;
    try {
        equipment.metadata.dependency = {module: entries[2].id, frame: 'fixture-belt'};
        assert.equal(resolveCharacterPresentation(adult, {...choices, equipment: equipment.id}, body).equipmentId,
            equipment.id);
        assert.equal(resolveCharacterPresentation(adult, {...choices, top: 'none', equipment: equipment.id}, body).equipmentId,
            null);
    } finally {
        equipment.metadata.dependency = previous;
    }
});

test('native factory equips three separate modules and reports only installed slots through age changes', async t => {
    const {records, entries, choices} = await fixture(t);
    globalThis.self ??= globalThis;
    globalThis.createImageBitmap ??= async () => ({width: 2048, height: 2048, close() {}});
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async url => {
        const path = url.split('?')[0];
        const bytes = records.get(path)?.sourceBytes ??
            await readFile(new URL('../public' + path, import.meta.url));
        return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    }, async url => {
        const bytes = records.get(url.split('?')[0]).bindingBytes;
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    });
    const model = await factory.create(adult, 2, undefined, choices);
    const other = await factory.create(adult, 2, undefined, choices);
    try {
        assert.deepEqual([...model.fit.modules.keys()], entries.map(asset => asset.id));
        assert.deepEqual(model.root.userData.selectedAssets, {hair: null, beard: null, outfit: null,
            shoes: entries[0].id, trousers: entries[1].id, top: entries[2].id, equipment: null});
        for (const asset of entries) {
            const mesh = model.fit.modules.get(asset.id).children[0];
            assert.equal(mesh.skeleton, model.fit.nativeSkeleton);
            assert.notEqual(mesh.geometry, other.fit.modules.get(asset.id).children[0].geometry);
        }
        const fits = model.modules.fitRuns;
        model.sampleAnimation('Walk', .5);
        model.update(.1);
        assert.equal(model.modules.fitRuns, fits);
        model.applyDNA({...adult, age: 6});
        assert.equal(model.fit.modules.size, 2);
        assert.equal(model.root.userData.selectedAssets.top, null);
        assert.equal(model.root.userData.selectedAssets.shoes, entries[0].id);
        assert.equal(other.fit.modules.size, 3);
        await factory.equip(model, bare);
        assert.equal(model.fit.modules.size, 0);
        assert.deepEqual(model.root.userData.selectedAssets, {hair: null, beard: null, outfit: null,
            shoes: null, trousers: null, top: null, equipment: null});
    } finally {
        model.dispose();
        other.dispose();
    }
});

test('UI age policy uses hash-verified binding ranges and preserves existing adult restrictions', async () => {
    const asset = characterAsset('garment/meshy-tunic-trousers');
    const bytes = await readFile(new URL('../public' + asset.metadata.nativeBinding.path, import.meta.url));
    const requests = [];
    const range = await loadNativeModuleAgeRange(asset, async url => {
        requests.push(url);
        return new Response(bytes);
    });
    assert.deepEqual(range, {min: 18, max: 90});
    assert.equal(requests.length, 1);
    assert.equal(moduleAvailableAtAge(asset, 6, range), false);
    assert.equal(moduleAvailableAtAge(asset, 17, range), false);
    assert.equal(moduleAvailableAtAge(asset, 18, range), true);
    assert.equal(moduleAvailableAtAge(asset, 90, range), true);
    assert.equal(moduleAvailableAtAge(asset, 91, range), false);
    assert.equal(moduleAvailableAtAge(asset, 6), false, 'Unknown support cannot authorize child choices');
    const childRange = parseNativeModuleAgeRange({...JSON.parse(bytes), supportedAges: {min: 6, max: 90}}, asset);
    assert.equal(moduleAvailableAtAge(asset, 6, childRange), true);
    assert.throws(() => parseNativeModuleAgeRange({...JSON.parse(bytes), supportedAges: {min: 90, max: 6}}, asset),
        /Invalid native module age/);
    await assert.rejects(loadNativeModuleAgeRange(asset, async () => new Response(
        JSON.stringify({...JSON.parse(bytes), supportedAges: {min: 6, max: 100}}))),
    /frozen binding/);
});
