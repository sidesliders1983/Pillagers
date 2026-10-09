import { CharacterDNA } from './CharacterDNA';
import { BodyAssetIdentity, characterAsset, characterAssets, characterAssetFitsBody } from './CharacterAssets';
import { universalHumanProfile } from './UniversalHumanProfile';
import { EquipmentSocket, equipmentSocketNames, moduleAtEquipmentSocket } from './AttachmentContract';
import { identitySample } from './seededRandom';
import type { HairStyle, BeardStyle } from './AppearanceTypes';

/** Lab authoring choices are presentation state, never persistent character identity. */
export interface CharacterPresentation {
    hair:string;beard:string;outfit:string;equipment:string;
    equipmentSocket:EquipmentSocket|'auto';
    hairColor:string|null;
    technicalWaistWrap:boolean;
}
export const defaultCharacterPresentation:Readonly<CharacterPresentation>=Object.freeze({hair:'auto',beard:'auto',outfit:'auto',equipment:'none',equipmentSocket:'auto',hairColor:null,technicalWaistWrap:false});
export function parseCharacterPresentation(value:unknown=defaultCharacterPresentation):CharacterPresentation {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Presentation must be an object.');
    const p=value as Record<string,unknown>;
    if(Object.keys(p).some(key=>!Object.keys(defaultCharacterPresentation).includes(key)))throw new Error('Unknown presentation field.');
    const result={...defaultCharacterPresentation,...p} as CharacterPresentation;
    for(const [key,type] of [['hair','hair'],['beard','beard'],['outfit','garment'],['equipment','equipment']] as const){
        const id=result[key];if(typeof id!=='string')throw new Error('Invalid '+key+' choice.');
        if(id!=='auto'&&id!=='none'&&characterAsset(id).type!==type)throw new Error('Invalid '+key+' asset type.');
    }
    if(result.equipmentSocket!=='auto'&&!equipmentSocketNames.includes(result.equipmentSocket))throw new Error('Unknown equipment carry socket.');
    if(result.hairColor!==null&&(typeof result.hairColor!=='string'||!/^#[0-9a-f]{6}$/i.test(result.hairColor)))throw new Error('Hair colour must be Auto or a six-digit hex colour.');
    if(typeof result.technicalWaistWrap!=='boolean')throw new Error('Technical waist wrap must be a boolean.');
    return result;
}
export function presentationChoices(type:'hair'|'beard'|'garment'|'equipment',body?:BodyAssetIdentity){
    return characterAssets.filter(asset=>asset.type===type&&characterAssetFitsBody(asset,body)).map(asset=>({id:asset.id,label:(asset.label??asset.style??asset.id).replaceAll('-',' ')+(asset.reviewStatus==='preview'?' (preview)':'')}));
}
export function resolveCharacterPresentation(dna:CharacterDNA,value:unknown=defaultCharacterPresentation,body?:BodyAssetIdentity){
    const presentation=parseCharacterPresentation(value),base=universalHumanProfile(dna),v04=!!body&&body.id!=='body/universal-human';
    // Validate saved manual choices even when age/sex currently makes them ineligible.
    for(const key of ['hair','beard','outfit','equipment'] as const){
        const choice=presentation[key];
        if(choice!=='auto'&&choice!=='none'&&!characterAssetFitsBody(characterAsset(choice),body))throw new Error(choice+': module is not compatible with this exact body source.');
    }
    const automatic=(type:'hair'|'beard'|'garment'|'equipment',legacy:string)=>{
        if(!v04)return legacy;
        // A compatible preview remains inspectable through explicit Lab selection.
        // Automatic composition must wait for independent asset acceptance.
        const entries=characterAssets.filter(asset=>asset.type===type&&asset.reviewStatus==='accepted'&&characterAssetFitsBody(asset,body));
        if(!entries.length)return '';
        const style=type==='hair'?base.appearance.hairStyle:type==='beard'?base.appearance.beardStyle:undefined;
        if(style==='none')return '';
        const matching=entries.find(asset=>asset.style===style);
        return matching?.id??entries[Math.floor(identitySample(dna.seed,'v04.'+type+'.module')*entries.length)].id;
    };
    const select=(choice:string,automatic:string)=>choice==='none'?null:choice==='auto'?automatic||null:choice;
    const hairId=select(presentation.hair,automatic('hair','hair/'+base.appearance.hairStyle));
    const beardEligible=base.age>=18&&base.masculinity>.5;
    const beardId=beardEligible?select(presentation.beard,automatic('beard',base.appearance.beardStyle==='none'?'':'beard/'+base.appearance.beardStyle)):null;
    const outfitId=select(presentation.outfit,automatic('garment',''));
    let equipmentId=select(presentation.equipment,automatic('equipment',''));
    if(equipmentId&&characterAsset(equipmentId).metadata?.dependency?.module!==undefined&&characterAsset(equipmentId).metadata!.dependency!.module!==outfitId)equipmentId=null;
    const equipmentSocket=equipmentId?(presentation.equipmentSocket==='auto'?moduleAtEquipmentSocket(characterAsset(equipmentId).metadata!).anchor:moduleAtEquipmentSocket(characterAsset(equipmentId).metadata!,presentation.equipmentSocket).anchor):null;
    const profile={...base,appearance:{...base.appearance,
        hairStyle:hairId?characterAsset(hairId).style as HairStyle:base.appearance.hairStyle,
        beardStyle:beardId?characterAsset(beardId).style as BeardStyle:'none' as const,
        color:presentation.hairColor??base.appearance.color}};
    return {presentation,profile,hairId,beardId,outfitId,equipmentId,equipmentSocket,beardEligible};
}
