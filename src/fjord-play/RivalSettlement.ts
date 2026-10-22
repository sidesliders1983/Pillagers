import { universalHumanProfile } from '../characters/UniversalHumanProfile';
import { discoveryAt, inspectClanDiscovery } from '../simulation/ClanDiscovery';
import { assertIslandClanWorld } from '../simulation/IslandClans';
import type { FjordEntity } from './FjordProjection';
import type { FjordGround } from './FjordGround';
import { settlementCampfire, type SettlementCampfire } from './SettlementCampfire';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { SimulationState } from '../simulation/SimulationCore';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { fjordPlotFits, geographyIdentity, projectFjordSettlement, type FjordLayout, type FjordSettlementSite } from './FjordProjection';

const sites = new WeakMap<WorldBlueprint, FjordSettlementSite>();
/** Reuse the domestic Fjord projection inside the actual reservation; no new terrain or demo houses. */
export function rivalSettlementSite(world: WorldBlueprint): FjordSettlementSite {
    const cached = sites.get(world);
    if (cached) return cached;
    const reserve = world.rivalSite;
    if (!reserve) throw new Error('The island has no reserved rival settlement.');
    const candidates = reserve.foundations.map(plot => ({ x: plot.x, z: plot.z }));
    for (let z = Math.ceil(reserve.bounds.minZ + 4); z <= reserve.bounds.maxZ - 4; z += 4)
        for (let x = Math.ceil(reserve.bounds.minX + 4); x <= reserve.bounds.maxX - 4; x += 4)
            candidates.push({ x, z });
    candidates.sort((a, b) => Math.hypot(a.x - reserve.center.x, a.z - reserve.center.z) -
        Math.hypot(b.x - reserve.center.x, b.z - reserve.center.z) || a.z - b.z || a.x - b.x);
    const site = { id: reserve.candidateId, center: reserve.center, bounds: reserve.bounds, candidates };
    sites.set(world, site);
    return site;
}
export function projectRivalSettlement(target: SimulationState, world: WorldBlueprint, previous?: FjordLayout) {
    const site = rivalSettlementSite(world);
    if (previous) validateRivalLayout(target, world, site, previous);
    const layout = previous ?? { version: 'fjord-layout-v2', seed: target.seed,
        geographyId: geographyIdentity(world), plots: {}, points: {}, mooringResolved: true,
        mooring: { ...site.center, y: world.waterLevel, rotation: 0, scale: 1 } };
    return projectFjordSettlement(target, world, layout, site);
}


function validateRivalLayout(target: SimulationState, world: WorldBlueprint, site: FjordSettlementSite, layout: FjordLayout) {
    const surface = createBlueprintSurface(world);
    const finite = (p: FjordLayout['mooring']) => p &&
        [p.x, p.y, p.z, p.rotation, p.scale].every(Number.isFinite) && p.scale === 1;
    if (layout.version !== 'fjord-layout-v2' || layout.seed !== target.seed ||
        layout.geographyId !== geographyIdentity(world) || !layout.plots || !layout.points ||
        Object.keys(layout.plots).length > 4096 || Object.keys(layout.points).length > 4096 ||
        !finite(layout.mooring) || layout.mooringResolved !== true)
        throw new Error('Invalid rival presentation layout.');
    const fire = settlementCampfire(world, { id: site.id + ':campfire', center: site.center });
    const plots = Object.values(layout.plots);
    if (plots.some(p => !finite(p) || ![3, 3.5, 6, 7.5].includes(p.halfWidth) || p.halfDepth !== p.halfWidth ||
        !fjordPlotFits(world, p, site) || Math.hypot(Math.max(0, Math.abs(p.x - site.center.x) - p.halfWidth),
            Math.max(0, Math.abs(p.z - site.center.z) - p.halfDepth)) < fire.clearingRadius))
        throw new Error('Invalid rival plot support or campfire clearance.');
    for (let i = 0; i < plots.length; i++) for (const q of plots.slice(i + 1)) {
        const p = plots[i];
        if (Math.abs(p.x - q.x) <= p.halfWidth + q.halfWidth && Math.abs(p.z - q.z) <= p.halfDepth + q.halfDepth)
            throw new Error('Overlapping rival presentation plots.');
    }
    if (Object.values(layout.points).some(p => !finite(p) || p.x < site.bounds.minX || p.x > site.bounds.maxX ||
        p.z < site.bounds.minZ || p.z > site.bounds.maxZ || p.y <= world.waterLevel + .25 ||
        Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) > .000001))
        throw new Error('Invalid rival outdoor support.');
}

