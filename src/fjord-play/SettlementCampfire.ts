import type { FjordTransform } from './FjordProjection';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';

export interface SettlementCampfire {
    id: 'settlement-campfire';
    transform: FjordTransform;
    clearingRadius: number;
    obstacleRadius: number;
}
/** Geography owns the nucleus; the presentation never draws from the Core RNG. */
export function settlementCampfire(world: WorldBlueprint): SettlementCampfire {
    const bounds = world.settlement.bounds;
    const x = (bounds.minX + bounds.maxX) / 2, z = (bounds.minZ + bounds.maxZ) / 2;
    return { id: 'settlement-campfire',
        transform: { x, y: createBlueprintSurface(world).surfaceHeightAt(x, z), z, rotation: 0, scale: 2 },
        clearingRadius: 7, obstacleRadius: 4.4 };
}
