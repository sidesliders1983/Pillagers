import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Box3, Raycaster, Vector3 } from 'three';
import { load } from './load-source.mjs';
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
const { generateCharacterDNA } = load('../src/characters/generateCharacterDNA.ts');
const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const factory = new MeshyHumanFactory(async url => loader.parseAsync(buffer(await readFile('public' + url.split('?')[0])), ''),
    async url => buffer(await readFile('public' + url.split('?')[0])));
const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
const entity = (dna, occupation) => ({ kind: 'persona', id: 'test', dna, status: { occupation, sex: dna.sex, age: dna.age } });
const meshes = human => {
    const values = [];
    human.root.traverse(node => { if (node.isMesh && !node.name.startsWith('MeshyFitDebug')) values.push(node); });
    return values;
};
function sameGeometryAndPose(a, b, label) {
    a.root.updateMatrixWorld(true); b.root.updateMatrixWorld(true);
    a.fit.nativeSkeleton.update(); b.fit.nativeSkeleton.update();
    const left = meshes(a), right = meshes(b);
    assert.equal(left.length, right.length, label);
    for (let m = 0; m < left.length; m++) {
        const x = left[m], y = right[m];
        assert.equal(x.name, y.name, label);
        assert.deepEqual(x.geometry.index && [...x.geometry.index.array], y.geometry.index && [...y.geometry.index.array], label + ' coverage');
        for (const [name, attribute] of Object.entries(x.geometry.attributes)) {
            const other = y.geometry.attributes[name];
            assert.equal(attribute.count, other.count, label + '/' + name);
            for (let i = 0; i < attribute.array.length; i++)
                assert.ok(Math.abs(attribute.array[i] - other.array[i]) < 1e-6, label + '/' + name + '/' + i);
        }
        if (x.isSkinnedMesh) {
            for (let vertex = 0; vertex < x.geometry.getAttribute('position').count; vertex++) {
                const p = x.getVertexPosition(vertex, new Vector3()).applyMatrix4(x.matrixWorld);
                const q = y.getVertexPosition(vertex, new Vector3()).applyMatrix4(y.matrixWorld);
                assert.ok(p.distanceTo(q) < 1e-6, label + ' posed vertex ' + vertex);
            }
        }
        const materials = mesh => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
            .map(material => [material.type, material.color?.getHex(), material.map?.uuid, material.side, material.vertexColors]);
        assert.deepEqual(materials(x), materials(y), label + ' source materials');
    }
    const x = new Box3().setFromObject(a.root, true), y = new Box3().setFromObject(b.root, true);
    assert.ok(x.min.distanceTo(y.min) < 1e-6 && x.max.distanceTo(y.max) < 1e-6, label + ' bounds');
    const centre = x.getCenter(new Vector3());
    const ray = new Raycaster(centre.clone().add(new Vector3(0, 0, 10)), new Vector3(0, 0, -1));
    const hitsA = ray.intersectObject(a.root, true), hitsB = ray.intersectObject(b.root, true);
    assert.ok(hitsA.length > 0, label + ' picking must hit the actual mesh');
    assert.equal(hitsA.length, hitsB.length, label + ' picking');
    assert.ok(Math.abs(hitsA[0].distance - hitsB[0].distance) < 1e-6, label + ' picking distance');
    assert.deepEqual(a.root.userData.skinTint, b.root.userData.skinTint);
    assert.deepEqual(a.root.userData.selectedAssets, b.root.userData.selectedAssets);
}

test('annual invariant fits exactly match forced full refits across growth, adulthood, elders, sex, genetics and all world outfits', async () => {
    for (const sex of ['female', 'male']) for (const [index, age] of [4, 5, 6, 12, 17, 18, 32, 45, 50, 75, 99].entries()) {
        const dna = { ...generateCharacterDNA(1983 + index * 17), sex, age };
        const occupation = index % 3 === 0 ? 'farmer' : null;
        const a = await factory.createWorld(dna), b = await factory.createWorld(dna);
        try {
            await wardrobe.reconcile(a, entity(dna, occupation));
            await wardrobe.reconcile(b, entity(dna, occupation));
            a.root.position.set(120.25, 3, 142.75); b.root.position.copy(a.root.position);
            a.root.rotation.y = 3.14; b.root.rotation.y = 3.14;
            a.sampleAnimation('Walk', .37); b.sampleAnimation('Walk', .37);
            const before = a.modules.fitRuns, geometry = a.fit.mesh.geometry;
            const next = { ...dna, age: age + 1 }, key = a.boundsShapeSignature;
            const retained = a.applyDNA(next);
            b.applyDNA(next, undefined, { forceRefit: true });
            const invariant = [4, 5, 18, 32, 45, 50, 75, 99].includes(age);
            assert.equal(retained, invariant, sex + '/' + age);
            if (retained) {
                assert.equal(a.modules.fitRuns, before);
                assert.equal(a.fit.mesh.geometry, geometry);
            }
            assert.equal(a.dna.age, age + 1);
            assert.deepEqual(a.root.userData.universalHumanProfile, b.root.userData.universalHumanProfile);
            assert.deepEqual(a.root.userData.universalHumanProfile.weights, universalHumanProfile(next).weights);
            if (age === 32 || age === 45) assert.equal(a.boundsShapeSignature, key);
            if (age >= 50) assert.notEqual(a.boundsShapeSignature, key, 'Elder posture must invalidate bounds');
            await wardrobe.reconcile(a, entity(next, occupation));
            await wardrobe.reconcile(b, entity(next, occupation));
            for (const clip of ['Idle', 'Walk', 'Run', 'Attack']) {
                a.sampleAnimation(clip, .43); b.sampleAnimation(clip, .43);
                sameGeometryAndPose(a, b, sex + '/' + age + '/' + clip);
            }
        } finally { a.dispose(); b.dispose(); }
    }
});

