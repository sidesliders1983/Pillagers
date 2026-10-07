import {traitKeys, heritageKeys, normalizeHeritage} from '../characters/CharacterDNA';
import type {CoreTraits, HeritageMix} from '../characters/CharacterDNA';
import {generateCharacterDNA} from '../characters/generateCharacterDNA';
import type {SimulationState} from './SimulationCore';
import {personaAge} from './PersonaAge';
export function canPartner(state:SimulationState,aId:string,bId:string):boolean {
    const a=state.personas[aId],b=state.personas[bId];
    if(!a||!b||aId===bId||a.deathWinter!==null||b.deathWinter!==null||a.partnerId!==null||b.partnerId!==null||a.dna.sex===b.dna.sex)return false;
    const adultAge=state.mechanics?.config.adultAge??18;
    if(personaAge(state,aId)<adultAge||personaAge(state,bId)<adultAge)return false;
    return !prohibitedKinship(state,aId,bId);
}
export function prohibitedKinship(state:SimulationState,aId:string,bId:string):boolean {
    const a=state.personas[aId],b=state.personas[bId];
    if(aId===bId)return true;
    const siblings=(x:string,y:string)=>state.personas[x].parentIds.some(parent=>state.personas[y].parentIds.includes(parent));
    const parentsAndGrandparents=(id:string)=>state.personas[id].parentIds.flatMap(parent=>[parent,...state.personas[parent].parentIds]);
    if(parentsAndGrandparents(aId).includes(bId)||parentsAndGrandparents(bId).includes(aId)||siblings(aId,bId))return true;
    if(a.parentIds.some(parent=>siblings(parent,bId))||b.parentIds.some(parent=>siblings(parent,aId)))return true;
    return false;
}
export type EventWriter=(type:string,personaId?:string,details?:Record<string,unknown>)=>void;
export function resolvePartnerships(state:SimulationState,roll:(bps:number)=>boolean,house:(householdId:string)=>void,emit:EventWriter):void {
    const ids=Object.keys(state.personas).sort();
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
        const aId=ids[i],bId=ids[j];if(!canPartner(state,aId,bId)||!roll(state.mechanics!.config.partnershipChanceBps))continue;
        state.personas[aId].partnerId=bId;state.personas[bId].partnerId=aId;
        const members=[aId,bId];
        for(const id of ids){const person=state.personas[id];if(person.partnerId===null&&person.deathWinter===null&&person.parentIds.some(parent=>members.includes(parent))&&!members.includes(id))members.push(id);}
        for(const home of Object.values(state.households)){
            home.memberIds=home.memberIds.filter(id=>!members.includes(id));
            if(home.memberIds.length===0)home.residenceId=null;
        }
        let index=1;while(Object.hasOwn(state.households,`household-${index}`)||Object.hasOwn(state.families,`family-${index}`))index++;
        const householdId=`household-${index}`;
        state.households[householdId]={id:householdId,memberIds:members,residenceId:null};
        state.families[`family-${index}`]={id:`family-${index}`,memberIds:[...members]};
        emit('PartnershipFormed',aId,{partnerId:bId,householdId,participants:[aId,bId],ages:[personaAge(state,aId),personaAge(state,bId)]});
        house(householdId);
    }
}

