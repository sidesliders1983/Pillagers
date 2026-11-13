import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createShieldForearmContactMeasure } from '../scripts/qa/shield-forearm-contact.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

function bonePose(human) {
    return human.fit.nativeSkeleton.bones.map(bone => [...bone.position, ...bone.quaternion, ...bone.scale]);
}

function rootPose(human) {
    return [...human.root.position, ...human.root.quaternion, ...human.root.scale];
}

test('both supplied shields stay outside the real forearm and fingers during field and combat motion without changing identity or refitting', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile('public' + path.split('?')[0]);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    let samples = 0;
    for (const name of ['wooden-shield', 'leather-shield']) {
        const path = '/character-lab/modules/native-combat-equipment/' + name + '.glb';
        const source = await loader.parseAsync(await bytes(path), '');
        const provenance = JSON.parse(await readFile('public' + path.replace('.glb', '.provenance.json'), 'utf8'));
        for (const age of [16, 32]) for (const sex of ['male', 'female']) {
            const dna = { ...defaultDNA(), age, sex };
            const presentation = { ...fjordClothingSets.generic, hair: 'none', beard: 'none',
                equipment: 'none', equipmentItems: ['equipment/native-wooden-spear', 'equipment/native-' + name] };
            const human = await factory.create(dna, 2, undefined, presentation);
            try {
                human.root.position.set(13, 2, -7);
                human.root.rotation.y = .7;
                const measure = createShieldForearmContactMeasure(human, 'equipment/native-' + name, source, provenance);
                const identity = JSON.stringify(human.dna), root = rootPose(human), fitRuns = human.modules.fitRuns;
                const sampleContact = label => {
                    const contact = measure();
                    assert.ok(contact.sampled > 0, label + ': actual arm points project onto the shield');
                    assert.ok(contact.maximumTransformError < 1e-6,
                        label + ': source coordinates reproduce the real skinned shield surface');
                    assert.ok(contact.maximumIntrusion <= .0015,
                        label + ': skin must stay behind the real rear surface: ' + JSON.stringify(contact));
                    assert.equal(contact.ahead, 0, label + ': no sampled skin protrudes through the shield front');
                    samples++;
                    return contact;
                };
                for (const [animation, time] of [['Idle', .6], ['Walk', .2], ['Walk', .7], ['Run', .15], ['Run', .45]]) {
                    human.sampleAnimation(animation, time);
                    const label = name + ' / ' + sex + ' ' + age + ' / ' + animation + ' ' + time;
                    const contact = sampleContact(label);
                    assert.ok(contact.maximumForearmIntrusion >= -.025,
                        label + ': the rear panel must remain within 25 mm of the actual forearm');
                }
                for (const action of ['ready', 'spear', 'shield']) {
                    const request = phase => ({ key: 'public-shield-contact', action,
                        startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase, hasSpear: true, hasShield: true });
                    for (const phase of [0, .25, .5, .75, 1]) {
                        human.sampleEncounterPose(request(phase));
                        const label = name + ' / ' + sex + ' ' + age + ' / ' + action + ' phase ' + phase;
                        const contact = sampleContact(label);
                        if (action === 'ready' || action === 'shield') assert.ok(contact.maximumForearmIntrusion >= -.025,
                            label + ': carrying and defence must keep the shield within 25 mm of the forearm');
                        if (action === 'shield' && phase === .5)
                            assert.ok(contact.frontNormalDotForward > .98, label + ': the actual source front faces the opponent');
                    }
                    const endpoint = bonePose(human), contact = measure();
                    human.sampleEncounterPose(request(.25));
                    human.sampleEncounterPose(request(1));
                    assert.deepEqual(bonePose(human), endpoint, 'Exact recorded endpoints are repeatable');
                    assert.deepEqual(measure(), contact, 'Contact is exact after unordered resampling');
                }
                assert.equal(JSON.stringify(human.dna), identity);
                assert.deepEqual(rootPose(human), root);
                assert.equal(human.modules.fitRuns, fitRuns, 'Carrying and action samples cannot rebuild the fit');
            } finally { human.dispose(); }
        }
    }
    assert.equal(samples, 160, 'Both shields, body ages/sexes and all specified motion samples run');
});
