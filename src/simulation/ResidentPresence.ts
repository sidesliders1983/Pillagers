import type { SimulationState } from './SimulationCore';
import type { PhysicalExpeditionContext } from './SpatialExpeditions';
import type { Bounds2, Point2 } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { planRoute } from '../world-generation/LandRoutes';
import { personaAway } from './WorldExpeditions';
import { isProvidingCare } from './FamilyMechanics';
import { miningBusy } from './Mining';
import { personaAge } from './PersonaAge';
import { residentMovementConfig } from '../systems/SocialEncounters';

export type PresenceRole = 'watch' | 'warn' | 'mobilise' | 'withdraw';
export interface PresenceSite {
    clanId: string;
    center: Point2;
    bounds: Bounds2;
    homes: Record<string, Point2>;
}
export interface ResidentPresence {
    home: Point2;
    position: Point2;
    previousPosition: Point2;
    route: Point2[];
    travelled: number;
    previousTravelled: number;
    distance: number;
    updatedAt: number;
    mode: 'local' | PresenceRole | 'return';
    incidentId: string | null;
    facing: Point2 | null;
    ceremonyUntil: number | null;
    blockedTicks: number;
}
export interface ResidentPresenceState {
    version: 1;
    worldId: string;
    adoptedAt: number;
    site: { center: Point2; bounds: Bounds2 };
    residents: Record<string, ResidentPresence>;
}
const tick = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
const point = (value: Point2) => value && Number.isFinite(value.x) && Number.isFinite(value.z);
const samePoint = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z) <= 1e-6;
export function presenceRouteLength(route: readonly Point2[]) {
    let length = 0;
    for (let index = 1; index < route.length; index++)
        length += Math.hypot(route[index].x - route[index - 1].x, route[index].z - route[index - 1].z);
    return length;
}
export function presenceRoutePosition(route: readonly Point2[], travelled: number): Point2 {
    let remaining = travelled;
    for (let index = 1; index < route.length; index++) {
        const first = route[index - 1], next = route[index];
        const length = Math.hypot(next.x - first.x, next.z - first.z);
        if (remaining <= length && length > 0)
            return { x: first.x + (next.x - first.x) * remaining / length,
                z: first.z + (next.z - first.z) * remaining / length };
        remaining -= length;
    }
    return { ...route[route.length - 1] };
}
export function residentAtHome(state: SimulationState, id: string) {
    return state.personas[id]?.deathWinter === null && !personaAway(state, id) && !miningBusy(state, id);
}
/** Physical departures use saved bodies; pre-adoption campaigns retain their presentation contract. */
export function canonicalDepartureOrigins(state: SimulationState, memberIds: readonly string[],
    proposed?: Record<string, Point2>) {
    if (!state.residentPresence) return proposed;
    return Object.fromEntries(memberIds.map(id => {
        const actor = state.residentPresence!.residents[id];
        if (!actor) throw new Error('Every expedition member needs saved canonical presence.');
        return [id, { ...actor.position }];
    }));
}
export function presenceAtGathering(state: SimulationState, id: string) {
    const until = state.residentPresence?.residents[id]?.ceremonyUntil;
    return until !== undefined && until !== null && until > tick(state);
}
export function eligibleTerritorialObserver(state: SimulationState, id: string) {
    return residentAtHome(state, id) && personaAge(state, id) >= (state.mechanics?.config.workAge ?? 16) &&
        !isProvidingCare(state, id) && !presenceAtGathering(state, id);
}
export function territorialDuty(state: SimulationState, id: string): PresenceRole | null {
    const actor = state.residentPresence?.residents[id];
    return actor?.incidentId ? actor.mode as PresenceRole : null;
}
export function inspectResidentPresence(state: SimulationState, id: string) {
    const actor = state.residentPresence?.residents[id];
    if (!actor || !residentAtHome(state, id)) return undefined;
    const facing = actor.facing;
    const moving = actor.travelled < actor.distance && actor.blockedTicks === 0;
    const next = moving ? presenceRoutePosition(actor.route, Math.min(actor.distance, actor.travelled + .1)) : facing;
    const rotation = next && !samePoint(actor.position, next)
        ? Math.atan2(next.x - actor.position.x, next.z - actor.position.z) : 0;
    return { ...structuredClone(actor), rotation, moving,
        ...(actor.incidentId ? { duty: { incidentId: actor.incidentId, role: actor.mode as PresenceRole } } : {}) };
}
export function bindResidentPresence(state: SimulationState, context: PhysicalExpeditionContext, site: PresenceSite) {
    if (state.residentPresence) return;
    const residents: ResidentPresenceState['residents'] = {};
    for (const id of Object.keys(state.personas).sort()) {
        if (state.personas[id].deathWinter !== null) continue;
        const home = site.homes[id];
        if (!point(home)) throw new Error('Every resident needs a canonical home exterior.');
        residents[id] = { home: { ...home }, position: { ...home }, previousPosition: { ...home },
            route: [{ ...home }], travelled: 0, previousTravelled: 0, distance: 0, updatedAt: tick(state),
            mode: 'local', incidentId: null, facing: null, ceremonyUntil: null, blockedTicks: 0 };
    }
    state.residentPresence = { version: 1, worldId: context.worldId, adoptedAt: tick(state),
        site: { center: { ...site.center }, bounds: { ...site.bounds } }, residents };
}
export function assertPresenceSite(state: SimulationState, context: PhysicalExpeditionContext, site: PresenceSite) {
    const bounds = site.bounds, terrain = context.world.terrain.bounds;
    const centre = state.entityPrefix ? context.world.rivalSite?.center : context.world.settlement.center;
    if (site.clanId !== state.clan.id || !point(site.center) || !centre || !samePoint(site.center, centre) ||
        !bounds || !Object.values(bounds).every(Number.isFinite) ||
        bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ ||
        bounds.minX < terrain.minX || bounds.maxX > terrain.maxX ||
        bounds.minZ < terrain.minZ || bounds.maxZ > terrain.maxZ)
        throw new Error('Invalid canonical resident site.');
    const surface = createBlueprintSurface(context.world);
    for (const [id, home] of Object.entries(site.homes)) {
        if (!state.personas[id] || !point(home) ||
            home.x < bounds.minX || home.x > bounds.maxX || home.z < bounds.minZ || home.z > bounds.maxZ ||
            surface.surfaceHeightAt(home.x, home.z) <= context.world.waterLevel + .25)
            throw new Error('Invalid canonical resident home exterior.');
    }
}
export function validateResidentPresence(state: SimulationState) {
    const saved = state.residentPresence;
    if (!saved) return;
    const fail = () => { throw new Error('Invalid canonical resident presence.'); };
    const uint = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= tick(state);
    if (saved.version !== 1 || typeof saved.worldId !== 'string' || !saved.worldId || saved.worldId.length > 256 ||
        !uint(saved.adoptedAt) || !saved.site || !point(saved.site.center) || !saved.site.bounds ||
        !Object.values(saved.site.bounds).every(Number.isFinite) ||
        saved.site.bounds.minX >= saved.site.bounds.maxX || saved.site.bounds.minZ >= saved.site.bounds.maxZ ||
        !saved.residents || Array.isArray(saved.residents) || Object.keys(saved.residents).length > 4096) fail();
    for (const [id, actor] of Object.entries(saved.residents)) {
        if (!state.personas[id] || !actor || !point(actor.home) || !point(actor.position) ||
            !point(actor.previousPosition) || !Array.isArray(actor.route) || !actor.route.length ||
            actor.route.length > 4096 || actor.route.some(p => !point(p)) ||
            ![actor.travelled, actor.previousTravelled, actor.distance].every(Number.isFinite) ||
            actor.travelled < 0 || actor.previousTravelled < 0 || actor.previousTravelled > actor.travelled ||
            actor.travelled > actor.distance + 1e-6 ||
            Math.abs(presenceRouteLength(actor.route) - actor.distance) > 1e-6 ||
            !samePoint(presenceRoutePosition(actor.route, actor.travelled), actor.position) ||
            !uint(actor.updatedAt) || !Number.isSafeInteger(actor.blockedTicks) || actor.blockedTicks < 0 ||
            !['local', 'watch', 'warn', 'mobilise', 'withdraw', 'return'].includes(actor.mode) ||
            actor.incidentId !== null && (typeof actor.incidentId !== 'string' || !actor.incidentId) ||
            actor.facing !== null && !point(actor.facing) ||
            actor.ceremonyUntil !== null && (!Number.isSafeInteger(actor.ceremonyUntil) ||
                actor.ceremonyUntil < saved.adoptedAt || actor.ceremonyUntil > tick(state) + 250)) fail();
    }
}
/** Reuse the island's saved dry-land solver for every local movement. */
export function setPresenceRoute(actor: ResidentPresence, target: Point2, context: PhysicalExpeditionContext) {
    try {
        const plan = planRoute(context, target, actor.position, true);
        if (plan.adjusted || !samePoint(plan.route[0], actor.position)) return false;
        actor.route = plan.route.map(p => ({ ...p }));
        actor.travelled = 0;
        actor.previousTravelled = 0;
        actor.distance = presenceRouteLength(actor.route);
        actor.previousPosition = { ...actor.position };
        actor.blockedTicks = 0;
        return true;
    } catch { return false; }
}


