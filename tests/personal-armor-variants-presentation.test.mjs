import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { nativePersonalArmorByItem } = load('../src/characters/NativePersonalArmorCatalog.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordWardrobePresentation, fjordPersonalArmorStatus } = load('../src/fjord-play/FjordWardrobe.ts');
const { defaultCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');
const { snapshotModules, parseLabSnapshot, labSnapshotVersion, fixedLabViews } = load('../src/character-lab/LabSnapshot.ts');
const { labBodyAsset } = load('../src/characters/LabBodySources.ts');

const bodies = [
    ['leatherBodyArmor', 'garment/native-leather-body-armor', 'Leather Body Armor'],
    ['ironBodyArmor', 'garment/native-iron-body-armor', 'Iron-reinforced Body Armor'],
];
const helmets = [
    ['leatherHelmet', 'headwear/native-leather-helmet', 'Leather Helmet'],
    ['ironHelmet', 'headwear/native-iron-helmet', 'Iron Helmet'],
];

function resident(bodyArmor, headgear, status = {}) {
    return {
        kind: 'persona', dna: defaultDNA(),
        status: {
            living: true, occupation: 'fisher', expedition: 'actual-party',
            equipment: { weapon: 'ironSpear', shield: 'ironShield', bodyArmor, headgear },
            ...status,
        },
    };
}

test('all four actual armor variants occupy their own canonical presentation slots', () => {
    for (const [item, asset] of [...bodies, ...helmets]) assert.equal(nativePersonalArmorByItem[item], asset);
    for (const [bodyItem, bodyAsset] of bodies) {
        for (const [helmetItem, helmetAsset] of helmets) {
            const person = resident(bodyItem, helmetItem), before = structuredClone(person);
            const field = fjordWardrobePresentation(person);
            assert.equal(field.bodyArmor, bodyAsset);
            assert.equal(field.headwear, helmetAsset);
            assert.equal(field.outfit, 'garment/meshy-grid-trial-001');
            assert.deepEqual(field.equipmentItems, ['equipment/native-iron-spear', 'equipment/native-iron-shield']);
            assert.deepEqual(fjordPersonalArmorStatus(person), []);
            assert.deepEqual(person, before, 'Presentation does not replace or grant actual assigned items');
            const casualty = resident(null, null, { living: false, expedition: undefined,
                combatDeath: { equipment: before.status.equipment } });
            assert.equal(fjordWardrobePresentation(casualty).bodyArmor, bodyAsset);
            assert.equal(fjordWardrobePresentation(casualty).headwear, helmetAsset);
        }
    }
});

test('variant stow messages name the actual assigned item while preserving home work and age policy', () => {
    for (const [bodyItem, , bodyLabel] of bodies) {
        for (const [helmetItem, , helmetLabel] of helmets) {
            const home = resident(bodyItem, helmetItem, { expedition: undefined });
            const visible = fjordWardrobePresentation(home);
            assert.equal(visible.bodyArmor, 'none');
            assert.equal(visible.headwear, 'headwear/occupation-fisher');
            const status = fjordPersonalArmorStatus(home).join(' ');
            assert.ok(status.includes(bodyLabel + ' stowed:'));
            assert.ok(status.includes(helmetLabel + ' stowed while'));
            const child = resident(bodyItem, helmetItem); child.dna.age = 15;
            assert.equal(fjordWardrobePresentation(child).bodyArmor, 'none');
            assert.equal(fjordWardrobePresentation(child).headwear, 'none');
            assert.match(fjordPersonalArmorStatus(child).join(' '), /no qualified model.*age/);
        }
    }
});

test('each actual body and helmet variant roundtrips its exact Lab modules and resident identity', () => {
    const dna = defaultDNA(), body = { version: 1, preset: 'auto', source: 'meshy' };
    for (const [, bodyArmor] of bodies) {
        for (const [, headwear] of helmets) {
            const presentation = { ...defaultCharacterPresentation,
                outfit: 'garment/meshy-grid-trial-001', shoes: 'garment/meshy-low-shoes-005',
                hair: 'hair/manual-long-2', beard: 'beard/manual-fitted-normal',
                bodyArmor, headwear, equipment: 'none',
                equipmentItems: ['equipment/native-iron-spear', 'equipment/native-iron-shield'] };
            const snapshot = { version: labSnapshotVersion, styleVersion: labBodyAsset('meshy', 2).styleVersion,
                contractVersion: 1, fitVersion: 'pillagers-fit/0.2', dna, body, presentation, lod: 2,
                pose: { animation: 'CombatShield', time: 1, paused: true },
                camera: { ...structuredClone(fixedLabViews.front), type: 'orthographic', scale: 2.4, fov: 38 },
                lighting: 'lab-neutral/1', modules: snapshotModules(dna, presentation, 2, body) };
            const before = structuredClone(snapshot);
            const restored = parseLabSnapshot(JSON.parse(JSON.stringify(snapshot)));
            assert.deepEqual(restored, before);
            for (const id of [bodyArmor, headwear, ...presentation.equipmentItems])
                assert.ok(restored.modules.some(module => module.id === id), id);
        }
    }
});
