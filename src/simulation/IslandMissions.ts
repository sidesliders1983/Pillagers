import type { SimulationState } from './SimulationCore';
import type { PhysicalExpeditionContext, SpatialMission } from './SpatialExpeditions';
import type { Cargo, ExpeditionResult, Knowledge, MissionType } from './WorldExpeditions';
import type { Point2 } from '../world-generation/WorldBlueprint';
import { discoveryAt, inspectClanDiscovery } from './ClanDiscovery';
import { planRoute, prototypeExplorePolicy, routeLength, requireReadyExpeditionGroup } from './SpatialExpeditions';
import { absoluteTick, missionTypes, recoverExpeditionCargo, resolveExpeditionCrew } from './WorldExpeditions';
import { weatherProfile } from './Weather';
import { eventFacts } from './EventFacts';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { traceTerrainSightline } from '../world-generation/SettlementVisibility';

export type IslandTarget = { kind: 'area'; position: Point2 } | { kind: 'site'; siteId: string };
export interface IslandTargetRef {
    version: 1;
    worldId: string;
    kind: 'area' | 'site';
    id: string;
    position: Point2;
}
export interface IslandMissionTask {
    version: 1;
    type: MissionType;
    target: IslandTargetRef;
    priorities: Cargo[];
    speed: number;
    duration: number;
    operateUntil: number;
    successBps: number;
    casualtyBps: number;
    observation: Knowledge | null;
    observedSiteId: string | null;
    visitEventId: string | null;
    result: ExpeditionResult | null;
}
export interface IslandIntel {
    version: 1;
    worldId: string;
    sites: Record<string, { position: Point2; sightedAt: number; sourceEventId: string;
        knowledge?: Knowledge; reportEventId?: string }>;
}
export type IslandMissionCommand = { type: 'DispatchIslandMission'; groupId: string;
    target: IslandTarget; mission: MissionType; priorities?: Cargo[]; origins?: Record<string, Point2> };

/** Dated player observations only. No target state or unreported visit data. */
export function inspectIslandMissions(state: SimulationState) {
    return { sites: Object.entries(state.world?.islandIntel?.sites ?? {}).map(([id, site]) => ({
        id, position: { ...site.position }, sightedAt: site.sightedAt,
        sourceEventId: site.sourceEventId, reportEventId: site.reportEventId ?? null,
        knowledge: site.knowledge ? structuredClone(site.knowledge) : null,
    })) };
}

