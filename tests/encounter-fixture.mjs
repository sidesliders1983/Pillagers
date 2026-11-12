import { load } from './load-source.mjs';
export const core = load('../src/simulation/SimulationCore.ts');

export function encounterFixture({ seed = 32, defenders = false, members = 4, policy = {}, calendarMode, rivalHomes } = {}) {
    const bounds = { minX: 0, maxX: 320, minZ: 0, maxZ: 256 };
    const world = { waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 41, rows: 33, heights: Array(1353).fill(0) },
        navigation: { bounds, spacing: 8, columns: 41, rows: 33, cells: Array(1353).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null },
        rivalSite: { version: 1, candidateId: 'encounter-rival', center: { x: 160, z: 128 },
            bounds: { minX: 128, maxX: 272, minZ: 88, maxZ: 176 }, foundations: [], buildableArea: 12672 } };
    let state = core.initializeIslandClans(core.createCampaign(seed, { initialFood: 2000, initialMaterials: 200 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0 }, { enabled: false }, {
            successBps: { Recon: 10000, Surveillance: 10000, Pillage: 6000 },
            casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 1000 },
        }, {}, {}, undefined, calendarMode), world, 'on-site-encounter-fixture');
    const memberIds = Object.keys(state.personas).sort().slice(0, members);
    state = core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Shore party', memberIds });
    state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: { x: 128, z: 128 } }, mission: 'Recon' }, { world, worldId: 'on-site-encounter-fixture' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 250 }, { world, worldId: 'on-site-encounter-fixture' });
    if (!core.inspectIslandMissions(state).sites[0]?.knowledge?.settlementName)
        throw new Error('The real returned legacy Recon must identify the fixture site.');
    const rival = state.world.targetClans['island-rival'];
    const homes = (clan, x) => Object.fromEntries(Object.keys(clan.personas).sort()
        .map((id, index) => [id, { x: x + index % 4 * 4, z: 116 + Math.floor(index / 4) * 8 }]));
    const context = { world, worldId: 'on-site-encounter-fixture', encounterPolicy: policy,
        presenceSites: [
            { clanId: state.clan.id, center: world.settlement.center,
                bounds: { minX: 32, maxX: 112, minZ: 88, maxZ: 176 }, homes: homes(state, 48) },
            { clanId: rival.clan.id, center: world.rivalSite.center,
                bounds: world.rivalSite.bounds, homes: rivalHomes ? rivalHomes(rival) : homes(rival, defenders ? 156 : 232) },
        ] };
    state = core.initializeTerritorialAwareness(state, context, { ambientRadius: 0 });
    return { state, context, memberIds, rivalId: rival.clan.id,
        target: { kind: 'site', siteId: world.rivalSite.candidateId } };
}

export const latestPhysical = state => Object.values(state.world.spatial.missions).at(-1);