export function resolveBirths(state:SimulationState,roll:(bps:number)=>boolean,random:()=>number,foodNeed:()=>number,register:(id:string)=>void,emit:EventWriter,unavailable:Set<string>=new Set()):void {
    const config=state.mechanics!.config;
    for(const motherId of Object.keys(state.personas).sort()){
        const mother=state.personas[motherId],info=state.mechanics!.people[motherId];
        const age=personaAge(state,motherId);
        if(unavailable.has(motherId)||isCaregiver(state,motherId)||mother.deathWinter!==null||mother.dna.sex!=='female'||age<config.fertilityMinAge||age>config.fertilityMaxAge||mother.partnerId===null)continue;
        const father=state.personas[mother.partnerId];if(father.deathWinter!==null||father.dna.sex!=='male')continue;
        if(info.lastBirthWinter!==null&&state.time.winter-info.lastBirthWinter<=config.birthCooldownWinters)continue;
        if(state.stocks.food<foodNeed()||!roll(config.fertilityChanceBps))continue;
        const home=Object.values(state.households).find(h=>h.memberIds.includes(motherId));if(!home)continue;
        let n=1;while(Object.hasOwn(state.personas,`persona-${n}`))n++;const id=`persona-${n}`;
        const dna=generateCharacterDNA(random());dna.age=0;dna.sex=roll(5000)?'female':'male';
        dna.traits=Object.fromEntries(traitKeys.map(key=>[key,(mother.dna.traits[key]+father.dna.traits[key])/2])) as CoreTraits;
        dna.heritage=normalizeHeritage(Object.fromEntries(heritageKeys.map(key=>[key,(mother.dna.heritage[key]+father.dna.heritage[key])/2])) as HeritageMix);
        state.personas[id]={id,name:`Resident ${id}`,birthWinter:state.time.winter,deathWinter:null,originClanId:state.clan.id,dna,parentIds:[father.id,mother.id],partnerId:null,occupation:null,occupationHistory:[],workProgress:0};
        register(id);
        for(const key of traitKeys)if(roll(config.dominantLegacyChanceBps)){
            const parent=roll(5000)?mother:father;
            dna.traits[key]=parent.dna.traits[key];
            state.mechanics!.people[id].dominantLegacy[key]=parent.id;
        }
        home.memberIds.push(id);
        for(const family of Object.values(state.families))if(family.memberIds.includes(motherId)||family.memberIds.includes(father.id))family.memberIds.push(id);
        info.lastBirthWinter=state.time.winter;info.childcareUntilWinter=state.time.winter+config.childcareWinters;
        emit('ChildBorn',id,{participants:[father.id,mother.id,id],parentIds:[father.id,mother.id],name:state.personas[id].name,dna:structuredClone(dna)});
    }
}

export function isCaregiver(state:SimulationState,id:string):boolean {
    return Object.values(state.mechanics!.people).some(info=>info.childcareUntilWinter>state.time.winter&&info.caregiverId===id);
}
export function isProvidingCare(state:SimulationState,id:string):boolean {
    const info=state.mechanics!.people[id];
    return isCaregiver(state,id)||(info.childcareUntilWinter>state.time.winter&&info.caregiverId===null);
}
export function caregiverEligible(state:SimulationState,id:string):boolean {
    const person=state.personas[id];
    return !!person&&person.deathWinter===null&&person.dna.sex==='female'&&personaAge(state,id)>=state.mechanics!.config.adultAge&&person.occupation===null&&!isProvidingCare(state,id);
}
export function assignCaregiver(state:SimulationState,motherId:string,caregiverId:string|null,locked:boolean,emit:EventWriter):void {
    const mother=state.personas[motherId],info=state.mechanics!.people[motherId];
    if(!mother||mother.deathWinter!==null||mother.dna.sex!=='female'||info.childcareUntilWinter<=state.time.winter)throw new Error('No active childcare group');
    if(caregiverId!==null&&caregiverId!==info.caregiverId&&!caregiverEligible(state,caregiverId))throw new Error('Ineligible caregiver');
    info.caregiverId=caregiverId;info.caregiverLocked=locked;
    emit('CaregiverAssigned',motherId,{caregiverId,participants:caregiverId?[motherId,caregiverId]:[motherId],autonomous:!locked});
}
export function resolveCaregivers(state:SimulationState,emit:EventWriter):void {
    for(const motherId of Object.keys(state.mechanics!.people).sort()){
        const info=state.mechanics!.people[motherId];
        if(info.childcareUntilWinter<=state.time.winter){info.caregiverId=null;info.caregiverLocked=false;continue;}
        if(info.caregiverLocked||info.caregiverId!==null)continue;
        const candidate=Object.keys(state.personas).sort().find(id=>caregiverEligible(state,id));
        if(candidate)assignCaregiver(state,motherId,candidate,false,emit);
    }
}
