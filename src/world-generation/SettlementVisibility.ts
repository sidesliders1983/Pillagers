import { createBlueprintSurface } from './TerrainQueries';
import type { Point2, WorldBlueprint } from './WorldBlueprint';

export type ViewPoint = Point2 & { readonly y: number };
export interface TerrainSightline {
    readonly from: ViewPoint;
    readonly to: ViewPoint;
    readonly visible: boolean;
    /** A point on the canonical terrain that rises above the sightline. */
    readonly blocker: ViewPoint | null;
}

type Landscape = Pick<WorldBlueprint, 'terrain' | 'waterLevel'>;

/**
 * Trace the stored triangles exactly in XZ. The terrain and ray are linear
 * between grid/diagonal crossings, so checking these endpoints cannot step
 * over a narrow ridge. Trees, fog and distance never count as occlusion.
 */
export function traceTerrainSightline(world: Landscape, from: ViewPoint,
    to: ViewPoint): TerrainSightline {
    const surface = createBlueprintSurface(world);
    const { bounds, spacing } = world.terrain;
    for (const p of [from, to]) {
        if (![p.x, p.y, p.z].every(Number.isFinite) || p.x < bounds.minX ||
            p.x > bounds.maxX || p.z < bounds.minZ || p.z > bounds.maxZ) {
            throw new RangeError('Sightline endpoints must be inside the canonical terrain.');
        }
    }
    const dx = to.x - from.x, dz = to.z - from.z;
    const crossings = [0, 1];
    const addCrossing = (t: number) => {
        if (t > 0 && t < 1) crossings.push(t);
    };
    if (dx !== 0) {
        for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
            addCrossing((x - from.x) / dx);
        }
    }
    if (dz !== 0) {
        for (let z = bounds.minZ; z <= bounds.maxZ; z += spacing) {
            addCrossing((z - from.z) / dz);
        }
    }
    const grid = [...new Set(crossings)].sort((a, b) => a - b);
    for (let i = 1; i < grid.length; i++) {
        const middle = (grid[i - 1] + grid[i]) / 2;
        const col = Math.floor((from.x + dx * middle - bounds.minX) / spacing);
        const row = Math.floor((from.z + dz * middle - bounds.minZ) / spacing);
        const x = bounds.minX + col * spacing, z = bounds.minZ + row * spacing;
        const even = (col + row) % 2 === 0;
        const denominator = even ? dx + dz : dz - dx;
        if (denominator === 0) continue;
        const t = even ? (x + z + spacing - from.x - from.z) / denominator :
            (z - x - from.z + from.x) / denominator;
        if (t > grid[i - 1] && t < grid[i]) crossings.push(t);
    }
    crossings.sort((a, b) => a - b);
    for (const t of crossings) {
        const x = from.x + dx * t, z = from.z + dz * t;
        const height = surface.surfaceHeightAt(x, z);
        if (height > from.y + (to.y - from.y) * t + 1e-6) {
            return { from, to, visible: false, blocker: { x, y: height, z } };
        }
    }
    return { from, to, visible: true, blocker: null };
}

export interface StartingViewpoint extends ViewPoint {
    readonly id: string;
}

/** Every sampled point of the reserved area must be hidden, including roof height. */
export function inspectSiteVisibility(world: Landscape, viewpoints: readonly StartingViewpoint[],
    footprint: readonly Point2[], roofHeight: number, stopOnExposure = false) {
    if (!viewpoints.length || !footprint.length || !Number.isFinite(roofHeight) || roofHeight < 0) {
        throw new RangeError('Visibility needs viewpoints, a footprint and a non-negative roof height.');
    }
    const surface = createBlueprintSurface(world);
    const rays: (TerrainSightline & { viewpointId: string })[] = [];
    for (const view of viewpoints) for (const point of footprint) {
        const ray = { viewpointId: view.id, ...traceTerrainSightline(world, view, {
            ...point, y: surface.surfaceHeightAt(point.x, point.z) + roofHeight,
        }) };
        rays.push(ray);
        // One exposed roof point is sufficient to reject a pair. Successful proofs
        // still visit the complete grid, including every footprint edge.
        if (stopOnExposure && ray.visible) return { hidden: false, exposedRays: 1, rays };
    }
    const exposedRays = rays.filter(ray => ray.visible).length;
    return { hidden: exposedRays === 0, exposedRays, rays };
}
