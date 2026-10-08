import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Group, Matrix4, Quaternion, Vector3 } from 'three';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { readGLB, geometryGLTF } from '../scripts/characters/glb-inspection.mjs';

const { goldenLabBody } = loadTypeScript(new URL('../src/characters/LabBodySources.ts', import.meta.url));
const { goldenBodySurfaceCalibration } = loadTypeScript(new URL('../src/characters/GoldenBodySurfaceCalibration.ts', import.meta.url));
const { CharacterFactory } = loadTypeScript(new URL('../src/characters/CharacterFactory.ts', import.meta.url));
const { goldenCharacterDNA } = loadTypeScript(new URL('../src/characters/GoldenCharacters.ts', import.meta.url));
const { characterAsset } = loadTypeScript(new URL('../src/characters/CharacterAssets.ts', import.meta.url));
const { moduleAtEquipmentSocket, validateModule } = loadTypeScript(new URL('../src/characters/AttachmentContract.ts', import.meta.url));
const { universalHumanProfile } = loadTypeScript(new URL('../src/characters/UniversalHumanProfile.ts', import.meta.url));
const { generatePhenotype } = loadTypeScript(new URL('../src/characters/generatePhenotype.ts', import.meta.url));
const sword = characterAsset('equipment/v04-sword');
const bare = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none', equipmentSocket: 'auto', hairColor: null, technicalWaistWrap: false };
const bodyPresentation = { version: 1, preset: 'neutral', source: goldenLabBody.source };
const v = value => new Vector3(...value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const cloneMetadata = () => structuredClone(sword.metadata);
const matrix = frame => new Matrix4().compose(v(frame.position), new Quaternion(...frame.quaternion), new Vector3(1, 1, 1));
const approx = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const matrixClose = (actual, expected) => actual.elements.forEach((number, index) => approx(number, expected.elements[index]));

// Independent pairwise-distance identity: RMS radius squared equals the sum
// of all unordered squared pair distances divided by n squared. No production
// mean/radius helper or fit-internal cached measurement is reused.
function pairwiseRadius(points) {
    let squared = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) squared += points[i].distanceToSquared(points[j]);
    return Math.sqrt(squared / (points.length * points.length));
}
function corePoints(meshes, root, current = false) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert(), points = [];
    goldenBodySurfaceCalibration.meshes.forEach((entry, mi) => {
        const mesh = meshes[mi];
        assert.equal(mesh.name, entry.name);
        if (current) mesh.skeleton.update();
        for (const id of entry.cores.hand_R) {
            const point = current ? mesh.getVertexPosition(id, new Vector3()) : new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), id);
            points.push(point.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
        }
    });
    return points;
}
function meshesIn(group) { const result = []; group.traverse(o => { if (o.isSkinnedMesh) result.push(o); }); return result; }
function assetSnapshot(scene) {
    const result = [];
    scene.updateMatrixWorld(true);
    scene.traverse(o => {
        const row = { name: o.name, matrix: [...o.matrix.elements], matrixWorld: [...o.matrixWorld.elements] };
        if (o.isMesh) row.geometry = { position: Array.from(o.geometry.getAttribute('position').array), index: o.geometry.index ? Array.from(o.geometry.index.array) : null };
        if (o.isSkinnedMesh) row.skin = { inverses: o.skeleton.boneInverses.map(m => [...m.elements]), weights: [...(o.morphTargetInfluences ?? [])] };
        result.push(row);
    });
    return result;
}
function graphSnapshot(human) {
    human.root.updateMatrixWorld(true);
    const nodes = [];
    human.root.traverse(o => { nodes.push({ uuid: o.uuid, parent: o.parent?.uuid ?? null, matrix: [...o.matrix.elements], matrixWorld: [...o.matrixWorld.elements] }); });
    return { nodes, revision: human.fit.revision, modules: [...human.fit.modules].map(([id, m]) => ({ id, uuid: m.object.uuid, parent: m.object.parent?.uuid ?? null, metadata: structuredClone(m.metadata) })) };
}
async function fixture() {
    const sources = new Map(), records = new Map();
    const loader = async url => {
        const path = url.split('?')[0];
        if (!sources.has(path)) { const record = readGLB(path); records.set(path, record); sources.set(path, await geometryGLTF(record)); }
        return sources.get(path);
    };
    const factory = new CharacterFactory(loader), source = await loader(goldenLabBody.path), sourceSword = await loader(sword.lods[2]);
    const referencePoints = corePoints(meshesIn(source.scene), source.scene), referenceRadius = pairwiseRadius(referencePoints);
    assert.equal(referencePoints.length, 234);
    approx(referenceRadius, .07847847822748248, 1e-12);
    assert.equal(records.get(goldenLabBody.path).sha256, goldenLabBody.sha256);
    const metadata = cloneMetadata();
    metadata.equipmentBindings.proportions = { bodyCore: 'hand_R', referenceRadius, sourceSHA256: goldenLabBody.sha256 };
    validateModule(metadata);
    return { factory, source, sourceSword, records, referenceRadius, metadata, create: id => factory.create(goldenCharacterDNA(id), 2, bare, bodyPresentation) };
}
function verifyCarry(human, object, metadata, ratio) {
    human.root.updateMatrixWorld(true);
    const binding = metadata.equipmentBindings, carry = binding.sockets[metadata.anchor], socket = human.fit.sockets.get(metadata.anchor);
    const expected = socket.matrixWorld.clone().multiply(new Matrix4().compose(v(carry.position).multiplyScalar(ratio), new Quaternion(...carry.quaternion), new Vector3(ratio, ratio, ratio)));
    const actual = object.matrixWorld.clone().multiply(matrix(binding.grip));
    matrixClose(actual, expected);
    matrixClose(object.matrix, expected.clone().premultiply(socket.matrixWorld.clone().invert()).multiply(matrix(binding.grip).invert()));
    object.scale.toArray().forEach(value => approx(value, ratio));
    approx(object.userData.equipmentProportion, ratio);
}

