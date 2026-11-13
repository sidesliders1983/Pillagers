import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

export const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const { planOreSites } = loadTypeScript(new URL('../src/world-generation/OreSites.ts', import.meta.url));
const { campaignIslandCatalog } = loadTypeScript(new URL('../src/fjord-play/BakedIslandCatalog.ts', import.meta.url));
const entry = campaignIslandCatalog.entries.find(value => value.version === 'island-pool-v3' && value.seed === 18);
const original = JSON.parse(gunzipSync(readFileSync(new URL('../public' + entry.path, import.meta.url)))).world;
export const metalworkingWorld = { ...original, oreSites: planOreSites(original) };
export const metalworkingContext = { world: metalworkingWorld, worldId: 'metalworking-mined-18-v1' };
const { planRoute } = loadTypeScript(new URL('../src/world-generation/LandRoutes.ts', import.meta.url));
const center = original.settlement.center;
const nearby = Array.from({ length: 16 }, (_, index) => {
    const angle = index * Math.PI / 8;
    return { x: center.x + Math.cos(angle) * 80, z: center.z + Math.sin(angle) * 80 };
}).find(point => {
    const bounds = original.terrain.bounds, nav = original.navigation;
    const index = Math.round((point.z - nav.bounds.minZ) / nav.spacing) * nav.columns +
        Math.round((point.x - nav.bounds.minX) / nav.spacing);
    if (!nav.cells[index]) return false;
    if (point.x - 20 <= bounds.minX || point.x + 20 >= bounds.maxX ||
        point.z - 20 <= bounds.minZ || point.z + 20 >= bounds.maxZ) return false;
    try { return planRoute({ world: original }, point, undefined, true).route.length > 0; } catch { return false; }
});
if (!nearby) throw new Error('The controlled contact fixture requires an actual nearby dry land route.');
// This is an explicit test-site variant, not a relocation of the shipping island's rival.
const nearWorld = { ...original, rivalSite: { version: 1, candidateId: 'metalworking-nearby-rival',
    center: nearby, bounds: { minX: nearby.x - 20, maxX: nearby.x + 20,
        minZ: nearby.z - 20, maxZ: nearby.z + 20 }, foundations: [], buildableArea: 1600 } };
export const metalworkingNearbyWorld = { ...nearWorld, oreSites: planOreSites(nearWorld) };
export const metalworkingNearbyContext = { world: metalworkingNearbyWorld, worldId: 'metalworking-mined-18-nearby-test-v1' };
export const metalworkingApply = (state, command) => core.applyCommand(state, command, metalworkingContext);
const advance = (state, ticks) => metalworkingApply(state, { type: 'AdvanceTicks', ticks });
const cachedMinedStates = new Map();

/** Real scout, Miner and finite deposit; only the saved labour threshold is accelerated for QA. */
export function minedMetalworkingFixture({ physical = false, nearbyRival = false, livestockRules } = {}) {
    const key = `${physical}:${nearbyRival}:${JSON.stringify(livestockRules ?? null)}`;
    if (cachedMinedStates.has(key)) return structuredClone(cachedMinedStates.get(key));
    const context = nearbyRival ? metalworkingNearbyContext : metalworkingContext;
    const { world, worldId } = context;
    const apply = (state, command) => core.applyCommand(state, command, context);
    const step = (state, ticks) => apply(state, { type: 'AdvanceTicks', ticks });
    const campaign = core.createCampaign(32,
        { initialFood: 10000, initialMaterials: 500 }, {
            mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0,
            partnershipChanceBps: 0, switchTicks: 0, workPerUnit: 100000,
        }, { enabled: false }, {}, {}, {}, undefined, undefined, livestockRules ? { player: livestockRules } : undefined);
    let state = core.initializePhysicalMining(physical ? core.initializeIslandClans(campaign, world, worldId) :
        core.initializePhysicalDiscovery(campaign, world, worldId), world, worldId);
    for (const id of Object.keys(state.personas))
        state = apply(state, { type: 'AssignOccupation', personaId: id, occupation: null });
    const site = state.mining.sites[0];
    state = apply(state, { type: 'CreateExpeditionGroup', name: 'Ore survey', memberIds: ['founder-2'] });
    state = apply(state, { type: 'StartExpedition', groupId: 'group-1' });
    state = apply(state, { type: 'ExploreArea', groupId: 'group-1', target: site.approach });
    state = step(state, 350);
    assert.ok(core.inspectMining(state).sites.some(value => value.id === site.id), 'The paid scout actually sights the deposit');
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'miner' });
    state = apply(state, { type: 'AssignMiner', personaId: 'founder-1', siteId: site.id });
    for (let elapsed = 0; state.specialistStocks.ironOre < 12 && elapsed < 1000; elapsed += 25)
        state = step(state, 25);
    assert.ok(state.specialistStocks.ironOre >= 12, 'A real worker extracts the fixture supply from finite terrain');
    state = apply(state, { type: 'RecallMiner', personaId: 'founder-1' });
    state = step(state, 250);
    assert.equal(state.mining.workers['founder-1'], undefined);
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: null });
    state = apply(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = step(state, 350);
    assert.equal(core.personaAway(state, 'founder-2'), false);
    assert.equal(state.smithery.version, 1, 'Mining does not itself opt into metalworking or grant gear');
    assert.equal(state.specialistStocks.ironOre, state.mining.sites.reduce((sum, value) =>
        sum + value.initialUnits - value.remainingUnits, 0));
    cachedMinedStates.set(key, core.reconstructState(core.serializeState(state)));
    return structuredClone(cachedMinedStates.get(key));
}

