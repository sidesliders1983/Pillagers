import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Vector3 } from 'three';
import { createHash } from 'node:crypto';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
const { equipmentPortraitFrame } = load('../src/characters/EquipmentPortraitFraming.ts');

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

function nativeFactory() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile('public' + path.split('?')[0]);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    return new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
}

test('four actual pieces share one native character and preserve the field tunic coverage through motion and unequip', async () => {
    const factory = nativeFactory(), dna = { ...defaultDNA(), age: 32 };
    const entity = { kind: 'persona', dna, status: { living: true, expedition: 'qualified-field',
        equipment: { weapon: 'ironSpear', shield: 'ironShield' } } };
    const base = fjordWardrobePresentation(entity);
    const all = fjordWardrobePresentation({ ...entity, status: { ...entity.status,
        equipment: { ...entity.status.equipment, bodyArmor: 'leatherBodyArmor', headgear: 'ironHelmet' } } });
    const human = await factory.create(dna, 2, undefined, base);
    try {
        const skeleton = human.fit.nativeSkeleton, body = human.fit.mesh, identity = JSON.stringify(human.dna);
        const indices = Array.from(body.geometry.getIndex().array);
        const vertices = Array.from(body.geometry.getAttribute('position').array);
        const underlay = 'garment/meshy-grid-trial-001';
        await factory.equip(human, all);
        assert.equal(human.fit.nativeSkeleton, skeleton);
        assert.equal(skeleton.bones.length, 44);
        assert.equal(human.fit.mesh, body);
        assert.deepEqual(Array.from(body.geometry.getIndex().array), indices, 'Armor cannot mask or cut the native body');
        assert.deepEqual(Array.from(body.geometry.getAttribute('position').array), vertices);
        for (const id of [underlay, 'garment/meshy-low-shoes-005', 'garment/native-leather-body-armor',
            'headwear/native-iron-helmet', 'equipment/native-iron-spear', 'equipment/native-iron-shield'])
            assert.ok(human.fit.modules.has(id), id);
        assert.equal(human.root.userData.selectedAssets.bodyArmor, 'garment/native-leather-body-armor');
        const fitRuns = human.modules.fitRuns;
        for (const [clip, time] of [['Idle', .2], ['Walk', .3], ['Run', .4]]) human.sampleAnimation(clip, time);
        for (const action of ['ready', 'spear', 'shield', 'brace', 'withdraw', 'death']) for (const phase of [0, .5, 1]) {
            human.sampleEncounterPose({ key: 'native-personal-protection', action, startedAt: 0,
                durationTicks: 8, tick: 8 * phase, hasSpear: true, hasShield: true });
            for (const group of human.fit.modules.values()) group.traverse(mesh => {
                if (!mesh.isSkinnedMesh) return;
                assert.equal(mesh.skeleton, skeleton);
                for (let vertex = 0; vertex < mesh.geometry.getAttribute('position').count; vertex += 97)
                    assert.ok(mesh.getVertexPosition(vertex, new Vector3()).toArray().every(Number.isFinite));
            });
        }
        assert.equal(human.modules.fitRuns, fitRuns, 'Motion cannot refit armor, helmet or hand props');
        assert.equal(JSON.stringify(human.dna), identity);
        await factory.equip(human, base);
        assert.equal(human.fit.modules.has('garment/native-leather-body-armor'), false);
        assert.equal(human.fit.modules.has('headwear/native-iron-helmet'), false);
        assert.deepEqual(Array.from(body.geometry.getIndex().array), indices);
    } finally { human.dispose(); }
});

test('an armor-only portrait includes the real chest layer without requiring an invented hand item', async () => {
    const human = await nativeFactory().create({ ...defaultDNA(), age: 32 }, 2, undefined,
        { hair: 'none', beard: 'none', equipment: 'none', outfit: 'garment/meshy-grid-trial-001',
            shoes: 'garment/meshy-low-shoes-005', bodyArmor: 'garment/native-leather-body-armor' });
    try {
        human.sampleAnimation('Idle', .4); human.root.updateMatrixWorld(true);
        const target = human.fit.nativeSkeleton.bones[5].getWorldPosition(new Vector3());
        const frame = equipmentPortraitFrame(human, { target, across: new Vector3(1, 0, 0),
            up: new Vector3(0, 1, 0), forward: new Vector3(0, 0, 1) }, 30);
        assert.ok(frame && frame.target.y < target.y - .1, 'The actual torso and recognizable head determine the frame');
        assert.equal([...human.fit.modules.keys()].some(id => id.startsWith('equipment/')), false);
    } finally { human.dispose(); }
});


