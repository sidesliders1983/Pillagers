import type { Point2, WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';
import type { FjordPlot } from './FjordProjection';

export interface ExpeditionStandingGround {
    known?: (x: number, z: number) => boolean;
    plots?: readonly FjordPlot[];
}

/** Reserve safe arrival targets; the shared resident controller owns every physical step. */
export class ExpeditionStanding {
    private surface;
    private natureCells = new Map<string, Array<{ x: number; z: number; clearance: number }>>();
    private goals = new Map<string, Map<string, Point2>>();
    private ground: ExpeditionStandingGround = {};
    constructor(private world: WorldBlueprint) {
        this.surface = createBlueprintSurface(world);
        for (const item of world.placementPlan ?? []) {
            const reach = Math.max(.5, item.clearance) + .4;
            for (let x = Math.floor((item.x - reach) / 8); x <= Math.floor((item.x + reach) / 8); x++)
                for (let z = Math.floor((item.z - reach) / 8); z <= Math.floor((item.z + reach) / 8); z++) {
                    const key = x + ',' + z, cell = this.natureCells.get(key) ?? [];
                    cell.push(item);
                    this.natureCells.set(key, cell);
                }
        }
    }
    prepare(ground: ExpeditionStandingGround) {
        this.ground = ground;
        this.goals.clear();
    }
    private safe(p: Point2) {
        const b = this.surface.bounds, nav = this.world.navigation;
        if (p.x < b.minX + .6 || p.x > b.maxX - .6 || p.z < b.minZ + .6 || p.z > b.maxZ - .6 ||
            this.ground.known && !this.ground.known(p.x, p.z) ||
            this.surface.surfaceHeightAt(p.x, p.z) <= this.world.waterLevel + .25 ||
            this.surface.slopeAt(p.x, p.z) > .55) return false;
        const col = Math.round((p.x - nav.bounds.minX) / nav.spacing);
        const row = Math.round((p.z - nav.bounds.minZ) / nav.spacing);
        if (col < 0 || col >= nav.columns || row < 0 || row >= nav.rows || !nav.cells[row * nav.columns + col])
            return false;
        if (this.ground.plots?.some(plot => Math.abs(p.x - plot.x) < plot.halfWidth + .6 &&
            Math.abs(p.z - plot.z) < plot.halfDepth + .6)) return false;
        return !this.natureCells.get(Math.floor(p.x / 8) + ',' + Math.floor(p.z / 8))?.some(item =>
            Math.hypot(p.x - item.x, p.z - item.z) < Math.max(.5, item.clearance) + .4);
    }
    private segment(from: Point2, to: Point2) {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .25));
        for (let i = 1; i <= steps; i++)
            if (!this.safe({ x: from.x + (to.x - from.x) * i / steps,
                z: from.z + (to.z - from.z) * i / steps })) return false;
        return true;
    }
    targets(missionId: string, points: ReadonlyMap<string, Point2>, arrived: boolean) {
        let goals = this.goals.get(missionId);
        if (arrived && !goals) {
            goals = new Map();
            for (const [id, anchor] of [...points].sort(([a], [b]) => a.localeCompare(b))) {
                const candidates: Point2[] = [{ ...anchor }];
                for (const radius of [1.6, 3.2, 4.8]) for (let angle = 0; angle < 16; angle++)
                    candidates.push({ x: anchor.x + Math.cos(angle * Math.PI / 8) * radius,
                        z: anchor.z + Math.sin(angle * Math.PI / 8) * radius });
                const target = candidates.find(p => [...goals!.values()].every(other =>
                    Math.hypot(p.x - other.x, p.z - other.z) >= 1.25) && this.segment(anchor, p));
                // Tight terrain may have no safe slot; never invent a route through water or a wall.
                goals.set(id, target ?? anchor);
            }
            this.goals.set(missionId, goals);
        }
        return arrived ? goals ?? points : points;
    }
}