function prepareMission(state: SimulationState, groupId: string, target: IslandTarget,
    type: MissionType, priorities: Cargo[], context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    if (!context || state.world?.version !== 2 || !state.discovery ||
        state.world.island?.worldId !== context.worldId || !missionTypes.includes(type))
        throw new Error('Physical missions require the bound island campaign.');
    const known = target.kind === 'site' ? state.world.islandIntel?.sites[target.siteId] : undefined;
    if (type !== 'Recon' && !known?.knowledge?.settlementName)
        throw new Error('A discovered CPU clan is required for this mission.');
    if (target.kind === 'site' && !known) throw new Error('Choose a known site.');
    if (type === 'Pillage' && !known?.knowledge?.opportunity)
        throw new Error('No known viable pillage opportunity.');
    if (type === 'Pillage' && (!priorities.length || new Set(priorities).size !== priorities.length ||
        priorities.some(p => !['Food', 'Materials', 'Cattle', 'People'].includes(p))))
        throw new Error('Choose distinct pillage priorities.');
    const position = target.kind === 'site' ? known!.position : target.position;
    if (!position || discoveryAt(inspectClanDiscovery(state.discovery, state.clan.id),
        position.x, position.z) === 'unknown') throw new Error('Choose a mapped area for Recon.');
    const group = requireReadyExpeditionGroup(state, groupId, context);
    const home = context.world.settlement.center;
    // Presentation supplies exact local departure positions; it cannot shorten a trip by inventing remote origins.
    if (origins && (Object.keys(origins).length !== group.memberIds.length || group.memberIds.some(id =>
        !origins[id] || !Number.isFinite(origins[id].x) || !Number.isFinite(origins[id].z) ||
        Math.hypot(origins[id].x - home.x, origins[id].z - home.z) > state.discovery!.policy.settlementRadius)))
        throw new Error('Every member must depart from home.');
    const plans = group.memberIds.map(id => planRoute(context, position, origins?.[id], true));
    const memberRoutes = Object.fromEntries(group.memberIds.map((id, i) => [id, plans[i].route]));
    const route = plans.reduce((a, b) => routeLength(a.route) >= routeLength(b.route) ? a : b).route;
    const distance = routeLength(route);
    if (!distance) throw new Error('Choose a destination outside the group’s departure point.');
    const config = state.world.config, weather = weatherProfile(state);
    const duration = Math.ceil(config.durations[type] * weather.travelDurationBps / 10000);
    const foodPerMember = Math.ceil(config.provisions[type] * duration / config.durations[type]);
    const foodCost = foodPerMember * group.memberIds.length;
    if (state.stocks.food < foodCost) throw new Error(`Mission needs ${foodCost} Food.`);
    const speed = (state.world.spatial?.policy.metresPerTick ?? prototypeExplorePolicy.metresPerTick) *
        10000 / weather.travelDurationBps;
    const travelTicks = Math.ceil(distance / speed);
    if (travelTicks * 2 + 1 > duration)
        throw new Error('The land round trip does not fit this mission’s duration.');
    const nav = context.world.navigation, destination = plans[0].target;
    const ref: IslandTargetRef = { version: 1, worldId: context.worldId, kind: target.kind,
        id: target.kind === 'site' ? target.siteId : `area-${Math.round((destination.z - nav.bounds.minZ) / nav.spacing) * nav.columns +
            Math.round((destination.x - nav.bounds.minX) / nav.spacing)}`, position: { ...destination } };
    return { ref, group, memberRoutes, route, distance, speed, travelTicks, duration, foodCost, foodPerMember,
        successBps: config.successBps[type], casualtyBps: Math.min(10000, config.casualtyBps[type] + weather.travelRiskBps) };
}

export function islandMissionOffer(state: SimulationState, groupId: string, target: IslandTarget,
    type: MissionType, priorities: Cargo[] = [], context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    const offer = prepareMission(state, groupId, target, type, priorities, context, origins);
    return { duration: offer.duration, foodCost: offer.foodCost, foodPerMember: offer.foodPerMember,
        successBps: offer.successBps, casualtyBps: offer.casualtyBps,
        target: { ...offer.ref.position }, travelTicks: offer.travelTicks };
}

export function dispatchIslandMission(state: SimulationState, command: IslandMissionCommand, context?: PhysicalExpeditionContext) {
    const offer = prepareMission(state, command.groupId, command.target, command.mission,
        command.priorities ?? [], context, command.origins);
    const spatial = state.world!.spatial ??= { version: 3, worldId: context!.worldId,
        policy: { ...prototypeExplorePolicy }, missions: {} };
    spatial.version = 3;
    const id = `explore-${Object.keys(spatial.missions).length + 1}`, now = absoluteTick(state);
    const mission: SpatialMission = {
        id, routeMode: 'eight-way-v1', groupId: offer.group.id, groupName: offer.group.name, memberIds: [...offer.group.memberIds],
        target: offer.ref.position, route: offer.route, memberRoutes: offer.memberRoutes,
        homeOrigins: Object.fromEntries(offer.group.memberIds.map(id => [id, { ...offer.memberRoutes[id][0] }])),
        returnRoutes: Object.fromEntries(offer.group.memberIds.map(id => [id, [...offer.memberRoutes[id]].reverse()])),
        distance: offer.distance, travelled: 0, departedAt: now, updatedAt: now,
        exploringUntil: null, returnedAt: null, foodCost: offer.foodCost, status: 'Traveling', outcome: null,
        task: { version: 1, type: command.mission, target: offer.ref, priorities: [...(command.priorities ?? [])],
            speed: offer.speed, duration: offer.duration, operateUntil: now + offer.duration - offer.travelTicks,
            successBps: offer.successBps, casualtyBps: offer.casualtyBps,
            observation: null, observedSiteId: null, visitEventId: null, result: null },
    };
    spatial.missions[id] = mission;
    state.stocks.food -= offer.foodCost;
    record(state, 'ExpeditionDeparted', mission, { target: offer.ref, foodCost: offer.foodCost,
        duration: offer.duration, successBps: offer.successBps, casualtyBps: offer.casualtyBps });
}

