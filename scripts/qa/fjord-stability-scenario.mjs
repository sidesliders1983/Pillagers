import { loadTypeScript } from '../load-typescript.mjs';
export const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { generateCharacterDNA } = loadTypeScript(new URL('../../src/characters/generateCharacterDNA.ts', import.meta.url));

/** Controlled crowd fixture, validated through canonical save/load. Not a natural growth run. */
export function createCrowdScenario(count = 10) {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000,
        foundingCoupleChanceBps: 0 }, { fertilityChanceBps: 0, careerReviewWinters: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
    for (let i = 10; i < count; i++) {
        const id = 'crowd-' + (i + 1), source = 'founder-' + (i % 10 + 1);
        state.personas[id] = { ...structuredClone(state.personas[source]), id, name: 'Crowd ' + (i + 1),
            dna: { ...generateCharacterDNA(17000 + i), age: 24 }, birthWinter: 776,
            partnerId: null, parentIds: [], occupation: null, occupationHistory: [], workProgress: 0 };
        state.mechanics.people[id] = structuredClone(state.mechanics.people[source]);
        state.households[source].memberIds.push(id);
    }
    state = core.reconstructState(core.serializeState(state));
    const roles = ['farmer', 'fisher', 'woodworker', 'hunter'];
    const ids = Object.keys(state.personas);
    for (const [index, personaId] of ids.entries())
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId,
            occupation: roles[index % roles.length] });
    // Keep the proven shore-first resident and source-standing-tree approach from #95.
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-2', occupation: 'fisher' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-5', occupation: 'woodworker' });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-4', occupation: 'hunter' });
    for (const householdId of ['founder-1', 'founder-3']) {
        const member = state.households[householdId].memberIds[0];
        state = core.applyCommand(state, { type: 'AssignOccupation', personaId: member, occupation: 'farmer' });
        state = core.applyCommand(state, { type: 'BuildHouse', householdId });
    }
    if (count > 10) {
        for (let i = 4; i <= 12; i++) {
            const id = 'crowd-cattle-' + i;
            state.landing.cattle[id] = { ...structuredClone(state.landing.cattle['cattle-1']), id,
                sex: i % 3 ? 'female' : 'male', birthWinter: i === 4 ? 800 : i === 5 ? 799 : 797 };
        }
    }
    const farms = ['house-1', 'house-2'];
    for (const [index, cattleId] of Object.keys(state.landing.cattle).entries())
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId,
            farmyardId: farms[index % farms.length] });
    return core.reconstructState(core.serializeState(state));
}

export function pausedCheckpoint(state) {
    const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
    const shared = new SharedSettlement(state.seed);
    shared.importJSON(core.serializeState(state));
    return shared.handoff('fjord');
}
