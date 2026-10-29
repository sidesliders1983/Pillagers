import { planRoute, maximumTargetCorrection } from '../world-generation/LandRoutes';
export { planRoute } from '../world-generation/LandRoutes';
import { assertIslandClanWorld } from './IslandClans';
import { embarkReachedGroup, longshipReturnTicks, recallLongship, releaseLongship, sailLongship,
    sailLongshipOffer, stepLongship, validateLongshipState, assertLongshipWorld,
    type ExpeditionTransport, type LongshipPose } from './LongshipTransport';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { commitClanObservation, assertDiscoveryWorld } from './ClanDiscovery';
import type { SimulationState } from './SimulationCore';
import { absoluteTick, expeditionEligible, groupMission, nextExpeditionGroupId } from './WorldExpeditions';
import { eventFacts } from './EventFacts';
import { completeIslandMission, observeIslandMission, recordIslandSightings, validateIslandMission, type IslandMissionTask } from './IslandMissions';

export interface PhysicalExpeditionContext {
    longshipOrigins?: Record<string, LongshipPose>;
    wildlifeWorld?: WorldBlueprint;
    exclusions?: readonly Bounds2[];
    worldId: string;
    world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'navigation' | 'settlement' | 'rivalSite'> &
        Partial<Pick<WorldBlueprint, 'biomes' | 'oreSites'>>;
}
export interface ExplorePolicy {
    metresPerTick: number;
    exploringTicks: number;
    foodIntervalTicks: number;
}
export const prototypeExplorePolicy: ExplorePolicy = {
    metresPerTick: 2, exploringTicks: 25, foodIntervalTicks: 125,
};
export const maximumTestExpeditionFoodPerMember = 10;
export const defaultExpeditionFoodPerMember = 8;
const expeditionTicksPerFood = 250;
export interface ExpeditionProvisions {
    /** Version 1 preserves paid two-Food packs; version 2 starts with eight. */
    version: 1 | 2;
    /** Explicit playtest override, separate from ordinary production packs. */
    testCapacity?: true;
    foodPerMember: number;
    ticksPerFood: number;
    members: Record<string, { food: number; rationTicks: number; consumed: number; discarded: number; lost: number; loaded?: number }>;
}
export interface SpatialMission {
    transport?: ExpeditionTransport;
    lastShipId?: string;
    task?: IslandMissionTask;
    /** New route geometry; absent on preserved cardinal journeys. */
    routeMode?: 'eight-way-v1';
    id: string;
    groupId: string;
    groupName: string;
    memberIds: string[];
    target: Point2;
    /** New missions retain each member's dispatch-time origin and safe route. */
    memberRoutes?: Record<string, Point2[]>;
    /** Redirected groups retain their original homes and a separately planned homeward leg. */
    homeOrigins?: Record<string, Point2>;
    returnRoutes?: Record<string, Point2[]>;
    returnFrom?: number;
    route: Point2[];
    distance: number;
    travelled: number;
    departedAt: number;
    updatedAt: number;
    exploringUntil: number | null;
    returnedAt: number | null;
    foodCost: number;
    status: 'Prepared' | 'Traveling' | 'Exploring' | 'Returning' | 'Returned' | 'Stranded';
    provisions?: ExpeditionProvisions;
    outcome: 'Completed' | 'Cancelled' | 'Lost' | null;
}
export interface SpatialExpeditions {
    version: 1 | 2 | 3;
    worldId: string;
    policy: ExplorePolicy;
    missions: Record<string, SpatialMission>;
}
export type SpatialExpeditionCommand =
    { type: 'StartExpedition'; groupId: string; testFoodPerMember?: number } |
    { type: 'CancelExpedition'; groupId: string } |
    { type: 'CreateExplorationGroup' } |
    { type: 'SetExplorationMember'; groupId: string; personaId: string; included: boolean } |
    { type: 'ExploreArea'; groupId: string; target: Point2; origins?: Record<string, Point2> } |
    { type: 'RecallExpedition'; groupId: string };

export function spatialGroupMission(state: SimulationState, groupId: string) {
    return Object.values(state.world?.spatial?.missions ?? {})
        .find(mission => mission.groupId === groupId && mission.status !== 'Returned');
}
function requireContext(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (!context || !state.discovery || !state.world)
        throw new Error('Explore Area requires the bound physical island and discovery.');
    assertDiscoveryWorld(state.discovery, context.world, context.worldId);
    if (state.world.spatial && state.world.spatial.worldId !== context.worldId)
        throw new Error('Expedition belongs to a different physical world.');
    return context;
}

/** Pacing is derived from canonical activity, never stored as a second gameplay clock. */
export function expeditionModeActive(state: SimulationState) {
    return Object.values(state.world?.spatial?.missions ?? {}).some(m => (m.provisions || m.task) &&
        m.status !== 'Returned' && m.status !== 'Stranded');
}
export function requireReadyExpeditionGroup(state: SimulationState, groupId: string, context?: PhysicalExpeditionContext) {
    requireContext(state, context);
    const group = state.world!.groups[groupId];
    if (!group || groupMission(state, groupId)) throw new Error('Group already active or unavailable.');
    if (!group.memberIds.length || group.memberIds.some(id => !expeditionEligible(state, id, groupId)))
        throw new Error('Group needs living eligible members without childcare.');
    const active = Object.values(state.world!.spatial?.missions ?? {}).filter(m => m.status !== 'Returned');
    if (active.length >= 16 || group.memberIds.length + active.reduce((sum, m) => sum +
        (m.provisions || m.memberRoutes ? m.memberIds.length : 1), 0) > 62)
        throw new Error('At most 16 groups and 62 residents can explore at once.');
    return group;
}
export function startExpeditionOffer(state: SimulationState, groupId: string, context?: PhysicalExpeditionContext,
    testFoodPerMember?: number) {
    const group = requireReadyExpeditionGroup(state, groupId, context);
    if (testFoodPerMember !== undefined && (!Number.isSafeInteger(testFoodPerMember) ||
        testFoodPerMember < 1 || testFoodPerMember > maximumTestExpeditionFoodPerMember))
        throw new Error(`Test supplies must be a whole number from 1 to ${maximumTestExpeditionFoodPerMember} Food per resident.`);
    const foodPerMember = testFoodPerMember ?? defaultExpeditionFoodPerMember;
    const ticksPerFood = expeditionTicksPerFood, foodCost = group.memberIds.length * foodPerMember;
    if (state.stocks.food < foodCost)
        throw new Error(`Start Expedition needs ${foodCost} Food (${state.stocks.food} available).`);
    return { foodPerMember, ticksPerFood, foodCost, members: group.memberIds.length,
        activeTicks: foodPerMember * ticksPerFood, minutesPer1000Ticks: 10 };
}
export function recordSpatial(state: SimulationState, type: string, mission: SpatialMission, details: Record<string, unknown> = {}) {
    state.events.push({ id: `event-${state.events.length + 1}`, time: { ...state.time }, type,
        details: eventFacts(state, { missionId: mission.id, groupName: mission.groupName,
            participants: [...mission.memberIds], ...details }) });
}
function settleProvisions(state: SimulationState, mission: SpatialMission, atHome: boolean) {
    if (!mission.provisions) return;
    let discardedFood = 0, lostFood = 0;
    for (const [id, supply] of Object.entries(mission.provisions.members)) {
        if (atHome && state.personas[id]?.deathWinter === null) {
            supply.discarded += supply.food; discardedFood += supply.food;
        } else { supply.lost += supply.food; lostFood += supply.food; }
        supply.food = 0; supply.rationTicks = 0;
    }
    if (discardedFood) recordSpatial(state, 'ExploreAreaSuppliesDiscarded', mission, { units: discardedFood });
    if (lostFood) recordSpatial(state, 'ExploreAreaSuppliesLost', mission, { units: lostFood });
}

