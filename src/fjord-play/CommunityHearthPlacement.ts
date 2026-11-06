import type { CommunityHearthPlacement } from '../simulation/SimulationCore';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { suitability } from '../world-generation/PlanSettlement';
import type { FjordPlot } from './FjordProjection';
import { settlementCampfire } from './SettlementCampfire';
import { communityHearthContains, communityHearthGeometry, communityHearthLocalPoint,
    communityHearthOverlapsPlot } from './CommunityHearthGeometry';

export const communityHearthCourtRadius = 8.75;
export const communityHearthMaximumFooting = .6;
const accessRoutes = new WeakMap<WorldBlueprint, Map<string, Point2[]>>();
const resolvedSites = new WeakMap<WorldBlueprint, Map<string, CommunityHearthStatus>>();
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
export interface CommunityHearthStatus extends CommunityHearthPlacementResult { legacy: boolean }

export function communityHearthBounds(plot: FjordPlot): Bounds2 {
    return { minX: plot.x - plot.halfWidth, maxX: plot.x + plot.halfWidth,
        minZ: plot.z - plot.halfDepth, maxZ: plot.z + plot.halfDepth };
}
export function overlapsCommunityHearth(first: Pick<FjordPlot, 'x' | 'z' | 'halfWidth' | 'halfDepth'>,
    second: Pick<FjordPlot, 'x' | 'z' | 'halfWidth' | 'halfDepth'>, margin = 0): boolean {
    return Math.abs(first.x - second.x) < first.halfWidth + second.halfWidth + margin &&
        Math.abs(first.z - second.z) < first.halfDepth + second.halfDepth + margin;
}

