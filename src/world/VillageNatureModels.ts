import { Box3, Vector3, type Object3D } from 'three';
import type { AssetManager, AssetKey } from '../core/AssetManager';
import type { NatureAssetKey } from '../config/NatureAssets';
import { natureFootprints } from '../world-generation/NatureFootprints';
import { pineFootprints } from '../world-generation/PineFootprints';

/** V2 reuses two already registered scenery models for a birch and compact young spruce.
 * Normalize their measured extents inside the pinned role, preserving source primitives/maps.
 * AssetManager owns those resources; this cache owns only unmounted transform wrappers. */
export function createVillageNatureResolver(assets: AssetManager,
    fallback: (id: NatureAssetKey) => Object3D = id => assets.get(id)) {
    const models = new Map<NatureAssetKey, Object3D>();
    return (id: NatureAssetKey) => {
        const asset: AssetKey | undefined = id === 'kaykit-deciduous-a' ? 'birch'
            : id === 'kaykit-conifer-c' ? 'spruce' : undefined;
        if (!asset || !assets.has(asset)) return fallback(id);
        const existing = models.get(id);
        if (existing) return existing;
        const model = assets.get(asset);
        if (model.userData.placeholder) return fallback(id);
        model.updateMatrixWorld(true);
        const bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3());
        const radius = Math.hypot(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
            Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)));
        const role = id in pineFootprints ? pineFootprints[id as keyof typeof pineFootprints] : natureFootprints[id];
        if (!Number.isFinite(size.y) || size.y <= 0 || radius <= 0) return fallback(id);
        model.scale.multiplyScalar(Math.min(role.height / size.y, role.radius / radius));
        model.updateMatrixWorld(true);
        models.set(id, model);
        return model;
    };
}
