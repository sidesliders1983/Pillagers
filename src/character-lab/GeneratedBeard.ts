import { BeardStyle } from '../characters/CharacterAppearance';

/** Only fitted and reviewed reference assets belong in this registry. */
export const availableBeardStyles:readonly BeardStyle[]=['braid'];
export function beardAssetPath(style:BeardStyle,lod:number){
    return availableBeardStyles.includes(style)?`/appearance/beards/${style}/Beard_${style}_LOD${lod}.glb`:null;
}