function observesSite(state: SimulationState, context: PhysicalExpeditionContext, point: Point2) {
    const site = context.world.rivalSite;
    if (!site || Math.hypot(point.x - site.center.x, point.z - site.center.z) >
        state.discovery!.policy.expeditionRadius) return false;
    const surface = createBlueprintSurface(context.world);
    return traceTerrainSightline(context.world,
        { ...point, y: surface.surfaceHeightAt(point.x, point.z) + state.discovery!.policy.eyeHeight },
        { ...site.center, y: surface.surfaceHeightAt(site.center.x, site.center.z) + .05 }).visible;
}

/** An eyewitness marker is geography, not a surveyed clan or a live inventory. */
export function recordIslandSightings(state: SimulationState, context: PhysicalExpeditionContext,
    observers: readonly Point2[]) {
    const link = state.world?.island, site = context.world.rivalSite;
    if (!link || !site || state.world!.islandIntel?.sites[site.candidateId] ||
        !observers.some(point => observesSite(state, context, point))) return;
    const intel = state.world!.islandIntel ??= { version: 1, worldId: context.worldId, sites: {} };
    const id = `event-${state.events.length + 1}`, now = absoluteTick(state);
    intel.sites[site.candidateId] = { position: { ...site.center }, sightedAt: now, sourceEventId: id };
    state.events.push({ id, type: 'IslandSiteSighted', time: { ...state.time },
        details: { siteId: site.candidateId, worldId: context.worldId, observedAt: now, position: { ...site.center } } });
}

function record(state: SimulationState, type: string, mission: SpatialMission, details: Record<string, unknown>) {
    const id = `event-${state.events.length + 1}`;
    state.events.push({ id, type, time: { ...state.time }, details: eventFacts(state, {
        missionId: mission.id, mission: mission.task!.type, groupName: mission.groupName,
        destination: mission.task!.target.kind === 'area' ? 'a mapped area' : 'a settlement site',
        participants: [...mission.memberIds], ...details,
    }) });
    return id;
}

/** A visit records what this group could observe then, never a future remote inventory. */
export function observeIslandMission(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const task = mission.task!, site = context.world.rivalSite;
    const seesSite = !!site && mission.memberIds.some(id => {
        if (state.personas[id]?.deathWinter !== null) return false;
        const point = mission.memberRoutes![id].at(-1)!;
        return observesSite(state, context, point);
    });
    const target = seesSite ? state.world!.targetClans[state.world!.island!.clanId] : undefined;
    const population = target ? Object.values(target.personas).filter(p => p.deathWinter === null).length : 0;
    const field = context.world.terrain, point = mission.target;
    const biome = context.world.biomes?.cells[Math.round((point.z - field.bounds.minZ) / field.spacing) *
        field.columns + Math.round((point.x - field.bounds.minX) / field.spacing)];
    const terrain = ({ water: 'Water', shore: 'Shore', clearing: 'Clearing', grass: 'Grassland',
        forest: 'Forest', rock: 'Rock' } as const)[biome ?? 'grass'];
    task.observedSiteId = seesSite ? site!.candidateId : null;
    task.observation = { level: task.type === 'Surveillance' ? 'Surveyed' :
        state.world!.islandIntel?.sites[site?.candidateId ?? '']?.knowledge?.level ?? 'Scouted',
        observedAt: absoluteTick(state), terrain: biome ? terrain : 'Land', resources: [],
        settlementName: target?.clan.name ?? null,
        opportunity: !!target && (target.stocks.food > 0 || target.stocks.materials > 0 || population > 0 ||
            Object.values(target.landing!.cattle).some(c => c.deathWinter === null)),
        resistance: task.type === 'Surveillance' && target ? population < 5 ? 'Low' : population < 15 ? 'Medium' : 'High' : null };
    task.visitEventId = record(state, 'IslandMissionVisited', mission, { target: task.target,
        observedAt: task.observation.observedAt });
}

