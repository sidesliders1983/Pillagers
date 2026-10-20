import { loadTypeScript } from '../scripts/load-typescript.mjs';
export const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
export const world = {
    waterLevel: -1,
    terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
    navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
    settlement: { center: { x: 64, z: 128 }, harbor: null },
    rivalSite: { version: 1, candidateId: 'rival-pocket-1', center: { x: 224, z: 128 },
        bounds: { minX: 192, maxX: 288, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 12288 },
};
export const context = { world, worldId: 'livestock-report-contract-220' };

// Explicit deterministic mission-risk fixture, not a production success override.
export function knownRival(livestock) {
    const risk = { successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 } };
    let state = core.initializeIslandClans(core.createCampaign(32, { initialFood: 400, initialMaterials: 50 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 },
        { enabled: false }, risk, {}, {}, undefined, undefined,
        livestock ? { player: livestock } : undefined), world, context.worldId);
    const command = action => { state = core.applyCommand(state, action, context); };
    command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
    command({ type: 'StartExpedition', groupId: 'group-1' });
    command({ type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
    command({ type: 'AdvanceTicks', ticks: 80 });
    command({ type: 'RecallExpedition', groupId: 'group-1' });
    command({ type: 'AdvanceTicks', ticks: 80 });
    command({ type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: world.rivalSite.candidateId }, mission: 'Recon' });
    command({ type: 'AdvanceTicks', ticks: 250 });
    return state;
}

export function raid(state, priorities = ['Cattle']) {
    return core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: world.rivalSite.candidateId }, mission: 'Pillage', priorities }, context);
}
