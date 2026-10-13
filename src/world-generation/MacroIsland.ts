import { islandShapeQuality } from './IslandShapeQuality';
import { createCoastDistance } from './CoastDistance';
import { createBlueprintSurface } from './TerrainQueries';
import type { Bounds2, Point2, WorldBlueprint } from './WorldBlueprint';

export type MacroRegion = 'sea' | 'shore' | 'lowland' | 'valley' | 'upland' | 'highland';
export interface MacroSiteCandidate extends Point2 {
    bounds: Bounds2;
    area: number;
    shoreDistance: number;
    cells: Point2[];
}

export interface MacroTerrainSeparation {
    kind: 'ridgeline';
    crest: Point2;
    heightAboveSites: number;
    width: number;
    connection: Point2[];
}

/** Measure a broad elevated barrier between the centres of two dry footprints. */
function ridgeBetween(surface: ReturnType<typeof createBlueprintSurface>,
    first: MacroSiteCandidate, second: MacroSiteCandidate) {
    const centre = (site: MacroSiteCandidate) => ({
        x: (site.bounds.minX + site.bounds.maxX) / 2,
        z: (site.bounds.minZ + site.bounds.maxZ) / 2
    });
    const a = centre(first), b = centre(second);
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(distance / 2), stepLength = distance / steps;
    const base = Math.max(surface.surfaceHeightAt(first.x, first.z),
        surface.surfaceHeightAt(second.x, second.z));
    let width = 0, crestHeight = base, crest = a;
    for (let i = 0; i <= steps; i++) {
        const point = { x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps };
        const height = surface.surfaceHeightAt(point.x, point.z);
        if (height < base + 8) {
            if (width >= 12) return { crest, heightAboveSites: crestHeight - base, width };
            width = 0;
            crestHeight = base;
        } else {
            // Width counts the measured intervals between above-threshold samples.
            if (crestHeight > base) width += stepLength;
            if (height > crestHeight) {
                crestHeight = height;
                crest = point;
            }
        }
    }
    return width >= 12 ? { crest, heightAboveSites: crestHeight - base, width } : null;
}

function classifyRegion(world: WorldBlueprint, surface: ReturnType<typeof createBlueprintSurface>,
    x: number, z: number, height: number, shoreDistance: number): MacroRegion {
    if (height <= world.waterLevel) return 'sea';
    if (shoreDistance < 5) return 'shore';
    if (height >= world.waterLevel + 16) return 'highland';
    const valley = height < world.waterLevel + 7 && shoreDistance > 14 &&
        [[60, 0], [0, 60], [42, 42], [42, -42]].some(([dx, dz]) =>
            surface.surfaceHeightAt(x-dx, z-dz) > height+6 &&
            surface.surfaceHeightAt(x+dx, z+dz) > height+6);
    return valley ? 'valley' : height <= world.waterLevel + 6 ? 'lowland' : 'upland';
}

/** Grid diagnostics reuse the stored triangle heights and their measured coast distances. */
export function macroRegions(world: WorldBlueprint): MacroRegion[] {
    const surface = createBlueprintSurface(world), { terrain } = world;
    return terrain.heights.map((height, i) => classifyRegion(world, surface,
        terrain.bounds.minX + (i % terrain.columns) * terrain.spacing,
        terrain.bounds.minZ + Math.floor(i / terrain.columns) * terrain.spacing,
        height, Math.abs(world.biomes.waterDistance[i])));
}

/** Samples the stored physical triangles and their extracted coast, never a second height formula. */
export function createMacroQueries(world: WorldBlueprint) {
    const surface = createBlueprintSurface(world);
    const coastDistance = createCoastDistance(world.coast);
    return {
        sample(x: number, z: number) {
            const height = surface.surfaceHeightAt(x, z);
            const slope = surface.slopeAt(x, z);
            const shoreDistance = coastDistance({ x, z });
            const submerged = height <= world.waterLevel;
            const region = classifyRegion(world, surface, x, z, height, shoreDistance);
            return { height, slope, shoreDistance: submerged ? -shoreDistance : shoreDistance,
                waterDepth: Math.max(0, world.waterLevel - height), region };
        }
    };
}