/** Split an already validated route at a confirmed distance, retaining exact partial-edge positions. */
export function splitRoute(route: readonly Point2[], distance: number) {
    const prefix = [{ ...route[0] }];
    let remaining = Math.max(0, distance);
    for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (remaining < length - 1e-8) {
            const ratio = length ? remaining / length : 0;
            const point = { x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio };
            if (remaining > 1e-8) prefix.push(point);
            return { prefix, suffix: [point, ...route.slice(i).map(p => ({ ...p }))] };
        }
        prefix.push({ ...b }); remaining -= length;
    }
    return { prefix, suffix: [{ ...route.at(-1)! }, { ...route.at(-1)! }] };
}
export function joinRoutes(first: Point2[], second: readonly Point2[]) {
    const result: Point2[] = [];
    // A landed/waiting group has a valid two-point zero-length route. Its duplicate
    // endpoint must not become an interior zero-length edge when it departs again.
    for (const path of [first, second]) for (const point of path)
        if (!result.length || Math.hypot(point.x - result.at(-1)!.x, point.z - result.at(-1)!.z) > 1e-8)
            result.push({ ...point });
    if (result.length < 2) result.push({ ...result[0] });
    return result;
}
/** Reuse reached trail geometry for a safe conservative return; no repeated path search per tick. */
export function modeReturnTrail(mission: SpatialMission, member: string) {
    const route = mission.memberRoutes![member], length = routeLength(route);
    if (mission.returnFrom !== undefined) {
        const elapsed = mission.returnFrom - mission.travelled;
        return splitRoute(route, Math.min(length, elapsed)).suffix;
    }
    const reached = splitRoute(route, Math.min(length, mission.travelled)).prefix.reverse();
    if (mission.task) return joinRoutes(reached, []);
    return joinRoutes(reached, mission.returnRoutes![member]);
}

