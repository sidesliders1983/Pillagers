import { AssetManager } from '../core/AssetManager';
import { loadPineModels } from '../world/PineModels';
/** Backward-compatible Lab resolver; Lab teardown owns its source scene resources. */
export async function loadLabPines(assets: AssetManager) {
    return (await loadPineModels(assets)).resolve;
}
