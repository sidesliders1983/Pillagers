import type { Bounds2, Point2, WorldBlueprint } from './WorldBlueprint';
import { createBlueprintSurface } from './TerrainQueries';

export interface LandRouteContext {
    world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'navigation' | 'settlement' | 'rivalSite'>;
    exclusions?: readonly Bounds2[];
}
export const maximumTargetCorrection = 8;

/** Bounded search on the existing grid. Diagonals cannot cut blocked cell or building corners. */
export function planRoute(context: LandRouteContext, target: Point2, origin?: Point2, eightWay = false) {
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
    let end = index(target);
    const adjusted = !safe(end);
    if (surface.surfaceHeightAt(target.x, target.z) <= world.waterLevel + .25)
        throw new Error('Choose a land destination. This spot is in the water.');
    if (adjusted) {
        // Touch need not hit one exact free cell. Propose nearby ground without crossing a shore or cliff.
        const radius = maximumTargetCorrection, candidates: number[] = [];
        const containing = context.exclusions?.filter(b => target.x >= b.minX - .4 && target.x <= b.maxX + .4 &&
            target.z >= b.minZ - .4 && target.z <= b.maxZ + .4) ?? [];
        const nearest = point(end), reach = Math.ceil(radius / nav.spacing);
        for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
            const p = { x: nearest.x + dx * nav.spacing, z: nearest.z + dz * nav.spacing };
            const distance = Math.hypot(p.x - target.x, p.z - target.z);
            if (!inside(p) || distance > radius || !safe(index(p))) continue;
            const samples = Math.max(1, Math.ceil(distance));
            let previous = surface.surfaceHeightAt(target.x, target.z), connected = true;
            for (let step = 1; step <= samples; step++) {
                const q = { x: target.x + (p.x - target.x) * step / samples, z: target.z + (p.z - target.z) * step / samples };
                const height = surface.surfaceHeightAt(q.x, q.z);
                if (height <= world.waterLevel + .25 || Math.abs(height - previous) > .65 * distance / samples ||
                    context.exclusions?.some(b => !containing.includes(b) && q.x >= b.minX - .4 && q.x <= b.maxX + .4 &&
                        q.z >= b.minZ - .4 && q.z <= b.maxZ + .4)) { connected = false; break; }
                previous = height;
            }
            if (connected) candidates.push(index(p));
        }
        candidates.sort((a, b) => Math.hypot(point(a).x - target.x, point(a).z - target.z) -
            Math.hypot(point(b).x - target.x, point(b).z - target.z) || a - b);
        if (!candidates.length)
            throw new Error('No safe destination nearby. Tap open ground away from steep slopes or buildings.');
        end = candidates[0];
    }
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
    const estimate = (i: number) => {
        const dx = Math.abs(i % nav.columns - end % nav.columns);
        const dz = Math.abs(Math.floor(i / nav.columns) - Math.floor(end / nav.columns));
        return eightWay ? Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) : dx + dz;
    };
    costs[start] = 0; parents[start] = start; push({ id: start, score: estimate(start), cost: 0 });
    let expanded = 0;
    while (heap.length && expanded++ < 40000) {
        const current = pop(), i = current.id;
        if (current.cost !== costs[i]) continue;
        if (i === end) break;
        const col = i % nav.columns, row = Math.floor(i / nav.columns);
        const neighbours = [col > 0 ? i - 1 : -1, col < nav.columns - 1 ? i + 1 : -1,
            row > 0 ? i - nav.columns : -1, row < nav.rows - 1 ? i + nav.columns : -1];
        if (eightWay) {
            for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
                if (col + dx >= 0 && col + dx < nav.columns && row + dz >= 0 && row + dz < nav.rows &&
                    safe(i + dx) && safe(i + dz * nav.columns)) neighbours.push(i + dx + dz * nav.columns);
            }
        }
        for (const next of neighbours) {
            if (!safe(next)) continue;
            const diagonal = col !== next % nav.columns && row !== Math.floor(next / nav.columns);
            const nextCost = costs[i] + (diagonal ? Math.SQRT2 : 1);
            if (costs[next] <= nextCost) continue;
            const a = point(i), b = point(next);
            let passable = true;
            const distance = Math.hypot(b.x - a.x, b.z - a.z);
            const samples = Math.max(1, Math.ceil(distance));
            let previous = surface.surfaceHeightAt(a.x, a.z);
            for (let step = 1; step <= samples; step++) {
                const h = surface.surfaceHeightAt(a.x + (b.x - a.x) * step / samples,
                    a.z + (b.z - a.z) * step / samples);
                if (h <= world.waterLevel + .25 || Math.abs(h - previous) / (distance / samples) > .65) {
                    passable = false; break;
                }
                previous = h;
            }
            if (!passable) continue;
            costs[next] = nextCost; parents[next] = i;
            push({ id: next, cost: costs[next], score: costs[next] + estimate(next) });
        }
    }
    if (parents[end] < 0 || !Number.isFinite(costs[end]))
        throw new Error('No safe route found within the exploration search limit. Choose a nearer destination.');
    const route = [];
    for (let i = end; ; i = parents[i]) {
        route.push(point(i)); if (i === start) break;
    }
    route.reverse();
    if (origin && Math.hypot(route[0].x - origin.x, route[0].z - origin.z) > 1e-6)
        route.unshift({ ...origin });
    if (route.length < 2) route.push({ ...route[0] });
    return { route, target: point(end), adjusted };
}
