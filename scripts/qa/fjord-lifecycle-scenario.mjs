import { loadTypeScript } from '../load-typescript.mjs';
export const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));

/** Generous starting reserves isolate visual lifecycle from starvation; all rates stay default. */
export function createLifecycleScenario() {
    let state = core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000, foundingCoupleChanceBps: 10000 });
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' });
    for (const home of Object.values(state.households).filter(h => h.memberIds.length))
        state = core.applyCommand(state, { type: 'BuildHouse', householdId: home.id });
    const farm = Object.values(state.households).find(h => h.memberIds.includes('founder-1')).residenceId;
    for (const id of Object.keys(state.landing.cattle))
        state = core.applyCommand(state, { type: 'AssignCattle', cattleId: id, farmyardId: farm });
    return { state, farm };
}