export function completeIslandMission(state: SimulationState, mission: SpatialMission) {
    const task = mission.task!;
    const { live, success: rolled } = resolveExpeditionCrew(state, { id: mission.id,
        memberIds: mission.memberIds, successBps: task.successBps, casualtyBps: task.casualtyBps });
    const success = mission.outcome === 'Completed' && !!task.visitEventId && rolled;
    const discovery = success && task.type !== 'Pillage' ? task.observation : null;
    const loot = success && task.type === 'Pillage' && task.observedSiteId === state.world!.island!.siteId ?
        recoverExpeditionCargo(state, { id: mission.id, priorities: task.priorities }, live, state.world!.island!.clanId) :
        { food: 0, materials: 0, cattleIds: [], personaIds: [] };
    task.result = { success, discovery, survivorIds: live, casualtyIds: mission.memberIds.filter(id => !live.includes(id)),
        ...loot, summary: success ? task.type === 'Pillage' ?
            loot.food || loot.materials || loot.cattleIds.length || loot.personaIds.length ? 'Raid completed.' :
                'Raid succeeded but no available assets were recovered.' :
            discovery?.settlementName ? 'Settlement observed.' : 'No settlement observed in this area.' :
            mission.outcome === 'Cancelled' ? 'Mission cancelled; no discoveries or recovered assets.' : 'Mission failed; no discoveries or recovered assets.' };
    const reportId = record(state, 'ExpeditionReturned', mission, { target: task.target,
        visitEventId: task.visitEventId, ...task.result });
    if (discovery && task.observedSiteId) {
        const intel = state.world!.islandIntel ??= { version: 1, worldId: task.target.worldId, sites: {} };
        const site = intel.sites[task.observedSiteId];
        if (site) {
            site.reportEventId = reportId;
            site.knowledge = structuredClone(discovery);
        }
    }
}