test('hair, beard, source coverage edits, geometry versions, external scale and native-neutral invalidate only exact dependencies', async () => {
    const dna = { ...generateCharacterDNA(1983), sex: 'male', age: 45, morphology: { height: 1.5, masculinity: 1 } };
    const presentation = { hair: 'hair/meshy-short-angular', beard: 'beard/meshy-compact-wedge',
        outfit: 'garment/meshy-tunic-trousers', equipment: 'equipment/meshy-belt-pouch', hairColor: '#512c1e' };
    const a = await factory.create(dna, 2, undefined, presentation), b = await factory.create(dna, 2, undefined, presentation);
    try {
        assert.equal(a.applyDNA({ ...dna, age: 46 }), true);
        b.applyDNA({ ...dna, age: 46 }, undefined, { forceRefit: true });
        for (const clip of ['Idle', 'Walk', 'Run', 'Attack']) {
            a.sampleAnimation(clip, .6); b.sampleAnimation(clip, .6);
            sameGeometryAndPose(a, b, 'hair/beard/' + clip);
        }
        assert.equal(a.applyDNA({ ...dna, traits: { ...dna.traits, intelligence: .1 } }), false);
        assert.equal(a.applyDNA(dna), false, 'There is no historical-fit cache across DNA changes');
        a.sampleNativeNeutral();
        assert.equal(a.applyDNA(dna), false);
        a.root.scale.setScalar(1.1);
        await factory.equip(a, presentation);
        assert.equal(a.applyDNA(dna), false, 'Installing clothing cannot validate a changed normalization frame');
        assert.equal(a.applyDNA(dna), true);
        a.fit.sourceGeometry.getAttribute('position').needsUpdate = true;
        assert.equal(a.applyDNA(dna), false);
        const binding = a.nativeSources[0].binding;
        const oldRecipe = binding.recipe.version;
        binding.recipe.version++;
        assert.equal(a.applyDNA(dna), false, 'In-place binding edits must force a complete fit');
        binding.recipe.version = oldRecipe;
        assert.equal(a.applyDNA(dna), false);
        a.fit.refit();
        assert.equal(a.applyDNA(dna), false, 'An unexpected external socket refit invalidates reuse');
        a.modules.refit(a.profile);
        assert.equal(a.applyDNA(dna), false, 'An unexpected module refit invalidates reuse');
        await factory.equip(a, { ...presentation, hairColor: '#e4d4b0' });
        assert.equal(a.applyDNA(dna), true, 'New equipment is fitted before its dependency key is retained');
        a.dispose();
        assert.equal(a.lastNeutralFit, undefined);
        b.sampleAnimation('Walk', .2);
    } finally { a.dispose(); b.dispose(); }
});

test('each body LOD retains identical authored coverage and scale through invariant birthdays and forced fallback', async () => {
    const dna = { ...generateCharacterDNA(32), age: 30 };
    for (const lod of [0, 1, 2]) {
        const a = await factory.create(dna, lod), b = await factory.create(dna, lod);
        try {
            await wardrobe.reconcile(a, entity(dna, null)); await wardrobe.reconcile(b, entity(dna, null));
            assert.equal(a.applyDNA({ ...dna, age: 31 }), true);
            b.applyDNA({ ...dna, age: 31 }, undefined, { forceRefit: true });
            a.sampleAnimation('Walk', .3); b.sampleAnimation('Walk', .3);
            sameGeometryAndPose(a, b, 'LOD' + lod);
        } finally { a.dispose(); b.dispose(); }
    }
});
