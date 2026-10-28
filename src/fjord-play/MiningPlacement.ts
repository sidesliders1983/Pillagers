import { createBlueprintSurface, type TerrainSurface } from '../world-generation/TerrainQueries';
import type { WorldBlueprint, Point2 } from '../world-generation/WorldBlueprint';
import type { OreSite } from '../world-generation/OreSites';
import { miningAsset } from './MiningAssets';

export interface MiningPlacement {
    model: {x: number; y: number; z: number; rotation: number};
    forecourt: {center: Point2; right: Point2; front: Point2; width: number; back: number; forward: number; height: number};
    clearing: {x: number; y: number; z: number; rotation: number; scale: number; halfWidth: number; halfDepth: number};
    rearTerrainHeight: number;
}

function platformHeight(surface: TerrainSurface, center: Point2, right: Point2, front: Point2,
    width: number, back: number, forward: number): number {
    let height = surface.surfaceHeightAt(center.x, center.z);
    const depthSteps = Math.ceil((back + forward) / .25);
    for (let column = 0; column <= 8; column++) for (let row = 0; row <= depthSteps; row++) {
        const x = -width / 2 + width * column / 8;
        const z = -back + (back + forward) * row / depthSteps;
        height = Math.max(height, surface.surfaceHeightAt(
            center.x + right.x * x + front.x * z, center.z + right.z * x + front.z * z));
    }
    return height + .04;
}

/** The doorway faces +Z at 1.45 m; the projecting rails are not the entrance plane.
 * Choose a local hillside orientation without changing the saved site, route or geography. */
export function placeMiningModel(world: WorldBlueprint, site: Pick<OreSite, 'position' | 'approach'>): MiningPlacement {
    const surface = createBlueprintSurface(world);
    const originalAngle = Math.atan2(site.position.x - site.approach.x, site.position.z - site.approach.z);
    const width = miningAsset.bounds.max[0] - miningAsset.bounds.min[0] + .6;
    const back = .5, forward = 1.65, distance = 1.6;
    const rearDistance = distance - miningAsset.bounds.min[2];
    const natural = surface.surfaceHeightAt(site.approach.x, site.approach.z);
    let best: {placement: MiningPlacement; score: number} | undefined;
    for (let direction = 0; direction < 16; direction++) {
        const angle = originalAngle + direction * Math.PI / 8;
        const uphill = {x: Math.sin(angle), z: Math.cos(angle)};
        const front = {x: -uphill.x, z: -uphill.z}, right = {x: front.z, z: -front.x};
        const height = platformHeight(surface, site.approach, right, front, width, back, forward);
        const rotation = Math.atan2(front.x, front.z);
        let rearTerrainHeight = -Infinity;
        // Ridges can descend again at the exact rear-centre point; inspect the whole rear section.
        for (const depth of [rearDistance - 1.5, rearDistance - .75, rearDistance])
            for (const side of [-width / 4, 0, width / 4])
                rearTerrainHeight = Math.max(rearTerrainHeight, surface.surfaceHeightAt(
                    site.approach.x + uphill.x * depth + right.x * side,
                    site.approach.z + uphill.z * depth + right.z * side));
        const totalDepth = rearDistance + forward + .5, clearingCenter = (rearDistance - forward - .5) / 2;
        const placement: MiningPlacement = {
            model: {x: site.approach.x + uphill.x * distance, y: height,
                z: site.approach.z + uphill.z * distance, rotation},
            forecourt: {center: {...site.approach}, right, front, width, back, forward, height},
            clearing: {x: site.approach.x + uphill.x * clearingCenter, y: height,
                z: site.approach.z + uphill.z * clearingCenter, rotation, scale: 1,
                halfWidth: width / 2 + .5, halfDepth: totalDepth / 2},
            rearTerrainHeight,
        };
        // Prefer a buried rear and a modest forecourt, retaining the original uphill direction on ties.
        const embed = rearTerrainHeight - height;
        const score = (embed >= .5 ? 10 : 0) + Math.min(2, embed) -
            (height - natural) * 2 - Math.min(direction, 16 - direction) * .01;
        if (!best || score > best.score) best = {placement, score};
    }
    return best!.placement;
}

export function miningForecourtHeight(placement: MiningPlacement, point: Point2, natural: number): number {
    const pad = placement.forecourt, dx = point.x - pad.center.x, dz = point.z - pad.center.z;
    const side = dx * pad.right.x + dz * pad.right.z, front = dx * pad.front.x + dz * pad.front.z;
    const edge = Math.min(pad.width / 2 - Math.abs(side), front + pad.back, pad.forward - front);
    if (edge < -.5) return natural;
    const blend = Math.max(0, Math.min(1, (edge + .5) / .5));
    return Math.max(natural, natural + (pad.height - natural) * blend);
}
