import type { SimulationState } from './SimulationCore';
import type { Point2 } from '../world-generation/WorldBlueprint';
import { assertDiscoveryWorld } from './ClanDiscovery';
import { absoluteTick } from './WorldExpeditions';
import {
    applySpatialCommand, consumeCarriedFood, finish, joinRoutes, modeReturnTrail,
    planRoute, recordSpatial, routeLength, spatialGroupMission, spatialMemberPosition,
    spatialMissionPosition, splitRoute, supplyEndurance,
    type PhysicalExpeditionContext, type SpatialMission
} from './SpatialExpeditions';
import { longshipPolicy, navigableSea, planSailingRoute, validSeaSegment } from './LongshipNavigation';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';

export interface LongshipPose extends Point2 { rotation: number }
export interface LongshipLocation extends LongshipPose { version: 1; worldId: string; groupId: string | null }
export type ExpeditionTransport = {
    version: 1; phase: 'boarding'; shipId: string; shore: Point2; shipPosition: LongshipPose;
} | {
    version: 1; phase: 'embarked'; shipId: string; homeSea: LongshipPose;
    homeLandRoutes: Record<string, Point2[]>; seaReturnRoute: Point2[];
};
export type LongshipCommand =
    { type: 'BoardLongship'; groupId: string; shipId: string; origins?: Record<string, Point2> } |
    { type: 'DisembarkLongship'; groupId: string } |
    { type: 'LoadLongshipFood'; groupId: string };

function requireWorld(state: SimulationState, context?: PhysicalExpeditionContext) {
    if (!context || !state.discovery || !state.world) throw new Error('Longship transport requires the bound island.');
    assertDiscoveryWorld(state.discovery, context.world, context.worldId);
    return context;
}
export function longshipPose(state: SimulationState, shipId: string, context: PhysicalExpeditionContext): LongshipPose {
    const ship = state.landing?.longships[shipId];
    if (!ship || ship.salvagedWinter !== null) throw new Error('Longship unavailable.');
    if (ship.transport) {
        if (ship.transport.worldId !== context.worldId) throw new Error('Longship belongs to another island.');
        return { x: ship.transport.x, z: ship.transport.z, rotation: ship.transport.rotation };
    }
    return foundingLongshipPose(context, shipId);
}
function foundingLongshipPose(context: PhysicalExpeditionContext, shipId: string): LongshipPose {
    const initial = context.longshipOrigins?.[shipId];
    if (initial) return { ...initial };
    const harbor = context.world.settlement.harbor;
    if (!harbor) throw new Error('The longship has no safe water berth.');
    return { x: harbor.x + 4.5, z: harbor.z - 2.5, rotation: 0 };
}
function freeShip(state: SimulationState, shipId: string, groupId: string) {
    const ship = state.landing?.longships[shipId];
    if (!ship || ship.salvagedWinter !== null || ship.transport?.groupId && ship.transport.groupId !== groupId ||
        Object.values(state.world?.missions ?? {}).some(m => m.status === 'Away' && m.shipId === shipId))
        throw new Error('Longship already assigned or unavailable.');
    return ship;
}
function activeGroup(state: SimulationState, groupId: string) {
    const mission = spatialGroupMission(state, groupId);
    if (!mission?.provisions || mission.task || mission.status === 'Stranded')
        throw new Error('Prepare an exploration expedition before using the longship.');
    return mission;
}

