import type { CommunityHearthPlacement } from '../simulation/SimulationCore';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { suitability } from '../world-generation/PlanSettlement';
import type { FjordPlot } from './FjordProjection';
import { settlementCampfire } from './SettlementCampfire';
import { communityHearthAssets } from './CommunityHearthAssets';
import { campaignIslandPlan } from './CampaignIsland';

/** Both upgrades reserve the final authored Hall, including fences and roof overhangs.
 * This is an independent community reservation, never a household or a graded island plot. */
const hallBounds = communityHearthAssets[2].bounds;
export const communityHearthFootprint = Object.freeze({
    halfWidth: Math.max(Math.abs(hallBounds.min[0]), Math.abs(hallBounds.max[0])) + .15,
    halfDepth: Math.max(Math.abs(hallBounds.min[2]), Math.abs(hallBounds.max[2])) + 1.1,
});
export const communityHearthCourtRadius = 8.75;
export const communityHearthMaximumFooting = .6;
const supports = new WeakMap<WorldBlueprint, Map<string,
    { low: number; high: number; slope: number; floor: number }>>();
const accessRoutes = new WeakMap<WorldBlueprint, Map<string, Point2[]>>();

export interface CommunityHearthPlacementContext {
    world: WorldBlueprint;
    worldId: string;
    plots: readonly FjordPlot[];
    paths: readonly (readonly Point2[])[];
}
export interface CommunityHearthPlacementResult {
    available: boolean;
    reason: string | null;
    placement?: CommunityHearthPlacement;
}

/** The small stone footing supports the authored model without changing saved terrain. */
export function communityHearthSupport(world: WorldBlueprint, placement: CommunityHearthPlacement) {
    const key = JSON.stringify([placement.x, placement.z, placement.rotation]);
    const cache = supports.get(world) ?? new Map();
    const cached = cache.get(key);
    if (cached) return { ...cached };
    const reservation = communityHearthReservation(world, placement);
    const bounds = communityHearthBounds(reservation);
    const surface = createBlueprintSurface(world);
    let low = Infinity, high = -Infinity, slope = 0;
    const columns = Math.ceil(bounds.maxX - bounds.minX);
    const rows = Math.ceil(bounds.maxZ - bounds.minZ);
    for (let column = 0; column <= columns; column++) {
        for (let row = 0; row <= rows; row++) {
            const x = bounds.minX + (bounds.maxX - bounds.minX) * column / columns;
            const z = bounds.minZ + (bounds.maxZ - bounds.minZ) * row / rows;
            const height = surface.surfaceHeightAt(x, z);
            low = Math.min(low, height);
            high = Math.max(high, height);
            slope = Math.max(slope, surface.slopeAt(x, z));
        }
    }
    const result = { low, high, slope, floor: high + .025 };
    if (cache.size >= 512) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    supports.set(world, cache);
    return { ...result };
}

export function communityHearthReservation(world: WorldBlueprint,
    placement: CommunityHearthPlacement): FjordPlot {
    const sine = Math.abs(Math.sin(placement.rotation));
    const cosine = Math.abs(Math.cos(placement.rotation));
    return {
        ...placement,
        y: createBlueprintSurface(world).surfaceHeightAt(placement.x, placement.z),
        scale: 1,
        halfWidth: communityHearthFootprint.halfWidth * cosine + communityHearthFootprint.halfDepth * sine,
        halfDepth: communityHearthFootprint.halfWidth * sine + communityHearthFootprint.halfDepth * cosine,
    };
}

export function communityHearthBounds(plot: FjordPlot): Bounds2 {
    return { minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
        minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth };
}

export function overlapsCommunityHearth(first: Pick<FjordPlot, 'x' | 'z' | 'halfWidth' | 'halfDepth'>,
    second: Pick<FjordPlot, 'x' | 'z' | 'halfWidth' | 'halfDepth'>, margin = 0): boolean {
    return Math.abs(first.x - second.x) < first.halfWidth + second.halfWidth + margin &&
        Math.abs(first.z - second.z) < first.halfDepth + second.halfDepth + margin;
}

function segmentTouchesBounds(first: Point2, second: Point2, bounds: Bounds2, margin: number) {
    let near = 0, far = 1;
    for (const [start, delta, low, high] of [
        [first.x, second.x - first.x, bounds.minX - margin, bounds.maxX + margin],
        [first.z, second.z - first.z, bounds.minZ - margin, bounds.maxZ + margin],
    ]) {
        if (Math.abs(delta) < 1e-10) {
            if (start < low || start > high) return false;
            continue;
        }
        const entry = (low - start) / delta, exit = (high - start) / delta;
        near = Math.max(near, Math.min(entry, exit));
        far = Math.min(far, Math.max(entry, exit));
        if (near > far) return false;
    }
    return true;
}

