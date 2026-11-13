import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const { characterContract } = load('../src/characters/CharacterContract.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { defaultCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');
const { fjordClothingSets } = load('../src/fjord-play/FjordWardrobe.ts');
const { labBodyAsset } = load('../src/characters/LabBodySources.ts');
const { parseLabSnapshot, snapshotModules, labSnapshotVersion, fixedLabViews } = load('../src/character-lab/LabSnapshot.ts');

function snapshot(animation = 'CombatSpear') {
    const dna = defaultDNA(), body = { version: 1, preset: 'auto', source: 'meshy' };
    const presentation = { ...defaultCharacterPresentation, ...fjordClothingSets.generic,
        hair: 'none', beard: 'none', equipment: 'none',
        equipmentItems: ['equipment/native-wooden-spear', 'equipment/native-leather-shield'] };
    return { version: labSnapshotVersion, styleVersion: labBodyAsset('meshy', 2).styleVersion,
        contractVersion: 1, fitVersion: 'pillagers-fit/0.2', dna, body, presentation, lod: 2,
        pose: { animation, time: 1, paused: true },
        camera: { ...structuredClone(fixedLabViews.front), type: 'orthographic', scale: 2.4, fov: 38 },
        lighting: 'lab-neutral/1', modules: snapshotModules(dna, presentation, 2, body) };
}

test('a field outfit with both actual props roundtrips its combat review pose, camera and identity through the public Lab snapshot', () => {
    const original = snapshot(), before = JSON.stringify(original);
    const restored = parseLabSnapshot(JSON.parse(before));
    assert.deepEqual(restored, original);
    assert.equal(restored.pose.animation, 'CombatSpear');
    assert.ok(restored.modules.some(item => item.id === 'equipment/native-wooden-spear'));
    assert.ok(restored.modules.some(item => item.id === 'equipment/native-leather-shield'));
    assert.equal(JSON.stringify(original), before);
    assert.equal(parseLabSnapshot(snapshot('Walk')).pose.animation, 'Walk');
});


test('combat snapshots require compatible real props and a native body while ordinary clips remain compatible', () => {
    for (const [animation, items] of [
        ['CombatSpear', ['equipment/native-leather-shield']],
        ['CombatShield', ['equipment/native-wooden-spear']],
        ['CombatStrike', ['equipment/native-wooden-spear']],
        ['CombatStrike', ['equipment/occupation-farmer']],
    ]) {
        const saved = snapshot(animation);
        saved.presentation.equipmentItems = items;
        saved.modules = snapshotModules(saved.dna, saved.presentation, saved.lod, saved.body);
        assert.throws(() => parseLabSnapshot(saved), /combat.*equipment/i);
    }
    const unarmed = snapshot('CombatStrike');
    unarmed.presentation.equipmentItems = [];
    unarmed.modules = snapshotModules(unarmed.dna, unarmed.presentation, unarmed.lod, unarmed.body);
    assert.equal(parseLabSnapshot(unarmed).pose.animation, 'CombatStrike');
    const legacy = snapshot('CombatReady');
    legacy.body = { version: 1, preset: 'auto', source: 'published' };
    legacy.styleVersion = labBodyAsset('published', 2).styleVersion;
    legacy.fitVersion = characterContract.attachmentVersion;
    legacy.presentation = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    legacy.modules = snapshotModules(legacy.dna, legacy.presentation, legacy.lod, legacy.body);
    assert.throws(() => parseLabSnapshot(legacy), /Invalid snapshot animation/i);
});
