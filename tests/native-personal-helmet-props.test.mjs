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

test('the supplied helmet clears every actual spear and shield source, including empty hand slots, throughout native motions', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const bytes = async path => { const value = await readFile('public' + path.split('?')[0]);
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength); };
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await bytes(path), ''), bytes);
    const base = { ...fjordClothingSets.generic, hair: 'hair/manual-long-2',
        beard: 'beard/manual-fitted-normal', headwear: 'headwear/native-iron-helmet' };
    const human = await factory.create(defaultDNA(), 2, undefined, base);
    let motions = 0, contacts = 0;
    try {
        for (const weapon of [null, ...nativeSpearAssets]) for (const shield of [null, ...nativeShieldAssets]) {
            const equipmentItems = [weapon, shield].filter(Boolean);
            await factory.equip(human, { ...base, equipmentItems });
            const meshFor = id => human.fit.modules.get(id).children.find(mesh => mesh.isSkinnedMesh);
            const helmet = meshFor('headwear/native-iron-helmet');
            const probes = equipmentItems.map(id => ({ id,
                measure: createRigidPropIntersectionMeasure(helmet, meshFor(id), { stopAtFirst: true }) }));
            const fitRuns = human.modules.fitRuns;
            const inspect = label => {
                human.root.updateMatrixWorld(true); const cache = new Map();
                for (const probe of probes) {
                    const actual = probe.measure(cache);
                    assert.equal(actual.intersections, 0, label + ' / helmet against ' + probe.id + ': ' + JSON.stringify(actual));
                    contacts++;
                }
                motions++;
            };
            for (const [clip, time] of [['Idle', .6], ['Walk', .25], ['Run', .3]]) {
                human.sampleAnimation(clip, time); inspect(clip);
            }
            for (const action of ['ready', 'spear', 'shield', 'brace', 'withdraw', 'death']) for (const phase of [0, .5, 1]) {
                human.sampleEncounterPose({ key: 'native-helmet-props', action, startedAt: 100,
                    durationTicks: 8, tick: 100 + 8 * phase, hasSpear: !!weapon, hasShield: !!shield });
                inspect(action + ' phase ' + phase);
            }
            assert.equal(human.modules.fitRuns, fitRuns, 'Hand-prop motion cannot refit the helmet');
        }
        assert.equal(motions, 252);
        assert.equal(contacts, 357);
    } finally { human.dispose(); }
});
