import type { SimulationState } from './SimulationCore';
import type { PhysicalExpeditionContext } from './SpatialExpeditions';
import type { Bounds2, Point2 } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { planRoute } from '../world-generation/LandRoutes';

export interface StaticLivestockBody {
    home: Point2;
    position: Point2;
    sourceEventId: string | null;
}
export interface LivestockPresenceState {
    version: 1;
    worldId: string;
    adoptedAt: number;
    site: { center: Point2; bounds: Bounds2 };
    /** Adopted static obstacles cannot depend on later presentation reads or command batching. */
    exclusions: Bounds2[];
    animals: Record<string, StaticLivestockBody>;
}
const now = (state: SimulationState) => state.time.winter * state.ticksPerWinter + state.time.tick;
const point = (value: Point2) => value && Number.isFinite(value.x) && Number.isFinite(value.z);
const equalPoint = (first: Point2, second: Point2) =>
    Math.hypot(first.x - second.x, first.z - second.z) <= 1e-6;
const clans = (root: SimulationState) => [root, ...Object.values(root.world?.targetClans ?? {})];
const boundsValid = (bounds: Bounds2) => bounds && Object.values(bounds).every(Number.isFinite) &&
    bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ;
function supported(context: PhysicalExpeditionContext, position: Point2) {
    if (!point(position)) return false;
    const nav = context.world.navigation, bounds = nav.bounds;
    const column = Math.round((position.x - bounds.minX) / nav.spacing);
    const row = Math.round((position.z - bounds.minZ) / nav.spacing);
    return position.x >= bounds.minX && position.x < bounds.maxX &&
        position.z >= bounds.minZ && position.z < bounds.maxZ &&
        column >= 0 && column < nav.columns && row >= 0 && row < nav.rows &&
        !!nav.cells[row * nav.columns + column] &&
        createBlueprintSurface(context.world).surfaceHeightAt(position.x, position.z) > context.world.waterLevel + .25;
}

/** Explicit adoption snapshots existing actual static bodies once, before any renderer is needed. */
export function bindLivestockPresence(root: SimulationState, context?: PhysicalExpeditionContext): void {
    if (!root.world?.territory || !context) return;
    for (const clan of clans(root)) {
        const positions = context.livestockPositionsByClan?.[clan.clan.id];
        if (clan.livestockPresence || !positions) continue;
        const site = clan.residentPresence?.site;
        if (!site) throw new Error('Static livestock bodies require an adopted clan site.');
        const animals: LivestockPresenceState['animals'] = {};
        for (const id of Object.keys(positions).sort()) {
            if (clan.landing?.cattle[id]?.deathWinter !== null || !supported(context, positions[id]))
                throw new Error('Invalid initial physical livestock body.');
            animals[id] = { home: { ...positions[id] }, position: { ...positions[id] }, sourceEventId: null };
        }
        clan.livestockPresence = { version: 1, worldId: context.worldId, adoptedAt: now(root),
            site: structuredClone(site), exclusions: (context.exclusions ?? []).map(bounds => ({ ...bounds })), animals };
    }
}

function birthPosition(clan: SimulationState, anchor: Point2, context: PhysicalExpeditionContext) {
    const saved = clan.livestockPresence!, nav = context.world.navigation;
    const originColumn = Math.round((anchor.x - nav.bounds.minX) / nav.spacing);
    const originRow = Math.round((anchor.z - nav.bounds.minZ) / nav.spacing);
    const radius = 16, reach = Math.ceil(radius / nav.spacing), candidates: Point2[] = [];
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
        const position = { x: nav.bounds.minX + (originColumn + dx) * nav.spacing,
            z: nav.bounds.minZ + (originRow + dz) * nav.spacing };
        if (Math.hypot(position.x - anchor.x, position.z - anchor.z) <= radius) candidates.push(position);
    }
    candidates.sort((first, second) => Math.hypot(first.x - anchor.x, first.z - anchor.z) -
        Math.hypot(second.x - anchor.x, second.z - anchor.z) || first.z - second.z || first.x - second.x);
    for (const position of candidates) {
        if (!supported(context, position) || Object.values(saved.animals).some(body =>
            Math.hypot(body.home.x - position.x, body.home.z - position.z) < 1.5)) continue;
        try {
            const route = planRoute({ world: context.world, exclusions: saved.exclusions }, position, anchor, true,
                { strictNavigation: true, strictExclusions: true, allowTargetAdjustment: false });
            if (!route.adjusted && equalPoint(route.route[0], anchor) &&
                equalPoint(route.target, position)) return position;
        } catch { /* A newborn needs an actual reachable dry body, never a cosmetic fallback. */ }
    }
    return undefined;
}

