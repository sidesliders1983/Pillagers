import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { core, minedMetalworkingFixture, metalworkingContext, metalworkingNearbyContext } from './metalworking-fixture.mjs';
const { fjordLivestockRules } = loadTypeScript(new URL('../src/config/FjordLivestock.ts', import.meta.url));
export { core };
export const personalArmorApply = (state, command) => core.applyCommand(state, command,
    state.mining?.worldId === metalworkingNearbyContext.worldId ? metalworkingNearbyContext : metalworkingContext);
const advance = (state, ticks) => personalArmorApply(state, { type: 'AdvanceTicks', ticks });
const cached = new Map();

/** Real finite extraction and real slaughter fund all four items, using the explicitly accelerated QA labour threshold. */
export function craftedPersonalArmorFixture(options = {}) {
    const key = JSON.stringify(options);
    if (cached.has(key)) return structuredClone(cached.get(key));
    let state = minedMetalworkingFixture({ ...options, livestockRules: fjordLivestockRules });
    state = personalArmorApply(state, { type: 'SetSmitheryTarget', item: 'leatherBodyArmor', target: 1 });
    state = personalArmorApply(state, { type: 'SetSmitheryTarget', item: 'ironHelmet', target: 1 });
    const animals = Object.values(state.landing.cattle).filter(animal => animal.deathWinter === null &&
        state.landing.livestock.hides[animal.species] > 0 && state.time.winter - animal.birthWinter >= 2).slice(0, 2);
    assert.equal(animals.length, 2, 'The pinned livestock seed must supply two real mature hide-bearing animals');
    for (const animal of animals)
        state = personalArmorApply(state, { type: 'SlaughterLivestock', livestockId: animal.id });
    assert.equal(state.specialistStocks.hides, 2);
    state = personalArmorApply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    state = personalArmorApply(state, { type: 'SetSmitheryTarget', item: 'ironSpear', target: 1 });
    state = personalArmorApply(state, { type: 'SetSmitheryTarget', item: 'ironShield', target: 1 });
    state = advance(state, 400);
    state = personalArmorApply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'leatherAndJewelleryMaker' });
    state = advance(state, 100);
    assert.equal(state.smithery.version, 3);
    for (const item of ['ironSpear', 'ironShield', 'ironHelmet', 'leatherBodyArmor']) assert.equal(state.smithery.stored[item], 1);
    assert.equal(state.specialistStocks.hides, 0);
    cached.set(key, core.reconstructState(core.serializeState(state)));
    return structuredClone(cached.get(key));
}

export function equippedPersonalArmorFixture(options = {}) {
    let state = craftedPersonalArmorFixture(options);
    for (const [slot, item] of [['weapon', 'ironSpear'], ['shield', 'ironShield'],
        ['bodyArmor', 'leatherBodyArmor'], ['headgear', 'ironHelmet']])
        state = personalArmorApply(state, { type: 'AssignEquipment', personaId: 'founder-1', slot, item });
    return state;
}
