import { createBlueprintSurface } from './TerrainQueries';
import { buildingDistance } from '../world/SettlementLayout';
import { footprintBounds } from './PlanSettlement';
import type { WorldBlueprint } from './WorldBlueprint';
import type { HarborBerth } from './SettlementSites';

type Landscape = Pick<WorldBlueprint, 'terrain' | 'waterLevel' | 'settlement'>;

/** Validate a padded 16.5 by 5m berth around the authored 14.47 by 3.48m hull. */
export function harborDepth(world: Landscape, berth: HarborBerth) {
    const surface = createBlueprintSurface(world);
    const placement = { ...berth.center, rotation: berth.rotation,
        halfWidth: berth.halfBeam, halfDepth: berth.halfLength, id: '', key: '', radius: 9 };
    const bounds = footprintBounds(placement, world.terrain.spacing * Math.SQRT2);
    if (bounds.minX < world.terrain.bounds.minX || bounds.maxX > world.terrain.bounds.maxX ||
        bounds.minZ < world.terrain.bounds.minZ || bounds.maxZ > world.terrain.bounds.maxZ) return -Infinity;
    let minimumDepth = Infinity;
    // Include all vertices of triangles touching the padded berth, conservatively.
    for (let z = Math.floor(bounds.minZ / 2) * 2; z <= bounds.maxZ + 2; z += 2) {
        for (let x = Math.floor(bounds.minX / 2) * 2; x <= bounds.maxX + 2; x += 2) {
            if (buildingDistance(x, z, placement) > world.terrain.spacing * Math.SQRT2) continue;
            minimumDepth = Math.min(minimumDepth, world.waterLevel - surface.surfaceHeightAt(x, z));
        }
    }
    return minimumDepth;
}

export function findHarborBerth(world: Landscape): HarborBerth | null {
    const landing = world.settlement.harbor;
    if (!landing) return null;
    const surface = createBlueprintSurface(world);
    for (const distance of [13, 17, 21, 25]) for (let direction = 0; direction < 24; direction++) {
        const rotation = direction * Math.PI / 12;
        const dx = Math.sin(rotation), dz = Math.cos(rotation);
        // A continuous short shore approach, not a berth across a peninsula.
        let clear = true;
        for (let step = 3; step <= distance; step++) {
            if (surface.surfaceHeightAt(landing.x + dx * step, landing.z + dz * step) > world.waterLevel) {
                clear = false; break;
            }
        }
        if (!clear) continue;
        const candidate = { center: { x: landing.x + dx * distance, z: landing.z + dz * distance },
            rotation, halfLength: 8.25, halfBeam: 2.5, minimumDepth: 0 };
        const minimumDepth = harborDepth(world, candidate);
        if (minimumDepth >= .5) return { ...candidate, minimumDepth };
    }
    return null;
}
