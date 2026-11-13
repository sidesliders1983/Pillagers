import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { parseCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');

test('the personal body armor presentation slot is optional and old saved choices retain their exact shape', () => {
    const old = { hair: 'none', beard: 'none', outfit: 'none', equipment: 'none' };
    const parsed = parseCharacterPresentation(old);
    assert.equal(Object.hasOwn(parsed, 'bodyArmor'), false);
    const explicit = parseCharacterPresentation({ ...old, bodyArmor: 'none' });
    assert.equal(explicit.bodyArmor, 'none');
    assert.deepEqual(parseCharacterPresentation(JSON.parse(JSON.stringify(parsed))), parsed);
    assert.throws(() => parseCharacterPresentation({ ...old, bodyArmor: 'auto' }), /body armor.*explicit|body armor.*automatically/i);
});

const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { fjordWardrobePresentation, fjordPersonalArmorStatus, fjordVisibleEquipment } = load('../src/fjord-play/FjordWardrobe.ts');
const { nativePersonalArmorByItem } = load('../src/characters/NativePersonalArmorCatalog.ts');

function resident(overrides = {}) {
    return { kind: 'persona', dna: { ...defaultDNA(), age: 32 }, status: {
        living: true, occupation: 'fisher', expedition: 'actual-party',
        equipment: { weapon: 'ironSpear', shield: 'ironShield', bodyArmor: 'leatherBodyArmor', headgear: 'ironHelmet' },
        ...overrides,
    } };
}

test('actual personal protection shares the field tunic with both hand items and stows honestly under incompatible home work', () => {
    const person = resident(), before = JSON.stringify(person);
    const field = fjordWardrobePresentation(person);
    assert.equal(field.outfit, 'garment/meshy-grid-trial-001');
    assert.equal(field.bodyArmor, nativePersonalArmorByItem.leatherBodyArmor);
    assert.equal(field.headwear, nativePersonalArmorByItem.ironHelmet);
    assert.deepEqual(field.equipmentItems, ['equipment/native-iron-spear', 'equipment/native-iron-shield']);
    assert.equal(field.equipment, 'none');
    assert.deepEqual(fjordPersonalArmorStatus(person), []);
    const home = resident({ expedition: undefined });
    const work = fjordWardrobePresentation(home);
    assert.equal(work.top, 'garment/meshy-fisherman-tunic-009');
    assert.equal(work.bodyArmor, 'none');
    assert.equal(work.headwear, 'headwear/occupation-fisher');
    assert.deepEqual(work.equipmentItems, ['equipment/native-iron-shield']);
    assert.equal(work.equipment, 'equipment/occupation-fisher');
    assert.match(fjordPersonalArmorStatus(home).join(' '), /Body Armor stowed.*work outfit.*Iron Helmet stowed.*occupational hat/);
    assert.equal(fjordVisibleEquipment(home).bodyArmor, null);
    assert.equal(fjordVisibleEquipment(home).headgear, null);
    const generic = fjordWardrobePresentation(resident({ expedition: undefined, occupation: null }));
    assert.equal(generic.bodyArmor, nativePersonalArmorByItem.leatherBodyArmor);
    assert.equal(generic.headwear, nativePersonalArmorByItem.ironHelmet);
    assert.equal(JSON.stringify(person), before, 'Visibility must not mutate assignments or identity');
    assert.equal(home.status.equipment.bodyArmor, 'leatherBodyArmor');
    assert.equal(home.status.equipment.headgear, 'ironHelmet');
});

test('unsupported ages and absent assignments cannot create armor while committed casualty gear remains visible', () => {
    const unassigned = fjordWardrobePresentation(resident({ equipment: { weapon: null, shield: null } }));
    assert.equal(unassigned.bodyArmor, 'none');
    assert.equal(unassigned.headwear, 'none');
    assert.deepEqual(unassigned.equipmentItems, []);
    const young = resident(); young.dna.age = 15;
    const hidden = fjordWardrobePresentation(young);
    assert.equal(hidden.bodyArmor, 'none');
    assert.equal(hidden.headwear, 'none');
    assert.match(fjordPersonalArmorStatus(young).join(' '), /no qualified model.*age/);
    const dead = resident({ living: false, expedition: undefined, equipment: { weapon: null, shield: null } });
    dead.status.combatDeath = { equipment: resident().status.equipment };
    const historical = fjordWardrobePresentation(dead);
    assert.equal(historical.bodyArmor, nativePersonalArmorByItem.leatherBodyArmor);
    assert.equal(historical.headwear, nativePersonalArmorByItem.ironHelmet);
    assert.deepEqual(historical.equipmentItems, ['equipment/native-iron-spear', 'equipment/native-iron-shield']);
});
