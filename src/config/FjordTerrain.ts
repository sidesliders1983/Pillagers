import type { WorldBlueprint } from '../world-generation/WorldBlueprint';

/** Selected #180 material treatment. Relative game-scale snowline, not physical glacier altitude. */
export const fjordTerrain = {
    style: 'iceland-v1' as const,
    periodMeters: 24,
    permanentHeightFraction: .90,
    permanentMinimumUp: .97,
    permanentColor: '#dfedf4',
    rockSnowRetention: [.72, .96] as const,
};
export function fjordSnowLine(world: WorldBlueprint): number {
    const peak = world.terrain.heights.reduce((highest, height) => Math.max(highest, height), -Infinity);
    return world.waterLevel + (peak - world.waterLevel) * fjordTerrain.permanentHeightFraction;
}