/** Deterministic coast candidates; no harbour is required, and building exclusions still apply. */
function shoreCandidates(context: PhysicalExpeditionContext, ship: Point2) {
    const nav = context.world.navigation, surface = createBlueprintSurface(context.world);
    const candidates: Point2[] = [];
    const col = Math.round((ship.x - nav.bounds.minX) / nav.spacing);
    const row = Math.round((ship.z - nav.bounds.minZ) / nav.spacing);
    const range = Math.ceil(longshipPolicy.landingRange / nav.spacing) + 1;
    for (let z = row - range; z <= row + range; z++) for (let x = col - range; x <= col + range; x++) {
        if (x < 0 || z < 0 || x >= nav.columns || z >= nav.rows || !nav.cells[z * nav.columns + x]) continue;
        const point = { x: nav.bounds.minX + x * nav.spacing, z: nav.bounds.minZ + z * nav.spacing };
        if (Math.hypot(point.x - ship.x, point.z - ship.z) > longshipPolicy.landingRange ||
            surface.surfaceHeightAt(point.x, point.z) <= context.world.waterLevel + .25 ||
            surface.slopeAt(point.x, point.z) > .65 || context.exclusions?.some(b =>
                point.x >= b.minX - .6 && point.x <= b.maxX + .6 && point.z >= b.minZ - .6 && point.z <= b.maxZ + .6)) continue;
        candidates.push(point);
    }
    return candidates.sort((a, b) => Math.hypot(a.x - ship.x, a.z - ship.z) - Math.hypot(b.x - ship.x, b.z - ship.z) ||
        a.x - b.x || a.z - b.z);
}
export function boardLongshipOffer(state: SimulationState, groupId: string, shipId: string,
    context?: PhysicalExpeditionContext, origins?: Record<string, Point2>) {
    const bound = requireWorld(state, context), mission = activeGroup(state, groupId);
    if (mission.transport?.phase === 'embarked') throw new Error('This expedition is already aboard.');
    freeShip(state, shipId, groupId);
    const ship = longshipPose(state, shipId, bound);
    if (!navigableSea(bound, ship)) throw new Error('The longship has no navigable embarkation berth.');
    const starts = mission.status === 'Prepared' ? origins : Object.fromEntries(mission.memberIds.map(id =>
        [id, spatialMemberPosition(mission, id)]));
    if (starts && (Object.keys(starts).length !== mission.memberIds.length || mission.memberIds.some(id =>
        !starts[id] || !Number.isFinite(starts[id].x) || !Number.isFinite(starts[id].z))))
        throw new Error('Every expedition member needs an exact departure origin.');
    for (const point of shoreCandidates(bound, ship)) {
        try {
            const routes = mission.memberIds.map(member => planRoute(bound, point, starts?.[member], true).route);
            const alreadyThere = routes.every(route => routeLength(route) < 1e-6);
            if (alreadyThere && mission.status === 'Prepared') continue;
            return { target: point, shipId, shipPosition: ship, members: mission.memberIds.length, foodCost: 0, alreadyThere };
        } catch { /* Try the next reachable section of coast. */ }
    }
    throw new Error('No reachable embarkation shore near this longship.');
}
export function releaseLongship(state: SimulationState, mission: SpatialMission) {
    if (!mission.transport) return;
    const ship = state.landing?.longships[mission.transport.shipId];
    if (ship?.transport?.groupId === mission.groupId) ship.transport.groupId = null;
    mission.lastShipId = mission.transport.shipId;
    delete mission.transport;
}
function setWaterRoute(mission: SpatialMission, route: Point2[], returning = false) {
    mission.route = route; mission.distance = routeLength(route);
    mission.target = { ...route.at(-1)! };
    mission.travelled = returning ? mission.distance : 0;
    mission.memberRoutes = Object.fromEntries(mission.memberIds.map(id => [id, route.map(p => ({ ...p }))]));
    mission.returnRoutes = structuredClone(mission.memberRoutes);
    mission.status = returning ? 'Returning' : mission.distance ? 'Traveling' : 'Exploring';
    mission.exploringUntil = null;
    if (returning) mission.returnFrom = mission.distance;
    else delete mission.returnFrom;
}
/** Reboarding never moves home to the remote landing. Repair legacy anchors once, on a command/tick. */
function anchorReturnAtHarbour(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const transport = mission.transport;
    if (transport?.phase !== 'embarked') return false;
    const homeSea = foundingLongshipPose(context, transport.shipId);
    if (Math.hypot(homeSea.x - transport.homeSea.x, homeSea.z - transport.homeSea.z) <= 1e-6) return false;
    const returning = mission.status === 'Returning';
    const start = returning ? longshipPose(state, transport.shipId, context) : mission.route[0];
    const seaReturnRoute = planSailingRoute(context, start, homeSea);
    for (const shore of shoreCandidates(context, homeSea)) {
        let homeLandRoutes: Record<string, Point2[]>;
        try {
            homeLandRoutes = Object.fromEntries(mission.memberIds.map(id => [id,
                planRoute(context, shore, mission.homeOrigins![id], true).route.reverse()]));
        } catch { continue; }
        transport.homeSea = homeSea;
        transport.homeLandRoutes = homeLandRoutes;
        transport.seaReturnRoute = seaReturnRoute;
        if (returning) setWaterRoute(mission, seaReturnRoute, true);
        return true;
    }
    throw new Error('No safe connected shore at the home harbour.');
}
/** Called only once all members have reached the canonical coast destination. */
export function embarkReachedGroup(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const boarding = mission.transport;
    if (boarding?.phase !== 'boarding') return;
    const ship = freeShip(state, boarding.shipId, mission.groupId), pose = longshipPose(state, ship.id, context);
    if (Math.hypot(pose.x - boarding.shipPosition.x, pose.z - boarding.shipPosition.z) > .01) {
        releaseLongship(state, mission); recordSpatial(state, 'LongshipBoardingCancelled', mission); return;
    }
    const homeLandRoutes = Object.fromEntries(mission.memberIds.map(id => [id, modeReturnTrail(mission, id)]));
    mission.transport = { version: 1, phase: 'embarked', shipId: ship.id, homeSea: pose,
        homeLandRoutes, seaReturnRoute: [{ ...pose }, { ...pose }] };
    mission.lastShipId = ship.id;
    setWaterRoute(mission, [{ x: pose.x, z: pose.z }, { x: pose.x, z: pose.z }]);
    anchorReturnAtHarbour(state, mission, context);
    recordSpatial(state, 'LongshipEmbarked', mission, { longshipId: ship.id });
}
export function sailLongshipOffer(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext) {
    const bound = requireWorld(state, context), mission = activeGroup(state, groupId);
    if (mission.transport?.phase !== 'embarked') throw new Error('The expedition must embark before sailing.');
    const position = longshipPose(state, mission.transport.shipId, bound);
    const route = planSailingRoute(bound, position, target);
    return { target: { ...target }, route, adjusted: false, foodCost: 0, members: mission.memberIds.length,
        estimate: 'Sailing with carried supplies; the return journey is reserved.' };
}
export function sailLongship(state: SimulationState, groupId: string, target: Point2,
    context?: PhysicalExpeditionContext) {
    const offer = sailLongshipOffer(state, groupId, target, context), mission = activeGroup(state, groupId);
    const transport = mission.transport!;
    if (transport.phase !== 'embarked') return;
    // Preserve reached sea geometry across redirects, including a partial edge.
    const progress = mission.returnFrom === undefined ? mission.travelled : mission.returnFrom - mission.travelled;
    const reached = splitRoute(mission.route, progress).prefix.reverse();
    transport.seaReturnRoute = mission.status === 'Returning'
        ? splitRoute(mission.route, progress).suffix : joinRoutes(reached, transport.seaReturnRoute);
    setWaterRoute(mission, offer.route);
    recordSpatial(state, 'LongshipDestinationSet', mission, { longshipId: transport.shipId });
}
export function longshipReturnTicks(state: SimulationState, mission: SpatialMission) {
    const transport = mission.transport;
    if (transport?.phase !== 'embarked') return 0;
    const speed = state.world!.spatial!.policy.metresPerTick;
    const progress = mission.returnFrom === undefined ? mission.travelled : mission.returnFrom - mission.travelled;
    const sea = mission.status === 'Returning' ? routeLength(splitRoute(mission.route, progress).suffix) :
        progress + routeLength(transport.seaReturnRoute);
    return Math.ceil(sea / (speed * longshipPolicy.speedMultiplier)) +
        Math.max(...Object.values(transport.homeLandRoutes).map(route => Math.ceil(routeLength(route) / speed))) + 2;
}
export function recallLongship(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    if (mission.transport?.phase !== 'embarked') return;
    anchorReturnAtHarbour(state, mission, context);
    const reached = splitRoute(mission.route, mission.travelled).prefix.reverse();
    setWaterRoute(mission, joinRoutes(reached, mission.transport.seaReturnRoute), true);
    recordSpatial(state, 'LongshipReturnStarted', mission, { longshipId: mission.transport.shipId });
}
function applyLandPlacement(state: SimulationState, mission: SpatialMission,
    routes: Record<string, Point2[]>, returning: boolean) {
    releaseLongship(state, mission);
    mission.memberRoutes = returning ? routes : Object.fromEntries(mission.memberIds.map(id => [id,
        [{ ...routes[id][0] }, { ...routes[id][0] }]]));
    mission.returnRoutes = routes;
    mission.route = Object.values(mission.memberRoutes).reduce((a, b) => routeLength(a) >= routeLength(b) ? a : b);
    mission.distance = routeLength(mission.route); mission.travelled = returning ? mission.distance : 0;
    mission.target = { ...mission.route.at(-1)! }; mission.status = returning ? 'Returning' : 'Exploring';
    if (returning) mission.returnFrom = mission.distance;
    else delete mission.returnFrom;
}
export function disembarkLongshipOffer(state: SimulationState, groupId: string, context?: PhysicalExpeditionContext) {
    const bound = requireWorld(state, context), mission = activeGroup(state, groupId);
    if (mission.transport?.phase !== 'embarked') throw new Error('This expedition is not aboard a longship.');
    const pose = longshipPose(state, mission.transport.shipId, bound);
    for (const point of shoreCandidates(bound, pose)) {
        try {
            const routes = Object.fromEntries(mission.memberIds.map(id => [id,
                planRoute(bound, point, mission.homeOrigins![id], true).route.reverse()]));
            return { target: point, routes };
        } catch { /* v0.1 serves the same connected island, not a second island. */ }
    }
    throw new Error('No safe connected shore within landing range.');
}
export function longshipFoodOffer(state: SimulationState, groupId: string, context?: PhysicalExpeditionContext) {
    const bound = requireWorld(state, context), mission = activeGroup(state, groupId);
    if (mission.transport?.phase !== 'embarked') throw new Error('Load Food while aboard the longship.');
    const pose = longshipPose(state, mission.transport.shipId, bound);
    const harbor = bound.world.settlement.harbor;
    const initial = bound.longshipOrigins?.[mission.transport.shipId] ??
        (harbor ? { x: harbor.x + 4.5, z: harbor.z - 2.5 } : undefined);
    if (!initial) throw new Error('The founding coast is unavailable.');
    if (Math.hypot(pose.x - initial.x, pose.z - initial.z) > longshipPolicy.landingRange)
        throw new Error('Return to the founding coast to load clan Food.');
    const pack = mission.provisions!, capacity = pack.foodPerMember * longshipPolicy.capacityMultiplier;
    const additions = Object.fromEntries(mission.memberIds.map(id => {
        const supply = pack.members[id];
        return [id, state.personas[id]?.deathWinter === null ? Math.max(0, capacity - supply.food - Number(supply.rationTicks > 0)) : 0];
    }));
    const foodCost = Object.values(additions).reduce((a, b) => a + b, 0);
    if (state.stocks.food < foodCost) throw new Error(`Loading the longship needs ${foodCost} Food.`);
    return { foodCost, capacityPerMember: capacity, additions };
}
export function applyLongshipCommand(state: SimulationState, command: LongshipCommand, context?: PhysicalExpeditionContext) {
    const bound = requireWorld(state, context);
    if (command.type === 'BoardLongship') {
        const offer = boardLongshipOffer(state, command.groupId, command.shipId, bound, command.origins);
        if (!offer.alreadyThere)
            applySpatialCommand(state, { type: 'ExploreArea', groupId: command.groupId, target: offer.target, origins: command.origins }, bound);
        const mission = activeGroup(state, command.groupId), ship = freeShip(state, command.shipId, command.groupId);
        ship.transport = { version: 1, worldId: bound.worldId, ...offer.shipPosition, groupId: command.groupId };
        mission.transport = { version: 1, phase: 'boarding', shipId: ship.id, shore: offer.target, shipPosition: offer.shipPosition };
        recordSpatial(state, 'LongshipBoardingStarted', mission, { longshipId: ship.id });
        if (offer.alreadyThere) embarkReachedGroup(state, mission, bound);
    } else if (command.type === 'DisembarkLongship') {
        const offer = disembarkLongshipOffer(state, command.groupId, bound), mission = activeGroup(state, command.groupId);
        applyLandPlacement(state, mission, offer.routes, false);
        recordSpatial(state, 'LongshipDisembarked', mission, { longshipId: mission.lastShipId });
    } else {
        const offer = longshipFoodOffer(state, command.groupId, bound), mission = activeGroup(state, command.groupId);
        for (const [id, amount] of Object.entries(offer.additions)) {
            const supply = mission.provisions!.members[id];
            supply.food += amount; supply.loaded = (supply.loaded ?? 0) + amount;
        }
        state.stocks.food -= offer.foodCost; mission.foodCost += offer.foodCost;
        recordSpatial(state, 'LongshipFoodLoaded', mission, { units: offer.foodCost, foodCost: offer.foodCost });
    }
}
/** One Core tick moves one persistent hull. No render frame advances this state. */
export function stepLongship(state: SimulationState, mission: SpatialMission, context: PhysicalExpeditionContext) {
    const transport = mission.transport;
    if (transport?.phase !== 'embarked') return false;
    const reanchored = anchorReturnAtHarbour(state, mission, context);
    const previous = mission.travelled, previousStatus = mission.status;
    if (mission.memberIds.some(id => state.personas[id]?.deathWinter === null &&
        supplyEndurance(mission, id) <= longshipReturnTicks(state, mission)) && mission.status !== 'Returning')
        recallLongship(state, mission, context);
    consumeCarriedFood(state, mission);
    const speed = state.world!.spatial!.policy.metresPerTick * longshipPolicy.speedMultiplier;
    if (mission.status === 'Traveling') mission.travelled = Math.min(mission.distance, mission.travelled + speed);
    if (mission.status === 'Returning') mission.travelled = Math.max(0, mission.travelled - speed);
    const pose = spatialMissionPosition(mission), ship = state.landing!.longships[transport.shipId];
    // Check the traversed polyline, rather than a chord that can cut across a coastal corner.
    const progress = mission.returnFrom === undefined ? mission.travelled : mission.returnFrom - mission.travelled;
    const oldProgress = Math.max(0, progress - speed);
    const travelled = splitRoute(splitRoute(mission.route, oldProgress).suffix, progress - oldProgress).prefix;
    for (let i = 1; i < travelled.length; i++)
        if (!validSeaSegment(context, travelled[i - 1], travelled[i]))
            throw new Error('The confirmed sailing route is blocked.');
    ship.transport = { version: 1, worldId: context.worldId, groupId: mission.groupId,
        x: pose.x, z: pose.z, rotation: pose.rotation };
    if (mission.status === 'Traveling' && mission.travelled === mission.distance) mission.status = 'Exploring';
    if (mission.status === 'Returning' && mission.travelled === 0) {
        const home = transport.homeLandRoutes;
        applyLandPlacement(state, mission, home, true);
        if (!mission.distance) finish(state, mission, mission.outcome ?? 'Completed');
    }
    mission.updatedAt = absoluteTick(state);
    return reanchored || previousStatus !== mission.status || Math.floor(previous / 8) !== Math.floor(mission.travelled / 8);
}

