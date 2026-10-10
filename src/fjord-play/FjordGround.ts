import type { FjordEntity, FjordPlot } from './FjordProjection';
import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { suitability } from '../world-generation/PlanSettlement';
export interface FjordGround {
    plots: {
        id: string;
        plot: FjordPlot;
    }[];
    paths: {
        from: string;
        to: string;
        points: Point2[];
    }[];
}
const cached = new WeakMap<WorldBlueprint, {
    signature: string;
    ground: FjordGround;
}>();
/** Presentation paths use the authoritative terrain and the existing walking thresholds.
 * They never alter geography, navigation, household assignments or simulation rules. */
export function projectFjordGround(world: WorldBlueprint, entities: readonly FjordEntity[]): FjordGround {
    const parcels = entities.filter(e => e.plot);
    const plots = parcels.filter(e => e.kind === 'building').map(e => ({ id: e.id, plot: e.plot! }));
    const signature = JSON.stringify(parcels.map(e => [e.selectionKey, e.plot]));
    const known = cached.get(world);
    if (known?.signature === signature)
        return structuredClone(known.ground);
    const ground: FjordGround = { plots, paths: [] };
    if (plots.length > 1) {
        const surface = createBlueprintSurface(world);
        const bounds = world.terrain.bounds;
        const columns = Math.floor(bounds.maxX - bounds.minX) + 1;
        const rows = Math.floor(bounds.maxZ - bounds.minZ) + 1;
        const point = (i: number): Point2 => ({ x: bounds.minX + i % columns,
            z: bounds.minZ + Math.floor(i / columns) });
        const index = (p: Point2) => Math.round(p.z - bounds.minZ) * columns + Math.round(p.x - bounds.minX);
        const cells = Array.from({ length: columns * rows }, (_, i) => {
            const p = point(i);
            return surface.surfaceHeightAt(p.x, p.z) >= world.waterLevel + suitability.walkingElevation &&
                surface.slopeAt(p.x, p.z) <= suitability.walkingSlope &&
                parcels.every(e => Math.abs(p.x - e.plot!.x) > e.plot!.halfWidth + .65 ||
                    Math.abs(p.z - e.plot!.z) > e.plot!.halfDepth + .65);
        });
        const door = (plot: FjordPlot) => index({ x: plot.x + Math.sin(plot.rotation) * (plot.halfDepth + 2),
            z: plot.z + Math.cos(plot.rotation) * (plot.halfDepth + 2) });
        const connected = new Map<number, string>();
        connected.set(door(plots[0].plot), plots[0].id);
        for (const home of plots.slice(1)) {
            const start = door(home.plot);
            if (!cells[start])
                continue;
            const parent = new Int32Array(cells.length).fill(-1);
            parent[start] = start;
            const queue = [start];
            let end = -1;
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const i = queue[cursor];
                if (connected.has(i)) {
                    end = i;
                    break;
                }
                const column = i % columns, row = Math.floor(i / columns);
                const neighbors = [column > 0 ? i - 1 : -1, row < rows - 1 ? i + columns : -1,
                    column < columns - 1 ? i + 1 : -1, row > 0 ? i - columns : -1];
                for (const next of neighbors) {
                    if (next < 0 || !cells[next] || parent[next] !== -1)
                        continue;
                    parent[next] = i;
                    queue.push(next);
                }
            }
            if (end < 0)
                continue;
            const points: Point2[] = [];
            for (let i = end;; i = parent[i]) {
                points.push(point(i));
                if (i === start)
                    break;
            }
            ground.paths.push({ from: home.id, to: connected.get(end)!, points: points.reverse() });
            connected.set(start, home.id);
        }
    }
    // Each consumer owns its presentation result; never expose the shared cache.
    cached.set(world, { signature, ground: structuredClone(ground) });
    return ground;
}
/** Soil appears only at permanent parcels and their connecting paths. */
export function fjordGroundWeights(world: WorldBlueprint, ground: FjordGround, grassPlots: readonly FjordPlot[] = []): number[] {
    return world.terrain.heights.map((height, i) => {
        if (height < world.waterLevel + suitability.walkingElevation)
            return 0;
        const x = world.terrain.bounds.minX + i % world.terrain.columns * world.terrain.spacing;
        const z = world.terrain.bounds.minZ + Math.floor(i / world.terrain.columns) * world.terrain.spacing;
        if (grassPlots.some(p => Math.abs(x - p.x) <= p.halfWidth && Math.abs(z - p.z) <= p.halfDepth))
            return 0;
        let weight = 0;
        for (const { plot } of ground.plots) {
            const distance = Math.max(Math.abs(x - plot.x) - plot.halfWidth, Math.abs(z - plot.z) - plot.halfDepth, 0);
            weight = Math.max(weight, Math.max(0, 1 - distance));
        }
        for (const path of ground.paths)
            for (const p of path.points) {
                const distance = Math.hypot(x - p.x, z - p.z);
                weight = Math.max(weight, Math.max(0, 1 - distance / 1.5));
            }
        return weight;
    });
}
