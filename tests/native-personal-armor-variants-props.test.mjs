import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createRigidPropIntersectionMeasure } from '../scripts/qa/rigid-prop-intersection.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { nativeSpearAssets, nativeShieldAssets } = load('../src/characters/NativeCombatEquipmentCatalog.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });

test('the actual iron body armor and leather helmet clear both spears and all three shields in bounded combat poses', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => {
        const buffer = await readFile('public' + path.split('?')[0]);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    const armor = ['garment/native-iron-body-armor', 'headwear/native-leather-helmet'];
    let states = 0, exactPairs = 0;
    for (const weapon of nativeSpearAssets) {
        for (const shield of nativeShieldAssets) {
            const equipmentItems = [weapon, shield];
            const human = await factory.create(defaultDNA(), 2, undefined, {
                ...fjordClothingSets.generic,
                hair: 'hair/manual-long-2', beard: 'beard/manual-fitted-normal',
                bodyArmor: armor[0], headwear: armor[1], equipmentItems,
            });
            try {
                const meshFor = id => human.fit.modules.get(id).children.find(mesh => mesh.isSkinnedMesh);
                const probes = armor.flatMap(layer => equipmentItems.map(item => ({
                    layer, item,
                    measure: createRigidPropIntersectionMeasure(meshFor(layer), meshFor(item), { stopAtFirst: true }),
                })));
                const fitRuns = human.modules.fitRuns;
                for (const [action, phase] of [
                    ['ready', .5], ['spear', .5], ['shield', .5],
                    ['death', .5], ['death', .75], ['death', 1],
                ]) {
                    assert.equal(human.sampleEncounterPose({
                        key: 'actual-personal-armor-variant-props', action,
                        startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase,
                        hasSpear: true, hasShield: true,
                    }), true, 'The actual native action must be sampled');
                    human.root.updateMatrixWorld(true);
                    assert.ok(human.fit.nativeSkeleton.bones.every(bone =>
                        bone.matrixWorld.elements.every(Number.isFinite)));
                    const cache = new Map();
                    for (const probe of probes) {
                        const contact = probe.measure(cache);
                        assert.equal(contact.intersections, 0,
                            weapon + ' / ' + shield + ' / ' + action + ' ' + phase + ' / ' +
                            probe.layer + ' against ' + probe.item + ': ' + JSON.stringify(contact));
                        exactPairs++;
                    }
                    states++;
                }
                assert.equal(human.modules.fitRuns, fitRuns, 'Combat motion cannot refit protective layers or hand props');
            } finally {
                human.dispose();
            }
        }
    }
    assert.equal(states, 36);
    assert.equal(exactPairs, 144);
    console.log('Actual new armor hand-prop clearance: ' + states + ' states / ' + exactPairs + ' exact pairs.');
});