/** A bounded outdoor approach uses the same walking limits as village paths. */
export function communityHearthAccess(context: CommunityHearthPlacementContext,
    placement: CommunityHearthPlacement): Point2[] {
    const { world, plots } = context;
    const key = JSON.stringify([placement, plots, context.paths]);
    const cache = accessRoutes.get(world) ?? new Map<string, Point2[]>();
    const cached = cache.get(key);
    if (cached) return cached.map(point => ({ ...point }));
    const surface = createBlueprintSurface(world);
    const fire = settlementCampfire(world);
    const reservation = communityHearthReservation(world, placement);
    const forward = { x: Math.sin(placement.rotation), z: Math.cos(placement.rotation) };
    const exitDistance = Math.min(Math.abs(forward.x) > 1e-6 ? reservation.halfWidth / Math.abs(forward.x) : Infinity,
        Math.abs(forward.z) > 1e-6 ? reservation.halfDepth / Math.abs(forward.z) : Infinity) + 3;
    const preferred = { x: placement.x + forward.x * exitDistance,
        z: placement.z + forward.z * exitDistance };
    const start = { x: Math.round(preferred.x), z: Math.round(preferred.z) };
    const bounds = { minX: Math.floor(Math.min(fire.transform.x, start.x) - 18),
        maxX: Math.ceil(Math.max(fire.transform.x, start.x) + 18),
        minZ: Math.floor(Math.min(fire.transform.z, start.z) - 18),
        maxZ: Math.ceil(Math.max(fire.transform.z, start.z) + 18) };
    const cleared = [reservation, ...plots,
        { ...fire.transform, halfWidth: fire.clearingRadius, halfDepth: fire.clearingRadius },
        ...context.paths.flatMap(path => path.map(point => ({ ...point, halfWidth: 1.5, halfDepth: 1.5 })))];
    const nature = world.placementPlan.filter(item => !item.assetId.includes('grass') &&
        !cleared.some(plot => overlapsCommunityHearth(plot,
            { ...item, halfWidth: item.clearance, halfDepth: item.clearance })));
    const walkable = new Map<string, boolean>();
    const pointKey = (point: Point2) => point.x + ',' + point.z;
    const safe = (point: Point2) => {
        const id = pointKey(point);
        if (walkable.has(id)) return walkable.get(id)!;
        const valid = point.x >= bounds.minX && point.x <= bounds.maxX &&
            point.z >= bounds.minZ && point.z <= bounds.maxZ &&
            point.x >= world.terrain.bounds.minX + 1 && point.x <= world.terrain.bounds.maxX - 1 &&
            point.z >= world.terrain.bounds.minZ + 1 && point.z <= world.terrain.bounds.maxZ - 1 &&
            surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + suitability.walkingElevation &&
            surface.slopeAt(point.x, point.z) <= suitability.walkingSlope &&
            Math.hypot(point.x - fire.transform.x, point.z - fire.transform.z) > fire.obstacleRadius + .65 &&
            ![reservation, ...plots].some(plot => overlapsCommunityHearth(plot,
                { ...point, halfWidth: .65, halfDepth: .65 })) &&
            !nature.some(item => Math.hypot(point.x - item.x, point.z - item.z) < item.clearance + .65);
        walkable.set(id, valid);
        return valid;
    };
    const queue: Point2[] = safe(start) ? [start] : [];
    const parents = new Map<string, Point2 | null>();
    if (queue.length) parents.set(pointKey(start), null);
    let goal: Point2 | undefined;
    for (let cursor = 0; cursor < queue.length && cursor < 20000; cursor++) {
        const point = queue[cursor];
        if (Math.hypot(point.x - fire.transform.x, point.z - fire.transform.z) <= 6.25) {
            goal = point;
            break;
        }
        for (const next of [{ x: point.x + 1, z: point.z }, { x: point.x, z: point.z + 1 },
            { x: point.x - 1, z: point.z }, { x: point.x, z: point.z - 1 }]) {
            const id = pointKey(next);
            if (parents.has(id) || !safe(next)) continue;
            parents.set(id, point);
            queue.push(next);
        }
    }
    const route: Point2[] = [];
    for (let point = goal; point; point = parents.get(pointKey(point)) ?? undefined) route.push(point);
    route.reverse();
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, route);
    accessRoutes.set(world, cache);
    return route.map(point => ({ ...point }));
}

/** Validate the complete upgrade envelope against saved geography and live home reservations.
 * No grading, home relocation, recipe mutation or navigation-grid editing is permitted here. */
