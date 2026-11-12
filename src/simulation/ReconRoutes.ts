import { planRoute, segmentIntersectsBounds, type LandRouteContext } from '../world-generation/LandRoutes';
import type { Bounds2, Point2 } from '../world-generation/WorldBlueprint';

export interface ReconRoutePlan {
    version: 1;
    focus: Point2;
    protectedBounds: Bounds2 | null;
    safetyMargin: number;
    coverage: 'circuit' | 'partial';
    coverageDegrees: number;
    viewpoints: { position: Point2; distance: number }[];
    observationTicks: number;
}
export interface ReconRouteOptions {
    focus: Point2;
    protectedBounds?: Bounds2;
    origins: Record<string, Point2>;
    speed: number;
    duration: number;
    surveillance: boolean;
    safetyMargin?: number;
}
export interface PreparedReconRoute {
    memberRoutes: Record<string, Point2[]>;
    returnRoutes: Record<string, Point2[]>;
    route: Point2[];
    distance: number;
    travelTicks: number;
    outwardTicks: number;
    returnTicks: number;
    plan: ReconRoutePlan;
}
const noRoute = 'No safe observation route fits this mission.';
const finitePoint = (point: Point2) => point && Number.isFinite(point.x) && Number.isFinite(point.z);
const length = (route: readonly Point2[]) => route.slice(1).reduce((total, point, index) =>
    total + Math.hypot(point.x - route[index].x, point.z - route[index].z), 0);
const cloneRoute = (route: readonly Point2[]) => route.map(point => ({ ...point }));
const longest = (routes: Record<string, Point2[]>) => Object.values(routes).reduce((a, b) =>
    length(a) >= length(b) ? a : b);

function joinRoute(route: readonly Point2[], continuation: readonly Point2[]) {
    const joined = cloneRoute(route);
    for (const point of continuation) {
        const previous = joined.at(-1);
        if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 1e-8)
            joined.push({ ...point });
    }
    return joined;
}

