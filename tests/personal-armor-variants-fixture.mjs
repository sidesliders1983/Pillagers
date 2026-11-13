import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { core, minedMetalworkingFixture } from './metalworking-fixture.mjs';
import { personalArmorApply as apply } from './personal-armor-fixture.mjs';

const { fjordLivestockRules } = loadTypeScript(new URL('../src/config/FjordLivestock.ts', import.meta.url));
const { equipmentItems, equipmentCraftingOccupation } =
    loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
export { core, apply as personalArmorVariantsApply };

// Fast, explicit test policy: eligible real animals yield two Hides rather than one.
// Shipped livestock rules and earlier v3 fixtures remain unchanged.
export const personalArmorVariantsFixtureLivestockRules = {
    ...structuredClone(fjordLivestockRules),
    hides: Object.fromEntries(Object.entries(fjordLivestockRules.hides)
        .map(([species, quantity]) => [species, quantity * 2])),
};
const cache = new Map();

/** Actual mining, three paid slaughter commands and ordinary work fund all nine products. */
export function craftedPersonalArmorVariantsFixture(options = {}) {
    const key = JSON.stringify(options);
    if (cache.has(key)) return structuredClone(cache.get(key));
    let state = minedMetalworkingFixture({ ...options, livestockRules: personalArmorVariantsFixtureLivestockRules });
    const animals = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null &&
        state.landing.livestock.hides[animal.species] > 0 && state.time.winter - animal.birthWinter >= 2).slice(0, 3);
    assert.equal(animals.length, 3, 'The pinned seed must have three genuine mature hide-bearing animals.');
    for (const animal of animals) state = apply(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    assert.equal(state.specialistStocks.hides, 6);
    for (const item of equipmentItems) state = apply(state, { type: 'SetSmitheryTarget', item, target: 1 });
    for (const occupation of ['smith', 'leatherAndJewelleryMaker']) {
        state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation });
        const items = equipmentItems.filter(item => equipmentCraftingOccupation(item) === occupation);
        for (let ticks = 0; items.some(item => state.smithery.stored[item] < 1) && ticks < 1000; ticks += 25)
            state = apply(state, { type: 'AdvanceTicks', ticks: 25 });
        assert.ok(items.every(item => state.smithery.stored[item] === 1), 'Actual workers must finish every target.');
    }
    assert.equal(state.smithery.version, 4);
    assert.equal(state.specialistStocks.hides, 0);
    const crafts = state.events.filter(event => event.type === 'EquipmentCrafted');
    assert.equal(crafts.length, 9);
    assert.equal(crafts.reduce((sum, event) => sum + event.details.materials, 0), 25);
    assert.equal(crafts.reduce((sum, event) => sum + event.details.hides, 0), 6);
    assert.equal(crafts.reduce((sum, event) => sum + (event.details.ironOre ?? 0), 0), 7);
    cache.set(key, core.reconstructState(core.serializeState(state)));
    return structuredClone(cache.get(key));
}

export function equippedPersonalArmorVariantsFixture(options = {}) {
    let state = craftedPersonalArmorVariantsFixture(options);
    for (const [slot, item] of [['weapon', 'ironSpear'], ['shield', 'ironShield'],
        ['bodyArmor', 'ironBodyArmor'], ['headgear', 'leatherHelmet']])
        state = apply(state, { type: 'AssignEquipment', personaId: 'founder-1', slot, item });
    return state;
}
