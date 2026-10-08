import { buildings, buildingDistance, settlementBounds } from '../world/SettlementLayout';
import { createBlueprintSurface, terrainTriangles } from './TerrainQueries';
import type {
    Bounds2, CoastSegment, Point2, SettlementSite, WalkabilityField, WorldBlueprint,
} from './WorldBlueprint';

type Landscape = Pick<WorldBlueprint, 'config' | 'terrain' | 'waterLevel'>;
export const suitability = Object.freeze({
    foundationSlope: .12, foundationElevation: .25, walkingSlope: .55,
    walkingElevation: .2, residentClearance: .65, connectedClearingArea: 1500,
});

export function settlementBoundsAt(center: Point2): Bounds2 {
    return { minX: center.x + settlementBounds.minX - 1,
        maxX: center.x + settlementBounds.maxX + 1,
        minZ: center.z + settlementBounds.minZ - 1,
        maxZ: center.z + settlementBounds.maxZ + 1 };
}

/** Intersect the actual authoritative triangles with the shared water level. */
export function extractCoast(world: Landscape): CoastSegment[] {
    const { terrain, waterLevel } = world;
    const point = (i: number) => ({
        x: terrain.bounds.minX + (i % terrain.columns) * terrain.spacing,
        z: terrain.bounds.minZ + Math.floor(i / terrain.columns) * terrain.spacing,
    });
    const coast: CoastSegment[] = [];
    for (const triangle of terrainTriangles(terrain)) {
        const crossings: Point2[] = [];
        for (let edge = 0; edge < 3; edge++) {
            const a = triangle[edge], b = triangle[(edge + 1) % 3];
            const ah = terrain.heights[a], bh = terrain.heights[b];
            if ((ah <= waterLevel) === (bh <= waterLevel)) continue;
            const t = (waterLevel - ah) / (bh - ah), p = point(a), q = point(b);
            crossings.push({ x: p.x + (q.x-p.x)*t, z: p.z + (q.z-p.z)*t });
        }
        if (crossings.length === 2) coast.push({ a: crossings[0], b: crossings[1] });
    }
    return coast;
}

