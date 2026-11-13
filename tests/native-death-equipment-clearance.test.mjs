import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createEquipmentCharacterIntersectionMeasure } from '../scripts/qa/character-equipment-clearance.mjs';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { characterAsset } = load('../src/characters/CharacterAssets.ts');
const { nativeRegion } = load('../src/characters/MeshyBodyFitAdapter.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
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

const death = (phase, hasSpear = true) => ({ key: 'native-death-source-clearance', action: 'death',
    startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase, hasSpear, hasShield: false });

function rightArmBranch(bone) {
    for (let parent = bone; parent; parent = parent.parent)
        if (parent.name === 'mixamorigRightArm') return true;
    return false;
}

test('native Death retains its fall and source grasp while both held spears clear body, clothes and the ground', async () => {
    const factory = nativeFactory();
    for (const spear of ['equipment/native-wooden-spear', 'equipment/native-iron-spear']) {
        const binding = JSON.parse(await readFile('public' + characterAsset(spear).metadata.nativeBinding.path, 'utf8'));
        for (const armored of [false, true]) {
            const garmentIds = ['garment/meshy-grid-trial-001', 'garment/meshy-low-shoes-005'];
            if (armored) garmentIds.push('garment/native-leather-body-armor', 'headwear/native-iron-helmet');
            const presentation = { ...fjordClothingSets.generic, hair: 'none', beard: 'none',
                ...(armored ? { bodyArmor: 'garment/native-leather-body-armor', headwear: 'headwear/native-iron-helmet' } : {}),
                equipmentItems: [spear] };
            const human = await factory.create(defaultDNA(), 2, undefined, presentation);
            try {
                const measure = createEquipmentCharacterIntersectionMeasure(human, spear, garmentIds,
                    nativeRegion, { gripBinding: binding });
                const prop = human.fit.modules.get(spear).children.find(mesh => mesh.isSkinnedMesh);
                const fitRuns = human.modules.fitRuns, root = human.root.position.clone();
                for (const phase of [0, .25, .5, .75, 1]) {
                    human.sampleEncounterPose(death(phase, false));
                    const reference = human.fit.nativeSkeleton.bones.map(bone => ({ bone,
                        position: bone.position.toArray(), quaternion: bone.quaternion.toArray() }));
                    human.sampleEncounterPose(death(phase));
                    for (const entry of reference) if (!rightArmBranch(entry.bone)) {
                        assert.deepEqual(entry.bone.position.toArray(), entry.position, 'Native fall position is unchanged');
                        assert.deepEqual(entry.bone.quaternion.toArray(), entry.quaternion, 'Native hips/spine/legs and left arm are unchanged');
                    }
                    for (const contact of measure(new Map())) assert.equal(contact.intersections, 0,
                        spear + ' / armor ' + armored + ' / Death ' + phase + ': ' + JSON.stringify(contact));
                    human.root.updateMatrixWorld(true);
                    let minimumY = Infinity;
                    for (let vertex = 0; vertex < prop.geometry.attributes.position.count; vertex++)
                        minimumY = Math.min(minimumY, prop.getVertexPosition(vertex, new Vector3()).applyMatrix4(prop.matrixWorld).y);
                    assert.ok(minimumY >= 0, 'The actual source spear remains above the native floor: ' + minimumY);
                    const expected = human.fit.nativeSkeleton.bones.map(bone => [...bone.position, ...bone.quaternion]);
                    human.sampleAnimation('Idle', .2);
                    human.sampleEncounterPose(death(phase));
                    assert.deepEqual(human.fit.nativeSkeleton.bones.map(bone => [...bone.position, ...bone.quaternion]), expected,
                        'The recorded Death sample is deterministic after unrelated animation');
                }
                assert.equal(human.modules.fitRuns, fitRuns, 'Death cannot refit body, clothes or gear');
                assert.deepEqual(human.root.position, root);
            } finally { human.dispose(); }
        }
    }
});