export function visibleLongshipMembers(memberIds: readonly string[]) {
    const count = memberIds.length <= 2 ? memberIds.length : Math.min(4, Math.ceil(memberIds.length / 2));
    return memberIds.slice().sort().slice(0, count);
}

export function validateLongshipState(state: SimulationState) {
    const ships = state.landing?.longships ?? {}, missions = Object.values(state.world?.spatial?.missions ?? {});
    const bounds = state.discovery?.grid.bounds;
    const point = (p: Point2 | undefined) => !!p && !!bounds && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= bounds.minX && p.x < bounds.maxX && p.z >= bounds.minZ && p.z < bounds.maxZ;
    const route = (r: Point2[] | undefined) => Array.isArray(r) && r.length >= 2 && r.length <= 40002 && r.every(point);
    const fail = () => { throw new Error('Invalid longship transport state.'); };
    for (const ship of Object.values(ships)) {
        const location = ship.transport;
        if (!location) continue;
        if (location.version !== 1 || !point(location) || !Number.isFinite(location.rotation) ||
            location.worldId !== state.discovery?.worldId || ship.salvagedWinter !== null ||
            location.groupId !== null && typeof location.groupId !== 'string') fail();
        if (location.groupId !== null && !missions.some(m => m.status !== 'Returned' &&
            m.groupId === location.groupId && m.transport?.shipId === ship.id)) fail();
        if (location.groupId && Object.values(state.world?.missions ?? {}).some(m => m.status === 'Away' && m.shipId === ship.id)) fail();
    }
    for (const mission of missions) {
        if (mission.lastShipId !== undefined && (typeof mission.lastShipId !== 'string' || !ships[mission.lastShipId])) fail();
        const transport = mission.transport;
        if (!transport) continue;
        if (transport.version !== 1 || !['boarding', 'embarked'].includes(transport.phase) ||
            !mission.provisions || mission.task || ['Prepared', 'Returned', 'Stranded'].includes(mission.status) ||
            ships[transport.shipId]?.transport?.groupId !== mission.groupId) fail();
        if (transport.phase === 'boarding') {
            if (!point(transport.shore) || !point(transport.shipPosition) || !Number.isFinite(transport.shipPosition.rotation) ||
                Math.hypot(transport.shore.x - transport.shipPosition.x, transport.shore.z - transport.shipPosition.z) >
                    longshipPolicy.landingRange || mission.status !== 'Traveling') fail();
        } else {
            if (!point(transport.homeSea) || !Number.isFinite(transport.homeSea.rotation) || !route(transport.seaReturnRoute) ||
                !transport.homeLandRoutes || Object.keys(transport.homeLandRoutes).length !== mission.memberIds.length ||
                !mission.homeOrigins || !mission.memberRoutes || !mission.returnRoutes ||
                Math.hypot(transport.seaReturnRoute.at(-1)!.x - transport.homeSea.x,
                    transport.seaReturnRoute.at(-1)!.z - transport.homeSea.z) > 1e-6) fail();
            for (const id of mission.memberIds) {
                const trail = transport.homeLandRoutes[id], home = mission.homeOrigins![id];
                if (!route(trail) || !point(home) || Math.hypot(trail.at(-1)!.x - home.x, trail.at(-1)!.z - home.z) > 1e-6 ||
                    JSON.stringify(mission.memberRoutes![id]) !== JSON.stringify(mission.route) ||
                    JSON.stringify(mission.returnRoutes![id]) !== JSON.stringify(mission.route)) fail();
            }
            const position = spatialMissionPosition(mission), saved = ships[transport.shipId].transport!;
            if (Math.hypot(position.x - saved.x, position.z - saved.z) > 1e-6 ||
                mission.status !== 'Returning' && Math.hypot(transport.seaReturnRoute[0].x - mission.route[0].x,
                    transport.seaReturnRoute[0].z - mission.route[0].z) > 1e-6) fail();
        }
    }
}