test('complete actual source hand_R core determines an independently measured RMS reference', async () => {
    const f = await fixture();
    const receipt = JSON.parse(readFileSync('docs/qa/character-validation/MEASURED-HAND-PROPORTIONS.json', 'utf8'));
    assert.equal(receipt.bodySHA256, goldenLabBody.sha256);
    approx(receipt.referenceRadius, f.referenceRadius, 1e-12);
});

test('actual adult/child factory clones preserve source and pin; all five carries inherit the full measured grip affine', async () => {
    const f = await fixture(), pin = await f.create('golden_masculine_01'), pinBefore = assetSnapshot(pin.root), sourceBefore = assetSnapshot(f.source.scene), swordBefore = assetSnapshot(f.sourceSword.scene), rows = [];
    try {
        for (const id of ['golden_masculine_01', 'golden_feminine_01', 'golden_child_01']) {
            const h = await f.create(id);
            try {
                // Deliberately translate/rotate the root and retain its inherited
                // nonuniform .8 height scale: compare full affine, not grip alone.
                h.root.position.set(2.7, -.2, -1.4); h.root.rotation.set(.13, .47, -.08); h.root.updateMatrixWorld(true);
                const ratio = pairwiseRadius(corePoints(meshesIn(h.root), h.root, true)) / f.referenceRadius;
                approx(h.fit.equipmentProportion(f.metadata), ratio);
                if (id === 'golden_child_01') { approx(ratio, .6499999709233687, 1e-7); assert.ok(ratio < .7); }
                else approx(ratio, 1, 1e-9);
                for (const socket of Object.keys(f.metadata.equipmentBindings.sockets)) {
                    const metadata = moduleAtEquipmentSocket(f.metadata, socket), object = h.equip(metadata, f.sourceSword.scene);
                    verifyCarry(h, object, metadata, ratio);
                    rows.push({ id, socket, ratio, inheritedAffine: 'PASS' });
                    assert.deepEqual(assetSnapshot(pin.root), pinBefore);
                    assert.deepEqual(assetSnapshot(f.source.scene), sourceBefore);
                    assert.deepEqual(assetSnapshot(f.sourceSword.scene), swordBefore);
                    f.factory.unequip(h, metadata.id);
                    assert.ok(!h.fit.modules.has(metadata.id));
                }
            } finally { h.dispose(); }
        }
        mkdirSync('scratch/equipment-proportions', { recursive: true });
        writeFileSync('scratch/equipment-proportions/ACTUAL-FACTORY-CARRIES.json', JSON.stringify({ schema: 'pillagers-equipment-proportions-independent/1', at: new Date().toISOString(), bodySHA256: goldenLabBody.sha256, swordSHA256: f.records.get(sword.lods[2]).sha256, referenceMethod: 'Pairwise squared distance identity over all234 source hand_R core points', referenceRadius: f.referenceRadius, rows, sourceAndPinUnchanged: true, visualAcceptance: false }, null, 2) + '\n');
    } finally { pin.dispose(); }
});