export function freezePresence(actor: ResidentPresence) {
    actor.route = [{ ...actor.position }];
    actor.travelled = 0;
    actor.previousTravelled = 0;
    actor.distance = 0;
    actor.blockedTicks = 0;
    actor.previousPosition = { ...actor.position };
}
export function releasePresence(actor: ResidentPresence) {
    actor.incidentId = null;
    actor.mode = 'return';
    actor.facing = null;
    freezePresence(actor);
}
/** New identities reserve a dry, reachable exterior from saved household facts, never later scene facts. */
function allocateResidentHome(state: SimulationState, id: string, context: PhysicalExpeditionContext) {
    const saved = state.residentPresence!;
    const household = Object.values(state.households).find(home => home.memberIds.includes(id));
    const relative = household?.memberIds.slice().sort()
        .map(member => saved.residents[member]?.home).find(Boolean);
    const anchor = relative ?? saved.site.center;
    const nav = context.world.navigation, bounds = saved.site.bounds;
    const spacing = nav.spacing, reach = Math.ceil(16 / spacing);
    const column = Math.round((anchor.x - nav.bounds.minX) / spacing);
    const row = Math.round((anchor.z - nav.bounds.minZ) / spacing);
    const homes = Object.values(saved.residents).map(actor => actor.home);
    const candidates: Point2[] = [];
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
        const target = { x: nav.bounds.minX + (column + dx) * spacing,
            z: nav.bounds.minZ + (row + dz) * spacing };
        if (target.x < bounds.minX || target.x > bounds.maxX || target.z < bounds.minZ || target.z > bounds.maxZ ||
            Math.hypot(target.x - anchor.x, target.z - anchor.z) > 16 ||
            homes.some(home => Math.hypot(target.x - home.x, target.z - home.z) < residentMovementConfig.radius * 2)) continue;
        candidates.push(target);
    }
    candidates.sort((first, second) => Math.hypot(first.x - anchor.x, first.z - anchor.z) -
        Math.hypot(second.x - anchor.x, second.z - anchor.z) || first.x - second.x || first.z - second.z);
    for (const target of candidates) {
        try {
            const plan = planRoute(context, target, anchor, true);
            if (!plan.adjusted && samePoint(plan.target, target)) return { ...target };
        } catch { /* The next bounded candidate may have a valid dry connection. */ }
    }
    throw new Error('No separate reachable resident exterior remains near this household.');
}
export function reconcileResidentPresence(state: SimulationState) {
    const saved = state.residentPresence;
    if (!saved) return;
    for (const [id, actor] of Object.entries(saved.residents)) {
        if (!state.personas[id] || state.personas[id].deathWinter !== null) {
            delete saved.residents[id];
            continue;
        }
        if (actor.incidentId && (!residentAtHome(state, id) ||
            actor.mode !== 'withdraw' && !eligibleTerritorialObserver(state, id)))
            releasePresence(actor);
    }
}
export function advanceResidentPresence(state: SimulationState, context: PhysicalExpeditionContext,
    policy: { residentSpeed: number; ambientInterval: number; ambientRadius: number },
    visitors: readonly Point2[] = []) {
    const saved = state.residentPresence;
    if (!saved) return;
    reconcileResidentPresence(state);
    for (const id of Object.keys(state.personas).sort()) {
        if (state.personas[id].deathWinter !== null) continue;
        if (!saved.residents[id]) {
            const home = allocateResidentHome(state, id, context);
            if (!home) continue;
            saved.residents[id] = { home: { ...home }, position: { ...home }, previousPosition: { ...home },
                route: [{ ...home }], travelled: 0, previousTravelled: 0, distance: 0, updatedAt: tick(state),
                mode: 'local', incidentId: null, facing: null, ceremonyUntil: null, blockedTicks: 0 };
        }
        const actor = saved.residents[id];
        actor.previousPosition = { ...actor.position };
        actor.previousTravelled = actor.travelled;
        actor.updatedAt = tick(state);
        if (personaAge(state, id) < 5 || isProvidingCare(state, id)) { freezePresence(actor); continue; }
        if (!residentAtHome(state, id) || actor.ceremonyUntil !== null && actor.ceremonyUntil > tick(state)) continue;
        if (actor.ceremonyUntil !== null) actor.ceremonyUntil = null;
        if (actor.mode === 'return' && actor.travelled >= actor.distance) {
            if (samePoint(actor.position, actor.home) || !setPresenceRoute(actor, actor.home, context))
                actor.mode = 'local';
        }
        if (actor.mode === 'local' && actor.travelled >= actor.distance && policy.ambientRadius > 0) {
            let hash = 0;
            for (const letter of id) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
            if ((tick(state) + hash % policy.ambientInterval) % policy.ambientInterval === 0) {
                const angle = (Math.floor(tick(state) / policy.ambientInterval) + hash % 8) * Math.PI / 4;
                const target = { x: actor.home.x + Math.cos(angle) * policy.ambientRadius,
                    z: actor.home.z + Math.sin(angle) * policy.ambientRadius };
                const bounds = saved.site.bounds;
                if (target.x >= bounds.minX && target.x <= bounds.maxX &&
                    target.z >= bounds.minZ && target.z <= bounds.maxZ) setPresenceRoute(actor, target, context);
            }
        }
        if (actor.travelled < actor.distance) {
            const travelled = Math.min(actor.distance, actor.travelled + policy.residentSpeed);
            const next = presenceRoutePosition(actor.route, travelled);
            if (movingPresenceClear(state, id, next, context, visitors)) {
                actor.travelled = travelled;
                actor.position = next;
                actor.blockedTicks = 0;
            } else {
                actor.blockedTicks++;
                if (actor.blockedTicks % 25 === 0) {
                    const nearby = Object.entries(saved.residents).filter(([otherId, other]) => otherId !== id &&
                        residentAtHome(state, otherId) && Math.hypot(other.position.x - actor.position.x,
                            other.position.z - actor.position.z) < 12).map(([, other]) => ({
                        minX: other.position.x - .5, maxX: other.position.x + .5,
                        minZ: other.position.z - .5, maxZ: other.position.z + .5 }));
                    setPresenceRoute(actor, actor.route.at(-1)!, { ...context,
                        exclusions: [...context.exclusions ?? [], ...nearby] });
                }
            }
        }
    }
}



