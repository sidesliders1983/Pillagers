import { campaignIslandPlan } from './CampaignIsland';
import type { FjordTransform } from './FjordProjection';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from '../world-generation/TerrainQueries';

export interface SettlementCampfire {
    id: string;
    transform: FjordTransform;
    clearingRadius: number;
    obstacleRadius: number;
}
/** Geography owns the nucleus; the presentation never draws from the Core RNG. */
export function settlementCampfire(world: WorldBlueprint, site?: { id: string; center: { x: number; z: number } }): SettlementCampfire {
    const bounds = world.settlement.bounds;
    const center = site?.center ?? campaignIslandPlan(world)?.center;
    const x = center?.x ?? (bounds.minX + bounds.maxX) / 2;
    const z = center?.z ?? (bounds.minZ + bounds.maxZ) / 2;
    return { id: site?.id ?? 'settlement-campfire',
        transform: { x, y: createBlueprintSurface(world).surfaceHeightAt(x, z), z, rotation: 0, scale: 2 },
        clearingRadius: 7, obstacleRadius: 4.4 };
}