/** Find natural lowland pockets without modifying or reserving the terrain. */
export function findNaturalSites(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'coast'>) {
    const surface = createBlueprintSurface(world);
    const { bounds, spacing, columns, rows, heights } = world.terrain;
    const { waterLevel } = world;
    const pointAt = (i: number) => ({ x: bounds.minX + i % columns * spacing,
        z: bounds.minZ + Math.floor(i / columns) * spacing });
    const usable = heights.map((height, i) => {
        const p = pointAt(i);
        return height >= waterLevel + .25 && height <= waterLevel + 10 &&
            surface.slopeAt(p.x, p.z) <= .12;
    });
    const candidates: MacroSiteCandidate[] = [];
    const radius = 55;
    const coastDistance = createCoastDistance(world.coast);
    for (let row = 25; row < rows - 25; row += 10) {
        for (let col = 25; col < columns - 25; col += 10) {
            const start = row * columns + col, center = pointAt(start);
            if (!usable[start]) continue;
            const shoreDistance = coastDistance(center);
            if (shoreDistance > 65) continue;
            const queue = [start], seen = new Set(queue);
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const cell = queue[cursor], x = cell % columns, z = Math.floor(cell / columns);
                for (const next of [x > 0 ? cell-1 : -1, x < columns-1 ? cell+1 : -1,
                    z > 0 ? cell-columns : -1, z < rows-1 ? cell+columns : -1]) {
                    if (next < 0 || !usable[next] || seen.has(next)) continue;
                    const p = pointAt(next);
                    if (Math.hypot(p.x-center.x, p.z-center.z) > radius) continue;
                    seen.add(next);
                    queue.push(next);
                }
            }
            const area = queue.length * spacing * spacing;
            if (area < 3000) continue;
            const cells = queue.map(pointAt);
            const footprint = { minX: Math.min(...cells.map(p => p.x)), maxX: Math.max(...cells.map(p => p.x)),
                minZ: Math.min(...cells.map(p => p.z)), maxZ: Math.max(...cells.map(p => p.z)) };
            candidates.push({ ...center, area, bounds: footprint, shoreDistance, cells });
        }
    }
    return candidates.sort((a, b) => b.area-a.area || a.z-b.z || a.x-b.x);
}