/** Housing reserves both envelopes; walkers reserve only walls, posts and props. */
export function communityHearthReservation(world: WorldBlueprint, placement: CommunityHearthPlacement): FjordPlot {
    const plots = [1, 2].map(tier => communityHearthGeometry(world, placement, tier as 1 | 2).envelope);
    const minX = Math.min(...plots.map(plot => plot.x - plot.halfWidth));
    const maxX = Math.max(...plots.map(plot => plot.x + plot.halfWidth));
    const minZ = Math.min(...plots.map(plot => plot.z - plot.halfDepth));
    const maxZ = Math.max(...plots.map(plot => plot.z + plot.halfDepth));
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2,
        y: createBlueprintSurface(world).surfaceHeightAt(placement.x, placement.z), rotation: 0, scale: 1,
        halfWidth: (maxX - minX) / 2, halfDepth: (maxZ - minZ) / 2 };
}
export function communityHearthSupport(world: WorldBlueprint, placement: CommunityHearthPlacement, tier: 1 | 2 = 2) {
    return { ...communityHearthGeometry(world, placement, tier).support };
}
export function communityHearthOccupancy(world: WorldBlueprint, placement: CommunityHearthPlacement) {
    return [1, 2].flatMap(tier => communityHearthGeometry(world, placement, tier as 1 | 2).occupancy);
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
export function pathTouchesCommunityHearth(path: readonly Point2[], occupancy: readonly FjordPlot[], margin = 1.5) {
    return occupancy.some(plot => path.some((point, index) => segmentTouchesBounds(
        communityHearthLocalPoint(plot, point), communityHearthLocalPoint(plot, path[index + 1] ?? point),
        { minX: -plot.halfWidth, maxX: plot.halfWidth, minZ: -plot.halfDepth, maxZ: plot.halfDepth }, margin)));
}

/** A short exterior approach reaches the original fire through the open forecourt. */
export function communityHearthAccess(context: CommunityHearthPlacementContext,
    placement: CommunityHearthPlacement, tier: 1 | 2 = 2): Point2[] {
    const { world, plots } = context;
    const key = JSON.stringify([placement, tier, plots, context.paths]);
    const cache = accessRoutes.get(world) ?? new Map<string, Point2[]>();
    const cached = cache.get(key);
    if (cached) return cached.map(point => ({ ...point }));
    const surface = createBlueprintSurface(world), fire = settlementCampfire(world);
    const reservation = communityHearthReservation(world, placement);
    const geometry = communityHearthGeometry(world, placement, tier);
    const occupancy = geometry.occupancy, radius = geometry.fireObstacleRadius;
    const shoreEntry = world.settlement.accessPaths[0]?.find(point =>
        Math.hypot(point.x - placement.x, point.z - placement.z) >= 5);
    const start = shoreEntry ? { x: shoreEntry.x, z: shoreEntry.z } :
        { x: Math.round(placement.x + Math.sin(placement.rotation) * 8),
            z: Math.round(placement.z + Math.cos(placement.rotation) * 8) };
    const cleared = [reservation, ...plots,
        { ...fire.transform, halfWidth: fire.clearingRadius, halfDepth: fire.clearingRadius },
        ...context.paths.flatMap(path => path.map(point => ({ ...point, halfWidth: 1.5, halfDepth: 1.5 })))];
    const nature = world.placementPlan.filter(item => !item.assetId.includes('grass') &&
        !cleared.some(plot => overlapsCommunityHearth(plot,
            { ...item, halfWidth: item.clearance, halfDepth: item.clearance })));
    const safe = (point: Point2) => Math.abs(point.x - placement.x) <= 18 && Math.abs(point.z - placement.z) <= 18 &&
        point.x >= world.terrain.bounds.minX + 1 && point.x <= world.terrain.bounds.maxX - 1 &&
        point.z >= world.terrain.bounds.minZ + 1 && point.z <= world.terrain.bounds.maxZ - 1 &&
        surface.surfaceHeightAt(point.x, point.z) > world.waterLevel + suitability.walkingElevation &&
        surface.slopeAt(point.x, point.z) <= suitability.walkingSlope &&
        Math.hypot(point.x - placement.x, point.z - placement.z) > radius + .45 &&
        !occupancy.some(plot => communityHearthContains(plot, point, .45)) &&
        !plots.some(plot => overlapsCommunityHearth(plot, { ...point, halfWidth: .65, halfDepth: .65 })) &&
        !nature.some(item => Math.hypot(point.x - item.x, point.z - item.z) < item.clearance + .65);
    const pointKey = (point: Point2) => point.x + ',' + point.z;
    // The shelter's authored front bench occupies the closer ring; its approach ends outside it.
    const arrivalRadius = tier === 1 ? 3.75 : 3;
    const queue = safe(start) ? [start] : [];
    const parents = new Map<string, Point2 | null>();
    if (queue.length) parents.set(pointKey(start), null);
    let goal: Point2 | undefined;
    for (let cursor = 0; cursor < queue.length && cursor < 6000; cursor++) {
        const point = queue[cursor];
        if (Math.hypot(point.x - placement.x, point.z - placement.z) <= arrivalRadius) { goal = point; break; }
        for (const next of [{ x: point.x + .5, z: point.z }, { x: point.x, z: point.z + .5 },
            { x: point.x - .5, z: point.z }, { x: point.x, z: point.z - .5 }]) {
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

/** One fire anchor and orientation serve both paid tiers, without moving homes or terrain. */
export function inspectCommunityHearthPlacement(context: CommunityHearthPlacementContext,
    placement: CommunityHearthPlacement): CommunityHearthPlacementResult {
    const reject = (reason: string): CommunityHearthPlacementResult => ({ available: false, reason });
    const { world } = context, fire = settlementCampfire(world).transform;
    if (!placement || placement.worldId !== context.worldId ||
        ![placement.x, placement.z, placement.rotation].every(Number.isFinite))
        return reject('The community site does not belong to this island.');
    if (Math.hypot(placement.x - fire.x, placement.z - fire.z) > 1e-6)
        return reject('The community structure must stay anchored to the existing campfire.');
    const reservation = communityHearthReservation(world, placement);
    const bounds = communityHearthBounds(reservation), terrain = world.terrain.bounds;
    if (bounds.minX < terrain.minX + 1 || bounds.maxX > terrain.maxX - 1 ||
        bounds.minZ < terrain.minZ + 1 || bounds.maxZ > terrain.maxZ - 1)
        return reject('Both community structures must stay on the island.');
    if ([1, 2].some(tier => context.plots.some(plot => communityHearthOverlapsPlot(
        communityHearthGeometry(world, placement, tier as 1 | 2).footprint, plot, 1))))
        return reject('The community upgrade envelope overlaps a household plot.');
    const rival = world.rivalSite?.bounds;
    if (rival && bounds.minX < rival.maxX + 1 && bounds.maxX > rival.minX - 1 &&
        bounds.minZ < rival.maxZ + 1 && bounds.maxZ > rival.minZ - 1)
        return reject('The community site must stay outside the neighbouring settlement.');
    // Baked shore routes end at the nucleus, even inside the original solid fire ring.
    // Preserve their exterior; the last metres use the verified open-court approach.
    const exteriorShorePaths = world.settlement.accessPaths.flatMap(path => path.slice(0, -1).flatMap((point, index) => {
        const next = path[index + 1];
        return Math.hypot(point.x - fire.x, point.z - fire.z) >= 5 &&
            Math.hypot(next.x - fire.x, next.z - fire.z) >= 5 ? [[point, next]] : [];
    }));
    const paths = [...exteriorShorePaths,
        ...(world.siteSelection?.connection ? [world.siteSelection.connection] : [])];
    const occupancy = communityHearthOccupancy(world, placement);
    if (paths.some(path => pathTouchesCommunityHearth(path, occupancy)))
        return reject('Keep existing settlement paths and shore access clear of community walls and props.');
    const harbor = world.settlement.harbor;
    if (harbor && segmentTouchesBounds(harbor, harbor, bounds, 5)) return reject('Keep the coastal landing clear.');
    if (world.oreSites?.sites.some(site => segmentTouchesBounds(site.position, site.approach, bounds, 10)))
        return reject('Keep mineral deposits and their working approaches clear.');
    const environment = world.environment;
    if (environment && world.oreSites?.wetLowlands?.patches.some(patch => patch.cells.some(cell => {
        const point = { x: terrain.minX + cell % environment.columns * environment.spacing,
            z: terrain.minZ + Math.floor(cell / environment.columns) * environment.spacing };
        return segmentTouchesBounds(point, point, bounds, environment.spacing / 2 + 1);
    }))) return reject('The community structure cannot cover a wet lowland.');
    for (const tier of [1, 2] as const) {
        const support = communityHearthSupport(world, placement, tier);
        if (support.low <= world.waterLevel + suitability.foundationElevation)
            return reject('Both community structures need dry supporting ground.');
        // Independent stone feet support the untouched grade; this is not a flat household slab.
        if (support.slope > suitability.walkingSlope) return reject('The community supports are on ground that is too steep.');
        if (support.high - support.low > communityHearthMaximumFooting)
            return reject('The ground exceeds the community site’s 0.6 m local-support limit.');
    }
    if (![1, 2].every(tier => communityHearthAccess(context, placement, tier as 1 | 2).length))
        return reject('No dry outdoor approach reaches the fire through both community structures.');
    return { available: true, reason: null, placement: { ...placement } };
}

export function findCommunityHearthPlacement(context: CommunityHearthPlacementContext,
    preferred?: Point2, preferredRotation = 0): CommunityHearthPlacementResult {
    const center = settlementCampfire(context.world).transform;
    if (preferred && Math.hypot(preferred.x - center.x, preferred.z - center.z) > 1e-6)
        return { available: false, reason: 'The community structure stays at the existing campfire.' };
    for (let index = 0; index < 32; index++) {
        const angle = preferredRotation + index * Math.PI / 16;
        const result = inspectCommunityHearthPlacement(context, { x: center.x, z: center.z,
            rotation: Math.atan2(Math.sin(angle), Math.cos(angle)), worldId: context.worldId });
        if (result.available) return result;
    }
    return { available: false,
        reason: 'No legal space for both community structures around this campfire. Existing homes, paths and terrain are kept.' };
}

/** Detached trial receipts stay history; their display is resolved around the original fire. */
export function resolveCommunityHearthPlacement(context: CommunityHearthPlacementContext,
    receipt: CommunityHearthPlacement): CommunityHearthStatus {
    const key = JSON.stringify([receipt, context.worldId, context.plots, context.paths]);
    const cache = resolvedSites.get(context.world) ?? new Map<string, CommunityHearthStatus>();
    let result = cache.get(key);
    if (!result) {
        result = resolvePlacement(context, receipt);
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        resolvedSites.set(context.world, cache);
    }
    return { ...result, ...(result.placement ? { placement: { ...result.placement } } : {}) };
}
function resolvePlacement(context: CommunityHearthPlacementContext,
    receipt: CommunityHearthPlacement): CommunityHearthStatus {
    const fire = settlementCampfire(context.world).transform;
    const distance = Math.hypot(receipt.x - fire.x, receipt.z - fire.z);
    const legacy = distance > 1e-6;
    if (!legacy) return { ...inspectCommunityHearthPlacement(context, receipt), legacy: false };
    const facing = Math.atan2(fire.x - receipt.x, fire.z - receipt.z);
    if (receipt.worldId !== context.worldId || ![receipt.x, receipt.z, receipt.rotation].every(Number.isFinite) ||
        distance < 16 - 1e-6 || distance > 64 || Math.abs(Math.atan2(Math.sin(facing - receipt.rotation),
            Math.cos(facing - receipt.rotation))) > 1e-6)
        return { available: false, reason: 'Invalid historical Community Hearth placement.', legacy: true };
    return { ...findCommunityHearthPlacement(context, undefined, receipt.rotation), legacy: true };
}