test('idle/walk/run preserve captured uniform proportion; None and age refit lifecycle reinstall the measured ratio', async () => {
    const f = await fixture(), h = await f.create('golden_child_01');
    try {
        let object = h.equip(f.metadata, f.sourceSword.scene), ratio = object.userData.equipmentProportion;
        for (const clip of ['Idle', 'Walk', 'Run']) for (const time of [0, .35, .72]) {
            h.sampleAnimation(clip, time);
            assert.equal(object.userData.equipmentProportion, ratio);
            verifyCarry(h, object, f.metadata, ratio);
        }
        const old = object;
        f.factory.unequip(h, f.metadata.id);
        assert.equal(old.parent, null);
        assert.ok(!h.fit.modules.has(f.metadata.id));
        f.factory.unequip(h, f.metadata.id);
        assert.ok(!h.fit.modules.has(f.metadata.id));
        object = h.equip(f.metadata, f.sourceSword.scene);
        assert.notEqual(object, old);
        approx(object.userData.equipmentProportion, ratio);
        const adultDNA = goldenCharacterDNA('golden_masculine_01');
        h.apply(universalHumanProfile(adultDNA), generatePhenotype(adultDNA).skinTone);
        object = h.fit.modules.get(f.metadata.id).object;
        const adultRatio = pairwiseRadius(corePoints(meshesIn(h.root), h.root, true)) / f.referenceRadius;
        approx(object.userData.equipmentProportion, adultRatio, 1e-9);
        // The source/morph buffers are Float32: sub-nanometre reconstruction
        // drift after an age refit is not a change to the protected hand core.
        approx(adultRatio, 1, 1e-7);
        verifyCarry(h, object, f.metadata, adultRatio);
    } finally { h.dispose(); }
});

function invalidCases(metadata) {
    const cases = [], add = (name, mutate) => { const candidate = structuredClone(metadata); mutate(candidate); cases.push({ name, candidate }); };
    for (const radius of [0, -1, NaN, Infinity, 1e-8]) add('invalid radius ' + radius, m => { m.equipmentBindings.proportions.referenceRadius = radius; });
    add('null proportions', m => { m.equipmentBindings.proportions = null; });
    add('undefined proportions', m => { m.equipmentBindings.proportions = undefined; });
    add('array disguised as proportions', m => { m.equipmentBindings.proportions = Object.assign([], m.equipmentBindings.proportions); });
    add('function disguised as proportions', m => { m.equipmentBindings.proportions = Object.assign(() => 1, m.equipmentBindings.proportions); });
    add('unknown core', m => { m.equipmentBindings.proportions.bodyCore = 'head'; });
    add('valid left core paired with wrong right reference', m => { m.equipmentBindings.proportions.bodyCore = 'hand_L'; });
    add('malformed source hash', m => { m.equipmentBindings.proportions.sourceSHA256 = 'bad'; });
    add('wrong exact source hash', m => { m.equipmentBindings.proportions.sourceSHA256 = '0'.repeat(64); });
    add('wrong measured reference radius', m => { m.equipmentBindings.proportions.referenceRadius *= 1.5; });
    add('extra proportion key', m => { m.equipmentBindings.proportions.age = 6; });
    add('inherited source hash', m => { const p = m.equipmentBindings.proportions, hash = p.sourceSHA256; delete p.sourceSHA256; Object.setPrototypeOf(p, { sourceSHA256: hash }); });
    add('inherited whole proportions', m => { const p = m.equipmentBindings.proportions; delete m.equipmentBindings.proportions; Object.setPrototypeOf(m.equipmentBindings, { proportions: p }); });
    return cases;
}

test('generic fit.attach rejects malformed/inherited/source-wrong proportions before any fit graph mutation', async () => {
    const f = await fixture(), h = await f.create('golden_masculine_01');
    try {
        h.equip(f.metadata, f.sourceSword.scene);
        for (const { name, candidate } of invalidCases(f.metadata)) {
            const before = graphSnapshot(h), untouched = new Group();
            assert.throws(() => h.fit.attach(candidate, untouched, false), undefined, name);
            assert.equal(untouched.parent, null);
            assert.deepEqual(graphSnapshot(h), before, name);
        }
    } finally { h.dispose(); }
});

test('public UniversalHuman.equip rejects source-wrong proportions before replacing existing state or graph', async () => {
    const f = await fixture();
    for (const { name, candidate } of invalidCases(f.metadata)) {
        const h = await f.create('golden_masculine_01');
        try {
            h.equip(f.metadata, f.sourceSword.scene);
            const before = graphSnapshot(h);
            assert.throws(() => h.equip(candidate, f.sourceSword.scene), undefined, name);
            assert.deepEqual(graphSnapshot(h), before, name);
        } finally { h.dispose(); }
    }
});

test('legacy unvalidated body rejects source-bound proportions before fit or public graph mutation', async () => {
    const f = await fixture(), legacy = await f.factory.create(goldenCharacterDNA('golden_masculine_01'), 2, bare);
    try {
        const before = graphSnapshot(legacy), object = new Group();
        assert.throws(() => legacy.fit.attach(f.metadata, object, false), /source-validated fixed core/);
        assert.equal(object.parent, null);
        assert.deepEqual(graphSnapshot(legacy), before);
        assert.throws(() => legacy.equip(f.metadata, f.sourceSword.scene), /source-validated fixed core/);
        assert.deepEqual(graphSnapshot(legacy), before);
    } finally { legacy.dispose(); }
});



