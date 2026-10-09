import { Group, Raycaster, Vector3 } from 'three';
import type { AssetManager, AssetKey } from '../core/AssetManager';
import type { BuildingPlacement } from '../world-generation/WorldBlueprint';

/** Preserve authored parcel geometry, house identity, scale and relative foundation. */
export function placeSettlement(assets: AssetManager, placements: readonly BuildingPlacement[],
    height: (x: number, z: number) => number) {
    const village = new Group();
    for (const building of placements) {
        const parcel = new Group();
        parcel.name = building.id;
        parcel.position.set(building.x, height(building.x, building.z), building.z);
        parcel.rotation.y = building.rotation;
        let floor = 0;
        if (building.terrainKey) {
            const yard = assets.get(building.terrainKey as AssetKey);
            yard.updateMatrixWorld(true);
            floor = new Raycaster(new Vector3(0,20,0), new Vector3(0,-1,0))
                .intersectObject(yard, true)[0]?.point.y ?? 0;
            parcel.add(yard);
        }
        const house = assets.get(building.key as AssetKey);
        house.position.y = floor;
        parcel.add(house);
        village.add(parcel);
    }
    return village;
}
