import {meshyHumanAssetIdentity} from './MeshyHumanAssetIdentity';
import { assetMeasurement, characterAssetURL, characterAsset, characterAssetFitsBody } from './CharacterAssets';
import { v04BodyIdentity } from './V04ModuleCatalog';
import type { CharacterPresentation } from './CharacterPresentation';

export type LabBodySource='published'|'golden-v04-preview'|'meshy';
export const publishedLabBodyStyle='pillagers-character-style/0.4-draft.1';
/** Explicit Lab-only candidate; never an accepted production registry entry. */
export const goldenLabBody=Object.freeze({
    source:'golden-v04-preview' as const,id:v04BodyIdentity.id,
    path:'/character-lab/candidates/golden-v04/body-r3.glb',
    sha256:v04BodyIdentity.sha256,
    styleVersion:'pillagers-character-style/0.4-candidate-002-r3',
    triangles:1322,materials:1,status:'preview' as const,
});
export const labCandidatePresetNames=['giant','raven','bear','fox','elder','jarl'] as const;
export type LabCandidatePreset=typeof labCandidatePresetNames[number];
export const labCandidateBodyPresets=Object.freeze({
    giant:{height:1.58,morphs:{Powerful:1,Grounded:.35,Masculine:.3}},
    raven:{height:1.54,morphs:{Slight:1,Underweight:.6,Agile:.4}},
    bear:{height:1.27,morphs:{Overweight:.4,Powerful:.35,Grounded:.75,Masculine:.15}},
    fox:{height:1.36,morphs:{Slight:.65,Agile:1,Underweight:.4,LegRatio:.04,ShoulderSlope:.03}},
    elder:{height:1.44,morphs:{Age:.25,Slight:.55,Underweight:.35,ShoulderSlope:.08}},
    jarl:{height:1.51,morphs:{Powerful:.55,Grounded:.65,Masculine:.45,Overweight:.2}},
});
for(const recipe of Object.values(labCandidateBodyPresets)){Object.freeze(recipe.morphs);Object.freeze(recipe);}
export function parseLabBodySource(value:unknown='published'):LabBodySource {
    if(value!=='published'&&value!==goldenLabBody.source&&value!=='meshy')throw new Error('Unknown Lab body source.');
    return value;
}
export function labBodyAsset(source:LabBodySource='published',lod=2){
    parseLabBodySource(source);
    if(source==='meshy'){
        if(!Number.isInteger(lod)||lod<0||lod>2)throw new Error('Invalid Meshy LOD.');
        const identity=meshyHumanAssetIdentity[lod];return {source,id:'body/meshy-human',path:identity.path,url:identity.path,sha256:identity.sha256,styleVersion:'pillagers-meshy-human/1',status:'preview' as const};
    }
    if(source===goldenLabBody.source){
        if(lod!==2)throw new Error('The v0.4 body preview supports LOD2 only.');
        return {...goldenLabBody,url:goldenLabBody.path+'?v='+goldenLabBody.sha256.slice(0,12)};
    }
    const url=characterAssetURL('body/universal-human',lod),path=url.split('?')[0];
    return {source,id:'body/universal-human',path,url,sha256:assetMeasurement(path).sha256,styleVersion:publishedLabBodyStyle,status:'published' as const};
}
/** Prevent silently fitting an old authoring frame to the new unreviewed source. */
export function validateLabBodyUsage(source:LabBodySource,lod:number,presentation:CharacterPresentation){
    const asset=labBodyAsset(source,lod);
    if((source===goldenLabBody.source||source==='meshy')&&presentation.technicalWaistWrap)throw new Error('The v0.4 body does not reuse the legacy waist demonstrator.');
    for(const key of ['hair','beard','outfit','equipment'] as const){
        const choice=presentation[key];
        if(choice&&choice!=='auto'&&choice!=='none'&&!characterAssetFitsBody(characterAsset(choice),asset))throw new Error(choice+': module is not compatible with this exact body source.');
    }
    return asset;
}

/** Trusted source-authored semantic regions; ordinary published sources use the legacy mapping. */
export async function labBodySurfaceCalibration(source:LabBodySource):Promise<unknown|undefined> {
    parseLabBodySource(source);return source===goldenLabBody.source?(await import('./GoldenBodySurfaceCalibration')).goldenBodySurfaceCalibration:undefined;
}
