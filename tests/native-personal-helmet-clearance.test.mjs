import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createRigidPropIntersectionMeasure } from '../scripts/qa/rigid-prop-intersection.mjs';
import { load } from './load-source.mjs';
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
const { founderFacialIdentity, facialAxes } = load('../src/characters/FacialIdentity.ts');
const { femaleHairAssets } = load('../src/characters/FemaleHairCatalog.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

test('the supplied native helmet clears actual head, hair and beard surfaces across qualified body and motion samples', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => { const value = await readFile('public' + path.split('?')[0]);
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    const profiles = [{ label: 'owner default', dna: defaultDNA() }];
    for (const age of [16, 32]) for (const masculinity of [.15, .85]) {
        const original = { ...defaultDNA(), age, sex: masculinity < .5 ? 'female' : 'male' };
        profiles.push({ label: 'age ' + age + ' / masculinity ' + masculinity,
            dna: { ...original, morphology: { masculinity, height: universalHumanProfile(original).height } } });
    }
    for (const [age, masculinity, height, intelligence, hair] of [
        [75, .05, 1.16, 1, femaleHairAssets[0].id],
        [100, .95, 1.60, 0, 'hair/manual-long-2'],
    ]) {
        const original = defaultDNA(), seed = age === 75 ? 17 : 930;
        profiles.push({ label: 'older bounded morphology / age ' + age, lods: [2], hairs: [hair],
            dna: { ...original, seed, age, sex: masculinity < .5 ? 'female' : 'male',
                traits: { ...original.traits, intelligence, agility: intelligence },
                morphology: { masculinity, height } },
            face: { version: 'facial-identity-v1', axes: Object.fromEntries(facialAxes.map((axis, index) =>
                [axis, age === 75 ? index % 2 ? -.75 : .75 : .75])) } });
    }
    let samples = 0;
    for (const { label, dna, face, lods, hairs: explicitHairs } of profiles) for (const lod of lods ?? [0, 1, 2]) {
        const hairs = explicitHairs ?? (dna.age < 18 ? ['none', 'hair/manual-fitted-short'] : dna.sex === 'female'
            ? ['none', femaleHairAssets[0].id, femaleHairAssets[1].id]
            : ['none', 'hair/manual-long-braided', 'hair/manual-long-2']);
        for (const hair of hairs) {
            const beard = dna.age >= 18 && dna.sex === 'male' ? 'beard/manual-fitted-normal' : 'none';
            const presentation = { ...fjordClothingSets.generic, hair, beard,
                headwear: 'headwear/native-iron-helmet',
                equipmentItems: ['equipment/native-iron-spear', 'equipment/native-iron-shield'] };
            const human = await factory.create(dna, lod, undefined, presentation, face ?? founderFacialIdentity(dna.seed));
            try {
                const helmet = human.fit.modules.get('headwear/native-iron-helmet').children.find(mesh => mesh.isSkinnedMesh);
                const targets = [{ label: 'body', mesh: human.fit.mesh }];
                for (const id of [hair, beard]) if (id !== 'none') human.fit.modules.get(id)?.traverse(mesh => {
                    if (mesh.isSkinnedMesh && mesh.visible) targets.push({ label: id, mesh });
                });
                const probes = targets.map(target => ({ label: target.label,
                    measure: createRigidPropIntersectionMeasure(helmet, target.mesh, { stopAtFirst: true }) }));
                const fitRuns = human.modules.fitRuns;
                const inspect = motion => {
                    human.root.updateMatrixWorld(true); const cache = new Map();
                    for (const probe of probes) {
                        const contact = probe.measure(cache);
                        assert.equal(contact.intersections, 0, label + ' / LOD ' + lod + ' / ' + hair + ' / ' + motion +
                            ' / helmet against ' + probe.label + ': ' + JSON.stringify(contact));
                    }
                    samples++;
                };
                for (const [clip, time] of [['Idle', .6], ['Walk', .25], ['Run', .3]]) {
                    human.sampleAnimation(clip, time); inspect(clip + ' ' + time);
                }
                for (const action of ['ready', 'spear', 'shield', 'brace', 'withdraw', 'death']) for (const phase of [0, .5, 1]) {
                    human.sampleEncounterPose({ key: 'native-personal-helmet-clearance', action,
                        startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase, hasSpear: true, hasShield: true });
                    inspect(action + ' phase ' + phase);
                }
                assert.equal(human.modules.fitRuns, fitRuns, 'Headwear motion cannot refit the helmet or hair');
            } finally { human.dispose(); }
        }
        console.log('Helmet source clearance: ' + label + ' / LOD ' + lod + ' complete; ' + samples + ' poses.');
    }
    assert.equal(samples, 861, 'Five age/sex profiles at every LOD and two older bounded morphology/face samples each run all 21 motions');
});
