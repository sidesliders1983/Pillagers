import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { load } from './load-source.mjs';

const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordWardrobePresentation } = load('../src/fjord-play/FjordWardrobe.ts');
const { sampleLabCombatPose, labCombatDuration } = load('../src/character-lab/LabCombatPreview.ts');
const { nativeCombatEquipmentByItem } = load('../src/characters/NativeCombatEquipmentCatalog.ts');

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

function bonePose(human) {
    return human.fit.nativeSkeleton.bones.map(bone =>
        [...bone.position, ...bone.quaternion, ...bone.scale]);
}

function rootPose(human) {
    return [...human.root.position, ...human.root.quaternion, ...human.root.scale];
}

test('Lab spear, shield and death previews exactly match the public native action sampler with either real shield and retain identity, fit and root', async () => {
    const factory = nativeFactory();
    const dna = { ...defaultDNA(), age: 32 };
    for (const shield of ['woodenShield', 'leatherShield']) {
        const presentation = fjordWardrobePresentation({ kind: 'persona', dna,
            status: { living: true, expedition: 'lab-adapter-proof',
                equipment: { weapon: 'woodenSpear', shield } } });
        const preview = await factory.create(dna, 2, undefined, presentation);
        const reference = await factory.create(dna, 2, undefined, presentation);
        try {
            for (const human of [preview, reference]) {
                human.root.position.set(13, 2, -7);
                human.root.rotation.y = .7;
                assert.ok(human.fit.modules.has(nativeCombatEquipmentByItem.woodenSpear));
                assert.ok(human.fit.modules.has(nativeCombatEquipmentByItem[shield]));
                assert.ok(human.fit.modules.has('garment/meshy-grid-trial-001'));
            }
            const identity = JSON.stringify(preview.dna);
            const rig = preview.fit.nativeSkeleton, fit = preview.fit;
            const fitRuns = preview.modules.fitRuns;
            const modules = [...preview.fit.modules.keys()];
            const root = rootPose(preview);
            for (const [id, action] of [
                ['CombatSpear', 'spear'], ['CombatShield', 'shield'], ['CombatDeath', 'death'],
            ]) {
                const duration = labCombatDuration(preview, id);
                for (const phase of [0, .25, .5, .75, 1]) {
                    const label = shield + ' / ' + id + ' / phase ' + phase;
                    assert.equal(sampleLabCombatPose(preview, id, duration * phase), true, label);
                    reference.sampleEncounterPose({ key: 'native-adapter-reference', action,
                        startedAt: 100, durationTicks: 8, tick: 100 + 8 * phase,
                        hasSpear: true, hasShield: true });
                    const expected = bonePose(reference);
                    assert.deepEqual(bonePose(preview), expected, label + ': exact native pose parity');
                    sampleLabCombatPose(preview, id, duration * (phase === 0 ? .75 : 0));
                    preview.sampleAnimation('Walk', .3);
                    sampleLabCombatPose(preview, id, duration * phase);
                    assert.deepEqual(bonePose(preview), expected,
                        label + ': the same preview time is exact after unordered and ordinary samples');
                    assert.equal(JSON.stringify(preview.dna), identity, label + ': identity is unchanged');
                    assert.equal(preview.fit, fit);
                    assert.equal(preview.fit.nativeSkeleton, rig);
                    assert.equal(preview.modules.fitRuns, fitRuns, label + ': no motion refit');
                    assert.deepEqual([...preview.fit.modules.keys()], modules);
                    assert.deepEqual(rootPose(preview), root, label + ': no root drift');
                }
            }
        } finally { preview.dispose(); reference.dispose(); }
    }
});
