import { miningWorkerPosition } from '../simulation/Mining';
import { inspectResidentPresence } from '../simulation/ResidentPresence';
import type { CustodyRecord } from '../simulation/TransitCargo';
import { communityHearthAccess, communityHearthOccupancy, communityHearthReservation,
    resolveCommunityHearthPlacement } from './CommunityHearthPlacement';
import { communityHearthContains, communityHearthGeometry, communityHearthOverlapsPlot } from './CommunityHearthGeometry';
import type { HumanProfile } from '../characters/UniversalHumanProfile';
import { parseFacialShape, type FacialShapeV1 } from '../characters/FacialIdentity';
import { projectResidentAppearance } from '../characters/ResidentAppearance';
import { spatialMemberPosition } from '../simulation/SpatialExpeditions';
import { discoveryAt, inspectClanDiscovery } from '../simulation/ClanDiscovery';
import { visibleLongshipMembers } from '../simulation/LongshipTransport';
import { campaignIslandPlan } from './CampaignIsland';
import { settlementCampfire } from './SettlementCampfire';
import { livestockAsset } from '../characters/LivestockPresentation';
import { animalProfile } from '../simulation/LivestockSpecies';
export { settlementCampfire } from './SettlementCampfire';
import { housingName } from '../simulation/HousingNames';
import { houseAssetFor, type HouseSize } from '../config/HousingAssets';
import { projectFjordCalendar } from './FjordCalendar';
import { seasonBlend } from '../config/timeVisualization';
import type { CharacterDNA } from '../characters/CharacterDNA';
import { inspectWork, inspectCattle, inspectWeather, landingSummary, personaAge, personaAway, isProvidingCare } from '../simulation/SimulationCore';
import type { SimulationState } from '../simulation/SimulationCore';
import type { EntityKind } from '../play/SettlementView';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { fitsBuildingFoundation } from '../world/BuildingPlot';
import { suitability } from '../world-generation/PlanSettlement';
import { projectFjordGround } from './FjordGround';
import { projectFjordWeather } from './FjordWeather';
export type FjordPrecipitation = { snow: number; rain: number };
export type FjordTransform = {
    x: number;
    y: number;
    z: number;
    rotation: number;
    scale: number;
};
export type FjordPlot = FjordTransform & {
    halfWidth: number;
    halfDepth: number;
};
export interface FjordSettlementSite {
    id: string;
    center: Point2;
    bounds: Bounds2;
    candidates: Point2[];
}
export interface FjordLayout {
    version: 'fjord-layout-v2';
    seed: number;
    geographyId: string;
    plots: Record<string, FjordPlot>;
    points: Record<string, FjordTransform>;
    mooring: FjordTransform;
    mooringResolved: boolean;
}
export interface FjordResidentPresence {
    position: Point2;
    previousPosition: Point2;
    route: Point2[];
    home: Point2;
    rotation: number;
    moving: boolean;
    updatedAt: number;
    mode: 'local' | 'watch' | 'warn' | 'mobilise' | 'withdraw' | 'return';
    incidentId: string | null;
    facing: Point2 | null;
    suspended: boolean;
    duty?: { incidentId: string; role: 'watch' | 'warn' | 'mobilise' | 'withdraw' };
}
export interface FjordEntity {
    kind: EntityKind;
    id: string;
    selectionKey: string;
    label: string;
    asset: string;
    terrainAsset?: string;
    dna?: CharacterDNA;
    visualProfile?: HumanProfile;
    facialIdentity?: FacialShapeV1;
    transform: FjordTransform | null;
    plot?: FjordPlot;
    status: {
        living: boolean;
        expedition?: string;
        mining?: boolean;
        presence?: FjordResidentPresence;
        expeditionWalking?: boolean;
        encounter?: { id: string; phase: 'engaging' | 'withdrawing'; facing: Point2 | null };
        shipExpedition?: string;
        transportGroup?: string;
        aboardShip?: string;
        aboardAnchor?: number;
        occupation?: string | null;
        workEligible?: boolean;
        workHomeId?: string;
        stage?: string;
        species?: string;
        sexTerm?: string;
        sex?: string;
        age?: number;
        level?: number;
        farmyard?: boolean;
        inhabited?: boolean;
        assignment?: string | null;
        sheltered?: boolean;
        overcrowding?: number;
        parentIds?: string[];
        indoorReason?: 'young-child' | 'childcare' | 'awaiting-exterior' | null;
        grazingZone?: 'yard' | 'overflow' | 'exposed';
    };
}
/** The scene receives reached route geometry; future route points stay in Core. */
function residentPresenceView(state: SimulationState, id: string): FjordResidentPresence | undefined {
    const actor = inspectResidentPresence(state, id);
    if (!actor) return;
    const route = [{ ...actor.route[0] }];
    let distance = 0;
    for (let index = 1; index < actor.route.length; index++) {
        const first = actor.route[index - 1], next = actor.route[index];
        distance += Math.hypot(next.x - first.x, next.z - first.z);
        if (distance < actor.travelled) route.push({ ...next });
    }
    route.push({ ...actor.position });
    return { position: { ...actor.position }, previousPosition: { ...actor.previousPosition }, route,
        home: { ...actor.home }, rotation: actor.rotation, moving: actor.moving, updatedAt: actor.updatedAt,
        mode: actor.mode, incidentId: actor.incidentId, facing: actor.facing ? { ...actor.facing } : null,
        suspended: actor.ceremonyUntil !== null && actor.ceremonyUntil > state.time.winter * state.ticksPerWinter + state.time.tick,
        ...(actor.duty ? { duty: { ...actor.duty } } : {}) };
}
/** Ready-facing is tied to a committed participant that this party can currently observe. */
function attackerEncounterView(state: SimulationState, id: string, position: Point2 | undefined) {
    if (!position || !state.discovery) return;
    const entry = Object.values(state.world?.encounters?.records ?? {}).find(record =>
        record.attackingClanId === state.clan.id && record.attackerIds.includes(id) &&
        (record.phase === 'engaging' || record.phase === 'withdrawing'));
    if (!entry || entry.phase !== 'engaging' && entry.phase !== 'withdrawing') return;
    const defender = state.world!.targetClans[entry.defendingClanId];
    const knowledge = inspectClanDiscovery(state.discovery, state.clan.id);
    const candidates = entry.defenderIds.filter(personaId => defender.personas[personaId]?.deathWinter === null)
        .map(personaId => ({ id: personaId, point: defender.residentPresence?.residents[personaId]?.position }))
        .filter((candidate): candidate is { id: string; point: Point2 } => !!candidate.point &&
            discoveryAt(knowledge, candidate.point.x, candidate.point.z) === 'visible');
    candidates.sort((first, second) =>
        Math.hypot(first.point.x - position.x, first.point.z - position.z) -
        Math.hypot(second.point.x - position.x, second.point.z - position.z) || first.id.localeCompare(second.id));
    return { id: entry.id, phase: entry.phase,
        facing: candidates[0] ? { ...candidates[0].point } : null };
}
/** Custody movement exposes only the last actually crossed segment, never its remaining route. */
function custodyPresenceView(record: CustodyRecord): FjordResidentPresence {
    const dx = record.position.x - record.previousPosition.x;
    const dz = record.position.z - record.previousPosition.z;
    const moving = Math.hypot(dx, dz) > 1e-8;
    return { position: { ...record.position }, previousPosition: { ...record.previousPosition },
        route: record.reachedRoute.map(point => ({ ...point })), home: { ...record.home },
        rotation: moving ? Math.atan2(dx, dz) : 0, moving, updatedAt: record.updatedAt,
        mode: 'return', incidentId: null, facing: null, suspended: false };
}
const geographyIds = new WeakMap<WorldBlueprint, string>();
const plotCandidates = new WeakMap<WorldBlueprint, { x: number; z: number }[]>();
export function geographyIdentity(world: WorldBlueprint) {
    const known = geographyIds.get(world);
    if (known)
        return known;
    let hash = 2166136261;
    for (const char of JSON.stringify(world))
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const identity = world.config.generatorVersion + ':' + world.config.seed + ':' + (hash >>> 0).toString(16);
    geographyIds.set(world, identity);
    return identity;
}
export function createFjordLayout(world: WorldBlueprint, mooring?: FjordTransform, campaignSeed = world.config.seed): FjordLayout {
    if (!world.validation.accepted)
        throw new Error('Fjord geography must be validated.');
    const harbor = world.settlement.harbor!;
    const berth = campaignIslandPlan(world)?.berth;
    if (!mooring && berth) {
        // Layout v2 retains a faering anchor. Invert the existing longship offset so
        // the rendered hull lands exactly in the validated, full-sized island berth.
        const sine = Math.sin(berth.rotation), cosine = Math.cos(berth.rotation);
        mooring = { x: berth.center.x - sine * 3.5 - cosine * 4.5,
            z: berth.center.z - cosine * 3.5 + sine * 4.5,
            y: world.waterLevel + .15, rotation: berth.rotation, scale: 1 };
    }
    return { version: 'fjord-layout-v2', seed: campaignSeed, geographyId: geographyIdentity(world),
        plots: {}, points: {}, mooringResolved: Boolean(mooring), mooring: mooring ??
            { x: harbor.x, y: world.waterLevel + .15, z: harbor.z - 6, rotation: 0, scale: 1 } };
}
/** The stored anchor belongs to the 5m faering. Keep it stable for existing campaign saves.
 * Both source hull and pier run along local Z. The 14.47m longship needs a lateral
 * berth: 2m pier half-width + 1.74m hull half-width + .76m gap, and extra seaward room.
 */
