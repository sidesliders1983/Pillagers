import { loadTypeScript } from '../load-typescript.mjs';
export function createFamilyFixture() {
    const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
    let state = core.createCampaign(32, {}, { fertilityChanceBps: 10000, partnershipChanceBps: 10000, childcareWinters: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }], careerReviewWinters: 0 }, { enabled: false });
    // Domestic test fixture: remove autonomous neighbours, keeping the actual player lifecycle/kinship.
    delete state.world;
    state.stocks.food = 100000;
    state.stocks.materials = 100000;
    while (Object.keys(state.personas).length < 50 && state.time.winter < 900)
        state = core.applyCommand(state, { type: 'AdvanceWinter' });
    if (Object.keys(state.personas).length < 50)
        throw new Error('Real Core fixture did not reach fifty identities.');
    state.mechanics.config.fertilityChanceBps = 0;
    state.mechanics.config.partnershipChanceBps = 0;
    const source = state.personas[state.landing.founderIds[0]];
    state.personas['unaffiliated-worker'] = { ...structuredClone(source), id: 'unaffiliated-worker', name: 'Unaffiliated resident',
        birthWinter: state.time.winter - 30, deathWinter: null, parentIds: [], partnerId: null, occupation: null, occupationHistory: [], workProgress: 0 };
    state.mechanics.people['unaffiliated-worker'] = { ...structuredClone(state.mechanics.people[source.id]),
        caregiverId: null, lastBirthWinter: null, childcareUntilWinter: 0 };
    state.households['unaffiliated-home'] = { id: 'unaffiliated-home', memberIds: ['unaffiliated-worker'], residenceId: null };
    state = core.applyCommand(core.reconstructState(JSON.stringify(state)), { type: 'AssignOccupation', personaId: 'unaffiliated-worker', occupation: 'woodworker' });
    return state;
}