/** Coarse physical feasibility only. No rival reservation, LOS promise or gameplay population. */
export function inspectMacroIsland(world: WorldBlueprint) {
    const surface = createBlueprintSurface(world);
    const { terrain, waterLevel } = world, { columns, rows, heights, bounds, spacing } = terrain;
    const regions: Record<MacroRegion, number> = {
        sea: 0, shore: 0, lowland: 0, valley: 0, upland: 0, highland: 0
    };
    for (const region of macroRegions(world)) regions[region]++;
    const visited = new Uint8Array(heights.length);
    let landComponents = 0, landSamples = 0, seaBorder = true;
    for (let i = 0; i < heights.length; i++) {
        const col = i % columns, row = Math.floor(i / columns);
        if ((col < 3 || row < 3 || col >= columns - 3 || row >= rows - 3) &&
            heights[i] >= waterLevel - .1) seaBorder = false;
        if (heights[i] <= waterLevel || visited[i]) continue;
        landComponents++;
        const queue = [i];
        visited[i] = 1;
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor], x = cell % columns, z = Math.floor(cell / columns);
            landSamples++;
            for (const next of [x > 0 ? cell - 1 : -1, x < columns - 1 ? cell + 1 : -1,
                z > 0 ? cell - columns : -1, z < rows - 1 ? cell + columns : -1]) {
                if (next >= 0 && !visited[next] && heights[next] > waterLevel) {
                    visited[next] = 1;
                    queue.push(next);
                }
            }
        }
    }
    const shoreCells = new Set<number>();
    const walking = heights.map((height, i) => {
        const x = bounds.minX + (i % columns) * spacing;
        const z = bounds.minZ + Math.floor(i / columns) * spacing;
        const safe = height >= waterLevel + .2 && surface.slopeAt(x, z) <= .55;
        if (safe && world.biomes.waterDistance[i] <= 2) shoreCells.add(i);
        return safe;
    });
    const pointAt = (i: number) => ({ x: bounds.minX + (i % columns) * spacing,
        z: bounds.minZ + Math.floor(i / columns) * spacing });
    const cellAt = (point: Point2) => Math.round((point.z - bounds.minZ) / spacing) * columns +
        Math.round((point.x - bounds.minX) / spacing);
    const walkingPath = (site: Point2, reached: (cell: number) => boolean): Point2[] => {
        const start = cellAt(site);
        if (!walking[start]) return [];
        const parent = new Int32Array(heights.length).fill(-1), queue = [start];
        parent[start] = start;
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor];
            if (reached(cell)) {
                const path: Point2[] = [];
                for (let end = cell; ; end = parent[end]) {
                    path.push(pointAt(end));
                    if (end === start) return path.reverse();
                }
            }
            const col = cell % columns, row = Math.floor(cell / columns);
            const from = pointAt(cell);
            for (const next of [col > 0 ? cell - 1 : -1, col < columns - 1 ? cell + 1 : -1,
                row > 0 ? cell - columns : -1, row < rows - 1 ? cell + columns : -1]) {
                if (next < 0 || !walking[next] || parent[next] >= 0) continue;
                const to = pointAt(next), x = (from.x + to.x) / 2, z = (from.z + to.z) / 2;
                if (surface.surfaceHeightAt(x, z) < waterLevel + .2 || surface.slopeAt(x, z) > .55) continue;
                parent[next] = cell;
                queue.push(next);
            }
        }
        return [];
    };
    // Label walking components once. Rejected pairs must not repeat a whole-island BFS.
    const component = new Int32Array(heights.length).fill(-1);
    const coastalComponents = new Set<number>();
    let componentId = 0;
    for (let start = 0; start < walking.length; start++) {
        if (!walking[start] || component[start] >= 0) continue;
        const queue = [start];
        component[start] = componentId;
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const cell = queue[cursor], col = cell % columns, row = Math.floor(cell / columns);
            if (shoreCells.has(cell)) coastalComponents.add(componentId);
            const from = pointAt(cell);
            for (const next of [col > 0 ? cell-1 : -1, col < columns-1 ? cell+1 : -1,
                row > 0 ? cell-columns : -1, row < rows-1 ? cell+columns : -1]) {
                if (next < 0 || !walking[next] || component[next] >= 0) continue;
                const to = pointAt(next), x = (from.x+to.x)/2, z = (from.z+to.z)/2;
                if (surface.surfaceHeightAt(x,z) < waterLevel+.2 || surface.slopeAt(x,z) > .55) continue;
                component[next] = componentId;
                queue.push(next);
            }
        }
        componentId++;
    }
    const candidates = findNaturalSites(world);
    const center = world.settlement.center;
    candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) -
        Math.hypot(b.x - center.x, b.z - center.z) || a.z - b.z || a.x - b.x);
    let sitePair: (MacroSiteCandidate & { approach: Point2[] })[] = [];
    let terrainSeparation: MacroTerrainSeparation | null = null;
    for (const first of candidates) {
        for (const second of candidates) {
            if (Math.hypot(first.x - second.x, first.z - second.z) < 120 ||
                (Math.abs(first.x - second.x) < 94 && Math.abs(first.z - second.z) < 75)) continue;
            const firstComponent = component[cellAt(first)], secondComponent = component[cellAt(second)];
            if (firstComponent < 0 || firstComponent !== secondComponent ||
                !coastalComponents.has(firstComponent)) continue;
            const ridge = ridgeBetween(surface, first, second);
            if (!ridge) continue;
            const firstApproach = walkingPath(first, cell => shoreCells.has(cell));
            const secondApproach = walkingPath(second, cell => shoreCells.has(cell));
            if (!firstApproach.length || !secondApproach.length) continue;
            const target = cellAt(second);
            const connection = walkingPath(first, cell => cell === target);
            if (!connection.length) continue;
            sitePair = [{ ...first, approach: firstApproach }, { ...second, approach: secondApproach }];
            terrainSeparation = { kind: 'ridgeline', ...ridge, connection };
            break;
        }
        if (terrainSeparation) break;
    }
    const shape = islandShapeQuality(world);
    const reasons: string[] = [];
    if (shape.maximumRadialOverlap >= .9) reasons.push('The coastline has excessive regular radial symmetry.');
    if (shape.coastHullOccupancy > .85) reasons.push('Insufficient fjord incision into the landmass.');
    const mainValleys = world.geology?.valleys.filter(valley => valley.parentId === null) ?? [];
    if (mainValleys.length < 2) reasons.push('Fewer than two major drainage valleys.');
    if (landComponents !== 1) reasons.push('The dry land is not one connected island.');
    if (!seaBorder) reasons.push('The island does not have a complete sea margin.');
    if (!regions.lowland || !regions.valley || !regions.highland) reasons.push('Missing lowland, valley or highland relief.');
    if (sitePair.length !== 2) reasons.push('No two natural lowland pockets of at least 3000 square metres have a broad terrain barrier and a safe walking connection.');
    if (!world.settlement.harbor) reasons.push('No connected dry landing approach.');
    return { accepted: reasons.length === 0, reasons, landComponents, landSamples, seaBorder,
        regions, shape, candidates, sitePair, terrainSeparation, maximumElevation: heights.reduce((maximum, height) => Math.max(maximum, height), -Infinity) - waterLevel };
}
