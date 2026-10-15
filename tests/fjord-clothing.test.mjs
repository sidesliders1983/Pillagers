import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {Vector3} from 'three';
import {load} from './load-source.mjs';

const {FjordWardrobe, fjordClothingSet, fjordClothingSets} = load('../src/fjord-play/FjordWardrobe.ts');
const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
const {parseCharacterPresentation} = load('../src/characters/CharacterPresentation.ts');
const {validateModule} = load('../src/characters/AttachmentContract.ts');
const {characterAsset} = load('../src/characters/CharacterAssets.ts');
const tunic = 'garment/meshy-grid-trial-001';
const low = 'garment/meshy-low-shoes-005';
const high = 'garment/meshy-high-shoes-005';
const skirt = 'garment/meshy-long-skirt-005';
const shorts = 'garment/meshy-short-trousers-006';
const adult = {...defaultDNA(), age: 32};
const entity = (occupation = null, sex = 'male', age = 32) => ({
    kind: 'persona', id: 'resident-1', selectionKey: 'persona:resident-1',
    dna: {...adult, sex, age}, status: {living: true, occupation, sex, age},
});
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});

function fixture(bindingHook = async () => {}) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const requests = [];
    const factory = new MeshyHumanFactory(async url => {
        const path = url.split('?')[0];
        requests.push(path);
        return loader.parseAsync(buffer(await readFile('public' + path)), '');
    }, async url => {
        const path = url.split('?')[0];
        await bindingHook(path);
        return buffer(await readFile('public' + path));
    });
    const diagnostics = [];
    return {factory, requests, diagnostics,
        wardrobe: new FjordWardrobe(factory, message => diagnostics.push(message))};
}
function expectSet(human, set, ids) {
    assert.equal(human.root.userData.clothingSet.id, set);
    assert.deepEqual([...human.fit.modules.keys()].sort(), ids.slice().sort());
    for (const group of human.fit.modules.values()) {
        for (const mesh of group.children) assert.equal(mesh.skeleton, human.fit.nativeSkeleton);
    }
}

test('Fjordplay selects explicit generic and farmer sets from canonical sex and occupation without mutating identity', () => {
    for (const sex of ['female', 'male']) {
        for (const occupation of [null, 'farmer', 'fisher', 'woodworker']) {
            const person = entity(occupation, sex);
            const original = structuredClone(person);
            const selected = fjordClothingSet(person);
            assert.equal(selected, occupation === 'farmer' ? sex === 'female' ? 'farmerFemale' : 'farmerMale' : 'generic');
            assert.deepEqual(person, original);
            assert.doesNotThrow(() => parseCharacterPresentation(fjordClothingSets[selected]));
        }
        assert.equal(fjordClothingSet(entity('farmer', sex, 17)), 'native');
        assert.notEqual(fjordClothingSet(entity('farmer', sex, 18)), 'native');
    }
    const female = entity('farmer', 'female');
    female.status.sex = 'male';
    assert.equal(fjordClothingSet(female), 'farmerFemale', 'Canonical DNA sex governs the clothing set');
    assert.equal(fjordClothingSet({...entity(), kind: 'cattle'}), 'native');
    assert.equal(fjordClothingSet({...entity(), dna: undefined}), 'native');
});

test('only an explicit ensemble without shoes can accept complementary footwear', () => {
    const full = characterAsset(tunic);
    assert.equal(full.metadata.includesFootwear, false);
    assert.doesNotThrow(() => validateModule(full.metadata));
    assert.doesNotThrow(() => parseCharacterPresentation(fjordClothingSets.generic));
    assert.throws(() => parseCharacterPresentation({...fjordClothingSets.generic, trousers: shorts}), /full outfit/);
    assert.throws(() => parseCharacterPresentation({...fjordClothingSets.generic, outfit: 'garment/meshy-tunic-trousers'}), /full outfit/);
    assert.throws(() => validateModule({...full.metadata, includesFootwear: 'false'}), /Separate footwear/);
    assert.throws(() => validateModule({...full.metadata, slot: 'upper'}), /Separate footwear/);
});