function bodyDistance(first: Point2, last: Point2, other: Point2) {
    const dx = last.x - first.x, dz = last.z - first.z, lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? Math.max(0, Math.min(1,
        ((other.x - first.x) * dx + (other.z - first.z) * dz) / lengthSquared)) : 0;
    return Math.hypot(other.x - first.x - dx * t, other.z - first.z - dz * t);
}
function movingPresenceClear(state: SimulationState, id: string, next: Point2,
    context: PhysicalExpeditionContext, visitors: readonly Point2[]) {
    const actor = state.residentPresence!.residents[id];
    const others = Object.entries(state.residentPresence!.residents)
        .filter(([otherId, other]) => otherId !== id && residentAtHome(state, otherId) &&
            personaAge(state, otherId) >= 5 && !isProvidingCare(state, otherId) &&
            !(other.ceremonyUntil !== null && other.ceremonyUntil > tick(state)))
        .map(([, other]) => other.position);
    if ([...others, ...visitors].some(other =>
        bodyDistance(actor.position, next, other) < residentMovementConfig.radius * 2 - 1e-7)) return false;
    return !context.exclusions?.some(bounds => {
        const steps = Math.max(1, Math.ceil(Math.hypot(next.x - actor.position.x, next.z - actor.position.z) / .2));
        for (let step = 0; step <= steps; step++) {
            const point = { x: actor.position.x + (next.x - actor.position.x) * step / steps,
                z: actor.position.z + (next.z - actor.position.z) * step / steps };
            if (point.x >= bounds.minX && point.x <= bounds.maxX &&
                point.z >= bounds.minZ && point.z <= bounds.maxZ) return true;
        }
        return false;
    });
}



