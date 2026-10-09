import type { MovementTerrain } from '../systems/MovementSystem';
import type { WorldBlueprint } from '../world-generation/WorldBlueprint';
import { createBlueprintSurface } from './BlueprintTerrain';
import { buildingDistance } from './SettlementLayout';

/** Existing resident steering uses the immutable generated walkability/height domain. */
export function blueprintMovement(world: WorldBlueprint): MovementTerrain {
    const surface = createBlueprintSurface(world), nav = world.navigation;
    const walkable = (x: number, z: number) => {
        const { bounds } = world.settlement;
        if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return false;
        const index = Math.round(z-nav.bounds.minZ)*nav.columns + Math.round(x-nav.bounds.minX);
        return nav.cells[index] && surface.surfaceHeightAt(x,z) > world.waterLevel+.2 &&
            surface.slopeAt(x,z) <= .55 &&
            world.settlement.buildings.every(b => buildingDistance(x,z,b) >= .65) &&
            world.placementPlan.every(p => p.assetId.includes('grass') ||
                Math.hypot(x-p.x,z-p.z) > p.clearance+.5);
    };
    return { heightAt: surface.surfaceHeightAt, walkable,
        randomPosition(random) {
            const bounds = world.settlement.bounds;
            for (let attempt = 0; attempt < 300; attempt++) {
                const x = bounds.minX+random()*(bounds.maxX-bounds.minX);
                const z = bounds.minZ+random()*(bounds.maxZ-bounds.minZ);
                if (walkable(x,z)) return { x,z };
            }
            for (const point of world.settlement.accessPaths.flat()) {
                if (walkable(point.x,point.z)) return { x: point.x,z: point.z };
            }
            throw new Error('Generated world has no safe reference resident position.');
        },
    };
}