/** Cardinal paths prohibit corner-cutting through footprints or steep terrain. */
export function planSettlement(world: Landscape, center: Point2, candidateDry: boolean) {
    const surface = createBlueprintSurface(world), bounds = settlementBoundsAt(center);
    const placements = buildings.filter(b => b.key !== 'storehouse').map((b, i) => ({
        ...b, id: 'reference-building-' + (i+1), x: b.x + center.x, z: b.z + center.z,
    }));
    const columns = 181, rows = 181, gridBounds = world.terrain.bounds;
    const point = (i: number): Point2 => ({ x: gridBounds.minX + i % columns,
        z: gridBounds.minZ + Math.floor(i / columns) });
    const index = (p: Point2) => Math.round(p.z-gridBounds.minZ)*columns + Math.round(p.x-gridBounds.minX);
    const cells = Array.from({ length: columns*rows }, (_, i) => {
        const p = point(i);
        return surface.surfaceHeightAt(p.x, p.z) >= world.waterLevel + suitability.walkingElevation &&
            surface.slopeAt(p.x, p.z) <= suitability.walkingSlope &&
            placements.every(b => buildingDistance(p.x, p.z, b) >= suitability.residentClearance);
    });
    const start = index(center), parent = new Int32Array(cells.length).fill(-1), queue: number[] = [];
    if (cells[start]) { parent[start] = start;
    queue.push(start); }
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const i = queue[cursor], col = i % columns, row = Math.floor(i / columns);
        const neighbors = [col > 0 ? i-1 : -1, row < rows-1 ? i+columns : -1,
            col < columns-1 ? i+1 : -1, row > 0 ? i-columns : -1];
        for (const next of neighbors) {
            if (next < 0 || !cells[next] || parent[next] !== -1) continue;
            parent[next] = i;
            queue.push(next);
        }
    }
    const connectedNear = (p: Point2, radius: number) => {
        let best = -1, distance = Infinity;
        for (let z = Math.floor(p.z-radius); z <= Math.ceil(p.z+radius); z++) {
            for (let x = Math.floor(p.x-radius); x <= Math.ceil(p.x+radius); x++) {
                if (x < gridBounds.minX || x > gridBounds.maxX ||
                    z < gridBounds.minZ || z > gridBounds.maxZ) continue;
                const i = index({ x, z }), d = Math.hypot(p.x-x, p.z-z);
                if (parent[i] >= 0 && d <= radius && d < distance) { best = i;
                distance = d; }
            }
        }
        return best;
    };
    const path = (end: number) => {
        const points: Point2[] = [];
        for (let i = end; i >= 0; i = parent[i]) {
            points.push(point(i));
            if (i === start) break;
        }
        return points.reverse();
    };
    const paths: Point2[][] = [];
    let connectedBuildings = 0, maximumFoundationSlope = 0, minimumFoundationElevation = Infinity;
    for (const building of placements) {
        const c = Math.cos(building.rotation), s = Math.sin(building.rotation);
        for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) {
            const dx = u*building.halfWidth, dz = v*building.halfDepth;
            const x = building.x + dx*c + dz*s, z = building.z - dx*s + dz*c;
            maximumFoundationSlope = Math.max(maximumFoundationSlope, surface.slopeAt(x, z));
            minimumFoundationElevation = Math.min(minimumFoundationElevation,
                surface.surfaceHeightAt(x, z) - world.waterLevel);
        }
        const door = { x: building.x + s*(building.halfDepth+1.8),
            z: building.z + c*(building.halfDepth+1.8) };
        const end = connectedNear(door, 2);
        if (end >= 0) { connectedBuildings++;
        paths.push(path(end)); }
    }
    const coast = extractCoast(world);
    let harborIndex = -1, coastDistance = Infinity;
    for (const segment of coast) {
        const p = { x: (segment.a.x+segment.b.x)/2, z: (segment.a.z+segment.b.z)/2 };
        // The connected dry point must be within 2m of the actual coast, not an assumed shoreAt(x).
        const end = connectedNear(p, 2);
        if (end < 0) continue;
        const q = point(end), distance = Math.hypot(q.x-center.x, q.z-center.z);
        if (distance < coastDistance) { harborIndex = end;
        coastDistance = distance; }
    }
    const harbor = harborIndex < 0 ? null : point(harborIndex);
    if (harborIndex >= 0) paths.push(path(harborIndex));
    const connectedArea = queue.filter(i => {
        const p = point(i);
        return p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ;
    }).length;
    const reasons: string[] = [];
    if (!candidateDry) reasons.push('No naturally dry settlement candidate fits the reference layout.');
    if (maximumFoundationSlope > suitability.foundationSlope) reasons.push('Foundation slope exceeds 0.12 m/m.');
    if (minimumFoundationElevation < suitability.foundationElevation) reasons.push('A foundation is too close to water level.');
    if (connectedBuildings !== placements.length) reasons.push('Not every building has a connected pedestrian approach.');
    if (!harbor) reasons.push('No reachable dry approach within 2m of the coast.');
    if (connectedArea < suitability.connectedClearingArea) reasons.push('Connected clearing area is below 1500 square metres.');
    const settlement: SettlementSite = { center, bounds, elevation: 2.6,
        buildings: placements, accessPaths: paths, harbor };
    const navigation: WalkabilityField = { bounds: gridBounds, spacing: 1, columns, rows, cells };
    return { coast, settlement, navigation, validation: {
        accepted: reasons.length === 0, reasons, connectedBuildings, connectedArea,
        maximumFoundationSlope, minimumFoundationElevation,
        score: Math.round(100 * connectedBuildings/placements.length * Math.min(1, connectedArea/3000)),
    } };
}