function prepareExplore(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    const bound = requireContext(state, context), group = state.world!.groups[groupId];
    const active = spatialGroupMission(state, groupId);
    if (active?.task) throw new Error('A separate mission must return home before choosing another destination.');
    if (!group || !active && groupMission(state, groupId)) throw new Error('Choose an available expedition group.');
    if (!active && state.world!.spatial?.version !== 1) throw new Error('Start Expedition before choosing a destination.');
    if (active?.status === 'Stranded') throw new Error('This group is stranded and cannot receive new destinations.');
    if (!group.memberIds.length || (active && active.status !== 'Prepared' ? !group.memberIds.some(id => state.personas[id]?.deathWinter === null) :
        group.memberIds.some(id => !expeditionEligible(state, id, groupId))))
        throw new Error('Group needs living eligible members without childcare.');
    if (active && active.status !== 'Prepared') origins = Object.fromEntries(group.memberIds.map(id => [id, spatialMemberPosition(active, id)]));
    if (origins && (group.memberIds.some(id => !origins[id] || !Number.isFinite(origins[id].x) || !Number.isFinite(origins[id].z)) || Object.keys(origins).length !== group.memberIds.length ||
        group.memberIds.some(id => !Object.hasOwn(origins, id))))
        throw new Error('Every expedition member needs an exact departure origin.');
    const eightWay = !!active?.provisions;
    const plans = origins ? group.memberIds.map(id => planRoute(bound, target, origins[id], eightWay)) :
        [planRoute(bound, target, undefined, eightWay)];
    const memberRoutes = origins || active?.provisions ? Object.fromEntries(group.memberIds.map((id, i) =>
        [id, plans[origins ? i : 0].route])) : undefined;
    const routes = plans.map(plan => plan.route);
    const route = routes.reduce((longest, next) => routeLength(next) > routeLength(longest) ? next : longest);
    const distance = routeLength(route);
    if (distance === 0) throw new Error('Choose a destination farther from the group.');
    const policy = state.world!.spatial?.policy ?? prototypeExplorePolicy;
    const mode = !!active?.provisions;
    const homeOrigins = mode && active.status === 'Prepared' ? Object.fromEntries(group.memberIds.map(id =>
        [id, { ...memberRoutes![id][0] }])) : active ? active.homeOrigins ?? Object.fromEntries(group.memberIds.map(id =>
        [id, { ...(active.memberRoutes?.[id] ?? active.route)[0] }])) : undefined;
    const returnRoutes = mode ? Object.fromEntries(group.memberIds.map(id => [id, active.status === 'Prepared'
        ? [{ ...homeOrigins![id] }, { ...homeOrigins![id] }] : modeReturnTrail(active, id)])) :
        homeOrigins ? Object.fromEntries(group.memberIds.map(id =>
            [id, planRoute(bound, homeOrigins[id], plans[0].target).route])) : undefined;
    const returnDistance = returnRoutes ? Math.max(...Object.values(returnRoutes).map(routeLength)) : distance;
    const plannedTicks = mode ? undefined : Math.ceil(distance / policy.metresPerTick) + policy.exploringTicks +
        Math.ceil(returnDistance / policy.metresPerTick);
    const foodCost = mode ? 0 : Math.ceil(plannedTicks! / policy.foodIntervalTicks) * group.memberIds.length;
    if (state.stocks.food < foodCost) throw new Error(`Explore Area needs ${foodCost} Food.`);
    return {
        bound, group, active, homeOrigins, returnRoutes, route, memberRoutes, distance, policy, plannedTicks, foodCost,
        target: plans[0].target, adjusted: plans[0].adjusted
    };
}
/** No route, terrain difficulty or hidden-site information is exposed by a proposal. */
export function exploreOffer(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    if (spatialGroupMission(state, groupId)?.transport?.phase === 'embarked')
        return sailLongshipOffer(state, groupId, target, context);
    const offer = prepareExplore(state, groupId, target, context, origins);
    return {
        target: { ...offer.target }, adjusted: offer.adjusted,
        ...(offer.active?.provisions ? {} : { plannedTicks: offer.plannedTicks }), foodCost: offer.foodCost,
        members: offer.group.memberIds.length, estimate: offer.active?.provisions ?
            'Using carried supplies; the group returns safely before they run out.' : 'Planned round trip; conditions may change.'
    };
}
export function applySpatialCommand(state: SimulationState, command: SpatialExpeditionCommand,
    context?: PhysicalExpeditionContext) {
    if (command.type === 'ExploreArea' && spatialGroupMission(state, command.groupId)?.transport?.phase === 'embarked') {
        sailLongship(state, command.groupId, command.target, context); return;
    }
    if (command.type === 'StartExpedition') {
        const offer = startExpeditionOffer(state, command.groupId, context, command.testFoodPerMember);
        const group = state.world!.groups[command.groupId], now = absoluteTick(state);
        const spatial = state.world!.spatial ??= { version: 2, worldId: context!.worldId,
            policy: { ...prototypeExplorePolicy }, missions: {} };
        if (spatial.version !== 3) spatial.version = 2;
        const id = `explore-${Object.keys(spatial.missions).length + 1}`;
        const home = { ...context!.world.settlement.center };
        const mission: SpatialMission = {
            id, groupId: group.id, groupName: group.name, memberIds: [...group.memberIds], target: home,
            route: [home, { ...home }], distance: 0, travelled: 0, departedAt: now, updatedAt: now,
            exploringUntil: null, returnedAt: null, foodCost: offer.foodCost, status: 'Prepared', outcome: null,
            provisions: { version: 2, foodPerMember: offer.foodPerMember, ticksPerFood: offer.ticksPerFood,
                ...(command.testFoodPerMember !== undefined ? { testCapacity: true as const } : {}),
                members: Object.fromEntries(group.memberIds.map(member => [member,
                    { food: offer.foodPerMember, rationTicks: 0, consumed: 0, discarded: 0, lost: 0 }])) }
        };
        spatial.missions[id] = mission;
        state.stocks.food -= offer.foodCost;
        recordSpatial(state, 'ExploreAreaPrepared', mission, { foodCost: offer.foodCost, foodPerMember: offer.foodPerMember,
            ...(command.testFoodPerMember !== undefined ? { testCapacity: true } : {}) });
        return;
    }
    if (command.type === 'CancelExpedition') {
        requireContext(state, context);
        const mission = spatialGroupMission(state, command.groupId);
        if (!mission || mission.status !== 'Prepared') throw new Error('Only a prepared expedition can be cancelled at home.');
        finish(state, mission, 'Cancelled');
        return;
    }
    if (command.type === 'CreateExplorationGroup' || command.type === 'SetExplorationMember') {
        requireContext(state, context);
        const groups = state.world!.groups;
        if (command.type === 'CreateExplorationGroup') {
            const id = nextExpeditionGroupId(state);
            const number = Number(id.slice(6));
            groups[id] = { id, name: 'Group ' + number, memberIds: [], exploration: true };
        } else {
            if (typeof command.included !== 'boolean' || !state.personas[command.personaId])
                throw new Error('Choose a valid resident and membership action.');
            const group = groups[command.groupId];
            if (!group || groupMission(state, group.id))
                throw new Error('Cannot edit a missing group or a group on a mission.');
            if (command.included && !expeditionEligible(state, command.personaId, group.id))
                throw new Error('Choose an eligible resident who is not in another group.');
            if (command.included && !group.memberIds.includes(command.personaId))
                group.memberIds.push(command.personaId);
            if (!command.included) {
                group.memberIds = group.memberIds.filter(id => id !== command.personaId);
                group.exploration = true;
            }
        }
        const group = command.type === 'CreateExplorationGroup' ? Object.values(groups).at(-1)! : groups[command.groupId];
        state.events.push({
            id: 'event-' + (state.events.length + 1), time: { ...state.time },
            type: command.type === 'CreateExplorationGroup' ? 'ExpeditionGroupCreated' : 'ExpeditionGroupEdited',
            details: eventFacts(state, { groupId: group.id, groupName: group.name, participants: [...group.memberIds] })
        });
        return;
    }
    if (command.type === 'RecallExpedition') {
        const bound = requireContext(state, context), mission = spatialGroupMission(state, command.groupId);
        if (!mission || mission.status === 'Returning') throw new Error('No traveling expedition to recall.');
        if (mission.transport?.phase === 'embarked') {
            mission.outcome = 'Cancelled'; recallLongship(state, mission, bound); return;
        }
        if (mission.transport) releaseLongship(state, mission);
        if (mission.provisions || mission.task) {
            beginRedirectedReturn(mission, Object.fromEntries(mission.memberIds.map(id => [id, modeReturnTrail(mission, id)])));
        } else if (mission.homeOrigins) {
            const routes = Object.fromEntries(mission.memberIds.map(id => [id,
                planRoute(bound, mission.homeOrigins![id], spatialMemberPosition(mission, id)).route]));
            beginRedirectedReturn(mission, routes);
        } else {
            mission.returnFrom = mission.travelled; mission.status = 'Returning';
        }
        mission.outcome = 'Cancelled';
        if (!mission.travelled) { finish(state, mission, 'Cancelled'); refreshSpatialObservations(state, bound); }
        return;
    }
    if (!spatialGroupMission(state, command.groupId) && Object.values(state.world?.spatial?.missions ?? {}).filter(m => m.status !== 'Returned').length >= 16)
        throw new Error('At most 16 groups can explore this island at once.');
    const offer = prepareExplore(state, command.groupId, command.target, context, command.origins);
    if (offer.active?.transport) releaseLongship(state, offer.active);
    const participants = Object.values(state.world!.spatial?.missions ?? {})
        .filter(m => m.status !== 'Returned' && m.groupId !== command.groupId).reduce((sum, m) => sum + (m.memberRoutes ? m.memberIds.length : 1), 0);
    if (participants + (offer.memberRoutes ? offer.group.memberIds.length : 1) > 62)
        throw new Error('At most 62 residents can explore this island at once.');
    const spatial = state.world!.spatial ??= {
        version: 1, worldId: offer.bound.worldId,
        policy: { ...offer.policy }, missions: {}
    };
    const id = offer.active?.id ?? `explore-${Object.keys(spatial.missions).length + 1}`;
    spatial.missions[id] = {
        id, groupId: command.groupId, groupName: offer.group.name,
        memberIds: [...offer.group.memberIds], target: { ...offer.target }, route: offer.route,
        ...(offer.memberRoutes ? { memberRoutes: offer.memberRoutes } : {}),
        ...(offer.homeOrigins ? { homeOrigins: offer.homeOrigins, returnRoutes: offer.returnRoutes } : {}),
        ...(offer.active?.provisions ? { provisions: offer.active.provisions } : {}),
        ...(offer.active?.lastShipId ? { lastShipId: offer.active.lastShipId } : {}),
        ...(offer.active?.provisions ? { routeMode: 'eight-way-v1' as const } : {}),
        distance: offer.distance, travelled: 0,
        departedAt: offer.active?.provisions && offer.active.status !== 'Prepared' ? offer.active.departedAt : absoluteTick(state),
        updatedAt: absoluteTick(state),
        exploringUntil: null, returnedAt: null, foodCost: (offer.active?.foodCost ?? 0) + offer.foodCost, status: 'Traveling', outcome: null
    };
    state.stocks.food -= offer.foodCost;
    state.events.push({
        id: `event-${state.events.length + 1}`, time: { ...state.time },
        type: 'ExploreAreaDeparted', details: eventFacts(state, {
            groupName: offer.group.name,
            missionId: id, participants: [...offer.group.memberIds], foodCost: offer.foodCost,
            ...(offer.active?.status !== 'Prepared' && offer.active ? { redirected: true } : {}),
            ...(offer.active?.provisions ? { carriedSupplies: true } : {})
        })
    });
}
function beginRedirectedReturn(mission: SpatialMission, routes = mission.returnRoutes!) {
    mission.memberRoutes = routes;
    mission.returnRoutes = routes;
    mission.route = Object.values(routes).reduce((a, b) => routeLength(a) >= routeLength(b) ? a : b);
    mission.distance = routeLength(mission.route);
    mission.travelled = mission.distance;
    mission.returnFrom = mission.distance;
    mission.status = 'Returning';
}
export function routeLength(route: readonly Point2[]) {
    return route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.z - route[i].z), 0);
}
/** Every member follows its own confirmed route; shorter routes wait at the destination. */
export function spatialMemberPosition(mission: SpatialMission, personaId: string) {
    if (mission.transport?.phase === 'embarked') return { ...spatialMissionPosition(mission),
        moving: mission.status === 'Traveling' || mission.status === 'Returning' };
    const route = mission.memberRoutes?.[personaId];
    if (!route) return {
        ...spatialMissionPosition(mission, mission.memberIds.indexOf(personaId) * 1.1),
        moving: mission.status === 'Traveling' || mission.status === 'Returning'
    };
    const distance = routeLength(route);
    const returning = mission.status === 'Returning' || mission.status === 'Stranded' && mission.returnFrom !== undefined ||
        mission.status === 'Returned' && mission.outcome !== 'Lost';
    const from = mission.returnFrom ?? mission.distance;
    const travelled = returning && mission.homeOrigins ? Math.min(distance, from - mission.travelled) : returning ? Math.max(0, Math.min(distance, from) - (from - mission.travelled)) :
        Math.min(distance, mission.travelled);
    return {
        ...spatialMissionPosition({ ...mission, homeOrigins: undefined, route, distance, travelled, status: mission.homeOrigins && returning ? 'Traveling' : mission.status }),
        moving: mission.status === 'Traveling' && travelled < distance || mission.status === 'Returning' && (mission.homeOrigins ? travelled < distance : travelled > 0)
    };
}
/** Position comes only from saved route distance; animation never advances the mission. */
export function spatialMissionPosition(mission: SpatialMission, behind = 0) {
    const progress = mission.homeOrigins && mission.returnFrom !== undefined ?
        (mission.returnFrom ?? mission.distance) - mission.travelled : mission.travelled;
    let remaining = Math.max(0, Math.min(mission.distance, progress +
        (mission.status === 'Returning' ? behind : -behind)));
    for (let i = 1; i < mission.route.length; i++) {
        const a = mission.route[i - 1], b = mission.route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (remaining <= length || i === mission.route.length - 1) {
            const ratio = length ? Math.min(1, remaining / length) : 0;
            const direction = mission.status === 'Returning' && !mission.homeOrigins ? -1 : 1;
            return {
                x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio,
                rotation: Math.atan2((b.x - a.x) * direction, (b.z - a.z) * direction)
            };
        }
        remaining -= length;
    }
    return { ...mission.route[0], rotation: 0 };
}
export function supplyEndurance(mission: SpatialMission, member: string) {
    const pack = mission.provisions!, supply = pack.members[member];
    return supply.food * pack.ticksPerFood + supply.rationTicks;
}
export function consumeCarriedFood(state: SimulationState, mission: SpatialMission) {
    const pack = mission.provisions!;
    let consumed = 0, lost = 0;
    for (const [id, supply] of Object.entries(pack.members)) {
        if (state.personas[id]?.deathWinter !== null) {
            lost += supply.food; supply.lost += supply.food;
            supply.food = 0; supply.rationTicks = 0; continue;
        }
        if (!supply.rationTicks && supply.food) {
            supply.food--; supply.consumed++; consumed++;
            supply.rationTicks = pack.ticksPerFood;
        }
        if (supply.rationTicks) supply.rationTicks--;
    }
    if (consumed) recordSpatial(state, 'ExploreAreaSuppliesConsumed', mission, { units: consumed });
    if (lost) recordSpatial(state, 'ExploreAreaSuppliesLost', mission, { units: lost });
}
function inspectSupplies(state: SimulationState, mission: SpatialMission) {
    if (!mission.provisions) return undefined;
    const pack = mission.provisions;
    const living = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null);
    const activeTicksRemaining = living.length ? Math.min(...living.map(id => supplyEndurance(mission, id))) : 0;
    // Use the same reached trails and safety margin as automatic return, without saving derived values.
    const returnTicksReserved = mission.transport?.phase === 'embarked' ? longshipReturnTicks(state, mission) :
        living.length && mission.status !== 'Prepared' && mission.status !== 'Returned' ?
        Math.max(...living.map(id => Math.ceil(routeLength(modeReturnTrail(mission, id)) /
            state.world!.spatial!.policy.metresPerTick))) + 2 : 0;
    return { foodPerMember: pack.foodPerMember, ticksPerFood: pack.ticksPerFood,
        capacityPerMember: pack.foodPerMember * (mission.transport?.phase === 'embarked' ? 2 : 1),
        testCapacity: pack.testCapacity === true,
        activeTicksRemaining, returnTicksReserved,
        explorationTicksRemaining: Math.max(0, activeTicksRemaining - returnTicksReserved),
        unopenedFood: Object.values(pack.members).reduce((sum, p) => sum + p.food, 0),
        consumedFood: Object.values(pack.members).reduce((sum, p) => sum + p.consumed, 0),
        discardedFood: Object.values(pack.members).reduce((sum, p) => sum + p.discarded, 0),
        lostFood: Object.values(pack.members).reduce((sum, p) => sum + p.lost, 0) };
}
function inspectReturnReason(state: SimulationState, mission: SpatialMission) {
    if (mission.status !== 'Returning') return null;
    if (mission.outcome === 'Cancelled') return 'recalled';
    for (let index = state.events.length - 1; index >= 0; index--) {
        const event = state.events[index];
        const details = event.details;
        if (event.type === 'ExploreAreaReturnStarted' && details?.missionId === mission.id)
            return typeof details.reason === 'string' ? details.reason : null;
    }
    return null;
}
export function inspectSpatialExpeditions(state: SimulationState) {
    return {
        enabled: !!state.discovery && !!state.world,
        missions: Object.values(state.world?.spatial?.missions ?? {}).map(mission => ({
            id: mission.id, groupId: mission.groupId, groupName: mission.groupName,
            transport: mission.transport ? { phase: mission.transport.phase, shipId: mission.transport.shipId,
                speedMultiplier: mission.transport.phase === 'embarked' ? 2 : 1,
                foodCapacityMultiplier: mission.transport.phase === 'embarked' ? 2 : 1,
                cargoCapacityMultiplier: mission.transport.phase === 'embarked' ? 2 : 1 } : null,
            target: { ...mission.target }, memberIds: [...mission.memberIds],
            status: mission.status, outcome: mission.outcome, foodCost: mission.foodCost,
            returnReason: inspectReturnReason(state, mission),
            departedAt: mission.departedAt, returnedAt: mission.returnedAt,
            position: spatialMissionPosition(mission), supplies: inspectSupplies(state, mission),
            missionType: mission.task?.type ?? null,
            result: mission.status === 'Returned' ? structuredClone(mission.task?.result ?? null) : null,
        }))
    };
}
export function finish(state: SimulationState, mission: SpatialMission, outcome: SpatialMission['outcome']) {
    const prepared = mission.status === 'Prepared';
    releaseLongship(state, mission);
    settleProvisions(state, mission, outcome !== 'Lost');
    mission.status = 'Returned'; mission.outcome = outcome; mission.returnedAt = absoluteTick(state); mission.updatedAt = absoluteTick(state);
    if (mission.task) { completeIslandMission(state, mission); return; }
    state.events.push({
        id: `event-${state.events.length + 1}`, time: { ...state.time },
        type: prepared ? 'ExploreAreaCancelled' : 'ExploreAreaReturned', details: eventFacts(state, {
            missionId: mission.id,
            groupName: mission.groupName, outcome, participants: [...mission.memberIds],
            survivorIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter === null),
            casualtyIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter !== null)
        })
    });
}
function strand(state: SimulationState, mission: SpatialMission, reason: string) {
    settleProvisions(state, mission, false);
    mission.status = 'Stranded'; mission.updatedAt = absoluteTick(state);
    recordSpatial(state, 'ExploreAreaStranded', mission, { reason });
}
function modeStepPassable(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const speed = mission.task?.speed ?? state.world!.spatial!.policy.metresPerTick;
    const nav = context.world.navigation, surface = createBlueprintSurface(context.world);
    for (const id of mission.memberIds.filter(id => state.personas[id]?.deathWinter === null)) {
        const route = mission.memberRoutes![id], total = routeLength(route);
        let progress = mission.travelled;
        let advance = mission.status === 'Traveling' ? speed : 0;
        if (mission.status === 'Returning') {
            progress = mission.homeOrigins ? (mission.returnFrom ?? mission.distance) - mission.travelled : mission.travelled;
            advance = mission.homeOrigins ? speed : -speed;
        }
        const fromDistance = Math.max(0, Math.min(total, progress));
        const toDistance = Math.max(0, Math.min(total, progress + advance));
        // Check every crossed route edge rather than a chord cutting across an accepted corner.
        const low = Math.min(fromDistance, toDistance), high = Math.max(fromDistance, toDistance);
        let traversed = 0;
        for (let edge = 1; edge < route.length; edge++) {
            const a = route[edge - 1], b = route[edge], edgeLength = Math.hypot(b.x - a.x, b.z - a.z);
            const edgeStart = traversed;
            traversed += edgeLength;
            if (traversed < low) continue;
            if (edgeStart > high) break;
            const start = edgeLength ? Math.max(0, (low - edgeStart) / edgeLength) : 0;
            const end = edgeLength ? Math.min(1, (high - edgeStart) / edgeLength) : 0;
            const from = { x: a.x + (b.x - a.x) * start, z: a.z + (b.z - a.z) * start };
            const to = { x: a.x + (b.x - a.x) * end, z: a.z + (b.z - a.z) * end };
            const length = Math.hypot(to.x - from.x, to.z - from.z), samples = Math.max(1, Math.ceil(length));
            let previous = surface.surfaceHeightAt(from.x, from.z);
            for (let step = 1; step <= samples; step++) {
                const x = from.x + (to.x - from.x) * step / samples, z = from.z + (to.z - from.z) * step / samples;
                const col = Math.round((x - nav.bounds.minX) / nav.spacing), row = Math.round((z - nav.bounds.minZ) / nav.spacing);
                const height = surface.surfaceHeightAt(x, z);
                if (col < 0 || row < 0 || col >= nav.columns || row >= nav.rows || !nav.cells[row * nav.columns + col] ||
                    height <= context.world.waterLevel + .25 || length > 0 && Math.abs(height - previous) > .65 * length / samples)
                    return false;
                previous = height;
            }
        }
    }
    return true;
}
/** Bound the next active tick by actual known return geometry and carried endurance. */
function prepareModeTick(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const living = mission.memberIds.filter(id => state.personas[id]?.deathWinter === null);
    const speed = state.world!.spatial!.policy.metresPerTick;
    const beginReturn = (reason: string) => {
        beginRedirectedReturn(mission, Object.fromEntries(mission.memberIds.map(id => [id, modeReturnTrail(mission, id)])));
        recordSpatial(state, 'ExploreAreaReturnStarted', mission, { reason });
        if (!mission.distance) { finish(state, mission, 'Completed'); return false; }
        return true;
    };
    if (mission.status !== 'Returning') {
        const needsReturn = living.some(id => supplyEndurance(mission, id) <=
            Math.ceil(routeLength(modeReturnTrail(mission, id)) / speed) + 2);
        if (needsReturn && !beginReturn('low-supplies')) return false;
    }
    if (!modeStepPassable(state, mission, context)) {
        if (mission.status === 'Returning') { strand(state, mission, 'The confirmed return route is blocked.'); return false; }
        if (!beginReturn('outward-route-blocked')) return false;
        if (!modeStepPassable(state, mission, context)) {
            strand(state, mission, 'No safe physical return from the reached position.'); return false;
        }
    }
    if (living.some(id => supplyEndurance(mission, id) <= 0)) {
        strand(state, mission, 'Carried supplies are exhausted before homecoming.'); return false;
    }
    return true;
}
export function stepSpatialExpeditions(state: SimulationState, context?: PhysicalExpeditionContext) {
    const spatial = state.world?.spatial;
    const remaining = Object.values(spatial?.missions ?? {}).filter(m => m.status !== 'Returned');
    const active = remaining.filter(m => m.status !== 'Stranded');
    if (!active.length) return remaining;
    const bound = requireContext(state, context), now = absoluteTick(state);
    let observe = false;
    for (const mission of active) {
        const previous = mission.travelled, previousStatus = mission.status;
        let status = mission.status;
        if (!mission.memberIds.some(id => state.personas[id]?.deathWinter === null)) {
            finish(state, mission, 'Lost'); observe = true; continue;
        }
        if (status === 'Prepared') { mission.updatedAt = now; continue; }
        if (mission.transport?.phase === 'embarked') {
            observe = stepLongship(state, mission, bound) || observe;
            continue;
        }
        if (mission.task && !modeStepPassable(state, mission, bound)) {
            if (mission.status === 'Returning') {
                strand(state, mission, 'The confirmed return route is blocked.');
                observe = true; continue;
            }
            mission.outcome = 'Cancelled';
            beginRedirectedReturn(mission, Object.fromEntries(mission.memberIds.map(id => [id, modeReturnTrail(mission, id)])));
            if (!mission.distance) { finish(state, mission, 'Cancelled'); observe = true; continue; }
            if (!modeStepPassable(state, mission, bound)) {
                strand(state, mission, 'No safe physical return from the reached position.');
                observe = true; continue;
            }
            status = mission.status;
        }
        if (mission.provisions) {
            if (!prepareModeTick(state, mission, bound)) { observe = true; continue; }
            status = mission.status;
            consumeCarriedFood(state, mission);
        }
        if (status === 'Traveling') {
            mission.travelled = Math.min(mission.distance, mission.travelled + (mission.task?.speed ?? spatial!.policy.metresPerTick));
            if (mission.travelled === mission.distance) {
                mission.status = 'Exploring'; mission.exploringUntil = mission.task?.operateUntil ?? (mission.provisions ? null : now + spatial!.policy.exploringTicks);
                if (mission.transport?.phase === 'boarding') embarkReachedGroup(state, mission, bound);
            }
        } else if (!mission.provisions && status === 'Exploring' && now >= mission.exploringUntil!) {
            if (mission.task) observeIslandMission(state, mission, bound);
            if (mission.homeOrigins) {
                beginRedirectedReturn(mission);
                if (!mission.distance) finish(state, mission, 'Completed');
            } else { mission.returnFrom = mission.travelled; mission.status = 'Returning'; }
        } else if (status === 'Returning') {
            mission.travelled = Math.max(0, mission.travelled - (mission.task?.speed ?? spatial!.policy.metresPerTick));
            if (!mission.travelled || mission.provisions && mission.memberIds.filter(id => state.personas[id]?.deathWinter === null)
                .every(id => !spatialMemberPosition(mission, id).moving)) finish(state, mission, mission.outcome ?? 'Completed');
        }
        mission.updatedAt = now;
        // At most one canonical visibility refresh per tick, at confirmed 8 m progress intervals.
        observe ||= previousStatus !== mission.status || Math.floor(previous / 8) !== Math.floor(mission.travelled / 8);
    }
    if (observe) refreshSpatialObservations(state, bound);
    return remaining;
}
function refreshSpatialObservations(state: SimulationState, context: PhysicalExpeditionContext) {
    const observations = [{
        id: 'founding-settlement', kind: 'settlement' as const,
        ...context.world.settlement.center
    }];
    if (context.world.settlement.harbor) observations.push({
        id: 'founding-landing',
        kind: 'settlement', ...context.world.settlement.harbor
    });
    const parties = Object.values(state.world!.spatial!.missions).filter(m => m.status !== 'Returned' && m.status !== 'Prepared')
        .flatMap(mission => mission.memberRoutes ? mission.memberIds.filter(id => state.personas[id]?.deathWinter === null)
            .map(id => ({ id: mission.id + ':' + id, kind: 'expedition' as const, ...spatialMemberPosition(mission, id) })) :
            [{ id: mission.id, kind: 'expedition' as const, ...spatialMissionPosition(mission) }]);
    const unique = parties.filter((p, i) => parties.findIndex(q => q.x === p.x && q.z === p.z) === i);
    state.discovery = commitClanObservation(state.discovery!, context.world, context.worldId,
        state.clan.id, [...observations, ...unique], absoluteTick(state));
    recordIslandSightings(state, context, unique);
}
export function requireSpatialAdvance(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (Object.values(state.world?.spatial?.missions ?? {}).some(m => m.status !== 'Returned'))
        requireContext(state, context);
}
export function validateSpatialExpeditions(state: SimulationState) {
    validateLongshipState(state);
    const spatial = state.world?.spatial;
    if (!spatial) return;
    const fail = () => { throw new Error('Invalid spatial expedition state.'); };
    if (![1, 2, 3].includes(spatial.version) || !state.discovery || spatial.worldId !== state.discovery.worldId ||
        !spatial.policy || !spatial.missions || Array.isArray(spatial.missions)) fail();
    const policy = spatial.policy;
    if (!Number.isFinite(policy.metresPerTick) || policy.metresPerTick < .1 || policy.metresPerTick > 8 ||
        !Number.isSafeInteger(policy.exploringTicks) || policy.exploringTicks < 1 || policy.exploringTicks > 1000 ||
        !Number.isSafeInteger(policy.foodIntervalTicks) || policy.foodIntervalTicks < 1 || policy.foodIntervalTicks > 1000) fail();
    const bounds = state.discovery!.grid.bounds, now = absoluteTick(state), away = new Set<string>();
    const finitePoint = (p: Point2) => p && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= bounds.minX && p.x < bounds.maxX && p.z >= bounds.minZ && p.z < bounds.maxZ;
    const validateMemberRoute = (route: Point2[], mode = false, eightWay = false) => {
        if (!Array.isArray(route) || route.length < 2 || route.length > 40002 || !route.every(finitePoint) ||
            Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z) > 24) fail();
        if (mode) {
            for (let i = 1; i < route.length; i++) {
                const dx = Math.abs(route[i].x - route[i - 1].x), dz = Math.abs(route[i].z - route[i - 1].z);
                if (dx + dz > 24 || !eightWay && dx > 0 && dz > 0 && i !== 1 && i !== route.length - 1 ||
                    dx + dz === 0 && route.length !== 2) fail();
            }
            return;
        }
        let spacing: number | undefined;
        for (let i = 2; i < route.length; i++) {
            const dx = Math.abs(route[i].x - route[i - 1].x), dz = Math.abs(route[i].z - route[i - 1].z);
            spacing ??= dx + dz;
            if (dx > 0 && dz > 0 || dx + dz <= 0 || Math.abs(dx + dz - spacing) > 1e-6) fail();
        }
    };
    let active = 0, observers = 0;
    for (const [id, mission] of Object.entries(spatial.missions)) {
        if (mission.task) validateIslandMission(state, mission);
        const group = state.world!.groups[mission.groupId];
        if (mission.routeMode !== undefined &&
            (mission.routeMode !== 'eight-way-v1' || !mission.provisions && !mission.task)) fail();
        if (mission.id !== id || !id.startsWith('explore-') || (!group && !(mission.status === 'Returned' && state.world!.groupArchive?.groups[mission.groupId])) || !mission.groupName?.trim() ||
            !Array.isArray(mission.memberIds) || !mission.memberIds.length ||
            new Set(mission.memberIds).size !== mission.memberIds.length ||
            mission.memberIds.some(member => !state.personas[member]) || !finitePoint(mission.target) ||
            !Array.isArray(mission.route) || mission.route.length < 2 || mission.route.length > 40001 ||
            !mission.route.every(finitePoint) || !Number.isFinite(mission.distance) || mission.distance < 0 ||
            mission.distance === 0 && !['Returned', 'Prepared'].includes(mission.status) &&
                !(mission.transport?.phase === 'embarked' && ['Exploring', 'Returning'].includes(mission.status)) &&
                !(mission.lastShipId && mission.status === 'Exploring') ||
            !Number.isFinite(mission.travelled) || mission.travelled < 0 || mission.travelled > mission.distance ||
            !['Prepared', 'Traveling', 'Exploring', 'Returning', 'Returned', 'Stranded'].includes(mission.status) ||
            ![null, 'Completed', 'Cancelled', 'Lost'].includes(mission.outcome) ||
            !Number.isSafeInteger(mission.departedAt) || mission.departedAt > now || mission.departedAt < 800000 ||
            !Number.isSafeInteger(mission.updatedAt) || mission.updatedAt > now || mission.updatedAt < mission.departedAt ||
            !Number.isSafeInteger(mission.foodCost) || mission.foodCost < 0 ||
            mission.exploringUntil !== null && (!Number.isSafeInteger(mission.exploringUntil) ||
                mission.exploringUntil < mission.departedAt)) fail();
        if (mission.provisions) {
            const pack = mission.provisions;
            if (spatial.version < 2 || ![1, 2].includes(pack.version) ||
                pack.testCapacity !== undefined && pack.testCapacity !== true ||
                (pack.testCapacity ? !Number.isSafeInteger(pack.foodPerMember) || pack.foodPerMember < 1 ||
                    pack.foodPerMember > maximumTestExpeditionFoodPerMember :
                    pack.foodPerMember !== (pack.version === 1 ? 2 : defaultExpeditionFoodPerMember)) ||
                pack.ticksPerFood !== expeditionTicksPerFood ||
                !pack.members || Object.keys(pack.members).length !== mission.memberIds.length ||
                mission.foodCost !== pack.foodPerMember * mission.memberIds.length +
                    Object.values(pack.members).reduce((sum, supply) => sum + (supply.loaded ?? 0), 0)) fail();
            for (const member of mission.memberIds) {
                const supply = pack.members[member];
                if (supply?.loaded !== undefined && (!mission.lastShipId || !Number.isSafeInteger(supply.loaded) ||
                    supply.loaded < 0 || supply.loaded > 1000000)) fail();
                if (!supply || [supply.food, supply.consumed, supply.discarded, supply.lost].some(n =>
                    !Number.isSafeInteger(n) || n < 0 || n > pack.foodPerMember + (supply.loaded ?? 0)) ||
                    supply.food > pack.foodPerMember * 2 ||
                    supply.food + supply.consumed + supply.discarded + supply.lost !== pack.foodPerMember + (supply.loaded ?? 0) ||
                    !Number.isSafeInteger(supply.rationTicks) || supply.rationTicks < 0 || supply.rationTicks > pack.ticksPerFood ||
                    supply.rationTicks > 0 && supply.consumed === 0) fail();
            }
            if (mission.distance > 0 && (!mission.memberRoutes || !mission.homeOrigins || !mission.returnRoutes)) fail();
            if ((mission.status === 'Returned' || mission.status === 'Stranded') &&
                Object.values(pack.members).some(p => p.food || p.rationTicks)) fail();
            if (mission.status === 'Prepared' && (mission.distance !== 0 || mission.travelled !== 0 ||
                mission.memberRoutes || Object.values(pack.members).some(p => p.consumed || p.rationTicks))) fail();
        } else if (mission.status === 'Prepared' || mission.status === 'Stranded' && !mission.task) fail();
        if (mission.memberRoutes) {
            if (Object.keys(mission.memberRoutes).length !== mission.memberIds.length ||
                mission.memberIds.some(id => !Object.hasOwn(mission.memberRoutes!, id)) ||
                mission.returnFrom !== undefined && (!Number.isFinite(mission.returnFrom) ||
                    mission.returnFrom < mission.travelled || mission.returnFrom > mission.distance)) fail();
            for (const route of Object.values(mission.memberRoutes)) {
                validateMemberRoute(route, !!(mission.provisions || mission.task), mission.routeMode === 'eight-way-v1');
                if (routeLength(route) > mission.distance + 1e-6) fail();
            }
            if (!Object.values(mission.memberRoutes).some(route =>
                JSON.stringify(route) === JSON.stringify(mission.route))) fail();
            if (Math.abs(Math.max(...Object.values(mission.memberRoutes).map(routeLength)) - mission.distance) > 1e-6) fail();
            if (mission.status === 'Returning' && mission.returnFrom === undefined) fail();
        }
        if ((mission.homeOrigins || mission.returnRoutes) && mission.transport?.phase !== 'embarked') {
            if (!mission.homeOrigins || !mission.returnRoutes || !mission.memberRoutes ||
                Object.keys(mission.homeOrigins).length !== mission.memberIds.length ||
                Object.keys(mission.returnRoutes).length !== mission.memberIds.length) fail();
            for (const member of mission.memberIds) {
                const home = mission.homeOrigins![member], route = mission.returnRoutes![member];
                validateMemberRoute(route, !!(mission.provisions || mission.task), mission.routeMode === 'eight-way-v1');
                if (!finitePoint(home) || Math.hypot(route.at(-1)!.x - home.x, route.at(-1)!.z - home.z) > 12) fail();
                if (mission.status === 'Returning' && JSON.stringify(route) !== JSON.stringify(mission.memberRoutes![member])) fail();
                if (!mission.provisions && (mission.status === 'Traveling' || mission.status === 'Exploring')) {
                    if (Math.hypot(route[0].x - mission.target.x, route[0].z - mission.target.z) > 1e-6) fail();
                }
            }
        }
        const stepLength = Math.hypot(mission.route[1].x - mission.route[0].x,
            mission.route[1].z - mission.route[0].z);
        for (let i = mission.provisions || mission.task ? mission.route.length : mission.memberRoutes ? 2 : 1; i < mission.route.length; i++) {
            const dx = Math.abs(mission.route[i].x - mission.route[i - 1].x);
            const dz = Math.abs(mission.route[i].z - mission.route[i - 1].z);
            if (dx > 0 && dz > 0 || dx + dz <= 0 && mission.route.length !== 2 || !mission.memberRoutes && Math.abs(dx + dz - stepLength) > 1e-6) fail();
        }
        const length = mission.route.slice(1).reduce((sum, point, i) => sum +
            Math.hypot(point.x - mission.route[i].x, point.z - mission.route[i].z), 0);
        if (Math.abs(length - mission.distance) > 1e-6) fail();
        if (mission.status === 'Returned') {
            if (!mission.outcome || !Number.isSafeInteger(mission.returnedAt) ||
                mission.returnedAt! > now || mission.returnedAt! < mission.departedAt) fail();
        } else {
            active++;
            observers += mission.memberRoutes ? mission.memberIds.length : 1;
            if (mission.returnedAt !== null || mission.memberIds.join() !== group.memberIds.join() ||
                Object.values(state.world!.missions).some(m => m.status === 'Away' && m.groupId === group.id)) fail();
            for (const member of mission.memberIds) {
                if (away.has(member)) fail(); away.add(member);
            }
        }
    }
    if (active > 16 || observers > 62) fail();
}
/** Reattach regenerated geography on import; never serialize a second heightfield in Core. */
export function assertSpatialWorld(state: SimulationState, context: PhysicalExpeditionContext) {
    if (state.world?.island) assertIslandClanWorld(state, context.world, context.worldId);
    if (state.discovery) assertDiscoveryWorld(state.discovery, context.world, context.worldId);
    assertLongshipWorld(state, context);
    if (!state.world?.spatial) return;
    requireContext(state, context);
    const nav = context.world.navigation, surface = createBlueprintSurface(context.world);
    for (const mission of Object.values(state.world.spatial.missions)) {
        if (mission.transport?.phase === 'embarked') continue;
        if (mission.task) {
            const ref = mission.task.target;
            const cellId = `area-${Math.round((ref.position.z - nav.bounds.minZ) / nav.spacing) * nav.columns +
                Math.round((ref.position.x - nav.bounds.minX) / nav.spacing)}`;
            const site = context.world.rivalSite;
            if (ref.kind === 'area' ? ref.id !== cellId : !site || ref.id !== site.candidateId ||
                Math.hypot(ref.position.x - site.center.x, ref.position.z - site.center.z) >
                    Math.max(maximumTargetCorrection, nav.spacing / Math.SQRT2) + 1e-6)
                throw new Error('Invalid physical mission target.');
        }
        if (mission.provisions && mission.distance === 0 &&
            (mission.status === 'Prepared' || mission.status === 'Returned')) continue;
        if (mission.status === 'Stranded') {
            for (const member of mission.memberIds) {
                const point = spatialMemberPosition(mission, member);
                if (surface.surfaceHeightAt(point.x, point.z) <= context.world.waterLevel + .25)
                    throw new Error('Invalid stranded expedition position.');
            }
            continue;
        }
        const routes = mission.memberRoutes ? Object.entries(mission.memberRoutes) : [['', mission.route] as const];
        for (const [member, route] of [...routes, ...Object.entries(mission.returnRoutes ?? {})]) {
            const start = route[0], end = route.at(-1)!;
            const homeward = mission.homeOrigins && (mission.returnFrom !== undefined || route === mission.returnRoutes?.[member]);
            const destination = homeward ? mission.homeOrigins![member] : mission.target;
            const tolerance = homeward ? mission.provisions || mission.task ? 1e-6 : Math.max(12, nav.spacing) : nav.spacing;
            if ((!mission.memberRoutes && Math.hypot(start.x - context.world.settlement.center.x,
                start.z - context.world.settlement.center.z) > Math.max(18, nav.spacing * 2)) ||
                Math.hypot(end.x - destination.x, end.z - destination.z) > tolerance)
                throw new Error('Invalid spatial expedition route endpoints.');
            for (let i = 0; i < route.length; i++) {
                const p = route[i], col = (p.x - nav.bounds.minX) / nav.spacing, row = (p.z - nav.bounds.minZ) / nav.spacing;
                const exactOrigin = !!mission.memberRoutes && (i === 0 || !!(mission.provisions || mission.task) && i === route.length - 1 && homeward);
                const eightWay = mission.routeMode === 'eight-way-v1';
                // A redirect may retain a partial diagonal or departure connector inside the return trail.
                // Its physical segments are checked below instead of assuming cardinal grid vertices.
                const aligned = eightWay || (mission.provisions || mission.task ?
                    Number.isInteger(col) || Number.isInteger(row) : Number.isInteger(col) && Number.isInteger(row));
                if ((!exactOrigin && (!aligned || col < 0 || row < 0 ||
                    col >= nav.columns || row >= nav.rows || !nav.cells[Math.round(row) * nav.columns + Math.round(col)])) ||
                    surface.surfaceHeightAt(p.x, p.z) <= context.world.waterLevel + .25)
                    throw new Error('Invalid spatial expedition walkability.');
                if (!mission.provisions && !mission.task && i > (mission.memberRoutes ? 1 : 0) && Math.abs(Math.abs(p.x - route[i - 1].x) +
                    Math.abs(p.z - route[i - 1].z) - nav.spacing) > 1e-6)
                    throw new Error('Invalid spatial expedition route segment.');
                if (!i) continue;
                const previous = route[i - 1], length = Math.hypot(p.x - previous.x, p.z - previous.z);
                const samples = Math.max(1, Math.ceil(length));
                let height = surface.surfaceHeightAt(previous.x, previous.z);
                let previousCol = Math.round((previous.x - nav.bounds.minX) / nav.spacing);
                let previousRow = Math.round((previous.z - nav.bounds.minZ) / nav.spacing);
                for (let step = 1; step <= samples; step++) {
                    const x = previous.x + (p.x - previous.x) * step / samples;
                    const z = previous.z + (p.z - previous.z) * step / samples;
                    const next = surface.surfaceHeightAt(x, z);
                    if (eightWay) {
                        const sampleCol = Math.round((x - nav.bounds.minX) / nav.spacing);
                        const sampleRow = Math.round((z - nav.bounds.minZ) / nav.spacing);
                        if (sampleCol < 0 || sampleRow < 0 || sampleCol >= nav.columns || sampleRow >= nav.rows ||
                            !nav.cells[sampleRow * nav.columns + sampleCol] ||
                            sampleCol !== previousCol && sampleRow !== previousRow &&
                            (!nav.cells[previousRow * nav.columns + sampleCol] || !nav.cells[sampleRow * nav.columns + previousCol]))
                            throw new Error('Invalid spatial expedition diagonal walkability.');
                        previousCol = sampleCol;
                        previousRow = sampleRow;
                    }
                    if (next <= context.world.waterLevel + .25 || Math.abs(next - height) > .65 * length / samples)
                        throw new Error('Invalid spatial expedition route slope.');
                    height = next;
                }
            }
        }
    }
}
