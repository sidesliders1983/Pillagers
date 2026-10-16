import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { commitClanObservation, assertDiscoveryWorld } from './ClanDiscovery';
import type { SimulationState } from './SimulationCore';
import { absoluteTick, expeditionEligible, groupMission } from './WorldExpeditions';
import { eventFacts } from './EventFacts';

export interface PhysicalExpeditionContext {
    exclusions?: readonly Bounds2[];
    worldId: string;
    world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'navigation' | 'settlement'>;
}
export interface ExplorePolicy {
    metresPerTick: number;
    exploringTicks: number;
    foodIntervalTicks: number;
}
export const prototypeExplorePolicy: ExplorePolicy = {
    metresPerTick: 2, exploringTicks: 25, foodIntervalTicks: 125,
};
export interface SpatialMission {
    id: string;
    groupId: string;
    groupName: string;
    memberIds: string[];
    target: Point2;
    /** New missions retain each member's dispatch-time origin and safe route. */
    memberRoutes?: Record<string, Point2[]>;
    returnFrom?: number;
    route: Point2[];
    distance: number;
    travelled: number;
    departedAt: number;
    updatedAt: number;
    exploringUntil: number | null;
    returnedAt: number | null;
    foodCost: number;
    status: 'Traveling' | 'Exploring' | 'Returning' | 'Returned';
    outcome: 'Completed' | 'Cancelled' | 'Lost' | null;
}
export interface SpatialExpeditions {
    version: 1;
    worldId: string;
    policy: ExplorePolicy;
    missions: Record<string, SpatialMission>;
}
export type SpatialExpeditionCommand =
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

