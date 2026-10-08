import { LabBodyPresentation, defaultLabBodyPresentation, parseLabBodyPresentation } from '../characters/LabBodyPresentation';
import { CharacterDNA, parseCharacterDNA } from '../characters/CharacterDNA';
import { CharacterPresentation, parseCharacterPresentation, resolveCharacterPresentation } from '../characters/CharacterPresentation';
import { characterContract } from '../characters/CharacterContract';
import { publishedLabBodyStyle, validateLabBodyUsage, labBodyAsset } from '../characters/LabBodySources';
import { assetMeasurement, characterAssetURL } from '../characters/CharacterAssets';

import { meshyHumanAvailableClips } from '../characters/MeshyHumanAssetIdentity';

export const labSnapshotVersion='pillagers-lab-snapshot/1' as const;
export const labStyleVersion=publishedLabBodyStyle;
export type CameraPoint=[number,number,number];
export interface LabTestSnapshot {
    version:typeof labSnapshotVersion;styleVersion:string;contractVersion:1;fitVersion:string;
    dna:CharacterDNA;presentation:CharacterPresentation;body:LabBodyPresentation;lod:number;
    pose:{animation:string;time:number;paused:boolean};
    camera:{type:'perspective'|'orthographic';scale:number|null;fov:38;position:CameraPoint;target:CameraPoint};lighting:'lab-neutral/1';
    modules:ReturnType<typeof snapshotModules>;
}
export const fixedLabViews={
    front:{position:[0,.95,3.7],target:[0,.95,0]},
    side:{position:[3.7,.95,0],target:[0,.95,0]},
    back:{position:[0,.95,-3.7],target:[0,.95,0]},
    rts:{position:[5.5,6.5,9],target:[0,.8,0]},
} satisfies Record<string,{position:CameraPoint;target:CameraPoint}>;
export function snapshotModules(dna:CharacterDNA,presentation:CharacterPresentation,lod:number,body:LabBodyPresentation=defaultLabBodyPresentation){
    const selected=resolveCharacterPresentation(dna,presentation,labBodyAsset(body.source??'published',lod)),source=validateLabBodyUsage(parseLabBodyPresentation(body).source??'published',lod,selected.presentation);
    if(source.source!=='published')return [{id:source.id,path:source.path,sha256:source.sha256},...[selected.hairId,selected.beardId,selected.outfitId,selected.equipmentId].filter((id):id is string=>!!id).map(id=>{
        const path=new URL(characterAssetURL(id,lod),'http://local.test').pathname;
        return {id,path,sha256:assetMeasurement(path).sha256};
    })];
    return ['body/universal-human',selected.hairId,selected.beardId,selected.outfitId,selected.equipmentId].filter((id):id is string=>!!id).map(id=>{
        const path=new URL(characterAssetURL(id,lod),'http://local.test').pathname;
        return {id,path,sha256:assetMeasurement(path).sha256};
    });
}
export function parseLabSnapshot(value:unknown):LabTestSnapshot {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Lab snapshot must be an object.');
    const s=value as LabTestSnapshot;
    if(s.version!==labSnapshotVersion||s.contractVersion!==characterContract.version||s.fitVersion!==characterContract.attachmentVersion||s.lighting!=='lab-neutral/1')throw new Error('Unsupported Lab snapshot style, contract or version.');
    const dna=parseCharacterDNA(s.dna),presentation=parseCharacterPresentation(s.presentation),body=parseLabBodyPresentation(s.body??defaultLabBodyPresentation);
    if(!Number.isInteger(s.lod)||s.lod<0||s.lod>2)throw new Error('Snapshot LOD must be 0, 1 or 2.');
    const source=validateLabBodyUsage(body.source??'published',s.lod,presentation);
    if(s.styleVersion!==source.styleVersion)throw new Error('Snapshot style differs from the selected body source.');
    if(!s.pose||!([...characterContract.animations,...(body.source==='meshy'?meshyHumanAvailableClips:[])] as readonly string[]).includes(s.pose.animation)||!Number.isFinite(s.pose.time)||s.pose.time<0||s.pose.time>60||typeof s.pose.paused!=='boolean')throw new Error('Invalid snapshot animation or clip time (0–60 seconds).');
    if(!s.camera||!['perspective','orthographic'].includes(s.camera.type)||s.camera.fov!==38||(s.camera.type==='perspective'?s.camera.scale!==null:!Number.isFinite(s.camera.scale)||s.camera.scale!<.5||s.camera.scale!>10))throw new Error('Invalid snapshot camera type or fixed scale.');
    const point=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=60);
    if(!s.camera||!point(s.camera.position)||!point(s.camera.target)||Math.hypot(...s.camera.position.map((n,i)=>n-s.camera.target[i]))<2-1e-6||Math.hypot(...s.camera.position.map((n,i)=>n-s.camera.target[i]))>14+1e-6||s.camera.position[1]<s.camera.target[1]-1e-6)throw new Error('Invalid snapshot camera.');
    const modules=snapshotModules(dna,presentation,s.lod,body);
    if(!Array.isArray(s.modules)||JSON.stringify(s.modules)!==JSON.stringify(modules))throw new Error('Snapshot assets differ from the current registry. Capture a new snapshot deliberately.');
    return {version:labSnapshotVersion,styleVersion:source.styleVersion,contractVersion:1,fitVersion:characterContract.attachmentVersion,dna,presentation,body,lod:s.lod,pose:{...s.pose},camera:{type:s.camera.type,scale:s.camera.scale,fov:38,position:[...s.camera.position],target:[...s.camera.target]},lighting:'lab-neutral/1',modules};
}
