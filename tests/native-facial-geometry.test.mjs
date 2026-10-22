import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Vector3 } from 'three';
import { load } from './load-source.mjs';

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { createSettlement } = load('../src/simulation/SimulationCore.ts');
const { projectFacialIdentity } = load('../src/characters/FacialIdentity.ts');
const { generateCharacterDNA } = load('../src/characters/generateCharacterDNA.ts');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const factory = new MeshyHumanFactory(async url =>
    loader.parseAsync(buffer(await readFile('public' + url.split('?')[0])), ''),
async url => buffer(await readFile('public' + url.split('?')[0])));

test('world clothing retains its visible triangles while bounding unused face morph storage', async () => {
    const { createCampaign } = load('../src/simulation/SimulationCore.ts');
    const { projectResidentAppearance } = load('../src/characters/ResidentAppearance.ts');
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const family = createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
    const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
    // Frozen indexed triangle data from live main 31e54ef, including UVs, native
    // skin weights and every face morph. Compaction must change no drawn value.
    const references = [
        ['founder-1', '39211efa287e63afb5cdc263dfa8d6272ec90bbe50c7e98f19219e38ee895aa1'],
        ['founder-3', '797990cae5e0967e0d71457ee24a54738d8bb922d86f6e3cb0a55ee59e4dee99'],
        ['founder-6', '0225e353c5bcfad65303fa0e12dafde5cc74f9c6e49379c7f8568104fa25b556'],
    ];
    for (const [id, expected] of references) {
        const appearance = projectResidentAppearance(family, id);
        const human = await factory.createWorld(appearance.dna, undefined, appearance.face);
        try {
            await wardrobe.reconcile(human, { kind: 'persona', id, dna: appearance.dna,
                status: { living: true, sex: appearance.dna.sex, occupation: family.personas[id].occupation } });
            const geometry = human.fit.mesh.geometry, hash = createHash('sha256');
            const attributes = [...Object.entries(geometry.attributes).sort(),
                ...Object.entries(geometry.morphAttributes).sort().flatMap(([name, targets]) =>
                    targets.map((attribute, index) => ['morph:' + name + ':' + index, attribute]))];
            for (const [name, attribute] of attributes) {
                hash.update(name + ':' + attribute.itemSize + '\n');
                const values = new Float32Array(geometry.index.count * attribute.itemSize);
                for (let corner = 0; corner < geometry.index.count; corner++)
                    for (let component = 0; component < attribute.itemSize; component++)
                        values[corner * attribute.itemSize + component] =
                            attribute.getComponent(geometry.index.getX(corner), component);
                hash.update(Buffer.from(values.buffer));
            }
            assert.equal(hash.digest('hex'), expected, id + ' keeps every visible triangle attribute');
            assert.ok(geometry.attributes.position.count <= 7000,
                id + ' must not upload entire hidden bodies for each clothing coverage fragment');
            assert.equal(geometry.morphTargetsRelative, true);
            assert.equal(geometry.morphAttributes.position.length, 9);
        } finally { human.dispose(); }
    }
});

test('world residents retain their inherited face at the existing world LOD and accept ancestry corrections', async () => {
    const family = createSettlement(1983);
    const dna = { ...generateCharacterDNA(1983), age: 32 };
    const face = projectFacialIdentity(family, 'einar');
    const visibleShape = { version: face.version, axes: face.axes };
    const human = await factory.createWorld(dna, undefined, visibleShape);
    try {
        assert.equal(human.lod, 2);
        assert.deepEqual(human.root.userData.facialIdentity, visibleShape);
        const corrected = projectFacialIdentity(family, 'liv');
        human.applyDNA(dna, undefined, { face: corrected });
        assert.deepEqual(human.root.userData.facialIdentity,
            { version: corrected.version, axes: corrected.axes });
        assert.deepEqual(human.fit.mesh.morphTargetInfluences.slice(0, 7), Object.values(corrected.axes));
    } finally { human.dispose(); }
});

test('native neutral remains the unshaped source reference and playback restores the same inherited face', async () => {
    const dna = { ...generateCharacterDNA(1983), age: 8, sex: 'female' };
    const face = projectFacialIdentity(createSettlement(1983), 'liv');
    const human = await factory.create(dna, 0, undefined, undefined, face);
    try {
        const inherited = [...human.fit.mesh.morphTargetInfluences];
        human.sampleNativeNeutral();
        assert.ok(human.fit.mesh.morphTargetInfluences.every(weight => weight === 0));
        assert.deepEqual(human.root.userData.facialIdentity,
            { version: face.version, axes: face.axes });
        human.setAnimation('Walk');
        assert.deepEqual(human.fit.mesh.morphTargetInfluences, inherited);
    } finally { human.dispose(); }
});

