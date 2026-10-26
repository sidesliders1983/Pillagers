import { loadTypeScript } from '../../scripts/load-typescript.mjs';
export const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));

/** A public-command replay of the genuine seed-17 occupied house collapse. */
export function coDisplacedCampaign({ support = {}, weather = {}, seed = 17, mechanics = {}, expeditions = {}, reverseHomes = false } = {}) {
    let state = core.createCampaign(seed, {}, mechanics, weather, expeditions, { enabled: true }, {},
        'summer-800-v1', undefined, undefined, { enabled: true },
        { offerBps: 10000, acceptanceBps: 10000, ...support });
    const commands = [
        { type: 'SalvageLongship', longshipId: 'founding-longship' },
        { type: 'BuildHouse', householdId: reverseHomes ? 'founder-1' : 'founder-2' },
        { type: 'BuildHouse', householdId: reverseHomes ? 'founder-2' : 'founder-1' },
        { type: 'SpecializeBuilding', buildingId: 'house-1', occupation: 'farmer' },
        { type: 'UpgradeBuilding', buildingId: 'house-1' },
        ...Object.keys(state.personas).sort().map(personaId =>
            ({ type: 'AssignOccupation', personaId, occupation: 'farmer' })),
        { type: 'AdvanceTicks', ticks: 2499 },
    ];
    for (const command of commands) state = core.applyCommand(state, command);
    return state;
}
export function lossOffered(options) {
    return core.applyCommand(coDisplacedCampaign(options), { type: 'AdvanceTicks', ticks: 1 });
}