/** Bounded cardinal search on the existing walkability grid. No new terrain classification. */
function planRoute(context: PhysicalExpeditionContext, target: Point2, origin?: Point2): Point2[] {
    const { world } = context, nav = world.navigation, surface = createBlueprintSurface(world);
    const bounds = nav.bounds;
    const inside = (p: Point2) => p && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= bounds.minX && p.x < bounds.maxX && p.z >= bounds.minZ && p.z < bounds.maxZ;
    if (!inside(target)) throw new Error('Choose a reachable land destination on this island.');
    const point = (i: number) => ({
        x: bounds.minX + i % nav.columns * nav.spacing,
        z: bounds.minZ + Math.floor(i / nav.columns) * nav.spacing
    });
    const index = (p: Point2) => Math.round((p.z - bounds.minZ) / nav.spacing) * nav.columns +
        Math.round((p.x - bounds.minX) / nav.spacing);
    const free = (p: Point2) => !context.exclusions?.some(b =>
        p.x >= b.minX - .4 && p.x <= b.maxX + .4 && p.z >= b.minZ - .4 && p.z <= b.maxZ + .4);
    const safe = (i: number) => i >= 0 && i < nav.cells.length && nav.cells[i] && inside(point(i)) &&
        free(point(i)) && surface.surfaceHeightAt(point(i).x, point(i).z) > world.waterLevel + .25;
    const end = index(target);
    if (!safe(end) || surface.surfaceHeightAt(target.x, target.z) <= world.waterLevel + .25)
        throw new Error('No reachable land route to that destination.');
    const home = origin ?? world.settlement.center;
    if (!inside(home)) throw new Error('Invalid expedition departure origin on this island.');
    const exits = context.exclusions?.filter(b => home.x >= b.minX - .4 && home.x <= b.maxX + .4 &&
        home.z >= b.minZ - .4 && home.z <= b.maxZ + .4) ?? [];
    const connectorSafe = (p: Point2) => {
        const length = Math.hypot(p.x - home.x, p.z - home.z), steps = Math.max(1, Math.ceil(length));
        let previous = surface.surfaceHeightAt(home.x, home.z);
        for (let i = 0; i <= steps; i++) {
            const q = { x: home.x + (p.x - home.x) * i / steps, z: home.z + (p.z - home.z) * i / steps };
            const height = surface.surfaceHeightAt(q.x, q.z);
            if (height <= world.waterLevel + .25 || i > 0 && Math.abs(height - previous) > .65 * length / steps ||
                context.exclusions?.some(b => !exits.includes(b) && q.x >= b.minX - .4 && q.x <= b.maxX + .4 &&
                    q.z >= b.minZ - .4 && q.z <= b.maxZ + .4)) return false;
            previous = height;
        }
        return true;
    };
    let start = index(home);
    if (!safe(start) || origin && !connectorSafe(point(start))) {
        const alternatives = [];
        const reach = Math.max(1, Math.ceil(12 / nav.spacing));
        for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
            const p = { x: home.x + dx * nav.spacing, z: home.z + dz * nav.spacing };
            if (inside(p) && safe(index(p)) && (!origin || connectorSafe(point(index(p))))) alternatives.push(index(p));
        }
        alternatives.sort((a, b) => Math.hypot(point(a).x - home.x, point(a).z - home.z) -
            Math.hypot(point(b).x - home.x, point(b).z - home.z) || a - b);
        if (!alternatives.length) throw new Error('No accessible settlement departure point.');
        start = alternatives[0];
    }
    // A deterministic heap keeps the 40,000-node search bounded on an 800 m island.
    const parents = new Int32Array(nav.cells.length).fill(-1);
    const costs = new Float64Array(nav.cells.length).fill(Infinity);
    const heap: { id: number; score: number; cost: number }[] = [];
    const less = (a: typeof heap[number], b: typeof heap[number]) =>
        a.score < b.score || a.score === b.score && a.id < b.id;
    const push = (entry: typeof heap[number]) => {
        heap.push(entry);
        let i = heap.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (!less(heap[i], heap[parent])) break;
            [heap[i], heap[parent]] = [heap[parent], heap[i]]; i = parent;
        }
    };
    const pop = () => {
        const first = heap[0], last = heap.pop()!;
        if (heap.length) {
            heap[0] = last;
            for (let i = 0; ;) {
                let child = i * 2 + 1;
                if (child >= heap.length) break;
                if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
                if (!less(heap[child], heap[i])) break;
                [heap[i], heap[child]] = [heap[child], heap[i]]; i = child;
            }
        }
        return first;
    };
    const estimate = (i: number) => Math.abs(i % nav.columns - end % nav.columns) +
        Math.abs(Math.floor(i / nav.columns) - Math.floor(end / nav.columns));
    costs[start] = 0; parents[start] = start; push({ id: start, score: estimate(start), cost: 0 });
    let expanded = 0;
    while (heap.length && expanded++ < 40000) {
        const current = pop(), i = current.id;
        if (current.cost !== costs[i]) continue;
        if (i === end) break;
        const col = i % nav.columns, row = Math.floor(i / nav.columns);
        for (const next of [col > 0 ? i - 1 : -1, col < nav.columns - 1 ? i + 1 : -1,
        row > 0 ? i - nav.columns : -1, row < nav.rows - 1 ? i + nav.columns : -1]) {
            if (!safe(next) || costs[next] <= costs[i] + 1) continue;
            const a = point(i), b = point(next);
            let passable = true;
            const samples = Math.max(1, Math.ceil(nav.spacing));
            let previous = surface.surfaceHeightAt(a.x, a.z);
            for (let step = 1; step <= samples; step++) {
                const h = surface.surfaceHeightAt(a.x + (b.x - a.x) * step / samples,
                    a.z + (b.z - a.z) * step / samples);
                if (h <= world.waterLevel + .25 || Math.abs(h - previous) / (nav.spacing / samples) > .65) {
                    passable = false; break;
                }
                previous = h;
            }
            if (!passable) continue;
            costs[next] = costs[i] + 1; parents[next] = i;
            push({ id: next, cost: costs[next], score: costs[next] + estimate(next) });
        }
    }
    if (parents[end] < 0 || !Number.isFinite(costs[end]))
        throw new Error('No safe route found within the exploration search limit. Choose a nearer destination.');
    const route = [];
    for (let i = end; ; i = parents[i]) {
        route.push(point(i)); if (i === start) break;
    }
    if (route.length < 2) throw new Error('Choose a destination farther from the settlement.');
    route.reverse();
    if (origin && Math.hypot(route[0].x - origin.x, route[0].z - origin.z) > 1e-6)
        route.unshift({ ...origin });
    return route;
}
function prepareExplore(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    const bound = requireContext(state, context), group = state.world!.groups[groupId];
    if (!group || groupMission(state, groupId)) throw new Error('Choose a ready expedition group.');
    if (!group.memberIds.length || group.memberIds.some(id => !expeditionEligible(state, id, groupId)))
        throw new Error('Group needs living eligible members without childcare.');
    if (origins && (group.memberIds.some(id => !origins[id] || !Number.isFinite(origins[id].x) || !Number.isFinite(origins[id].z)) || Object.keys(origins).length !== group.memberIds.length ||
        group.memberIds.some(id => !Object.hasOwn(origins, id))))
        throw new Error('Every expedition member needs an exact departure origin.');
    const memberRoutes = origins ? Object.fromEntries(group.memberIds.map(id =>
        [id, planRoute(bound, target, origins[id])])) : undefined;
    const routes = memberRoutes ? Object.values(memberRoutes) : [planRoute(bound, target)];
    const route = routes.reduce((longest, next) => routeLength(next) > routeLength(longest) ? next : longest);
    const distance = routeLength(route);
    const policy = state.world!.spatial?.policy ?? prototypeExplorePolicy;
    const plannedTicks = Math.ceil(distance / policy.metresPerTick) * 2 + policy.exploringTicks;
    const foodCost = Math.ceil(plannedTicks / policy.foodIntervalTicks) * group.memberIds.length;
    if (state.stocks.food < foodCost) throw new Error(`Explore Area needs ${foodCost} Food.`);
    return { bound, group, route, memberRoutes, distance, policy, plannedTicks, foodCost };
}
/** No route, terrain difficulty or hidden-site information is exposed by a proposal. */
export function exploreOffer(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    const offer = prepareExplore(state, groupId, target, context, origins);
    return {
        plannedTicks: offer.plannedTicks, foodCost: offer.foodCost,
        members: offer.group.memberIds.length, estimate: 'Planned round trip; conditions may change.'
    };
}
export function applySpatialCommand(state: SimulationState, command: SpatialExpeditionCommand,
    context?: PhysicalExpeditionContext) {
    if (command.type === 'CreateExplorationGroup' || command.type === 'SetExplorationMember') {
        requireContext(state, context);
        const groups = state.world!.groups;
        if (command.type === 'CreateExplorationGroup') {
            const number = Object.keys(groups).length + 1;
            const id = 'group-' + number;
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
        mission.returnFrom = mission.travelled;
        mission.status = 'Returning'; mission.outcome = 'Cancelled';
        if (!mission.travelled) { finish(state, mission, 'Cancelled'); refreshSpatialObservations(state, bound); }
        return;
    }
    if (Object.values(state.world?.spatial?.missions ?? {}).filter(m => m.status !== 'Returned').length >= 16)
        throw new Error('At most 16 groups can explore this island at once.');
    const offer = prepareExplore(state, command.groupId, command.target, context, command.origins);
    const participants = Object.values(state.world!.spatial?.missions ?? {})
        .filter(m => m.status !== 'Returned').reduce((sum, m) => sum + (m.memberRoutes ? m.memberIds.length : 1), 0);
    if (participants + (offer.memberRoutes ? offer.group.memberIds.length : 1) > 62)
        throw new Error('At most 62 residents can explore this island at once.');
    const spatial = state.world!.spatial ??= {
        version: 1, worldId: offer.bound.worldId,
        policy: { ...offer.policy }, missions: {}
    };
    const id = `explore-${Object.keys(spatial.missions).length + 1}`;
    spatial.missions[id] = {
        id, groupId: command.groupId, groupName: offer.group.name,
        memberIds: [...offer.group.memberIds], target: { ...command.target }, route: offer.route,
        ...(offer.memberRoutes ? { memberRoutes: offer.memberRoutes } : {}),
        distance: offer.distance, travelled: 0, departedAt: absoluteTick(state), updatedAt: absoluteTick(state),
        exploringUntil: null, returnedAt: null, foodCost: offer.foodCost, status: 'Traveling', outcome: null
    };
    state.stocks.food -= offer.foodCost;
    state.events.push({
        id: `event-${state.events.length + 1}`, time: { ...state.time },
        type: 'ExploreAreaDeparted', details: eventFacts(state, {
            groupName: offer.group.name,
            missionId: id, participants: [...offer.group.memberIds], foodCost: offer.foodCost
        })
    });
}
function routeLength(route: readonly Point2[]) {
    return route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.z - route[i].z), 0);
}
/** Every member follows its own confirmed route; shorter routes wait at the destination. */
export function spatialMemberPosition(mission: SpatialMission, personaId: string) {
    const route = mission.memberRoutes?.[personaId];
    if (!route) return {
        ...spatialMissionPosition(mission, mission.memberIds.indexOf(personaId) * 1.1),
        moving: mission.status === 'Traveling' || mission.status === 'Returning'
    };
    const distance = routeLength(route);
    const returning = mission.status === 'Returning' || mission.status === 'Returned';
    const from = mission.returnFrom ?? mission.distance;
    const travelled = returning ? Math.max(0, Math.min(distance, from) - (from - mission.travelled)) :
        Math.min(distance, mission.travelled);
    return {
        ...spatialMissionPosition({ ...mission, route, distance, travelled }),
        moving: mission.status === 'Traveling' && travelled < distance || mission.status === 'Returning' && travelled > 0
    };
}
/** Position comes only from saved route distance; animation never advances the mission. */
export function spatialMissionPosition(mission: SpatialMission, behind = 0) {
    let remaining = Math.max(0, Math.min(mission.distance, mission.travelled +
        (mission.status === 'Returning' ? behind : -behind)));
    for (let i = 1; i < mission.route.length; i++) {
        const a = mission.route[i - 1], b = mission.route[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (remaining <= length || i === mission.route.length - 1) {
            const ratio = length ? Math.min(1, remaining / length) : 0;
            const direction = mission.status === 'Returning' ? -1 : 1;
            return {
                x: a.x + (b.x - a.x) * ratio, z: a.z + (b.z - a.z) * ratio,
                rotation: Math.atan2((b.x - a.x) * direction, (b.z - a.z) * direction)
            };
        }
        remaining -= length;
    }
    return { ...mission.route[0], rotation: 0 };
}
export function inspectSpatialExpeditions(state: SimulationState) {
    return {
        enabled: !!state.discovery && !!state.world,
        missions: Object.values(state.world?.spatial?.missions ?? {}).map(mission => ({
            id: mission.id, groupId: mission.groupId, groupName: mission.groupName,
            target: { ...mission.target }, memberIds: [...mission.memberIds],
            status: mission.status, outcome: mission.outcome, foodCost: mission.foodCost,
            departedAt: mission.departedAt, returnedAt: mission.returnedAt,
            position: spatialMissionPosition(mission),
        }))
    };
}
function finish(state: SimulationState, mission: SpatialMission, outcome: SpatialMission['outcome']) {
    mission.status = 'Returned'; mission.outcome = outcome; mission.returnedAt = absoluteTick(state); mission.updatedAt = absoluteTick(state);
    state.events.push({
        id: `event-${state.events.length + 1}`, time: { ...state.time },
        type: 'ExploreAreaReturned', details: eventFacts(state, {
            missionId: mission.id,
            groupName: mission.groupName, outcome, participants: [...mission.memberIds],
            survivorIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter === null),
            casualtyIds: mission.memberIds.filter(id => state.personas[id]?.deathWinter !== null)
        })
    });
}
export function stepSpatialExpeditions(state: SimulationState, context?: PhysicalExpeditionContext) {
    const spatial = state.world?.spatial;
    const active = Object.values(spatial?.missions ?? {}).filter(m => m.status !== 'Returned');
    if (!active.length) return;
    const bound = requireContext(state, context), now = absoluteTick(state);
    let observe = false;
    for (const mission of active) {
        const previous = mission.travelled, status = mission.status;
        if (!mission.memberIds.some(id => state.personas[id]?.deathWinter === null)) {
            finish(state, mission, 'Lost'); observe = true; continue;
        }
        if (status === 'Traveling') {
            mission.travelled = Math.min(mission.distance, mission.travelled + spatial!.policy.metresPerTick);
            if (mission.travelled === mission.distance) {
                mission.status = 'Exploring'; mission.exploringUntil = now + spatial!.policy.exploringTicks;
            }
        } else if (status === 'Exploring' && now >= mission.exploringUntil!) {
            mission.returnFrom = mission.travelled;
            mission.status = 'Returning';
        } else if (status === 'Returning') {
            mission.travelled = Math.max(0, mission.travelled - spatial!.policy.metresPerTick);
            if (!mission.travelled) finish(state, mission, mission.outcome ?? 'Completed');
        }
        mission.updatedAt = now;
        // At most one canonical visibility refresh per tick, at confirmed 8 m progress intervals.
        observe ||= status !== mission.status || Math.floor(previous / 8) !== Math.floor(mission.travelled / 8);
    }
    if (observe) refreshSpatialObservations(state, bound);
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
    const parties = Object.values(state.world!.spatial!.missions).filter(m => m.status !== 'Returned')
        .flatMap(mission => mission.memberRoutes ? mission.memberIds.filter(id => state.personas[id]?.deathWinter === null)
            .map(id => ({ id: mission.id + ':' + id, kind: 'expedition' as const, ...spatialMemberPosition(mission, id) })) :
            [{ id: mission.id, kind: 'expedition' as const, ...spatialMissionPosition(mission) }]);
    const unique = parties.filter((p, i) => parties.findIndex(q => q.x === p.x && q.z === p.z) === i);
    state.discovery = commitClanObservation(state.discovery!, context.world, context.worldId,
        state.clan.id, [...observations, ...unique], absoluteTick(state));
}
export function requireSpatialAdvance(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (Object.values(state.world?.spatial?.missions ?? {}).some(m => m.status !== 'Returned'))
        requireContext(state, context);
}
export function validateSpatialExpeditions(state: SimulationState) {
    const spatial = state.world?.spatial;
    if (!spatial) return;
    const fail = () => { throw new Error('Invalid spatial expedition state.'); };
    if (spatial.version !== 1 || !state.discovery || spatial.worldId !== state.discovery.worldId ||
        !spatial.policy || !spatial.missions || Array.isArray(spatial.missions)) fail();
    const policy = spatial.policy;
    if (!Number.isFinite(policy.metresPerTick) || policy.metresPerTick < .1 || policy.metresPerTick > 8 ||
        !Number.isSafeInteger(policy.exploringTicks) || policy.exploringTicks < 1 || policy.exploringTicks > 1000 ||
        !Number.isSafeInteger(policy.foodIntervalTicks) || policy.foodIntervalTicks < 1 || policy.foodIntervalTicks > 1000) fail();
    const bounds = state.discovery!.grid.bounds, now = absoluteTick(state), away = new Set<string>();
    const finitePoint = (p: Point2) => p && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= bounds.minX && p.x < bounds.maxX && p.z >= bounds.minZ && p.z < bounds.maxZ;
    let active = 0, observers = 0;
    for (const [id, mission] of Object.entries(spatial.missions)) {
        const group = state.world!.groups[mission.groupId];
        if (mission.id !== id || !id.startsWith('explore-') || !group || !mission.groupName?.trim() ||
            !Array.isArray(mission.memberIds) || !mission.memberIds.length ||
            new Set(mission.memberIds).size !== mission.memberIds.length ||
            mission.memberIds.some(member => !state.personas[member]) || !finitePoint(mission.target) ||
            !Array.isArray(mission.route) || mission.route.length < 2 || mission.route.length > 40001 ||
            !mission.route.every(finitePoint) || !Number.isFinite(mission.distance) || mission.distance <= 0 ||
            !Number.isFinite(mission.travelled) || mission.travelled < 0 || mission.travelled > mission.distance ||
            !['Traveling', 'Exploring', 'Returning', 'Returned'].includes(mission.status) ||
            ![null, 'Completed', 'Cancelled', 'Lost'].includes(mission.outcome) ||
            !Number.isSafeInteger(mission.departedAt) || mission.departedAt > now || mission.departedAt < 800000 ||
            !Number.isSafeInteger(mission.updatedAt) || mission.updatedAt > now || mission.updatedAt < mission.departedAt ||
            !Number.isSafeInteger(mission.foodCost) || mission.foodCost < 0 ||
            mission.exploringUntil !== null && (!Number.isSafeInteger(mission.exploringUntil) ||
                mission.exploringUntil < mission.departedAt)) fail();
        if (mission.memberRoutes) {
            if (Object.keys(mission.memberRoutes).length !== mission.memberIds.length ||
                mission.memberIds.some(id => !Object.hasOwn(mission.memberRoutes!, id)) ||
                mission.returnFrom !== undefined && (!Number.isFinite(mission.returnFrom) ||
                    mission.returnFrom < mission.travelled || mission.returnFrom > mission.distance)) fail();
            for (const route of Object.values(mission.memberRoutes)) {
                if (!Array.isArray(route) || route.length < 2 || route.length > 40002 || !route.every(finitePoint) ||
                    routeLength(route) > mission.distance + 1e-6 ||
                    Math.hypot(route[1].x - route[0].x, route[1].z - route[0].z) > 24) fail();
                let spacing: number | undefined;
                for (let i = 2; i < route.length; i++) {
                    const dx = Math.abs(route[i].x - route[i - 1].x), dz = Math.abs(route[i].z - route[i - 1].z);
                    spacing ??= dx + dz;
                    if (dx > 0 && dz > 0 || dx + dz <= 0 || Math.abs(dx + dz - spacing) > 1e-6) fail();
                }
            }
            if (!Object.values(mission.memberRoutes).some(route =>
                JSON.stringify(route) === JSON.stringify(mission.route))) fail();
            if (Math.abs(Math.max(...Object.values(mission.memberRoutes).map(routeLength)) - mission.distance) > 1e-6) fail();
            if (mission.status === 'Returning' && mission.returnFrom === undefined) fail();
        }
        const stepLength = Math.hypot(mission.route[1].x - mission.route[0].x,
            mission.route[1].z - mission.route[0].z);
        for (let i = mission.memberRoutes ? 2 : 1; i < mission.route.length; i++) {
            const dx = Math.abs(mission.route[i].x - mission.route[i - 1].x);
            const dz = Math.abs(mission.route[i].z - mission.route[i - 1].z);
            if (dx > 0 && dz > 0 || dx + dz <= 0 || !mission.memberRoutes && Math.abs(dx + dz - stepLength) > 1e-6) fail();
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
    if (state.discovery) assertDiscoveryWorld(state.discovery, context.world, context.worldId);
    if (!state.world?.spatial) return;
    requireContext(state, context);
    const nav = context.world.navigation, surface = createBlueprintSurface(context.world);
    for (const mission of Object.values(state.world.spatial.missions)) {
        for (const route of mission.memberRoutes ? Object.values(mission.memberRoutes) : [mission.route]) {
            const start = route[0], end = route.at(-1)!;
            if ((!mission.memberRoutes && Math.hypot(start.x - context.world.settlement.center.x,
                start.z - context.world.settlement.center.z) > Math.max(18, nav.spacing * 2)) ||
                Math.hypot(end.x - mission.target.x, end.z - mission.target.z) > nav.spacing)
                throw new Error('Invalid spatial expedition route endpoints.');
            for (let i = 0; i < route.length; i++) {
                const p = route[i], col = (p.x - nav.bounds.minX) / nav.spacing, row = (p.z - nav.bounds.minZ) / nav.spacing;
                const exactOrigin = !!mission.memberRoutes && i === 0;
                if ((!exactOrigin && (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 ||
                    col >= nav.columns || row >= nav.rows || !nav.cells[row * nav.columns + col])) ||
                    surface.surfaceHeightAt(p.x, p.z) <= context.world.waterLevel + .25)
                    throw new Error('Invalid spatial expedition walkability.');
                if (i > (mission.memberRoutes ? 1 : 0) && Math.abs(Math.abs(p.x - route[i - 1].x) +
                    Math.abs(p.z - route[i - 1].z) - nav.spacing) > 1e-6)
                    throw new Error('Invalid spatial expedition route segment.');
                if (!i) continue;
                const previous = route[i - 1], length = Math.hypot(p.x - previous.x, p.z - previous.z);
                const samples = Math.max(1, Math.ceil(length));
                let height = surface.surfaceHeightAt(previous.x, previous.z);
                for (let step = 1; step <= samples; step++) {
                    const next = surface.surfaceHeightAt(previous.x + (p.x - previous.x) * step / samples,
                        previous.z + (p.z - previous.z) * step / samples);
                    if (next <= context.world.waterLevel + .25 || Math.abs(next - height) > .65 * length / samples)
                        throw new Error('Invalid spatial expedition route slope.');
                    height = next;
                }
            }
        }
    }
}
