import { ModuleMetadata, appearanceMetadata, validateModule } from './AttachmentContract';
import { characterAssetMeasurements, AssetMeasurement } from './CharacterAssetMeasurements';
import type { HairStyle, BeardStyle } from './AppearanceTypes';
import { referenceHeadFrames } from '../character-lab/ReferenceHeadFrames';

export interface SourceHeadFrame {centre:readonly [number,number,number];radius:number;up:readonly [number,number,number];front:readonly [number,number,number];sourceSha256:string;}

export interface CharacterAsset {
    id:string;type:'body'|ModuleMetadata['type'];version:1;style?:string;
    lods:Record<number,string>;runtimeLOD:'requested'|2;metadata?:ModuleMetadata;sourceFrame?:SourceHeadFrame;
    materialVariants:readonly string[];tags:readonly string[];
    budgets:{triangles:Record<number,number>;materials:number};
}
function appearance(type:'hair'|'beard',style:string):CharacterAsset {
    const hair=type==='hair',levels=hair||style==='braid'?[0,1,2]:[2];
    return {id:`${type}/${style}`,type,style,version:1,
        lods:Object.fromEntries(levels.map(lod=>[lod,`/appearance/${hair?'':'beards/'}${style}/${hair?'Hair':'Beard'}_${style}_LOD${lod}.glb`])),
        runtimeLOD:hair||style!=='braid'?2:'requested',metadata:appearanceMetadata(type,style),
        sourceFrame:referenceHeadFrames[`${type}/${style}` as keyof typeof referenceHeadFrames],
        materialVariants:['profile-hair-colour'],tags:['image-to-3d','reference-reviewed'],
        // Hair LOD2 intentionally retains the reviewed finer surface.
        budgets:{triangles:{0:10000,1:10000,2:10000},materials:2}};
}
/** The only published character asset discovery list. Scratch candidates are not assets. */
export const characterAssets:readonly CharacterAsset[]=[
    {id:'body/universal-human',type:'body',version:1,runtimeLOD:'requested',
        lods:{0:'/universal-human/UniversalHuman_LOD0.glb',1:'/universal-human/UniversalHuman_LOD1.glb',2:'/universal-human/UniversalHuman_LOD2.glb'},
        materialVariants:['profile-skin-tone'],tags:['image-to-3d','PillagersHumanRig'],budgets:{triangles:{0:10000,1:5000,2:1600},materials:2}},
    ...['short','medium','long','tied','bun','braid'].map(style=>appearance('hair',style)),
    ...['stubble','short','medium','long','split-braid','braid'].map(style=>appearance('beard',style)),
];
export const availableHairStyles=characterAssets.filter(asset=>asset.type==='hair').map(asset=>asset.style as HairStyle);
export const availableBeardStyles=characterAssets.filter(asset=>asset.type==='beard').map(asset=>asset.style as BeardStyle);
export function characterAsset(id:string){const asset=characterAssets.find(asset=>asset.id===id);if(!asset)throw new Error(`Unknown character asset: ${id}`);return asset;}
export function assetMeasurement(path:string):AssetMeasurement {const measured=characterAssetMeasurements[path];if(!measured)throw new Error(`${path}: missing registry measurements; run assets:registry.`);return measured;}
export function versionedCharacterAsset(path:string){return `${path}?v=${assetMeasurement(path).sha256.slice(0,12)}`;}
export function characterAssetURL(id:string,lod:number){
    const asset=characterAsset(id);if(!Number.isInteger(lod)||lod<0||lod>2)throw new Error(`${id}: invalid LOD ${lod}`);
    const selected=asset.runtimeLOD==='requested'?lod:asset.runtimeLOD,path=asset.lods[selected];
    if(!path)throw new Error(`${id}: missing LOD${selected}`);return versionedCharacterAsset(path);
}
export function hairAssetPath(style:HairStyle,lod:number){return availableHairStyles.includes(style)?characterAssetURL(`hair/${style}`,lod):null;}
export function beardAssetPath(style:BeardStyle,lod:number){return availableBeardStyles.includes(style)?characterAssetURL(`beard/${style}`,lod):null;}
export function registeredAppearanceMetadata(kind:'hair'|'beard',style:string){const metadata=characterAsset(`${kind}/${style}`).metadata;if(!metadata)throw new Error(`${kind}/${style}: missing attachment metadata`);return metadata;}
export function validateCharacterRegistry(entries:readonly CharacterAsset[]=characterAssets){
    const ids=new Set<string>(),paths=new Set<string>();
    for(const asset of entries){
        const fail=(rule:string)=>{throw new Error(`${asset.id}: ${rule}`);};
        if(!asset.id||ids.has(asset.id))fail('asset id must be unique');ids.add(asset.id);
        if(asset.version!==1)fail('unsupported registry version');
        if(!['body','hair','beard','mask','garment','equipment'].includes(asset.type))fail('unknown asset type');
        if(!['requested',2].includes(asset.runtimeLOD))fail('invalid runtime LOD policy');
        if(!asset.materialVariants.length)fail('material variants must be declared');
        if(!Object.keys(asset.lods).length)fail('LOD files must be declared');
        for(const [lod,path] of Object.entries(asset.lods)){
            if(!['0','1','2'].includes(lod))fail(`invalid LOD ${lod}`);
            if(!/^\/[\w/-]+\.glb$/.test(path)||paths.has(path))fail(`invalid or duplicate asset path ${path}`);paths.add(path);
            if(!Number.isInteger(asset.budgets.triangles[Number(lod)])||asset.budgets.triangles[Number(lod)]<=0)fail(`LOD${lod} requires a triangle budget`);
        }
        if(asset.type==='body'&&[0,1,2].some(lod=>!asset.lods[lod]))fail('body requires LOD0, LOD1 and LOD2');
        if(asset.runtimeLOD===2&&!asset.lods[2])fail('runtime policy requires LOD2');
        if(!Number.isInteger(asset.budgets.materials)||asset.budgets.materials<=0)fail('invalid material budget');
        if(asset.type!=='body'){
            if(!asset.metadata)fail('attachment metadata is required');
            try{validateModule(asset.metadata!);}catch(error){fail((error as Error).message);}
            if(asset.metadata!.id!==asset.id||asset.metadata!.type!==asset.type)fail('attachment id/type does not match registry');
            if(asset.metadata!.authoringFrame==='measured-reference-head'&&!asset.sourceFrame)fail('measured attachment requires a source frame');
        }
    }
    return entries;
}