test('helmet fitting preserves cached source, exposed hair, beard and independent wearers, then fully restores on unequip', async () => {
    const sources = [], loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => { const value = await readFile('public' + path.split('?')[0]);
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); };
    const factory = new MeshyHumanFactory(async path => {
        const gltf = await loader.parseAsync(await bytes(path), ''); sources.push(gltf.scene); return gltf;
    }, bytes);
    const digest = geometry => {
        const hash = createHash('sha256');
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            hash.update(name); hash.update(new Uint8Array(attribute.array.buffer,
                attribute.array.byteOffset, attribute.array.byteLength));
        }
        if (geometry.index) hash.update(new Uint8Array(geometry.index.array.buffer,
            geometry.index.array.byteOffset, geometry.index.array.byteLength));
        return hash.digest('hex');
    };
    const sourceDigests = () => sources.flatMap(scene => { const values = [];
        scene.traverse(mesh => { if (mesh.isMesh) values.push(digest(mesh.geometry)); }); return values; });
    const meshFor = (human, id) => human.fit.modules.get(id).children.find(mesh => mesh.isSkinnedMesh);
    const dna = defaultDNA(), hairId = 'hair/manual-long-2', beardId = 'beard/manual-fitted-normal';
    const base = { hair: hairId, beard: beardId, outfit: 'garment/meshy-grid-trial-001',
        shoes: 'garment/meshy-low-shoes-005', equipment: 'none', headwear: 'none' };
    const preparation = [];
    const human = await factory.create(dna, 2, undefined, base, undefined, sample => preparation.push(sample));
    const other = await factory.create(dna, 2, undefined, base);
    try {
        const hair = meshFor(human, hairId), original = hair.geometry.clone();
        const sourceBefore = sourceDigests(), otherBefore = digest(meshFor(other, hairId).geometry);
        const beardBefore = digest(meshFor(human, beardId).geometry), originalDigest = digest(original);
        preparation.length = 0;
        const equipStarted = performance.now();
        await factory.equip(human, { ...base, headwear: 'headwear/native-iron-helmet' });
        const equipMilliseconds = performance.now() - equipStarted;
        const helmetFitMilliseconds = preparation.filter(sample => sample.stage === 'qualified-helmet-crown-fit')
            .reduce((total, sample) => total + sample.durationMs, 0);
        const fitted = meshFor(human, hairId), positions = fitted.geometry.getAttribute('position');
        let changed = 0, maximumDisplacement = 0, maximumMetres = 0, preservedTips = 0;
        human.root.updateMatrixWorld(true); other.root.updateMatrixWorld(true);
        for (let vertex = 0; vertex < original.getAttribute('position').count; vertex++) {
            const before = new Vector3().fromBufferAttribute(original.getAttribute('position'), vertex);
            const after = new Vector3().fromBufferAttribute(positions, vertex);
            const distance = before.distanceTo(after); if (distance > 1e-7) changed++;
            maximumDisplacement = Math.max(maximumDisplacement, distance);
            const referenceMesh = meshFor(other, hairId);
            const referenceWorld = referenceMesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(referenceMesh.matrixWorld);
            const fittedWorld = fitted.getVertexPosition(vertex, new Vector3()).applyMatrix4(fitted.matrixWorld);
            maximumMetres = Math.max(maximumMetres, referenceWorld.distanceTo(fittedWorld));
            if (before.clone().applyMatrix4(human.fit.encoding).y < 1.50) {
                assert.ok(distance < 1e-7, 'Distant exposed locks retain their authored positions'); preservedTips++;
            }
            for (const name of ['skinIndex', 'skinWeight', 'uv']) {
                const attribute = original.getAttribute(name); if (!attribute) continue;
                for (let channel = 0; channel < attribute.itemSize; channel++)
                    assert.equal(fitted.geometry.getAttribute(name).getComponent(vertex, channel),
                        attribute.getComponent(vertex, channel), 'Original skinning and UVs remain exact');
            }
        }
        assert.ok(changed > 0 && preservedTips > 100);
        assert.ok(maximumDisplacement < .12, 'Covered crown fitting remains bounded to the real helmet');
        assert.ok(Array.from(fitted.geometry.getAttribute('normal').array).every(Number.isFinite));
        assert.equal(digest(meshFor(human, beardId).geometry), beardBefore, 'Exposed beard is unchanged');
        assert.equal(digest(meshFor(other, hairId).geometry), otherBefore, 'Other wearer is unchanged');
        assert.deepEqual(sourceDigests().slice(0, sourceBefore.length), sourceBefore, 'Cached modules are unchanged');
        console.log('Measured helmet hair fit: ' + JSON.stringify({ changedOriginalVertices: changed,
            maximumModuleDisplacement: maximumDisplacement, maximumMetres, preservedTips, equipMilliseconds, helmetFitMilliseconds, refinement: fitted.userData.headwearCrownRefinement,
            rim: fitted.userData.headwearRimFit }));
        await factory.equip(human, base);
        assert.equal(digest(meshFor(human, hairId).geometry), originalDigest, 'Unequip restores source topology, normals and weights');
        assert.equal(digest(meshFor(human, beardId).geometry), beardBefore);
        const third = await factory.create(dna, 2, undefined, base);
        try { assert.equal(digest(meshFor(third, hairId).geometry), originalDigest, 'Later wearers reuse clean cached modules'); }
        finally { third.dispose(); }
        original.dispose();
    } finally { human.dispose(); other.dispose(); }
});
