import { HairStyle } from '../characters/CharacterAppearance';
import { versionedAppearanceAsset } from './AppearanceAssetVersions';
export const availableHairStyles:readonly HairStyle[]=['short','medium','long','tied','bun','braid'];
export function hairAssetPath(style:HairStyle,_lod:number){
    // Hair modules are small; keep the reviewed surface across body LOD changes.
    return availableHairStyles.includes(style)?versionedAppearanceAsset(`/appearance/${style}/Hair_${style}_LOD2.glb`):null;
}