test('native facial profiles share topology and morph buffers but keep independent identity and animation', async () => {
    const family = createSettlement(1983), dna = generateCharacterDNA(1983);
    dna.age = 32;
    const firstFace = projectFacialIdentity(family, 'einar');
    const secondFace = projectFacialIdentity(family, 'liv');
    const first = await factory.create(dna, 0, undefined, undefined, firstFace);
    const second = await factory.create(dna, 0, undefined, undefined, secondFace);
    const plain = await factory.create(dna, 0);
    try {
        assert.equal(first.root.userData.facialIdentity?.version, 'facial-identity-v1');
        assert.equal(first.fit.sourceGeometry, second.fit.sourceGeometry);
        assert.notEqual(first.fit.sourceGeometry, plain.fit.sourceGeometry);
        assert.equal(first.fit.sourceGeometry.getAttribute('position'), plain.fit.sourceGeometry.getAttribute('position'));
        assert.deepEqual(first.fit.source.indices, plain.fit.source.indices);
        assert.deepEqual(first.fit.source.positions, plain.fit.source.positions);
        assert.notDeepEqual(first.fit.mesh.morphTargetInfluences, second.fit.mesh.morphTargetInfluences);
        const original = [...first.fit.mesh.morphTargetInfluences];
        second.setAnimation('Run'); second.update(.25);
        assert.deepEqual(first.fit.mesh.morphTargetInfluences, original);
        let displacedHeadVertices = 0;
        const a = first.fit.mesh, b = plain.fit.mesh;
        for (let vertex = 0; vertex < a.geometry.getAttribute('position').count; vertex++) {
            const sourceY = first.fit.source.positions[vertex * 3 + 1];
            const delta = new Vector3();
            for (let axis = 0; axis < original.length; axis++)
                delta.addScaledVector(new Vector3().fromBufferAttribute(a.geometry.morphAttributes.position[axis], vertex), original[axis]);
            if (sourceY <= 1.44) assert.ok(delta.length() < 1e-8, 'The neck and body seam are unchanged');
            else if (delta.length() > .00001) displacedHeadVertices++;
        }
        assert.ok(displacedHeadVertices > 100, 'The real facial surface, including mixed Head weights, changes');
        assert.equal(a.geometry.index.count, b.geometry.index.count);
    } finally { first.dispose(); second.dispose(); plain.dispose(); }
});

test('an inherited face uses the native body with no added eye or brow mesh', async () => {
    const family = createSettlement(1983), face = projectFacialIdentity(family, 'einar');
    const dna = generateCharacterDNA(1983);
    const portrait = await factory.create(dna, 0, undefined, undefined, face);
    const plain = await factory.create(dna, 0);
    try {
        const meshes = human => {
            let count = 0;
            human.root.traverse(node => { if (node.isMesh) count++; });
            return count;
        };
        assert.equal(meshes(portrait), meshes(plain));
        assert.equal(portrait.fit.mesh.geometry.index.count, plain.fit.mesh.geometry.index.count);
    } finally { portrait.dispose(); plain.dispose(); }
});

test('existing fitted hair and a native occupation hat follow the same facial width change', async () => {
    const family = createSettlement(1983), dna = generateCharacterDNA(1983);
    dna.age = 32;
    const original = projectFacialIdentity(family, 'einar');
    const axes = Object.fromEntries(Object.keys(original.axes).map(axis => [axis, 0]));
    const presentation = { hair: 'hair/manual-fitted-short', beard: 'none',
        headwear: 'headwear/occupation-farmer', outfit: 'none', equipment: 'none' };
    const narrow = await factory.create(dna, 2, undefined, presentation,
        { ...original, axes: { ...axes, faceWidth: -1 } });
    const wide = await factory.create(dna, 2, undefined, presentation,
        { ...original, axes: { ...axes, faceWidth: 1 } });
    try {
        for (const id of ['hair/manual-fitted-short', 'headwear/occupation-farmer']) {
            const positions = human => {
                const result = [];
                human.fit.modules.get(id).traverse(node => {
                    if (node.isMesh) result.push(...node.geometry.getAttribute('position').array);
                });
                return result;
            };
            const a = positions(narrow), b = positions(wide);
            assert.equal(a.length, b.length);
            assert.ok(a.some((value, index) => Math.abs(value - b[index]) > .001),
                id + ' must follow the changed scalp, rather than hover at its original shape');
        }
    } finally { narrow.dispose(); wide.dispose(); }
});

