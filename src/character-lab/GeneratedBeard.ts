import { BeardStyle } from '../characters/CharacterAppearance';

/** Only fitted and reviewed reference assets belong in this registry. */
export const availableBeardStyles:readonly BeardStyle[]=['stubble','short','medium','long','split-braid','braid'];
export function beardAssetPath(style:BeardStyle,lod:number){
    const assetLOD=style==='braid'?lod:2;
    return availableBeardStyles.includes(style)?`/appearance/beards/${style}/Beard_${style}_LOD${assetLOD}.glb`:null;
}
