import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createRigidPropIntersectionMeasure } from '../scripts/qa/rigid-prop-intersection.mjs';
import { createEquipmentCharacterIntersectionMeasure } from '../scripts/qa/character-equipment-clearance.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { characterAsset } = load('../src/characters/CharacterAssets.ts');
const { nativeRegion } = load('../src/characters/MeshyBodyFitAdapter.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
const { founderFacialIdentity, facialAxes } = load('../src/characters/FacialIdentity.ts');
const { femaleHairAssets } = load('../src/characters/FemaleHairCatalog.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');

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

function transitionProfiles() {
    const profiles = [{ label: 'owner default', dna: defaultDNA(), lod: 0, hair: 'none' }];
    for (const age of [16, 32]) {
        for (const masculinity of [.15, .85]) {
            const original = { ...defaultDNA(), age, sex: masculinity < .5 ? 'female' : 'male' };
            profiles.push({
                label: 'age ' + age + ' / masculinity ' + masculinity,
                dna: {
                    ...original,
                    morphology: { masculinity, height: universalHumanProfile(original).height },
                },
                lod: 0,
                hair: 'none',
            });
        }
    }
    for (const [age, masculinity, height, intelligence, hair] of [
        [75, .05, 1.16, 1, femaleHairAssets[0].id],
        [100, .95, 1.60, 0, 'hair/manual-long-2'],
    ]) {
        const original = defaultDNA();
        profiles.push({
            label: 'older bounded morphology / age ' + age,
            dna: {
                ...original,
                seed: age === 75 ? 17 : 930,
                age,
                sex: masculinity < .5 ? 'female' : 'male',
                traits: { ...original.traits, intelligence, agility: intelligence },
                morphology: { masculinity, height },
            },
            lod: 2,
            hair,
            face: {
                version: 'facial-identity-v1',
                axes: Object.fromEntries(facialAxes.map((axis, index) => [
                    axis, age === 75 ? (index % 2 ? -.75 : .75) : .75,
                ])),
            },
        });
    }
    return profiles;
}

test('both falling spears retain source grasp and clear the forearm, helmet and floor through Death transitions', async () => {
    const factory = nativeFactory();
    let samples = 0;
    for (const { label, dna, face, lod, hair } of transitionProfiles()) {
        for (const spear of ['equipment/native-wooden-spear', 'equipment/native-iron-spear']) {
            const bindingPath = characterAsset(spear).metadata.nativeBinding.path;
            const binding = JSON.parse(await readFile('public' + bindingPath, 'utf8'));
            const beard = dna.age >= 18 && dna.sex === 'male' ? 'beard/manual-fitted-normal' : 'none';
            const human = await factory.create(dna, lod, undefined, {
                ...fjordClothingSets.generic,
                hair,
                beard,
                headwear: 'headwear/native-iron-helmet',
                equipmentItems: [spear, 'equipment/native-iron-shield'],
            }, face ?? founderFacialIdentity(dna.seed));
            try {
                const helmet = human.fit.modules.get('headwear/native-iron-helmet')
                    .children.find(mesh => mesh.isSkinnedMesh);
                const prop = human.fit.modules.get(spear).children.find(mesh => mesh.isSkinnedMesh);
                const helmetContact = createRigidPropIntersectionMeasure(helmet, human.fit.mesh, { stopAtFirst: true });
                const shaftContacts = createEquipmentCharacterIntersectionMeasure(human, spear, [],
                    nativeRegion, { gripBinding: binding });
                const fitRuns = human.modules.fitRuns;
                for (const phase of [0, .25, .5, .75, .9, 1]) {
                    assert.equal(human.sampleEncounterPose({
                        key: 'native-death-helmet-transition-' + label + '-' + spear,
                        action: 'death',
                        startedAt: 100,
                        durationTicks: 8,
                        tick: 100 + 8 * phase,
                        hasSpear: true,
                        hasShield: true,
                    }), true, 'The native Death clip must actually be sampled');
                    human.root.updateMatrixWorld(true);
                    assert.ok(human.fit.nativeSkeleton.bones.every(bone =>
                        bone.matrixWorld.elements.every(Number.isFinite)));
                    const context = label + ' / ' + spear + ' / LOD ' + lod + ' / Death ' + phase;
                    const contact = helmetContact(new Map());
                    assert.equal(contact.intersections, 0,
                        context + ' / helmet against actual body: ' + JSON.stringify(contact));
                    for (const shaft of shaftContacts(new Map())) {
                        assert.equal(shaft.intersections, 0,
                            context + ' / source shaft against actual body: ' + JSON.stringify(shaft));
                    }
                    let minimumY = Infinity;
                    for (let vertex = 0; vertex < prop.geometry.attributes.position.count; vertex++) {
                        minimumY = Math.min(minimumY, prop.getVertexPosition(vertex, new Vector3())
                            .applyMatrix4(prop.matrixWorld).y);
                    }
                    assert.ok(minimumY >= 0, context + ' / actual source spear remains above the floor: ' + minimumY);
                    samples++;
                }
                assert.equal(human.modules.fitRuns, fitRuns, 'A falling arm cannot refit the helmet or clothing');
            } finally {
                human.dispose();
            }
        }
    }
    assert.equal(samples, 84);
    console.log('Death helmet and source-shaft transition clearance: ' + samples + ' actual native poses.');
});
