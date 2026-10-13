import { buildingDistance } from '../world/SettlementLayout';
import { footprintBounds, suitability } from './PlanSettlement';
import { createBlueprintSurface } from './TerrainQueries';
import type { Bounds2, BuildingPlacement, Point2, WorldBlueprint } from './WorldBlueprint';

export type ReservationKind = 'player-site' | 'rival-site' | 'player-foundation' |
    'rival-foundation' | 'neutral-buffer' | 'access-path' | 'rival-connection' | 'harbor-berth' | 'harbor-approach';
type Reservation = { kind: ReservationKind; id: string };
type Shape = { bounds: Bounds2; contains(x: number, z: number): boolean; reservation?: Reservation;
    obstacle?: 'building' | 'scenery' };
const contains = (b: Bounds2, x: number, z: number) =>
    x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/** Sparse broad-phase index over existing objects/routes, never an extra terrain raster. */
export function createSpatialConstraints(world: WorldBlueprint) {
    const buckets = new Map<string, Shape[]>();
    const bucketSize = 16;
    let shapes = 0, references = 0;
    const add = (shape: Shape) => {
        shapes++;
        const b = shape.bounds;
        for (let row = Math.floor(b.minZ / bucketSize); row <= Math.floor(b.maxZ / bucketSize); row++) {
            for (let col = Math.floor(b.minX / bucketSize); col <= Math.floor(b.maxX / bucketSize); col++) {
                const key = `${row}:${col}`, bucket = buckets.get(key) ?? [];
                bucket.push(shape);
                buckets.set(key, bucket);
                references++;
            }
        }
    };
    const site = (kind: ReservationKind, bounds: Bounds2) =>
        add({ bounds, reservation: { kind, id: kind }, contains: (x, z) => contains(bounds, x, z) });
    site('player-site', world.settlement.bounds);
    if (world.rivalSite) site('rival-site', world.rivalSite.bounds);
    const foundation = (building: BuildingPlacement, kind: ReservationKind, obstacle: boolean) => {
        add({ bounds: footprintBounds(building, suitability.residentClearance),
            reservation: { kind, id: building.id }, obstacle: obstacle ? 'building' : undefined,
            contains: (x, z) => buildingDistance(x, z, building) < suitability.residentClearance });
    };
    for (const b of world.settlement.buildings) foundation(b, 'player-foundation', true);
    // Rival foundations are already obstacles in the saved navigation grid.
    for (const b of world.rivalSite?.foundations ?? []) foundation(b, 'rival-foundation', false);
    for (const [i, bounds] of (world.siteSelection?.buffers ?? []).entries()) {
        add({ bounds, reservation: { kind: 'neutral-buffer', id: `buffer-${i}` },
            contains: (x, z) => contains(bounds, x, z) && !contains(world.settlement.bounds, x, z) &&
                !(world.rivalSite && contains(world.rivalSite.bounds, x, z)) });
    }
    const route = (points: readonly Point2[], kind: ReservationKind, id: string) => {
        const radius = suitability.residentClearance;
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[i + 1] ?? a;
            const dx = b.x - a.x, dz = b.z - a.z, lengthSquared = dx * dx + dz * dz;
            add({ bounds: { minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius,
                minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius },
                reservation: { kind, id }, contains: (x, z) => {
                    const t = lengthSquared ? Math.max(0, Math.min(1,
                        ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared)) : 0;
                    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) <= radius;
                } });
        }
    };
    world.settlement.accessPaths.forEach((path, i) => route(path, 'access-path', `access-${i}`));
    route(world.siteSelection?.connection ?? [], 'rival-connection', 'rival-connection');
    const berth = world.siteSelection?.harborBerth;
    if (berth) {
        if (world.settlement.harbor) route([world.settlement.harbor, berth.center],
            'harbor-approach', 'harbor-approach');
        foundation({ ...berth.center, id: 'harbor-berth', key: 'harbor', rotation: berth.rotation,
            halfWidth: berth.halfBeam, halfDepth: berth.halfLength, radius: berth.halfLength },
        'harbor-berth', false);
    }
    for (const p of world.placementPlan) {
        if (p.assetId.includes('grass')) continue;
        const radius = p.clearance + .5; // Preserve the existing resident steering clearance.
        add({ bounds: { minX: p.x - radius, maxX: p.x + radius, minZ: p.z - radius, maxZ: p.z + radius },
            obstacle: 'scenery', contains: (x, z) => Math.hypot(x - p.x, z - p.z) <= radius });
    }
    const surface = createBlueprintSurface(world), nav = world.navigation;
    return {
        storage: { bucketCount: buckets.size, shapes, references, serializedBytes: 0 },
        sample(x: number, z: number, index: number, height: number, triangleSlope: number) {
            const matches = (buckets.get(`${Math.floor(z / bucketSize)}:${Math.floor(x / bucketSize)}`) ?? [])
                .filter(shape => shape.contains(x, z));
            const reservations = [...new Map(matches.filter(s => s.reservation).map(s =>
                [s.reservation!.kind + ':' + s.reservation!.id, s.reservation!])).values()];
            const placementSlope = surface.slopeAt(x, z);
            const movementReasons: string[] = [];
            if (!nav.cells[index]) movementReasons.push('navigation-blocked');
            if (height <= world.waterLevel + suitability.walkingElevation) movementReasons.push('water-clearance');
            if (placementSlope > suitability.walkingSlope) movementReasons.push('walking-slope');
            if (matches.some(s => s.obstacle === 'building')) movementReasons.push('foundation-clearance');
            if (matches.some(s => s.obstacle === 'scenery')) movementReasons.push('scenery-clearance');
            const terrainReasons: string[] = [];
            if (height < world.waterLevel + suitability.foundationElevation) terrainReasons.push('foundation-elevation');
            if (placementSlope > suitability.foundationSlope || triangleSlope > suitability.foundationSlope)
                terrainReasons.push('foundation-slope');
            const buildReasons = [...terrainReasons, ...new Set(reservations.map(r => r.kind))];
            if (!nav.cells[index]) buildReasons.push('navigation-blocked');
            if (matches.some(s => s.obstacle === 'scenery')) buildReasons.push('scenery-clearance');
            return {
                reservations,
                movement: { traversable: movementReasons.length === 0, reasons: movementReasons },
                buildability: { terrainSuitable: terrainReasons.length === 0,
                    available: buildReasons.length === 0, reasons: buildReasons },
                placementSlope,
            };
        },
    };
}