export function longshipBerth(anchor: FjordTransform): FjordTransform {
    const forward = 3.5 * anchor.scale;
    const lateral = 4.5 * anchor.scale;
    const sine = Math.sin(anchor.rotation), cosine = Math.cos(anchor.rotation);
    return {
        ...anchor,
        x: anchor.x + sine * forward + cosine * lateral,
        z: anchor.z + cosine * forward - sine * lateral
    };
}

export function fjordPlotFits(world: WorldBlueprint, p: FjordPlot, site?: FjordSettlementSite) {
    const surface = createBlueprintSurface(world);
    const island = campaignIslandPlan(world);
    if (island && !site && !island.plots.some(q => q.x === p.x && q.z === p.z &&
        q.halfWidth === p.halfWidth && q.halfDepth === p.halfDepth)) return false;
    if (site && (p.x - p.halfWidth < site.bounds.minX || p.x + p.halfWidth > site.bounds.maxX ||
        p.z - p.halfDepth < site.bounds.minZ || p.z + p.halfDepth > site.bounds.maxZ)) return false;
    return fitsBuildingFoundation(surface, p) &&
        Math.abs(p.y - surface.surfaceHeightAt(p.x, p.z)) < .000001;
}
/** Pure presentation: all gameplay facts come from canonical public inspection. */
export function projectFjordSettlement(state: SimulationState, world: WorldBlueprint, previous: FjordLayout, site?: FjordSettlementSite) {
    if ((!site && !campaignIslandPlan(world) && state.seed !== world.config.seed) || previous.seed !== state.seed ||
        previous.geographyId !== geographyIdentity(world) || previous.version !== 'fjord-layout-v2')
        throw new Error('Campaign, geography and presentation identities do not match.');
    const layout = structuredClone(previous);
    const livestockDeaths: { id: string; position: Point2 }[] = [];
    // Historical identities remain in Core, but no longer reserve outdoor render space.
    for (const key of Object.keys(layout.points)) {
        const identity = key.split('@')[0];
        const separator = identity.indexOf(':');
        const kind = identity.slice(0, separator), id = identity.slice(separator + 1);
        const living = kind === 'persona' ? state.personas[id]?.deathWinter === null && !personaAway(state, id) :
            kind === 'cattle' ? state.landing?.cattle[id]?.deathWinter === null : false;
        if (!living) {
            const animal = kind === 'cattle' ? state.landing?.cattle[id] : undefined;
            if (animal && animal.deathWinter !== null)
                livestockDeaths.push({ id, position: { x: layout.points[key].x, z: layout.points[key].z } });
            delete layout.points[key];
        }
    }
    // Transfer tent parcels before removing obsolete reservations so construction stays in place.
    for (const building of Object.values(state.buildings)) {
        const key = 'building:' + building.id;
        if (!layout.plots[key]) {
            const birth = state.events.find(e => e.type === 'HouseBuilt' && e.details?.buildingId === building.id);
            const homeKey = 'household:' + birth?.details?.householdId;
            if (layout.plots[homeKey]) {
                layout.plots[key] = layout.plots[homeKey];
                delete layout.plots[homeKey];
            }
        }
    }
    const activePlots = new Set(Object.keys(state.buildings).map(id => 'building:' + id));
    for (const home of Object.values(state.households)) {
        const residence = home.residenceId ? state.residences[home.residenceId] : undefined;
        if (residence?.kind !== 'house' && home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            activePlots.add('household:' + home.id);
    }
    for (const key of Object.keys(layout.plots)) if (!activePlots.has(key)) delete layout.plots[key];
    const usedPoints = new Set<string>();
    const surface = createBlueprintSurface(world);
    const entities: FjordEntity[] = [];
    const diagnostics: string[] = [];
    const campfire = settlementCampfire(world, site ? { id: site.id + ':campfire', center: site.center } : undefined);
    const hearth = !site ? state.communityHearth : undefined;
    const communityHearthStatus = hearth && hearth.tier > 0 && hearth.placement
        ? resolveCommunityHearthPlacement({ world, worldId: geographyIdentity(world),
            plots: Object.values(layout.plots), paths: [] }, hearth.placement) : undefined;
    const placement = communityHearthStatus?.available ? communityHearthStatus.placement : undefined;
    const communityHearthSite = hearth && hearth.tier > 0 && placement ? structuredClone({
        tier: hearth.tier as 1 | 2, placement,
        reservation: communityHearthReservation(world, placement),
        reservedFootprints: [1, 2].map(tier => communityHearthGeometry(world, placement, tier as 1 | 2).footprint),
        reservedOccupancy: communityHearthOccupancy(world, placement),
        ...communityHearthGeometry(world, placement, hearth.tier as 1 | 2),
    }) : undefined;
    if (communityHearthSite) {
        campfire.transform.scale = communityHearthSite.fireScale;
        campfire.obstacleRadius = communityHearthSite.fireObstacleRadius;
    }
    const center = campfire.transform;
    let candidates = site?.candidates ?? plotCandidates.get(world);
    if (!candidates) {
        candidates = campaignIslandPlan(world)?.plots.map(p => ({ x: p.x, z: p.z })) ?? [];
        // Four columns and three rows around the middle place fit the validated
        // clearing, including ten separate founding households and future upgrades.
        for (let row = -10; !campaignIslandPlan(world) && row <= 10; row++)
            for (let column = -10; column <= 10; column++) {
                const x = center.x + 8.5 + column * 17, z = center.z + row * 17;
                if (x >= world.terrain.bounds.minX + 8 && x <= world.terrain.bounds.maxX - 8 &&
                    z >= world.terrain.bounds.minZ + 8 && z <= world.terrain.bounds.maxZ - 8)
                    candidates.push({ x, z });
            }
        candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) -
            Math.hypot(b.x - center.x, b.z - center.z) || a.z - b.z || a.x - b.x);
        plotCandidates.set(world, candidates);
    }
    const allocatePlot = (key: string, halfSize = 7.5): FjordPlot | undefined => {
        const stored = layout.plots[key];
        if (stored && (!site || stored.halfWidth === halfSize && stored.halfDepth === halfSize))
            return stored;
        delete layout.plots[key];
        const halfWidth = halfSize, halfDepth = halfSize;
        const found = candidates.find(p => (!communityHearthSite || !communityHearthSite.reservedFootprints.some(
            footprint => communityHearthOverlapsPlot(footprint,
                { ...p, y: 0, rotation: 0, scale: 1, halfWidth, halfDepth }, 1))) && Math.hypot(
            Math.max(0, Math.abs(p.x - center.x) - halfWidth),
            Math.max(0, Math.abs(p.z - center.z) - halfDepth)) >= campfire.clearingRadius &&
            Object.values(layout.plots).every(q => Math.abs(p.x - q.x) > halfWidth + q.halfWidth + 1 ||
            Math.abs(p.z - q.z) > halfDepth + q.halfDepth + 1) &&
            Object.values(layout.points).every(q => Math.abs(p.x - q.x) > halfWidth + .8 || Math.abs(p.z - q.z) > halfDepth + .8) &&
            fjordPlotFits(world, { ...p, y: surface.surfaceHeightAt(p.x, p.z),
                halfWidth, halfDepth, rotation: Math.PI, scale: 1 }, site));
        if (!found) {
            diagnostics.push(key + ': no safe plot remains; identity retained without a 3D mesh. Gameplay is unchanged.');
            return undefined;
        }
        return layout.plots[key] = { ...found, y: surface.surfaceHeightAt(found.x, found.z),
            rotation: Math.PI, scale: 1, halfWidth, halfDepth };
    };
    const add = (kind: EntityKind, id: string, label: string, asset: string, transform: FjordTransform | undefined, status: FjordEntity['status'], plot?: FjordPlot) => {
        entities.push({ kind, id, label, asset, transform: transform ? { ...transform } : null, status,
            selectionKey: kind + ':' + id, ...(plot ? { plot: { ...plot } } : {}) });
    };
    add('campfire', campfire.id, 'Settlement campfire', 'stoneCampfire', campfire.transform, { living: false });
    // Cache positions by resident/animal and assignment. New arrivals never move survivors.
    const allocatePoint = (key: string, preferred: {
        x: number;
        z: number;
    }, yard?: FjordPlot, obstacle = { halfWidth: 3.5, halfDepth: 4 },
        permitted: (p: { x: number; z: number }) => boolean = () => true) => {
        usedPoints.add(key);
        const outsideCommunitySite = (point: { x: number; z: number }) => !communityHearthSite ||
            !communityHearthSite.occupancy.some(plot => communityHearthContains(plot, point, .8));
        if (layout.points[key] && outsideCommunitySite(layout.points[key]) && permitted(layout.points[key]) &&
            Math.hypot(layout.points[key].x - center.x, layout.points[key].z - center.z) > campfire.obstacleRadius + 1)
            return layout.points[key];
        delete layout.points[key];
        const points = Object.values(layout.points);
        const options: {
            x: number;
            z: number;
        }[] = [preferred];
        for (let radius = 1.5; radius <= 12; radius += 1.5)
            for (let angle = 0; angle < 8; angle++)
                options.push({
                    x: preferred.x + Math.cos(angle * Math.PI / 4) * radius,
                    z: preferred.z + Math.sin(angle * Math.PI / 4) * radius
                });
        const bounds = site?.bounds ?? world.settlement.bounds;
        const point = options.find(p => (!(site || campaignIslandPlan(world)) ||
            p.x >= bounds.minX + 1 && p.x <= bounds.maxX - 1 &&
            p.z >= bounds.minZ + 1 && p.z <= bounds.maxZ - 1) && outsideCommunitySite(p) && permitted(p) &&
            Math.hypot(p.x - center.x, p.z - center.z) > campfire.obstacleRadius + 1 &&
            surface.surfaceHeightAt(p.x, p.z) > world.waterLevel + .25 &&
            surface.slopeAt(p.x, p.z) <= suitability.walkingSlope &&
            points.every(q => Math.hypot(p.x - q.x, p.z - q.z) > 1.5) &&
            Object.values(layout.plots).every(q => q === yard ?
                ((Math.abs(p.x - q.x) > obstacle.halfWidth || Math.abs(p.z - q.z) > obstacle.halfDepth) &&
                    Math.abs(p.x - q.x) < q.halfWidth - 1 && Math.abs(p.z - q.z) < q.halfDepth - 1 ||
                    Math.abs(p.x - q.x) > q.halfWidth + .8 || Math.abs(p.z - q.z) > q.halfDepth + .8) :
                Math.abs(p.x - q.x) > q.halfWidth + .8 || Math.abs(p.z - q.z) > q.halfDepth + .8));
        if (!point) {
            diagnostics.push(key + ': no safe outdoor position remains; identity retained without a 3D mesh.');
            return undefined;
        }
        return layout.points[key] = { ...point, y: surface.surfaceHeightAt(point.x, point.z), rotation: .5, scale: 1 };
    };
    const homes = Object.values(state.households).sort((a, b) => a.id.localeCompare(b.id));
    const yards = state.landing ? landingSummary(state).farmyards : [];
    const buildingPlots = new Map<string, FjordPlot>();
    for (const building of Object.values(state.buildings).sort((a, b) => a.id.localeCompare(b.id))) {
        const key = 'building:' + building.id;
        const level = state.mechanics?.buildings[building.id]?.upgradeLevel ?? 0;
        const yard = yards.some(y => y.id === building.id);
        const halfSize = site ? yard || level >= 2 ? 7.5 : level === 1 ? 6 : 3.5 : 7.5;
        const plot = allocatePlot(key, halfSize);
        if (plot)
            buildingPlots.set(building.id, plot);
        const size: HouseSize = (['hut', 'homestead', 'longhouse', 'greatHouse'] as const)[Math.min(level, 3)];
        const appearance = building.specialization === 'smith' ? 'smith' : yard ? 'farmer' : undefined;
        const asset = houseAssetFor(size, appearance);
        const orientedPlot = plot ? {
            ...plot,
            rotation: yard ? Math.PI : Math.atan2(center.x - plot.x, center.z - plot.z)
        } : undefined;
        const entity: FjordEntity = { kind: 'building', id: building.id, label: housingName(state, 'building', building.id),
            selectionKey: key, asset, transform: orientedPlot ? { ...orientedPlot } : null,
            ...(orientedPlot ? { plot: { ...orientedPlot } } : {}),
            status: { living: true, level, farmyard: yard, inhabited: homes.some(home => {
                const residence = home.residenceId ? state.residences[home.residenceId] : undefined;
                return residence?.kind === 'house' && residence.buildingId === building.id &&
                    home.memberIds.some(id => state.personas[id]?.deathWinter === null);
            }) } };
        if (yard) {
            entity.terrainAsset = level <= 1 ? 'farmHutTerrain' : 'farmyardMarker';
            if (level === 1)
                diagnostics.push(building.id +
                    ': FarmHomestead terrain exceeds this plot; nearest safe sourced FarmHut yard used.');
            if (level > 1)
                diagnostics.push(building.id +
                    ': no source Farmyard at this level; actual dwelling retained with a lightweight yard marker.');
        }
        entities.push(entity);
    }
    const homePlots = new Map<string, FjordPlot | undefined>();
    for (const home of homes) {
        if (!home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            continue;
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        homePlots.set(home.id, residence?.buildingId ? buildingPlots.get(residence.buildingId) :
            allocatePlot('household:' + home.id, site ? 3 : 7.5));
    }
    for (const home of homes) {
        if (!home.memberIds.some(id => state.personas[id]?.deathWinter === null))
            continue;
        const residence = home.residenceId ? state.residences[home.residenceId] : null;
        const plot = homePlots.get(home.id);
        if (residence?.kind !== 'house')
            add('household', home.id, housingName(state, 'household', home.id), 'tent', plot, { living: true }, plot);
        for (const [index, id] of home.memberIds.entries()) {
            const p = state.personas[id];
            const mission = Object.values(state.world?.spatial?.missions ?? {}).find(m =>
                m.status !== 'Returned' && m.status !== 'Lost' && m.status !== 'Prepared' && m.memberIds.includes(id));
            const custody = state.custody?.people[id];
            if (!p || p.deathWinter !== null || personaAway(state, id) && !mission && !custody)
                continue;
            const age = personaAge(state, id);
            const miner = custody ? undefined : state.mining?.workers[id];
            const indoorReason = miner || custody ? null : age < 5 ? 'young-child' :
                state.mechanics && isProvidingCare(state, id) ? 'childcare' :
                    state.residentPresence?.residents[id]?.placement ? 'awaiting-exterior' : null;
            const key = 'persona:' + id + '@' + (plot ? plot.x + ',' + plot.z : home.id);
            const miningPoint = miner ? miningWorkerPosition(miner) : undefined;
            const partyPoint = mission ? spatialMemberPosition(mission, id) : undefined;
            const encounter = attackerEncounterView(state, id, partyPoint);
            const presence = custody ? custodyPresenceView(custody) :
                !miner && !mission && !indoorReason ? residentPresenceView(state, id) : undefined;
            const transport = mission?.transport?.phase === 'embarked' ? mission.transport : undefined;
            const deckMembers = transport ? visibleLongshipMembers(mission!.memberIds.filter(member =>
                state.personas[member]?.deathWinter === null)) : [];
            const aboardAnchor = deckMembers.indexOf(id);
            const point = miningPoint ? {...miningPoint, rotation: 0, y: surface.surfaceHeightAt(miningPoint.x, miningPoint.z), scale: 1} : transport && aboardAnchor < 0 ? undefined : partyPoint ? { ...partyPoint,
                y: transport ? world.waterLevel + .15 : surface.surfaceHeightAt(partyPoint.x, partyPoint.z), scale: 1 } : presence ? {
                ...presence.position, y: surface.surfaceHeightAt(presence.position.x, presence.position.z),
                rotation: presence.rotation, scale: 1 } : plot && !indoorReason ? allocatePoint(key, { x: plot.x - 3 + index % 5 * 1.8,
                z: plot.z + plot.halfDepth + 1.5 + Math.floor(index / 5) * 1.8 }) : undefined;
            if (point && encounter?.facing) point.rotation = Math.atan2(
                encounter.facing.x - point.x, encounter.facing.z - point.z);
            const growth = .4 + .6 * Math.min(16, Math.max(0, age)) / 16;
            add('persona', id, p.name, 'human', point ? { ...point, scale: growth } : undefined,
                { living: true, mining: !!miner, presence, encounter, expedition: mission?.id, expeditionWalking: partyPoint?.moving ?? false,
                    aboardShip: transport?.shipId, aboardAnchor: transport ? aboardAnchor : undefined,
                    sex: p.dna.sex, age, indoorReason, occupation: p.occupation,
                    workEligible: state.mechanics ? inspectWork(state, id).reason === null : false,
                    workHomeId: residence?.buildingId ?? undefined });
            const appearance = projectResidentAppearance(state, id)!;
            entities[entities.length - 1].dna = appearance.dna;
            entities[entities.length - 1].facialIdentity = parseFacialShape(appearance.face);
        }
    }
    const livingCattle = Object.values(state.landing?.cattle ?? {})
        .filter(c => c.deathWinter === null)
        .sort((a, b) => a.id.localeCompare(b.id));
    const livestockArrivals = new Map<string, Point2>();
    for (const event of state.events) {
        if (event.type !== 'LivestockTransferredIn' || typeof event.details?.livestockId !== 'string') continue;
        const position = event.details.arrivalPosition as Point2 | undefined;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.z))
            livestockArrivals.set(event.details.livestockId, { ...position });
    }
    for (const [index, c] of livingCattle.entries()) {
        const view = inspectCattle(state, c.id);
        const asset = livestockAsset(c.species ?? 'cattle', c.sex, view.stage);
        if (!asset) continue;
        const custody = state.custody?.livestock[c.id];
        if (custody) {
            const presence = custodyPresenceView(custody);
            add('cattle', c.id, view.name, asset, { ...presence.position,
                y: surface.surfaceHeightAt(presence.position.x, presence.position.z),
                rotation: presence.rotation, scale: 1 },
                { living: true, presence, sex: c.sex, species: view.species, sexTerm: view.sexTerm,
                    age: view.age, stage: view.stage, assignment: null, sheltered: false,
                    parentIds: [...view.parentIds], grazingZone: 'exposed' });
            continue;
        }
        const assigned = c.farmyardId ? buildingPlots.get(c.farmyardId) : null;
        const level = c.farmyardId ? state.mechanics?.buildings[c.farmyardId]?.upgradeLevel ?? 0 : 0;
        const herd = livingCattle.filter(member => member.farmyardId === c.farmyardId);
        const rank = herd.findIndex(member => member.id === c.id);
        const capacity = state.landing!.config.farmyardCapacity;
        const occupied = herd.slice(0, rank + 1).reduce((sum, animal) =>
            sum + animalProfile(state, animal).capacityWeightBps, 0);
        const grazingZone = assigned ? occupied <= capacity * 10000 ? 'yard' : 'overflow' : 'exposed';
        const key = 'cattle:' + c.id + '@' + (c.farmyardId ?? 'outside') + '@' + level + '@' + grazingZone;
        const x = assigned ? assigned.x - (grazingZone === 'yard' ? 4.8 : 10) : center.x - 7 + index * 2;
        const z = assigned ? assigned.z - 3.9 + rank % 4 * 2.6 : center.z - 3;
        const widths = [2.05, 3.06, 4.72, 5.58], depths = [2.42, 2.71, 2.92, 4.38];
        const permitted = (p: { x: number; z: number }) => !assigned ||
            (grazingZone === 'yard' ? Math.abs(p.x - assigned.x) < assigned.halfWidth - 1 &&
                Math.abs(p.z - assigned.z) < assigned.halfDepth - 1 :
                Math.hypot(p.x - assigned.x, p.z - assigned.z) <= 20 &&
                (Math.abs(p.x - assigned.x) > assigned.halfWidth + .8 ||
                    Math.abs(p.z - assigned.z) > assigned.halfDepth + .8));
        const arrival = !assigned ? livestockArrivals.get(c.id) : undefined;
        const body = state.livestockPresence?.animals[c.id];
        const point = state.livestockPresence ? body ? { ...body.position,
            y: surface.surfaceHeightAt(body.position.x, body.position.z), rotation: 0, scale: 1 } : undefined :
            arrival ? { ...arrival, y: surface.surfaceHeightAt(arrival.x, arrival.z),
                rotation: 0, scale: 1 } : allocatePoint(key, { x, z }, assigned ?? undefined, {
                    halfWidth: widths[Math.min(level, 3)] + .7, halfDepth: depths[Math.min(level, 3)] + .7
                }, permitted);
        const presence: FjordResidentPresence | undefined = body ? {
            position: { ...body.position }, previousPosition: { ...body.position },
            route: [{ ...body.position }, { ...body.position }], home: { ...body.home },
            rotation: 0, moving: false, updatedAt: state.livestockPresence!.adoptedAt,
            mode: 'local', incidentId: null, facing: null, suspended: false,
        } : undefined;
        add('cattle', c.id, view.name, asset, point,
            { living: true, ...(presence ? { presence } : {}), sex: c.sex, species: view.species, sexTerm: view.sexTerm,
                age: view.age, stage: view.stage, assignment: c.farmyardId,
                sheltered: view.sheltered, overcrowding: view.overcrowding, parentIds: [...view.parentIds], grazingZone });
    }
    for (const ship of site ? [] : Object.values(state.landing?.longships ?? {})) {
        if (ship.salvagedWinter !== null) continue;
        const mission = Object.values(state.world?.spatial?.missions ?? {}).find(m =>
            m.transport?.shipId === ship.id && m.transport.phase === 'embarked');
        const pose = ship.transport ? { ...ship.transport, y: world.waterLevel + .15, scale: 1 } : longshipBerth(layout.mooring);
        add('longship', ship.id, 'Founding longship', 'longship', pose, { living: true,
            shipExpedition: mission?.id, transportGroup: ship.transport?.groupId ?? undefined });
    }
    for (const key of Object.keys(layout.points)) if (!usedPoints.has(key)) delete layout.points[key];
    const ground = projectFjordGround(world, entities, campfire,
        communityHearthSite?.occupancy ?? []);
    if (communityHearthSite) {
        const points = communityHearthAccess({ world, worldId: geographyIdentity(world),
            plots: Object.values(layout.plots), paths: ground.paths.map(path => path.points) },
            communityHearthSite.placement, communityHearthSite.tier);
        if (points.length) ground.paths.push({ from: 'community-hearth', to: campfire.id, points });
    }
    if (ground.plots.length > 0 && ground.paths.length < ground.plots.length)
        diagnostics.push('Some permanent homes have no safe connecting path; no route across water or steep terrain is drawn.');
    const calendar = projectFjordCalendar(state.time, state.ticksPerWinter);
    const { from, to, mix } = seasonBlend(calendar.visualProgress);
    const precipitation: FjordPrecipitation = {
        snow: calendar.winterWeight,
        rain: from.name === 'Autumn' ? 1 - mix : to.name === 'Autumn' ? mix : 0
    };
    return { calendar, precipitation,
        campfire, communityHearthSite, communityHearthStatus, entities, livestockDeaths, layout, diagnostics, ground,
        time: { ...state.time }, stocks: { ...state.stocks },
        weather: inspectWeather(state),
        weatherVisual: projectFjordWeather(inspectWeather(state).enabled ? inspectWeather(state).class : null) };
}
