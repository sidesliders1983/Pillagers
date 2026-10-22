import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { Point2 } from '../world-generation/WorldBlueprint';
import type { PhysicalExpeditionContext } from './SpatialExpeditions';

export const longshipPolicy = Object.freeze({
    speedMultiplier: 2, capacityMultiplier: 2, seaInset: 24,
    minimumDepth: .35, clearance: 1.8, landingRange: 24, maximumSearch: 40000
});

const grids = new WeakMap<object, ReturnType<typeof createGrid>>();
function createGrid(context: PhysicalExpeditionContext) {
    const world = context.world, surface = createBlueprintSurface(world);
    const bounds = world.navigation.bounds, spacing = Math.max(8, world.navigation.spacing);
    const columns = Math.ceil((bounds.maxX - bounds.minX) / spacing);
    const rows = Math.ceil((bounds.maxZ - bounds.minZ) / spacing);
    const mask = new Uint8Array(columns * rows);
    const point = (i: number) => ({ x: bounds.minX + i % columns * spacing,
        z: bounds.minZ + Math.floor(i / columns) * spacing });
    const inSea = (p: Point2) => !!p && Number.isFinite(p.x) && Number.isFinite(p.z) &&
        p.x >= bounds.minX + longshipPolicy.seaInset && p.x < bounds.maxX - longshipPolicy.seaInset &&
        p.z >= bounds.minZ + longshipPolicy.seaInset && p.z < bounds.maxZ - longshipPolicy.seaInset;
    const water = (p: Point2) => inSea(p) && [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([x, z]) =>
        surface.surfaceHeightAt(p.x + x * longshipPolicy.clearance, p.z + z * longshipPolicy.clearance) <=
            world.waterLevel - longshipPolicy.minimumDepth);
    const safe = (i: number) => {
        if (i < 0 || i >= mask.length) return false;
        if (!mask[i]) mask[i] = water(point(i)) ? 1 : 2;
        return mask[i] === 1;
    };
    const segment = (a: Point2, b: Point2) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
        for (let step = 0; step <= steps; step++)
            if (!water({ x: a.x + (b.x - a.x) * step / steps, z: a.z + (b.z - a.z) * step / steps })) return false;
        return true;
    };
    const nearest = (p: Point2) => {
        const col = Math.round((p.x - bounds.minX) / spacing), row = Math.round((p.z - bounds.minZ) / spacing);
        const choices: number[] = [];
        for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) {
            if (col + x < 0 || col + x >= columns || row + z < 0 || row + z >= rows) continue;
            const index = (row + z) * columns + col + x;
            if (safe(index) && segment(p, point(index))) choices.push(index);
        }
        choices.sort((a, b) => Math.hypot(point(a).x - p.x, point(a).z - p.z) -
            Math.hypot(point(b).x - p.x, point(b).z - p.z) || a - b);
        return choices[0];
    };
    return { columns, rows, point, inSea, water, safe, segment, nearest,
        costs: new Float64Array(mask.length), parents: new Int32Array(mask.length) };
}
function grid(context: PhysicalExpeditionContext) {
    let value = grids.get(context.world);
    if (!value) { value = createGrid(context); grids.set(context.world, value); }
    return value;
}
export function navigableSea(context: PhysicalExpeditionContext, point: Point2) { return grid(context).water(point); }
export function validSeaSegment(context: PhysicalExpeditionContext, a: Point2, b: Point2) { return grid(context).segment(a, b); }

/** Bounded water-only A* on a cached terrain mask; invoked only by destination proposals/commands. */
export function planSailingRoute(context: PhysicalExpeditionContext, origin: Point2, destination: Point2) {
    const nav = grid(context);
    if (!nav.inSea(destination)) throw new Error('Sea too rough');
    if (!nav.water(destination)) throw new Error('Choose navigable water for the longship.');
    if (!nav.water(origin)) throw new Error('The longship is not in navigable water.');
    const start = nav.nearest(origin), end = nav.nearest(destination);
    if (start === undefined || end === undefined) throw new Error('No safe sailing route near this coast.');
    nav.costs.fill(Infinity); nav.parents.fill(-1);
    const heap: { id: number; cost: number; score: number }[] = [];
    const estimate = (id: number) => Math.hypot(id % nav.columns - end % nav.columns,
        Math.floor(id / nav.columns) - Math.floor(end / nav.columns));
    const push = (value: typeof heap[number]) => {
        let i = heap.length; heap.push(value);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (heap[parent].score <= value.score) break;
            heap[i] = heap[parent]; i = parent;
        }
        heap[i] = value;
    };
    const pop = () => {
        const first = heap[0], last = heap.pop()!;
        if (heap.length) {
            let i = 0;
            while (i * 2 + 1 < heap.length) {
                let child = i * 2 + 1;
                if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
                if (heap[child].score >= last.score) break;
                heap[i] = heap[child]; i = child;
            }
            heap[i] = last;
        }
        return first;
    };
    nav.costs[start] = 0; nav.parents[start] = start; push({ id: start, cost: 0, score: estimate(start) });
    let expanded = 0;
    while (heap.length && expanded++ < longshipPolicy.maximumSearch) {
        const current = pop(), i = current.id;
        if (current.cost !== nav.costs[i]) continue;
        if (i === end) break;
        const col = i % nav.columns, row = Math.floor(i / nav.columns);
        for (const dz of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
            if ((!dx && !dz) || col + dx < 0 || col + dx >= nav.columns || row + dz < 0 || row + dz >= nav.rows) continue;
            const next = i + dx + dz * nav.columns;
            if (!nav.safe(next) || dx && dz && (!nav.safe(i + dx) || !nav.safe(i + dz * nav.columns))) continue;
            const cost = current.cost + Math.hypot(dx, dz);
            if (cost >= nav.costs[next] || !nav.segment(nav.point(i), nav.point(next))) continue;
            nav.costs[next] = cost; nav.parents[next] = i;
            push({ id: next, cost, score: cost + estimate(next) });
        }
    }
    if (nav.parents[end] < 0) throw new Error('No safe sailing route within the search limit.');
    const path: Point2[] = [];
    for (let i = end; ; i = nav.parents[i]) { path.push(nav.point(i)); if (i === start) break; }
    path.reverse();
    const route = [{ ...origin }, ...path, { ...destination }].filter((p, i, all) =>
        !i || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 1e-8);
    if (route.length < 2) route.push({ ...route[0] });
    return route;
}