export interface ObservedRivalSettlement {
    known: boolean;
    currentlyObserved: boolean;
    site?: { id: string; center: { x: number; z: number } };
    entities: FjordEntity[];
    livestockDeaths?: { id: string; position: { x: number; z: number } }[];
    ground: FjordGround;
    campfire?: SettlementCampfire;
}
/** Terrain knowledge is not a survey of people, stocks, defenses or family history. */
export function inspectRivalSettlement(state: SimulationState, world: WorldBlueprint,
    prepared?: ReturnType<typeof projectRivalSettlement>): ObservedRivalSettlement {
    const empty = { known: false, currentlyObserved: false, entities: [], ground: { plots: [], paths: [] } };
    const link = state.world?.island;
    if (!link || !state.discovery) return empty;
    assertIslandClanWorld(state, world, state.discovery.worldId);
    const knowledge = inspectClanDiscovery(state.discovery, state.clan.id), center = world.rivalSite!.center;
    const visibility = discoveryAt(knowledge, center.x, center.z);
    const site = visibility === 'unknown' ? undefined : { id: link.siteId, center: { ...center } };
    const target = state.world!.targetClans[link.clanId];
    const projection = prepared ?? projectRivalSettlement(target, world);
    const visible = projection.entities.filter(entity => entity.transform &&
        discoveryAt(knowledge, entity.transform.x, entity.transform.z) === 'visible');
    // Each actor has its own LOS cell. An unseen centre must not suppress observed outskirts.
    if (!visible.length && visibility === 'unknown') return empty;
    if (!visible.length && visibility !== 'visible') return { ...empty, known: true, site };
    const visibleBuildings = new Set(visible.filter(entity => entity.kind === 'building').map(entity => entity.id));
    const visibleConnections = new Set(visible.filter(entity => entity.kind === 'building' || entity.kind === 'campfire').map(entity => entity.id));
    const entities = visible.map(entity => {
        const { naming: _naming, ...dna } = entity.dna ?? {};
        const visualProfile = entity.dna ? universalHumanProfile({ ...entity.dna, age: Math.min(100, entity.dna.age) }) : undefined;
        const status: FjordEntity['status'] = { living: entity.status.living, workEligible: false,
            inhabited: entity.kind === 'building' ? entity.status.inhabited : undefined,
            sex: entity.status.sex, stage: entity.status.stage, species: entity.status.species,
            occupation: entity.status.occupation === 'farmer' ? 'farmer' : undefined,
            assignment: entity.status.assignment && visibleBuildings.has(entity.status.assignment) ? entity.status.assignment : null,
            grazingZone: entity.status.assignment && visibleBuildings.has(entity.status.assignment) ? entity.status.grazingZone : 'exposed' };
        const appearance = entity.dna ? { dna: { ...dna, traits: {
            physicality: .5, agility: .5, intelligence: .5, cunning: .5, temperament: .5
        } } as FjordEntity['dna'], visualProfile } : {};
        return { ...entity, label: entity.kind === 'persona' ? 'Observed resident' :
            entity.kind === 'cattle' ? 'Observed livestock' : entity.kind === 'campfire' ? 'Observed campfire' :
                entity.kind === 'household' ? 'Observed tent' : 'Observed house', status,
            ...appearance };
    });
    const ground = {
        plots: projection.ground.plots.filter(plot => visibleBuildings.has(plot.id)),
        paths: projection.ground.paths.filter(path => visibleBuildings.has(path.from) && visibleConnections.has(path.to) && path.points.every(point =>
            discoveryAt(knowledge, point.x, point.z) === 'visible'))
    };
    const livestockDeaths = projection.livestockDeaths.filter(fact =>
        discoveryAt(knowledge, fact.position.x, fact.position.z) === 'visible');
    return { known: true, currentlyObserved: true, site, entities, livestockDeaths, ground,
        campfire: entities.some(entity => entity.kind === 'campfire') ? projection.campfire : undefined };
}
