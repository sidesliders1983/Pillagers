import type { WorldBlueprint } from './WorldBlueprint';
import { suitability } from './PlanSettlement';

/** Measure the final grid after asset clearances have removed cells. */
export function validateNavigation(world: WorldBlueprint) {
    const nav = world.navigation;
    const index = (x: number, z: number) =>
        Math.round(z - nav.bounds.minZ) * nav.columns + Math.round(x - nav.bounds.minX);
    const start = index(world.settlement.center.x, world.settlement.center.z);
    const queue: number[] = nav.cells[start] ? [start] : [];
    const visited = new Set(queue);
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = queue[cursor];
        const column = current % nav.columns;
        const row = Math.floor(current / nav.columns);
        const neighbors = [column > 0 ? current - 1 : -1,
            column < nav.columns - 1 ? current + 1 : -1,
            row > 0 ? current - nav.columns : -1,
            row < nav.rows - 1 ? current + nav.columns : -1];
        for (const next of neighbors) {
            if (next < 0 || !nav.cells[next] || visited.has(next)) continue;
            visited.add(next);
            queue.push(next);
        }
    }
    const bounds = world.settlement.bounds;
    const connectedArea = queue.filter(cell => {
        const x = nav.bounds.minX + cell % nav.columns;
        const z = nav.bounds.minZ + Math.floor(cell / nav.columns);
        return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
    }).length * nav.spacing * nav.spacing;
    const reasons = [...world.validation.reasons];
    if (connectedArea < suitability.connectedClearingArea &&
        !reasons.some(reason => reason.includes('clearing area'))) {
        reasons.push('Final scenery leaves less than 1500 square metres of connected clearing.');
    }
    if (world.settlement.accessPaths.some(route => route.some(point =>
        !visited.has(index(point.x, point.z))))) {
        reasons.push('A critical approach is obstructed in the final scenery-aware grid.');
    }
    return { ...world.validation, accepted: reasons.length === 0, reasons, connectedArea,
        score: Math.round(100 * world.validation.connectedBuildings / 6 *
            Math.min(1, connectedArea / 3000)) };
}
