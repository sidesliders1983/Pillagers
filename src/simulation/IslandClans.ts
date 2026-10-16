import type { SimulationState } from './SimulationCore';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';

export interface IslandClanLink {
    version: 1;
    worldId: string;
    siteId: string;
    clanId: string;
    foundedAt: number;
}
export type IslandClanLandscape = Pick<WorldBlueprint,
    'terrain' | 'navigation' | 'waterLevel' | 'settlement' | 'rivalSite'>;

/** The blueprint owns geometry; Core stores only its versioned site/clan identity link. */
export function assertIslandClanWorld(state: SimulationState, world: IslandClanLandscape, worldId: string) {
    const site = world.rivalSite, link = state.world?.island;
    if (!site || site.version !== 1 || !site.candidateId || !worldId || worldId.length > 256 ||
        link && (link.worldId !== worldId || link.siteId !== site.candidateId))
        throw new Error('The campaign has no matching physical rival site.');
    const { center, bounds } = site;
    const nav = world.navigation;
    const column = Math.round((center.x - nav.bounds.minX) / nav.spacing);
    const row = Math.round((center.z - nav.bounds.minZ) / nav.spacing);
    if (column < 0 || column >= nav.columns || row < 0 || row >= nav.rows || !nav.cells[row * nav.columns + column])
        throw new Error('The physical rival site is not walkable.');
    if (![center.x, center.z, bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite) ||
        center.x <= bounds.minX || center.x >= bounds.maxX || center.z <= bounds.minZ || center.z >= bounds.maxZ ||
        bounds.minX < world.terrain.bounds.minX || bounds.maxX > world.terrain.bounds.maxX ||
        bounds.minZ < world.terrain.bounds.minZ || bounds.maxZ > world.terrain.bounds.maxZ ||
        createBlueprintSurface(world).surfaceHeightAt(center.x, center.z) < world.waterLevel + .25)
        throw new Error('The physical rival site is outside safe dry terrain.');
}


export function validateIslandClans(state: SimulationState) {
    const world = state.world;
    if (world?.version !== 2) return;
    const link = world.island;
    const now = state.time.winter * state.ticksPerWinter + state.time.tick;
    if (!link || link.version !== 1 || typeof link.worldId !== 'string' || !link.worldId || link.worldId.length > 256 ||
        typeof link.siteId !== 'string' || !link.siteId || link.siteId.length > 256 || link.clanId !== 'island-rival' ||
        !Number.isSafeInteger(link.foundedAt) || link.foundedAt > now || link.foundedAt < 800000 ||
        Object.keys(world.regions).length || Object.keys(world.knowledge).length || Object.keys(world.missions ?? {}).length ||
        Object.keys(world.targetClans).length !== 1 || world.targetClans[link.clanId]?.clan.id !== link.clanId ||
        !state.discovery || state.discovery.worldId !== link.worldId ||
        !state.discovery.clans[state.clan.id] || !state.discovery.clans[link.clanId])
        throw new Error('Invalid physical island clans.');
}