/** Check immutable island terrain on bind. Live construction is handled as a blocked step. */
export function assertResidentRoutes(state: SimulationState, context: PhysicalExpeditionContext) {
    const saved = state.residentPresence;
    if (!saved) return;
    const world = context.world, nav = world.navigation, bounds = world.terrain.bounds;
    const surface = createBlueprintSurface(world);
    const safe = (point: Point2) => {
        if (point.x < bounds.minX || point.x >= bounds.maxX || point.z < bounds.minZ || point.z >= bounds.maxZ)
            return false;
        const column = Math.round((point.x - nav.bounds.minX) / nav.spacing);
        const row = Math.round((point.z - nav.bounds.minZ) / nav.spacing);
        return column >= 0 && column < nav.columns && row >= 0 && row < nav.rows &&
            Boolean(nav.cells[row * nav.columns + column]) &&
            surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + .25;
    };
    for (const actor of Object.values(saved.residents)) {
        if (!safe(actor.home) || !safe(actor.position)) throw new Error('Resident presence is outside dry island terrain.');
        for (let index = 1; index < actor.route.length; index++) {
            const first = actor.route[index - 1], last = actor.route[index];
            const distance = Math.hypot(last.x - first.x, last.z - first.z);
            const steps = Math.max(1, Math.ceil(distance * 2));
            let prior = surface.surfaceHeightAt(first.x, first.z);
            for (let step = 0; step <= steps; step++) {
                const point = { x: first.x + (last.x - first.x) * step / steps,
                    z: first.z + (last.z - first.z) * step / steps };
                const height = surface.surfaceHeightAt(point.x, point.z);
                if (!safe(point) || step > 0 && Math.abs(height - prior) > .65 * distance / steps + 1e-6)
                    throw new Error('Saved resident route crosses blocked island terrain.');
                prior = height;
            }
        }
    }
}