test('generic tunic and low shoes compose exact native masks, retain the chest and reuse cached equipment', async () => {
    const owner = fixture();
    const human = await owner.factory.createWorld(adult);
    try {
        await owner.wardrobe.reconcile(human, entity());
        expectSet(human, 'generic', [tunic, low]);
        human.sampleNativeNeutral();
        const geometry = human.fit.mesh.geometry;
        const used = new Set(geometry.index.array);
        const positions = geometry.getAttribute('position');
        let feet = 0, chest = 0;
        for (const vertex of used) {
            const point = new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(human.fit.encoding);
            if (point.y >= 0 && point.y < .15) feet++;
            if (point.y > 1.16 && point.y < 1.29 && Math.abs(point.x) < .12 && point.z > 0) chest++;
        }
        assert.equal(feet, 0, 'Native feet must not appear through the low shoes');
        assert.ok(chest > 0, 'The actual chest remains below the low tunic neckline');
        const loads = owner.requests.length, fitRuns = human.modules.fitRuns;
        await owner.wardrobe.reconcile(human, entity());
        assert.equal(owner.requests.length, loads);
        assert.equal(human.modules.fitRuns, fitRuns, 'An unchanged occupation does not refit clothing');
        for (const clip of ['Walking', 'Idle_02']) {
            human.sampleAnimation(clip, .75);
            for (const group of human.fit.modules.values()) for (const mesh of group.children) {
                const point = mesh.getVertexPosition(0, new Vector3());
                assert.ok(point.toArray().every(Number.isFinite));
            }
        }
        assert.deepEqual(owner.diagnostics, []);
    } finally {human.dispose();}
});

test('occupation, sex and adult-age changes update clothing on the same owned Human and restore native masks', async () => {
    const owner = fixture();
    const human = await owner.factory.createWorld(adult);
    const root = human.root, source = human.fit.sourceGeometry;
    try {
        for (const [person, set, ids] of [
            [entity(), 'generic', [tunic, low]],
            [entity('farmer', 'female'), 'farmerFemale', [skirt, low]],
            [entity('farmer', 'male'), 'farmerMale', [shorts, high]],
            [entity('farmer', 'male', 17), 'native', []],
            [entity('fisher', 'female', 18), 'generic', [tunic, low]],
        ]) {
            human.applyDNA(person.dna);
            await owner.wardrobe.reconcile(human, person);
            expectSet(human, set, ids);
            assert.equal(human.root, root, 'Occupation changes preserve the resident model identity');
            if (set === 'native') assert.equal(human.fit.mesh.geometry, source);
            if (set.startsWith('farmer')) {
                assert.equal(human.root.userData.selectedAssets.outfit, null);
                assert.equal(human.root.userData.selectedAssets.top, null, 'Farmers keep their native undershirt');
            }
        }
        assert.deepEqual(owner.diagnostics, []);
    } finally {human.dispose();}
});

test('a slow previous occupation load cannot overwrite a newer farmer set', async () => {
    let release;
    const gate = new Promise(resolve => {release = resolve;});
    const owner = fixture(async path => {if (path.endsWith('/long-skirt.binding.json')) await gate;});
    const human = await owner.factory.createWorld({...adult, sex: 'female'});
    try {
        const old = owner.wardrobe.reconcile(human, entity('farmer', 'female'));
        human.applyDNA(entity('farmer', 'male').dna);
        await owner.wardrobe.reconcile(human, entity('farmer', 'male'));
        expectSet(human, 'farmerMale', [shorts, high]);
        release();
        await old;
        expectSet(human, 'farmerMale', [shorts, high]);
        assert.deepEqual(owner.diagnostics, []);
    } finally {release(); human.dispose();}
});

test('a failed garment load preserves the live body and can retry without creating a replacement resident', async () => {
    let fail = true;
    const owner = fixture(async path => {
        if (path.endsWith('/low-shoes.binding.json') && fail) {
            fail = false;
            throw new Error('Fixture binding unavailable');
        }
    });
    const human = await owner.factory.createWorld(adult);
    try {
        const body = human.fit.mesh;
        await owner.wardrobe.reconcile(human, entity());
        assert.equal(human.fit.mesh, body);
        assert.equal(human.isDisposed, false);
        assert.equal(owner.diagnostics.length, 1);
        await owner.wardrobe.reconcile(human, entity());
        expectSet(human, 'generic', [tunic, low]);
        assert.equal(human.fit.mesh, body);
    } finally {human.dispose();}
});

test('footwear body masks cannot change DNA height normalization or lift a resident off the ground', async () => {
    const owner = fixture();
    const human = await owner.factory.createWorld(adult);
    try {
        human.sampleAnimation('Idle_02', 0);
        human.root.updateMatrixWorld(true);
        const original = human.fit.mesh.matrixWorld.clone();
        for (const person of [entity(), entity('farmer', 'male')]) {
            await owner.wardrobe.reconcile(human, person);
            human.applyDNA(adult);
            human.sampleAnimation('Idle_02', 0);
            human.root.updateMatrixWorld(true);
            assert.ok(human.fit.mesh.matrixWorld.elements.every((value, index) =>
                Math.abs(value - original.elements[index]) < 1e-6),
            'The full source height is independent of the currently hidden foot triangles');
        }
    } finally {human.dispose();}
});
