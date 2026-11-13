import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createRigidPropIntersectionMeasure } from '../scripts/qa/rigid-prop-intersection.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { founderFacialIdentity, facialAxes } = load('../src/characters/FacialIdentity.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
const { nativeBodyArmorAssets, nativeHelmetAssets } = load('../src/characters/NativePersonalArmorCatalog.ts');

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

function geometryDigest(geometry) {
    const digest = createHash('sha256');
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
        digest.update(name);
        digest.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    }
    if (geometry.index) digest.update(new Uint8Array(geometry.index.array.buffer,
        geometry.index.array.byteOffset, geometry.index.array.byteLength));
    return digest.digest('hex');
}

const meshFor = (human, id) => human.fit.modules.get(id)?.children.find(mesh => mesh.isSkinnedMesh);

function nativeProfiles() {
    const dna = defaultDNA();
    return [
        { name: 'owner default', dna, lod: 0, hair: 'hair/manual-long-2', beard: 'beard/manual-fitted-normal' },
        { name: 'teen female', dna: { ...dna, age: 16, sex: 'female', morphology: { masculinity: .15, height: 1.16 } },
            lod: 2, hair: 'hair/manual-fitted-short', beard: 'none' },
        { name: 'bounded older adult', dna: { ...dna, age: 100, seed: 930, sex: 'male',
            traits: { ...dna.traits, intelligence: 0, agility: 0 }, morphology: { masculinity: .95, height: 1.60 } },
            lod: 2, hair: 'hair/manual-long-braided', beard: 'beard/manual-fitted-normal',
            face: { version: 'facial-identity-v1', axes: Object.fromEntries(facialAxes.map(axis => [axis, .75])) } },
    ];
}

test('actual armor variants share the native rig, retain identity and restore independent source clothing', async () => {
    const factory = nativeFactory();
    let loadouts = 0, poses = 0;
    for (const profile of nativeProfiles()) {
        const base = { ...fjordClothingSets.generic, hair: profile.hair, beard: profile.beard,
            equipmentItems: ['equipment/native-iron-spear', 'equipment/native-iron-shield'] };
        const face = profile.face ?? founderFacialIdentity(profile.dna.seed);
        const other = await factory.create(profile.dna, profile.lod, undefined, base, face);
        const tunicId = 'garment/meshy-grid-trial-001';
        const originalTunic = geometryDigest(meshFor(other, tunicId).geometry);
        const originalHair = geometryDigest(meshFor(other, profile.hair).geometry);
        try {
            for (const bodyArmor of nativeBodyArmorAssets) {
                for (const headwear of nativeHelmetAssets) {
                    // A contact probe owns one fixed fitted topology. A new wearer gives each
                    // actual loadout its own geometry while still exercising the shared source cache.
                    const human = await factory.create(profile.dna, profile.lod, undefined,
                        { ...base, bodyArmor, headwear }, face);
                    try {
                        const skeleton = human.fit.nativeSkeleton, body = human.fit.mesh;
                        const bodyBefore = geometryDigest(other.fit.mesh.geometry), originalDNA = JSON.stringify(human.dna);
                        assert.equal(human.fit.nativeSkeleton, skeleton);
                        assert.equal(skeleton.bones.length, 44);
                        assert.equal(human.fit.mesh, body);
                        assert.equal(geometryDigest(body.geometry), bodyBefore, 'No armor variant cuts native body coverage');
                        assert.equal(human.root.userData.selectedAssets.bodyArmor, bodyArmor);
                        assert.ok(human.fit.modules.has(headwear));
                        assert.equal([...human.fit.modules.keys()].filter(id => nativeBodyArmorAssets.includes(id)).length, 1);
                        assert.equal([...human.fit.modules.keys()].filter(id => nativeHelmetAssets.includes(id)).length, 1);
                        for (const id of [bodyArmor, headwear, tunicId, ...base.equipmentItems])
                            assert.equal(meshFor(human, id).skeleton, skeleton, id);
                        const fitRuns = human.modules.fitRuns;
                        const helmet = meshFor(human, headwear);
                        const contacts = [
                            { id: 'visible-body', mesh: human.fit.mesh },
                            { id: profile.hair, mesh: meshFor(human, profile.hair) },
                            ...(profile.beard === 'none' ? [] : [{ id: profile.beard, mesh: meshFor(human, profile.beard) }]),
                        ].map(target => ({ id: target.id,
                            measure: createRigidPropIntersectionMeasure(helmet, target.mesh, { stopAtFirst: true }) }));
                        const samples = [
                            { clip: 'Idle', time: .2 }, { clip: 'Walk', time: .3 }, { clip: 'Run', time: .4 },
                            { action: 'spear', phase: .5 }, { action: 'shield', phase: .5 },
                            { action: 'death', phase: .5 }, { action: 'death', phase: .75 }, { action: 'death', phase: 1 },
                        ];
                        for (const sample of samples) {
                            if (sample.clip) human.sampleAnimation(sample.clip, sample.time);
                            else assert.equal(human.sampleEncounterPose({ key: 'personal-armor-variant', action: sample.action,
                                startedAt: 0, durationTicks: 8, tick: 8 * sample.phase, hasSpear: true, hasShield: true }), true);
                            human.root.updateMatrixWorld(true);
                            assert.ok(skeleton.bones.every(bone => bone.matrixWorld.elements.every(Number.isFinite)));
                            for (const id of [bodyArmor, headwear, tunicId]) {
                                const mesh = meshFor(human, id);
                                for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex += 97)
                                    assert.ok(mesh.getVertexPosition(vertex, new Vector3()).toArray().every(Number.isFinite));
                            }
                            for (const { id, measure } of contacts) {
                                const contact = measure(new Map());
                                assert.equal(contact.intersections, 0, profile.name + ' / ' + bodyArmor + ' / ' + headwear +
                                    ' / ' + id + ' / ' + JSON.stringify(sample) + ': ' + JSON.stringify(contact));
                            }
                            poses++;
                        }
                        assert.equal(human.modules.fitRuns, fitRuns, 'Native motion never refits an armor variant');
                        assert.equal(JSON.stringify(human.dna), originalDNA);
                        assert.equal(geometryDigest(meshFor(other, tunicId).geometry), originalTunic, 'Other wearer keeps original tunic');
                        assert.equal(geometryDigest(meshFor(other, profile.hair).geometry), originalHair, 'Other wearer keeps original hair');
                        await factory.equip(human, base);
                        assert.equal(human.fit.nativeSkeleton, skeleton);
                        assert.equal(human.fit.mesh, body);
                        assert.equal(geometryDigest(meshFor(human, tunicId).geometry), originalTunic, 'Unequip restores exact source tunic');
                        assert.equal(geometryDigest(meshFor(human, profile.hair).geometry), originalHair, 'Unequip restores exact source hair');
                        assert.equal(geometryDigest(body.geometry), bodyBefore);
                        loadouts++;
                    } finally {
                        human.dispose();
                    }
                }
            }
        } finally {
            other.dispose();
        }
    }
    assert.equal(loadouts, 12);
    assert.equal(poses, 96);
    console.log('Actual native armor variants: ' + loadouts + ' loadouts / ' + poses + ' bounded motion samples.');
});