/** Reconcile at each canonical tick: births and real arrivals never depend on render or command cadence. */
export function reconcileLivestockPresence(root: SimulationState, context?: PhysicalExpeditionContext): void {
    if (!context) return;
    for (const clan of clans(root)) {
        const saved = clan.livestockPresence;
        if (!saved) continue;
        for (const id of Object.keys(saved.animals))
            if (clan.landing?.cattle[id]?.deathWinter !== null) delete saved.animals[id];
        for (const animal of Object.values(clan.landing?.cattle ?? {}).sort((a, b) => a.id.localeCompare(b.id))) {
            if (animal.deathWinter !== null || saved.animals[animal.id]) continue;
            const events = [...clan.events].reverse();
            const arrival = events.find(event => event.type === 'LivestockTransferredIn' &&
                event.details?.livestockId === animal.id);
            const birth = events.find(event => ['CattleBorn', 'LivestockBorn'].includes(event.type) &&
                (event.details?.cattleId === animal.id || event.details?.livestockId === animal.id));
            const received = arrival?.details?.arrivalPosition as Point2 | undefined;
            const mother = saved.animals[animal.parentIds[0]];
            const position = received && supported(context, received) ? { ...received } :
                birth && birth.time.winter * clan.ticksPerWinter + birth.time.tick >= saved.adoptedAt
                    ? birthPosition(clan, mother?.home ?? saved.site.center, context) : undefined;
            if (position) saved.animals[animal.id] = { home: { ...position }, position: { ...position },
                sourceEventId: arrival?.id ?? birth!.id };
        }
    }
}

export function validateLivestockPresence(clan: SimulationState): void {
    const saved = clan.livestockPresence;
    if (!saved) return;
    const fail = () => { throw new Error('Invalid saved physical livestock bodies.'); };
    if (saved.version !== 1 || typeof saved.worldId !== 'string' || !saved.worldId || saved.worldId.length > 256 ||
        !clan.residentPresence || saved.worldId !== clan.residentPresence.worldId ||
        !Number.isSafeInteger(saved.adoptedAt) || saved.adoptedAt < clan.residentPresence.adoptedAt || saved.adoptedAt > now(clan) ||
        !saved.site || !point(saved.site.center) || !boundsValid(saved.site.bounds) ||
        !equalPoint(saved.site.center, clan.residentPresence!.site.center) ||
        (['minX', 'maxX', 'minZ', 'maxZ'] as const).some(key =>
            saved.site.bounds[key] !== clan.residentPresence!.site.bounds[key]) ||
        !Array.isArray(saved.exclusions) || saved.exclusions.length > 4096 || saved.exclusions.some(bounds => !boundsValid(bounds)) ||
        !saved.animals || Array.isArray(saved.animals) || Object.keys(saved.animals).length > 4096) fail();
    for (const [id, body] of Object.entries(saved.animals)) {
        if ((!clan.landing?.cattle[id] && !clan.landing?.cattleArchive?.[id]) || !body ||
            !point(body.home) || !point(body.position) || !equalPoint(body.home, body.position) ||
            body.sourceEventId !== null && !clan.events.some(event => event.id === body.sourceEventId &&
                ['CattleBorn', 'LivestockBorn', 'LivestockTransferredIn'].includes(event.type) &&
                (event.details?.cattleId === id || event.details?.livestockId === id))) fail();
    }
}

/** Reattaching a saved campaign checks all static bodies against its actual bound island. */
export function assertLivestockWorld(root: SimulationState, context?: PhysicalExpeditionContext): void {
    for (const clan of clans(root)) {
        const saved = clan.livestockPresence;
        if (!saved) continue;
        if (!context || saved.worldId !== context.worldId ||
            Object.values(saved.animals).some(body => !supported(context, body.home) || !supported(context, body.position)))
            throw new Error('Saved livestock bodies do not match the bound physical island.');
    }
}
