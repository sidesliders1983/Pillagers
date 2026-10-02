import { HairStyle } from '../characters/CharacterAppearance';
export const availableHairStyles:readonly HairStyle[]=['short','medium','long','tied','bun','braid'];
export function hairAssetPath(style:HairStyle,lod:number){
    return availableHairStyles.includes(style)?`/appearance/${style}/Hair_${style}_LOD${lod}.glb`:null;
}
