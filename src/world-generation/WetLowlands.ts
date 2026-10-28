import type {Point2, WorldBlueprint, GlacialValley} from './WorldBlueprint';
import {createBlueprintSurface} from './TerrainQueries';

export interface WetLowlandRules {
    version: 1; maximumPatches: number; minimumCells: number; maximumCells: number;
    minimumMoisture: number; minimumMud: number; maximumSlope: number;
    minimumElevation: number; maximumElevation: number; minimumSeparation: number;
}
export interface WetLowlandPatch {
    id: string; cells: number[]; center: Point2; drainageValleyId: string;
}
export interface WetLowlandPlan {
    version: 1; rules: WetLowlandRules; patches: WetLowlandPatch[]; eligibleCells: number; reasons: string[];
}
/** QA overlay only: indexes the existing 4 m environment cells, never a second terrain grid. */
export const prototypeWetLowlandRules: Readonly<WetLowlandRules> = Object.freeze({
    version: 1, maximumPatches: 4, minimumCells: 4, maximumCells: 16,
    minimumMoisture: .6, minimumMud: .22, maximumSlope: .12,
    minimumElevation: .6, maximumElevation: 12, minimumSeparation: 60,
});

function valleyDistance(point: Point2, valley: GlacialValley): number {
    let distance = Infinity;
    for (let i = 1; i < valley.points.length; i++) {
        const a = valley.points[i - 1], b = valley.points[i], dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const width = (valley.widths[i - 1] * (1 - t) + valley.widths[i] * t) / 2;
        distance = Math.min(distance, Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz) - width);
    }
    return Math.round(distance * 1e6) / 1e6;
}

export function planWetLowlands(world: WorldBlueprint, overrides: Partial<WetLowlandRules> = {}): WetLowlandPlan {
    const rules = {...prototypeWetLowlandRules, ...overrides};
    if (Object.keys(overrides).some(key => !Object.hasOwn(prototypeWetLowlandRules, key)) || rules.version !== 1 ||
        ![rules.maximumPatches, rules.minimumCells, rules.maximumCells].every(Number.isSafeInteger) ||
        rules.maximumPatches < 0 || rules.maximumPatches > 4 || rules.minimumCells < 4 ||
        rules.maximumCells < rules.minimumCells || rules.maximumCells > 16 ||
        ![rules.minimumMoisture, rules.minimumMud, rules.maximumSlope].every(n => Number.isFinite(n) && n >= 0 && n <= 1) ||
        ![rules.minimumElevation, rules.maximumElevation, rules.minimumSeparation].every(Number.isFinite) ||
        rules.minimumElevation < .3 || rules.maximumElevation < rules.minimumElevation ||
        rules.maximumElevation > 20 || rules.minimumSeparation < 30)
        throw new Error('Invalid wet lowland rules.');
    const result: WetLowlandPlan = {version: 1, rules, patches: [], eligibleCells: 0, reasons: []};
    const env = world.environment, valleys = world.geology?.valleys;
    if (!env || !valleys?.length) {result.reasons.push('missing-canonical-moisture-or-drainage'); return result;}
    const surface = createBlueprintSurface(world), nav = world.navigation;
    const point = (cell: number) => ({x: world.terrain.bounds.minX + cell % env.columns * env.spacing,
        z: world.terrain.bounds.minZ + Math.floor(cell / env.columns) * env.spacing});
    const forbidden = [world.settlement.bounds, ...(world.rivalSite ? [world.rivalSite.bounds] : [])];
    const eligible = new Map<number, string>();
    for (let row = 1; row < env.rows - 1; row++) for (let col = 1; col < env.columns - 1; col++) {
        const cell = row * env.columns + col, p = point(cell), height = surface.surfaceHeightAt(p.x, p.z) - world.waterLevel;
        if (height < rules.minimumElevation || height > rules.maximumElevation ||
            env.fields.moisture[cell] < rules.minimumMoisture || env.fields.mud[cell] < rules.minimumMud ||
            env.fields.slope[cell] > rules.maximumSlope ||
            forbidden.some(b => p.x >= b.minX - 24 && p.x <= b.maxX + 24 && p.z >= b.minZ - 24 && p.z <= b.maxZ + 24)) continue;
        const nc = Math.round((p.x - nav.bounds.minX) / nav.spacing), nr = Math.round((p.z - nav.bounds.minZ) / nav.spacing);
        if (!nav.cells[nr * nav.columns + nc]) continue;
        const valley = valleys.find(valley => valleyDistance(p, valley) <= 0);
        if (valley) eligible.set(cell, valley.id);
    }
    result.eligibleCells = eligible.size;
    const ranked = [...eligible.keys()].sort((a, b) =>
        env.fields.moisture[b] + env.fields.mud[b] - env.fields.moisture[a] - env.fields.mud[a] || a - b);
    const used = new Set<number>();
    for (const anchor of ranked) {
        if (result.patches.length >= rules.maximumPatches) break;
        const center = point(anchor);
        if (used.has(anchor) || result.patches.some(p => Math.round(Math.hypot(p.center.x - center.x, p.center.z - center.z) * 1e6) / 1e6 < rules.minimumSeparation)) continue;
        const cells: number[] = [], queue = [anchor], queued = new Set(queue);
        while (queue.length && cells.length < rules.maximumCells) {
            const cell = queue.shift()!, p = point(cell);
            if (used.has(cell) || !eligible.has(cell) || Math.round(Math.hypot(p.x - center.x, p.z - center.z) * 1e6) / 1e6 > 12) continue;
            cells.push(cell);
            for (const next of [cell - 1, cell + 1, cell - env.columns, cell + env.columns])
                if (!queued.has(next)) {queued.add(next); queue.push(next);}
        }
        if (cells.length < rules.minimumCells) continue;
        cells.forEach(cell => used.add(cell));
        result.patches.push({id: `wet-${world.config.seed}-${anchor}`, center, cells: cells.sort((a,b) => a-b), drainageValleyId: eligible.get(anchor)!});
    }
    if (!result.patches.length) result.reasons.push('no-eligible-wet-lowlands');
    return result;
}