/** Completion uses normal paid commands, preserving exact extraction and craft receipts. */
export function craftedIronFixture(spears = 2, shields = 2, options = {}) {
    let state = minedMetalworkingFixture(options);
    const context = options.nearbyRival ? metalworkingNearbyContext : metalworkingContext;
    const apply = (state, command) => core.applyCommand(state, command, context);
    state = apply(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'smith' });
    state = apply(state, { type: 'SetSmitheryTarget', item: 'ironSpear', target: spears });
    state = apply(state, { type: 'SetSmitheryTarget', item: 'ironShield', target: shields });
    state = apply(state, { type: 'AdvanceTicks', ticks: 200 });
    assert.equal(state.smithery.stored.ironSpear, spears);
    assert.equal(state.smithery.stored.ironShield, shields);
    return state;
}

/** Actual physical rival, discovery and presence binding, after the same real extraction/crafting path. */
export function ironEncounterFixture({ lethal = false, initialState, mission = 'Pillage',
    shield = 'ironShield', actionLethalityBps = lethal ? 10000 : 250 } = {}) {
    assert.ok(shield === null || shield === 'ironShield', 'The fixture uses the actual iron shield or an empty slot');
    assert.ok(Number.isInteger(actionLethalityBps) && actionLethalityBps >= 0 && actionLethalityBps <= 10000,
        'The explicit encounter trial lethality must be bounded basis points');
    let state = initialState ?? craftedIronFixture(2, 2, { physical: true, nearbyRival: true });
    const world = metalworkingNearbyWorld;
    const apply = (state, command) => core.applyCommand(state, command, metalworkingNearbyContext);
    const step = (state, ticks) => apply(state, { type: 'AdvanceTicks', ticks });
    state = apply(state, { type: 'EditExpeditionGroup', groupId: 'group-1',
        name: 'Iron review party', memberIds: ['founder-1', 'founder-2'] });
    state = apply(state, { type: 'StartExpedition', groupId: 'group-1' });
    state = apply(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center });
    state = step(state, 650);
    state = apply(state, { type: 'RecallExpedition', groupId: 'group-1' });
    state = step(state, 650);
    state.world.config.successBps.Recon = 10000;
    state = apply(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'area', position: world.rivalSite.center }, mission: 'Recon' });
    state = step(state, 1500);
    assert.equal(core.personaAway(state, 'founder-1'), false);
    assert.ok(core.inspectIslandMissions(state).sites[0]?.knowledge?.settlementName);
    const rival = state.world.targetClans['island-rival'];
    const { createBlueprintSurface } = loadTypeScript(new URL('../src/world-generation/TerrainQueries.ts', import.meta.url));
    const surface = createBlueprintSurface(world);
    const homes = (clan, center, bounds) => {
        const nav = world.navigation;
        const points = nav.cells.flatMap((available, index) => {
            const point = { x: nav.bounds.minX + index % nav.columns * nav.spacing,
                z: nav.bounds.minZ + Math.floor(index / nav.columns) * nav.spacing };
            return available && point.x >= bounds.minX && point.x <= bounds.maxX &&
                point.z >= bounds.minZ && point.z <= bounds.maxZ &&
                surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + .25 ? [point] : [];
        }).sort((first, second) => Math.hypot(first.x - center.x, first.z - center.z) -
            Math.hypot(second.x - center.x, second.z - center.z));
        assert.ok(points.length >= Object.keys(clan.personas).length, 'Every test resident needs their own real dry home point');
        return Object.fromEntries(Object.keys(clan.personas).sort().map((id, index) => [id, points[index]]));
    };
    const center = world.settlement.center;
    const encounterContext = { ...metalworkingNearbyContext,
        encounterPolicy: { actionLethalityBps, maximumExchanges: 1 },
        presenceSites: [
            { clanId: state.clan.id, center, bounds: { minX: center.x - 40, maxX: center.x + 40,
                minZ: center.z - 40, maxZ: center.z + 40 }, homes: homes(state, center, { minX: center.x - 40, maxX: center.x + 40, minZ: center.z - 40, maxZ: center.z + 40 }) },
            { clanId: rival.clan.id, center: world.rivalSite.center, bounds: world.rivalSite.bounds,
                homes: homes(rival, world.rivalSite.center, world.rivalSite.bounds) },
        ] };
    state = core.initializeTerritorialAwareness(state, encounterContext, { ambientRadius: 0 });
    if (lethal) {
        state.smithery.config.woodenShieldProtectionBps = 0;
        state.smithery.config.leatherShieldProtectionBps = 0;
        state.smithery.config.ironShieldProtectionBps = 0;
        if (state.smithery.version === 3) {
            state.smithery.config.leatherBodyArmorProtectionBps = 0;
            state.smithery.config.ironHelmetProtectionBps = 0;
        }
    }
    for (const [slot, item] of [['weapon', 'ironSpear'], ['shield', shield]])
        state = core.applyCommand(state, { type: 'AssignEquipment', personaId: 'founder-1', slot, item }, encounterContext);
    if (mission === 'Explore') {
        state = core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, encounterContext);
        state = core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center }, encounterContext);
    } else state = core.applyCommand(state, { type: 'DispatchIslandMission', groupId: 'group-1',
        target: { kind: 'site', siteId: world.rivalSite.candidateId }, mission: 'Pillage', priorities: ['Materials'] }, encounterContext);
    return { state, context: encounterContext };
}