/** Validate transported saves against regenerated land and water, never trusting serialized paths alone. */
export function assertLongshipWorld(state: SimulationState, context: PhysicalExpeditionContext) {
    const nav = context.world.navigation, surface = createBlueprintSurface(context.world);
    for (const ship of Object.values(state.landing?.longships ?? {}))
        if (ship.transport && !navigableSea(context, ship.transport)) throw new Error('Invalid saved longship berth.');
    for (const mission of Object.values(state.world?.spatial?.missions ?? {})) {
        const transport = mission.transport;
        if (transport?.phase !== 'embarked') continue;
        for (const path of [mission.route, transport.seaReturnRoute]) {
            for (let i = 1; i < path.length; i++)
                if (!validSeaSegment(context, path[i - 1], path[i])) throw new Error('Invalid saved sailing route.');
        }
        for (const id of mission.memberIds) {
            const path = transport.homeLandRoutes[id];
            // Recheck reserved return geometry when regenerated geography is bound.
            for (let i = 1; i < path.length; i++) {
                const a = path[i - 1], b = path[i];
                const length = Math.hypot(b.x - a.x, b.z - a.z);
                const steps = Math.max(1, Math.ceil(length));
                let previousHeight = surface.surfaceHeightAt(a.x, a.z);
                let previousCol = Math.round((a.x - nav.bounds.minX) / nav.spacing);
                let previousRow = Math.round((a.z - nav.bounds.minZ) / nav.spacing);
                for (let s = 0; s <= steps; s++) {
                    const x = a.x + (b.x - a.x) * s / steps, z = a.z + (b.z - a.z) * s / steps;
                    const col = Math.round((x - nav.bounds.minX) / nav.spacing);
                    const row = Math.round((z - nav.bounds.minZ) / nav.spacing);
                    const height = surface.surfaceHeightAt(x, z);
                    if (col < 0 || row < 0 || col >= nav.columns || row >= nav.rows ||
                        !nav.cells[row * nav.columns + col] ||
                        col !== previousCol && row !== previousRow &&
                            (!nav.cells[previousRow * nav.columns + col] || !nav.cells[row * nav.columns + previousCol]) ||
                        height <= context.world.waterLevel + .25 ||
                        Math.abs(height - previousHeight) > .65 * length / steps + 1e-6)
                        throw new Error('Invalid reserved longship land return.');
                    previousHeight = height;
                    previousCol = col;
                    previousRow = row;
                }
            }
        }
    }
}