export function inspectCommunityHearthPlacement(context: CommunityHearthPlacementContext,
    placement: CommunityHearthPlacement): CommunityHearthPlacementResult {
    const reject = (reason: string): CommunityHearthPlacementResult => ({ available: false, reason });
    if (!placement || placement.worldId !== context.worldId ||
        ![placement.x, placement.z, placement.rotation].every(Number.isFinite))
        return reject('The community site does not belong to this island.');
    const { world } = context;
    const fire = settlementCampfire(world).transform;
    const rotation = Math.atan2(fire.x - placement.x, fire.z - placement.z);
    if (Math.abs(Math.atan2(Math.sin(rotation - placement.rotation),
        Math.cos(rotation - placement.rotation))) > 1e-6)
        return reject('The community entrance must face the existing campfire.');
    const distance = Math.hypot(fire.x - placement.x, fire.z - placement.z);
    if (distance > 64) return reject('Choose a community site within reach of the existing gathering court.');
    const reservation = communityHearthReservation(world, placement);
    const bounds = communityHearthBounds(reservation);
    const terrain = world.terrain.bounds;
    if (bounds.minX < terrain.minX + 1 || bounds.maxX > terrain.maxX - 1 ||
        bounds.minZ < terrain.minZ + 1 || bounds.maxZ > terrain.maxZ - 1)
        return reject('The full Clan Hall footprint must stay on the island.');
    if (Math.hypot(Math.max(0, Math.abs(fire.x - reservation.x) - reservation.halfWidth),
        Math.max(0, Math.abs(fire.z - reservation.z) - reservation.halfDepth)) < communityHearthCourtRadius)
        return reject('Keep the fire and outdoor ceremony court clear.');
    if (context.plots.some(plot => overlapsCommunityHearth(reservation, plot, 1)))
        return reject('The Clan Hall upgrade footprint overlaps a household plot.');
    const rival = world.rivalSite?.bounds;
    if (rival && bounds.minX < rival.maxX + 1 && bounds.maxX > rival.minX - 1 &&
        bounds.minZ < rival.maxZ + 1 && bounds.maxZ > rival.minZ - 1)
        return reject('The community site must stay outside the neighbouring settlement.');
    const paths = [...context.paths, ...world.settlement.accessPaths,
        ...(world.siteSelection?.connection ? [world.siteSelection.connection] : [])];
    if (paths.some(path => path.some((point, index) =>
        segmentTouchesBounds(point, path[index + 1] ?? point, bounds, 1.5))))
        return reject('Keep existing settlement paths and shore access clear.');
    const harbor = world.settlement.harbor;
    if (harbor && segmentTouchesBounds(harbor, harbor, bounds, 5))
        return reject('Keep the coastal landing clear.');
    if (world.oreSites?.sites.some(site => segmentTouchesBounds(site.position, site.approach, bounds, 10)))
        return reject('Keep mineral deposits and their working approaches clear.');
    const environment = world.environment;
    if (environment && world.oreSites?.wetLowlands?.patches.some(patch => patch.cells.some(cell => {
        const point = { x: world.terrain.bounds.minX + cell % environment.columns * environment.spacing,
            z: world.terrain.bounds.minZ + Math.floor(cell / environment.columns) * environment.spacing };
        return segmentTouchesBounds(point, point, bounds, environment.spacing / 2 + 1);
    }))) return reject('The community structure cannot cover a wet lowland.');
    const support = communityHearthSupport(world, placement);
    if (support.low <= world.waterLevel + suitability.foundationElevation)
        return reject('The full Clan Hall footprint needs dry ground.');
    if (support.slope > suitability.foundationSlope)
        return reject('The full Clan Hall footprint is too steep.');
    if (support.high - support.low > communityHearthMaximumFooting)
        return reject('The ground exceeds the community site’s 0.6 m stone-footing limit.');
    if (!communityHearthAccess(context, placement).length)
        return reject('No dry outdoor approach connects this site to the existing campfire.');
    return { available: true, reason: null, placement: { ...placement } };
}

/** A bounded deterministic offer. An unavailable result leaves the original fire operational. */
export function findCommunityHearthPlacement(context: CommunityHearthPlacementContext,
    preferred?: Point2): CommunityHearthPlacementResult {
    const center = settlementCampfire(context.world).transform;
    const at = (point: Point2) => inspectCommunityHearthPlacement(context, {
        x: point.x, z: point.z,
        rotation: Math.atan2(center.x - point.x, center.z - point.z), worldId: context.worldId,
    });
    if (preferred) return at(preferred);
    const candidates: Point2[] = [...(campaignIslandPlan(context.world)?.plots ?? [])];
    for (const distance of [16, 18, 20, 22, 24, 27, 30, 33, 38, 44, 50, 56, 62]) {
        for (let direction = 0; direction < 32; direction++) {
            const angle = direction * Math.PI / 16;
            candidates.push({ x: center.x + Math.sin(angle) * distance,
                z: center.z + Math.cos(angle) * distance });
        }
    }
    candidates.sort((first, second) => Math.hypot(first.x - center.x, first.z - center.z) -
        Math.hypot(second.x - center.x, second.z - center.z));
    for (const candidate of candidates) {
        const result = at(candidate);
        if (result.available) return result;
    }
    return { available: false,
        reason: 'No legal space for both community upgrades beside this campfire. Existing homes, paths and terrain are kept.' };
}