test('the real wardrobe retains the same face through coverage, LOD and unchanged annual appearance updates', async () => {
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
    const family = createSettlement(1983), dna = generateCharacterDNA(1983);
    dna.age = 32; dna.sex = 'male';
    const face = projectFacialIdentity(family, 'einar');
    for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod, undefined, undefined, face);
        try {
            const entity = { kind: 'persona', id: 'einar', dna, status: { occupation: 'farmer', sex: 'male', age: 32 } };
            await wardrobe.reconcile(human, entity);
            assert.equal(human.fit.mesh.geometry.morphAttributes.position?.length, 9,
                'Clothing coverage must retain the face in the actual rendered body');
            const fitRuns = human.modules.fitRuns;
            const geometry = human.fit.mesh.geometry;
            human.applyDNA({ ...dna, age: 33 });
            await wardrobe.reconcile(human, { ...entity, dna: { ...dna, age: 33 } });
            assert.equal(human.modules.fitRuns, fitRuns, 'Stable adult birthdays cannot repeat module fitting');
            assert.equal(human.fit.mesh.geometry, geometry);
            assert.equal(human.root.userData.facialIdentity.version, face.version);
        } finally { human.dispose(); }
    }
});

test('native facial presentation changes with sex and growth without rerolling inherited identity', async () => {
    const family = createSettlement(1983);
    const face = projectFacialIdentity(family, 'einar');
    const adult = { ...generateCharacterDNA(1983), age: 32, sex: 'female' };
    const human = await factory.create(adult, 0, undefined, undefined, face);
    try {
        const influences = human.fit.mesh.morphTargetInfluences;
        assert.equal(influences.length, 9);
        assert.deepEqual(influences.slice(0, 7), Object.values(face.axes));
        assert.equal(influences[7], 1, 'Legacy female DNA receives the feminine presentation');
        assert.equal(influences[8], 0);
        const inherited = structuredClone(human.root.userData.facialIdentity);
        human.applyDNA({ ...adult, age: 8 });
        assert.ok(influences[8] > .7, 'A child gains the juvenile presentation');
        assert.deepEqual(human.root.userData.facialIdentity, inherited);
        human.applyDNA(adult);
        assert.equal(influences[8], 0, 'Maturation removes only the juvenile presentation');
        assert.deepEqual(influences.slice(0, 7), Object.values(face.axes));
    } finally { human.dispose(); }
});

test('factory rejects an invalid face before loading a native body', async () => {
    let loads = 0;
    const isolated = new MeshyHumanFactory(async () => { loads++; throw new Error('unexpected body load'); },
        async () => { loads++; throw new Error('unexpected digest load'); });
    const dna = generateCharacterDNA(1983);
    const face = projectFacialIdentity(createSettlement(1983), 'einar');
    await assert.rejects(isolated.create(dna, 0, undefined, undefined,
        { ...face, axes: { ...face.axes, faceWidth: Number.NaN } }),
    /invalid facial identity/i);
    assert.equal(loads, 0);
});

test('posed body surface keeps source vertex correspondence after wardrobe coverage', async () => {
    const { FjordWardrobe } = load('../src/fjord-play/FjordWardrobe.ts');
    const wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
    const dna = { ...generateCharacterDNA(1983), age: 32, sex: 'female' };
    const face = projectFacialIdentity(createSettlement(1983), 'liv');
    const human = await factory.create(dna, 0, undefined, undefined, face);
    try {
        human.sample(.4);
        const before = human.fit.surface('posed');
        await wardrobe.reconcile(human, { kind: 'persona', id: 'liv', dna,
            status: { occupation: 'farmer', sex: 'female', age: 32 } });
        assert.equal(human.fit.mesh.geometry.morphTargetsRelative, true,
            'Covered body morphs must remain offsets from the native source');
        human.sample(.4);
        const after = human.fit.surface('posed');
        assert.equal(after.positions.length, before.positions.length);
        for (let vertex = 0; vertex < before.positions.length / 3; vertex++) {
            if (human.fit.source.positions[vertex * 3 + 1] < 1.45) continue;
            const distance = Math.hypot(...[0, 1, 2].map(component =>
                after.positions[vertex * 3 + component] - before.positions[vertex * 3 + component]));
            assert.ok(distance < .001, `Source head vertex ${vertex} drifted ${distance} m`);
            const visible = human.fit.mesh.getVertexPosition(vertex, new Vector3());
            const renderedDistance = visible.distanceTo(new Vector3().fromArray(before.positions, vertex * 3));
            assert.ok(renderedDistance < .001,
                `Covered head vertex ${vertex} drifted ${renderedDistance} m`);
        }
    } finally { human.dispose(); }
});