/** Plan from supplied known geography only; this function never reads rival layout or inhabitants. */
export function planReconRoute(context: LandRouteContext, options: ReconRouteOptions): PreparedReconRoute {
    const { focus, origins, speed, duration, surveillance } = options;
    const safetyMargin = options.safetyMargin ?? 8;
    const members = Object.keys(origins).sort();
    const originalBounds = options.protectedBounds;
    if (!finitePoint(focus) || !members.length || members.length > 62 ||
        members.some(id => !finitePoint(origins[id])) || !Number.isFinite(speed) || speed <= 0 ||
        !Number.isSafeInteger(duration) || duration < 1 || !Number.isFinite(safetyMargin) ||
        safetyMargin < 0 || safetyMargin > 32 || originalBounds &&
        (!Object.values(originalBounds).every(Number.isFinite) || originalBounds.minX >= originalBounds.maxX ||
            originalBounds.minZ >= originalBounds.maxZ))
        throw new Error('Invalid Recon route policy.');
    const protectedBounds = originalBounds ? {
        minX: originalBounds.minX - safetyMargin, maxX: originalBounds.maxX + safetyMargin,
        minZ: originalBounds.minZ - safetyMargin, maxZ: originalBounds.maxZ + safetyMargin,
    } : undefined;
    // A protected settlement never receives the departure-building connector exception.
    if (protectedBounds && members.some(id =>
        segmentIntersectsBounds(origins[id], origins[id], protectedBounds, .4))) throw new Error(noRoute);
    const routeContext = { ...context, exclusions: [...context.exclusions ?? [],
        ...(protectedBounds ? [protectedBounds] : [])] };
    const nav = context.world.navigation;
    const candidates: Point2[] = [];
    const distinct = new Set<string>();
    for (let index = 0; index < 8; index++) {
        const angle = index * Math.PI / 4, dx = Math.cos(angle), dz = Math.sin(angle);
        let radius = 16;
        if (protectedBounds && focus.x >= protectedBounds.minX && focus.x <= protectedBounds.maxX &&
            focus.z >= protectedBounds.minZ && focus.z <= protectedBounds.maxZ) {
            const xEdge = Math.abs(dx) < 1e-8 ? Infinity :
                ((dx > 0 ? protectedBounds.maxX : protectedBounds.minX) - focus.x) / dx;
            const zEdge = Math.abs(dz) < 1e-8 ? Infinity :
                ((dz > 0 ? protectedBounds.maxZ : protectedBounds.minZ) - focus.z) / dz;
            radius = Math.min(xEdge, zEdge) + nav.spacing;
        }
        const point = {
            x: nav.bounds.minX + Math.round((focus.x + dx * radius - nav.bounds.minX) / nav.spacing) * nav.spacing,
            z: nav.bounds.minZ + Math.round((focus.z + dz * radius - nav.bounds.minZ) / nav.spacing) * nav.spacing,
        };
        candidates.push(point);
        const key = `${point.x}:${point.z}`;
        if (distinct.has(key)) candidates[index] = { x: NaN, z: NaN };
        distinct.add(key);
    }
    const routeOptions = { strictNavigation: true, strictExclusions: true, allowTargetAdjustment: false };
    const approaches = new Map<number, Record<string, Point2[]> | null>();
    const approach = (index: number) => {
        if (approaches.has(index)) return approaches.get(index)!;
        try {
            const point = candidates[index];
            if (!finitePoint(point)) throw new Error(noRoute);
            const routes = Object.fromEntries(members.map(id =>
                [id, planRoute(routeContext, point, origins[id], true, routeOptions).route]));
            approaches.set(index, routes);
            return routes;
        } catch {
            approaches.set(index, null);
            return null;
        }
    };
    const followsSector = (route: readonly Point2[], from: number, to: number) => {
        const start = candidates[from], end = candidates[to];
        const direction = (to - from + 8) % 8 === 1 ? 1 : -1;
        const startAngle = Math.atan2(start.z - focus.z, start.x - focus.x);
        const endAngle = Math.atan2(end.z - focus.z, end.x - focus.x);
        const wrapped = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
        const span = wrapped(direction * (endAngle - startAngle));
        const radius = Math.min(Math.hypot(start.x - focus.x, start.z - focus.z),
            Math.hypot(end.x - focus.x, end.z - focus.z));
        const tolerance = Math.min(Math.PI / 6, Math.atan2(nav.spacing, radius));
        let furthest = 0;
        for (const point of route) {
            const angle = Math.atan2(point.z - focus.z, point.x - focus.x);
            const progress = wrapped(direction * (angle - startAngle));
            if (progress < -tolerance || progress > span + tolerance || progress + tolerance < furthest)
                return false;
            furthest = Math.max(furthest, progress);
        }
        return span > 0;
    };
    const legs = new Map<string, Point2[] | null>();
    const leg = (from: number, to: number) => {
        const key = `${from}:${to}`;
        if (legs.has(key)) return legs.get(key)!;
        try {
            if (!finitePoint(candidates[from]) || !finitePoint(candidates[to])) throw new Error(noRoute);
            const route = planRoute(routeContext, candidates[to], candidates[from], true, routeOptions).route;
            // A blocked adjacent sector yields a partial arc, never a detour around the opposite side.
            if (!followsSector(route, from, to)) throw new Error(noRoute);
            legs.set(key, route);
            legs.set(`${to}:${from}`, cloneRoute(route).reverse());
            return route;
        } catch {
            legs.set(key, null);
            legs.set(`${to}:${from}`, null);
            return null;
        }
    };
    let best: PreparedReconRoute | undefined;
    for (let start = 0; start < 8; start++) {
        const initial = approach(start);
        if (!initial) continue;
        for (const direction of [1, -1]) {
            let routes = Object.fromEntries(members.map(id => [id, cloneRoute(initial[id])]));
            const viewpoints = [{ position: { ...candidates[start] }, distance: length(longest(routes)) }];
            let outwardTicks = Math.ceil(viewpoints[0].distance / speed);
            let previous = start;
            for (let step = 1; step <= (surveillance ? 2 : 8); step++) {
                const next = (start + direction * step + 8) % 8;
                const connection = leg(previous, next), homeward = approach(next);
                if (!connection || !homeward) break;
                routes = Object.fromEntries(members.map(id => [id, joinRoute(routes[id], connection)]));
                const route = longest(routes), distance = length(route);
                outwardTicks += Math.ceil((distance - viewpoints.at(-1)!.distance) / speed);
                viewpoints.push({ position: { ...candidates[next] }, distance });
                const returnTicks = Math.ceil(length(longest(homeward)) / speed);
                const observationTicks = viewpoints.length;
                const travelTicks = outwardTicks + returnTicks;
                if (travelTicks + observationTicks > duration) break;
                const coverageDegrees = step * 45;
                const prepared: PreparedReconRoute = {
                    memberRoutes: routes,
                    returnRoutes: Object.fromEntries(members.map(id => [id, cloneRoute(homeward[id]).reverse()])),
                    route, distance, travelTicks, outwardTicks, returnTicks,
                    plan: { version: 1, focus: { ...focus },
                        protectedBounds: originalBounds ? { ...originalBounds } : null,
                        safetyMargin, coverage: step === 8 ? 'circuit' : 'partial', coverageDegrees,
                        viewpoints: viewpoints.map(view => ({ position: { ...view.position }, distance: view.distance })),
                        observationTicks },
                };
                if (!best || coverageDegrees > best.plan.coverageDegrees ||
                    coverageDegrees === best.plan.coverageDegrees && travelTicks < best.travelTicks) best = prepared;
                previous = next;
            }
        }
    }
    if (!best) throw new Error(noRoute);
    return best;
}
