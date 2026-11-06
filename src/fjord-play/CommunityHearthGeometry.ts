import type { CommunityHearthPlacement } from '../simulation/SimulationCore';
import type { Bounds2, Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import type { FjordPlot, FjordTransform } from './FjordProjection';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import { communityHearthAssets } from './CommunityHearthAssets';
import { communityHearthProfiles } from './CommunityHearthProfiles';

export type CommunityHearthStructureTier = 1 | 2;
export const communityHearthFireRadius = 1.67144;
const geometryCache = new WeakMap<WorldBlueprint, Map<string, ReturnType<typeof buildGeometry>>>();

export function communityHearthLocalPoint(transform: FjordTransform, point: Point2): Point2 {
    const dx = point.x - transform.x, dz = point.z - transform.z;
    return { x: dx * Math.cos(transform.rotation) - dz * Math.sin(transform.rotation),
        z: dx * Math.sin(transform.rotation) + dz * Math.cos(transform.rotation) };
}

/** Occupancy is oriented; an open forecourt must not become the model's solid bounding box. */
export function communityHearthContains(plot: FjordPlot, point: Point2, margin = 0) {
    const local = communityHearthLocalPoint(plot, point);
    return Math.abs(local.x) <= plot.halfWidth + margin && Math.abs(local.z) <= plot.halfDepth + margin;
}

export function communityHearthObstacleBounds(plot: FjordPlot): FjordPlot {
    const sine = Math.abs(Math.sin(plot.rotation)), cosine = Math.abs(Math.cos(plot.rotation));
    return { ...plot, rotation: 0,
        halfWidth: plot.halfWidth * cosine + plot.halfDepth * sine,
        halfDepth: plot.halfWidth * sine + plot.halfDepth * cosine };
}

/** Separating axes retain the empty corners around a rotated structure's envelope. */
export function communityHearthOverlapsPlot(footprint: FjordPlot, plot: FjordPlot, margin = 0) {
    const dx = plot.x - footprint.x, dz = plot.z - footprint.z;
    const sine = Math.sin(footprint.rotation), cosine = Math.cos(footprint.rotation);
    const c = Math.abs(cosine), s = Math.abs(sine);
    return Math.abs(dx) < footprint.halfWidth * c + footprint.halfDepth * s + plot.halfWidth + margin &&
        Math.abs(dz) < footprint.halfWidth * s + footprint.halfDepth * c + plot.halfDepth + margin &&
        Math.abs(dx * cosine - dz * sine) < footprint.halfWidth + plot.halfWidth * c + plot.halfDepth * s + margin &&
        Math.abs(dx * sine + dz * cosine) < footprint.halfDepth + plot.halfWidth * s + plot.halfDepth * c + margin;
}

function buildGeometry(world: WorldBlueprint, placement: CommunityHearthPlacement,
    tier: CommunityHearthStructureTier) {
    const profile = communityHearthProfiles[tier];
    const surface = createBlueprintSurface(world);
    const sine = Math.sin(placement.rotation), cosine = Math.cos(placement.rotation);
    const transform: FjordTransform = {
        x: placement.x - profile.scale * (profile.fireAnchor.x * cosine + profile.fireAnchor.z * sine),
        z: placement.z - profile.scale * (-profile.fireAnchor.x * sine + profile.fireAnchor.z * cosine),
        y: surface.surfaceHeightAt(placement.x, placement.z), rotation: placement.rotation, scale: profile.scale,
    };
    const at = (x: number, z: number): Point2 => ({
        x: transform.x + profile.scale * (x * cosine + z * sine),
        z: transform.z + profile.scale * (-x * sine + z * cosine),
    });
    const rectangle = (bounds: Bounds2): FjordPlot => ({ ...transform,
        ...at((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2),
        halfWidth: (bounds.maxX - bounds.minX) * profile.scale / 2,
        halfDepth: (bounds.maxZ - bounds.minZ) * profile.scale / 2 });
    const bounds = communityHearthAssets[tier].bounds;
    const footprint = rectangle({ minX: bounds.min[0], maxX: bounds.max[0],
        minZ: bounds.min[2], maxZ: bounds.max[2] });
    const envelope = communityHearthObstacleBounds(footprint);
    const occupancy = profile.occupancy.map(rectangle);
    let low = Infinity, high = -Infinity, slope = 0;
    const supports = profile.supports.map(bounds => {
        let base = Infinity, top = -Infinity;
        const columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) * profile.scale / .5));
        const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) * profile.scale / .5));
        for (let column = 0; column <= columns; column++) for (let row = 0; row <= rows; row++) {
            const point = at(bounds.minX + (bounds.maxX - bounds.minX) * column / columns,
                bounds.minZ + (bounds.maxZ - bounds.minZ) * row / rows);
            const height = surface.surfaceHeightAt(point.x, point.z);
            base = Math.min(base, height);
            top = Math.max(top, height);
            slope = Math.max(slope, surface.slopeAt(point.x, point.z));
        }
        low = Math.min(low, base);
        high = Math.max(high, top);
        return { bounds, base, top };
    });
    transform.y = high;
    return { transform, footprint, envelope, occupancy, supports,
        support: { low, high, floor: high, slope },
        fireScale: profile.fireScale, fireObstacleRadius: profile.fireScale * communityHearthFireRadius + .08 };
}

export function communityHearthGeometry(world: WorldBlueprint, placement: CommunityHearthPlacement,
    tier: CommunityHearthStructureTier) {
    const cache = geometryCache.get(world) ?? new Map<string, ReturnType<typeof buildGeometry>>();
    const key = JSON.stringify([placement, tier]);
    let geometry = cache.get(key);
    if (!geometry) {
        geometry = buildGeometry(world, placement, tier);
        if (cache.size >= 96) cache.delete(cache.keys().next().value!);
        cache.set(key, geometry);
        geometryCache.set(world, cache);
    }
    return geometry;
}