export function validateIslandMission(state: SimulationState, mission: SpatialMission) {
    const task = mission.task!;
    const bounds = state.discovery!.grid.bounds;
    const validPoint = (p: Point2) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
    const visit = state.events.find(event => event.id === task.visitEventId);
    const validIds = (ids: string[]) => Array.isArray(ids) && new Set(ids).size === ids.length &&
        ids.every(id => typeof id === 'string');
    if (state.world?.spatial?.version !== 3 || state.world.version !== 2 || task.version !== 1 ||
        !task.target || task.target.version !== 1 || task.target.worldId !== state.world.island!.worldId || !task.target.id ||
        !validPoint(task.target.position) || !validPoint(mission.target) ||
        task.target.position.x !== mission.target.x || task.target.position.z !== mission.target.z ||
        task.target.position.x < bounds.minX || task.target.position.x > bounds.maxX ||
        task.target.position.z < bounds.minZ || task.target.position.z > bounds.maxZ ||
        !['area', 'site'].includes(task.target.kind) || !missionTypes.includes(task.type) ||
        (task.target.kind === 'site' ? task.target.id !== state.world.island!.siteId : !/^area-\d+$/.test(task.target.id)) ||
        !Array.isArray(task.priorities) || new Set(task.priorities).size !== task.priorities.length ||
        task.priorities.some(p => !['Food', 'Materials', 'Cattle', 'People'].includes(p)) ||
        task.type === 'Pillage' && !task.priorities.length ||
        !Number.isFinite(task.speed) || task.speed <= 0 || task.speed > 8 ||
        !Number.isSafeInteger(task.duration) || task.duration < 1 ||
        !Number.isSafeInteger(task.operateUntil) || task.operateUntil <= mission.departedAt ||
        task.operateUntil >= mission.departedAt + task.duration || mission.provisions ||
        ![task.successBps, task.casualtyBps].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000) ||
        (mission.status === 'Returned') !== !!task.result ||
        (task.observation === null) !== (task.visitEventId === null) ||
        task.observation !== null && (!validKnowledge(task.observation, absoluteTick(state)) || !visit ||
            visit.type !== 'IslandMissionVisited' || visit.details?.missionId !== mission.id ||
            visit.details?.observedAt !== task.observation.observedAt) ||
        task.observedSiteId !== null && (task.observedSiteId !== state.world.island!.siteId || !task.observation) ||
        task.result !== null && (typeof task.result.success !== 'boolean' ||
            ![task.result.food, task.result.materials].every(n => Number.isSafeInteger(n) && n >= 0) ||
            ![task.result.casualtyIds, task.result.survivorIds, task.result.cattleIds, task.result.personaIds].every(validIds) ||
            typeof task.result.summary !== 'string' ||
            [...task.result.casualtyIds, ...task.result.survivorIds].sort().join() !== [...mission.memberIds].sort().join() ||
            task.result.discovery !== null && (!task.result.success || task.type === 'Pillage' ||
                JSON.stringify(task.result.discovery) !== JSON.stringify(task.observation))))
        throw new Error('Invalid physical mission.');
}

function validKnowledge(value: Knowledge, now: number) {
    return value && ['Scouted', 'Surveyed'].includes(value.level) &&
        Number.isSafeInteger(value.observedAt) && value.observedAt >= 800000 && value.observedAt <= now &&
        typeof value.terrain === 'string' && Array.isArray(value.resources) &&
        value.resources.every(resource => typeof resource === 'string') &&
        (value.settlementName === null || typeof value.settlementName === 'string') &&
        typeof value.opportunity === 'boolean' && [null, 'Low', 'Medium', 'High'].includes(value.resistance);
}

export function validateIslandIntel(state: SimulationState) {
    const intel = state.world?.islandIntel;
    if (!intel) return;
    const fail = () => { throw new Error('Invalid physical mission knowledge.'); };
    if (state.world?.version !== 2 || intel.version !== 1 || intel.worldId !== state.world.island?.worldId ||
        !intel.sites || Array.isArray(intel.sites)) fail();
    for (const [id, site] of Object.entries(intel.sites)) {
        const source = state.events.find(event => event.id === site.sourceEventId);
        const bounds = state.discovery!.grid.bounds;
        if (id !== state.world!.island!.siteId || !site.position ||
            !Number.isFinite(site.position.x) || !Number.isFinite(site.position.z) ||
            site.position.x < bounds.minX || site.position.x > bounds.maxX ||
            site.position.z < bounds.minZ || site.position.z > bounds.maxZ ||
            !Number.isSafeInteger(site.sightedAt) || site.sightedAt > absoluteTick(state) ||
            !source || source.type !== 'IslandSiteSighted' || source.details?.siteId !== id ||
            source.details?.observedAt !== site.sightedAt ||
            JSON.stringify(source.details?.position) !== JSON.stringify(site.position)) fail();
        if (site.knowledge) {
            const report = state.events.find(event => event.id === site.reportEventId);
            if (!validKnowledge(site.knowledge, absoluteTick(state)) || !report || report.type !== 'ExpeditionReturned' ||
                JSON.stringify(report.details?.discovery) !== JSON.stringify(site.knowledge)) fail();
        } else if (site.reportEventId !== undefined) fail();
    }
}
