import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEquipmentCharacterIntersectionMeasure } from '../scripts/qa/character-equipment-clearance.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { nativeRegion } = load('../src/characters/MeshyBodyFitAdapter.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { universalHumanProfile } = load('../src/characters/UniversalHumanProfile.ts');
const { resolveCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

test('actual combat equipment clears the visible body, head and worn field clothes throughout sampled actions and body shapes', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile('public' + path.split('?')[0]);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    const profiles = [{ label: 'owner default', dna: defaultDNA() }];
    for (const age of [16, 32]) for (const masculinity of [.15, .85]) {
        const original = { ...defaultDNA(), age, sex: masculinity < .5 ? 'female' : 'male' };
        profiles.push({ label: 'age ' + age + ' / masculinity ' + masculinity,
            dna: { ...original, morphology: { masculinity, height: universalHumanProfile(original).height } } });
    }
    const spear = 'equipment/native-wooden-spear';
    const gripBinding = JSON.parse(await readFile('public/character-lab/modules/native-combat-equipment/wooden-spear.binding.json', 'utf8'));
    const loadouts = [
        [spear, 'equipment/native-wooden-shield'], [spear, 'equipment/native-leather-shield'],
        [spear], ['equipment/native-wooden-shield'], ['equipment/native-leather-shield'],
    ];
    const phases = [0, .1, .2, .25, .2647, .3, .4, .5, .6, .7, .75, .8, .9, 1];
    let samples = 0;
    for (const { label, dna } of profiles) for (const equipmentItems of loadouts) {
        const presentation = { ...fjordClothingSets.generic, hair: 'none', beard: 'none',
            equipment: 'none', equipmentItems };
        const human = await factory.create(dna, 2, undefined, presentation);
        try {
            const garmentIds = resolveCharacterPresentation(dna, presentation, human.fit.body).garmentIds;
            const measures = equipmentItems.map(id => ({ id,
                measure: createEquipmentCharacterIntersectionMeasure(human, id, garmentIds, nativeRegion, { gripBinding }) }));
            const fitRuns = human.modules.fitRuns, identity = JSON.stringify(human.dna);
            const hasSpear = equipmentItems.includes(spear), hasShield = equipmentItems.length > (hasSpear ? 1 : 0);
            for (const action of [hasSpear ? 'spear' : null, hasShield ? 'shield' : null].filter(Boolean)) {
                for (const phase of phases) {
                    human.sampleEncounterPose({ key: 'public-character-equipment-clearance', action,
                        startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase, hasSpear, hasShield });
                    human.root.updateMatrixWorld(true);
                    const points = new Map();
                    for (const { id, measure } of measures) for (const contact of measure(points)) {
                        assert.equal(contact.intersections, 0, label + ' / ' + equipmentItems.join(' + ') +
                            ' / ' + action + ' phase ' + phase + ' / ' + id + ': actual character surface crossing ' +
                            JSON.stringify(contact));
                    }
                    samples++;
                }
            }
            assert.equal(human.modules.fitRuns, fitRuns, 'Pose samples do not refit or replace body/clothes');
            assert.equal(JSON.stringify(human.dna), identity);
        } finally { human.dispose(); }
        if (equipmentItems === loadouts[loadouts.length - 1])
            console.log('Character equipment clearance: ' + label + ' complete; ' + samples + '/490 poses.');
    }
    assert.equal(samples, 490, 'Every body, valid equipment/action combination and specified phase runs');
});
