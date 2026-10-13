import type { Point2, WalkabilityField, WorldBlueprint } from './WorldBlueprint';
import { createBlueprintSurface } from './TerrainQueries';
import type { StartingViewpoint } from './SettlementVisibility';

/** Cardinal navigation on the same final walkability grid used by the world. */
export function siteRoutes(nav: WalkabilityField, origin: Point2) {
    const index = (p: Point2) => Math.round((p.z - nav.bounds.minZ) / nav.spacing) *
        nav.columns + Math.round((p.x - nav.bounds.minX) / nav.spacing);
    const start = index(origin), parent = new Int32Array(nav.cells.length).fill(-1);
    const queue = new Int32Array(nav.cells.length);
    let count = 0;
    if (nav.cells[start]) { parent[start] = start; queue[count++] = start; }
    for (let cursor = 0; cursor < count; cursor++) {
        const i = queue[cursor], col = i % nav.columns, row = Math.floor(i / nav.columns);
        for (const next of [col > 0 ? i - 1 : -1, col < nav.columns - 1 ? i + 1 : -1,
            row > 0 ? i - nav.columns : -1, row < nav.rows - 1 ? i + nav.columns : -1]) {
            if (next < 0 || parent[next] >= 0 || !nav.cells[next]) continue;
            parent[next] = i;
            queue[count++] = next;
        }
    }
    return (target: Point2): Point2[] => {
        const end = index(target);
        if (parent[end] < 0) return [];
        const route: Point2[] = [];
        for (let i = end; ; i = parent[i]) {
            route.push({ x: nav.bounds.minX + i % nav.columns * nav.spacing,
                z: nav.bounds.minZ + Math.floor(i / nav.columns) * nav.spacing });
            if (i === start) break;
        }
        return route.reverse();
    };
}

/** The Lab's player-start camera and the visibility proof use this same pose. */
export function settlementStartingViews(world: Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'settlement'>):
    StartingViewpoint[] {
    const surface = createBlueprintSurface(world);
    const center = world.settlement.center, harbor = world.settlement.harbor ?? center;
    const distance = Math.hypot(center.x - harbor.x, center.z - harbor.z) || 1;
    const dx = (center.x - harbor.x) / distance, dz = (center.z - harbor.z) / distance;
    const cameraX = harbor.x - dx * 60 - dz * 20;
    const cameraZ = harbor.z - dz * 60 + dx * 20;
    return [
        { id: 'landing-eye', ...harbor, y: surface.surfaceHeightAt(harbor.x, harbor.z) + 1.7 },
        { id: 'settlement-eye', ...center, y: surface.surfaceHeightAt(center.x, center.z) + 1.7 },
        { id: 'player-start-camera', x: cameraX, z: cameraZ,
            y: Math.max(18, surface.surfaceHeightAt(cameraX, cameraZ) + 12) },
    ];
}
