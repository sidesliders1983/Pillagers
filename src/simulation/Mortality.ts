import { releaseEquipment } from './Smithery';
import { careActive, careEndpoint, endCare } from './CareCalendar';
import {personaAway} from './WorldExpeditions';
import {personaWeatherExposure,permanentlySheltered,weatherFacts} from './Weather';
import type {SimulationState} from './SimulationCore';
import {personaAge} from './PersonaAge';

export type MortalityBand = {minAge:number; chanceBps:number};
export const defaultMortalityBands:MortalityBand[] = [
    {minAge:0,chanceBps:10},{minAge:16,chanceBps:5},{minAge:50,chanceBps:50},
    {minAge:60,chanceBps:200},{minAge:70,chanceBps:500},{minAge:80,chanceBps:1000},{minAge:90,chanceBps:2000},
];
type EventWriter=(type:string,personaId?:string,details?:Record<string,unknown>)=>void;
/** Resolve all rolls before cleanup so simultaneous deaths retain factual relationship context. */
export function resolveMortality(state:SimulationState,roll:(bps:number)=>boolean,emit:EventWriter,eligibleIds?:Set<string>):number {
    const mechanics=state.mechanics!,bands=mechanics.config.mortalityBands;
    const deaths=Object.keys(state.personas).sort().flatMap(id=>{
        const person=state.personas[id];if(person.deathWinter!==null||(eligibleIds&&!eligibleIds.has(id)))return [];
        const age=personaAge(state,id);
        const band=[...bands].reverse().find(b=>b.minAge<=age);
        const weatherExposureBps=personaAway(state,id)?0:personaWeatherExposure(state,id),risk=Math.min(10000,(band?.chanceBps??0)+weatherExposureBps);
        if(!roll(risk))return [];
        const home=Object.values(state.households).find(h=>h.memberIds.includes(id));
        return [{id,age,householdId:home?.id??null,residenceId:home?.residenceId??null,occupation:person.occupation,partnerId:person.partnerId,...(state.weather?.config.enabled?{mortalityRiskBps:risk,weatherExposureBps,permanentlySheltered:permanentlySheltered(state,id),...weatherFacts(state)}:{})}];
    });
    for(const death of deaths){
        const person=state.personas[death.id],info=mechanics.people[death.id];
        person.deathWinter=state.time.winter;
        if(person.birthTick!==undefined)person.deathTick=state.time.tick;
        const active=person.occupationHistory.at(-1);if(active?.endedAt===null)active.endedAt={...state.time};
        if(person.occupation!==null)info.progress[person.occupation]=person.workProgress;
        person.occupation=null;info.occupationLocked=false;
        if(person.partnerId!==null)state.personas[person.partnerId].partnerId=null;
        person.partnerId=null;
        for(const home of Object.values(state.households)){
            home.memberIds=home.memberIds.filter(id=>id!==person.id);
            if(home.memberIds.length===0)home.residenceId=null;
        }
        releaseEquipment(state, person.id, 'death');
        emit('PersonaDied',person.id,{...death,participants:[person.id],name:person.name});
    }
    if(deaths.length){
        const deadIds=new Set(deaths.map(d=>d.id));
        for(const id of Object.keys(mechanics.people).sort()){
            const person=state.personas[id],info=mechanics.people[id];
            if(person.deathWinter!==null){endCare(state,info);continue;}
            if(info.caregiverId!==null&&deadIds.has(info.caregiverId)){info.caregiverId=null;info.caregiverLocked=false;}
            if(careActive(state,info)&&deaths.some(d=>state.personas[d.id].parentIds.includes(id))){
                if(info.childcareUntilTick!==undefined){
                    const now=state.time.winter*state.ticksPerWinter+state.time.tick;
                    const endpoints=Object.values(state.personas).filter(child=>child.deathWinter===null&&child.parentIds.includes(id))
                        .map(child=>(child.birthWinter+mechanics.config.childcareWinters)*state.ticksPerWinter+(child.birthTick??0));
                    const endpoint=Math.min(careEndpoint(state,info),Math.max(now,...endpoints));
                    info.childcareUntilWinter=Math.floor(endpoint/state.ticksPerWinter);
                    info.childcareUntilTick=endpoint%state.ticksPerWinter;
                    if(!careActive(state,info))endCare(state,info);
                    continue;
                }
                const endpoints=Object.values(state.personas).filter(child=>child.deathWinter===null&&child.parentIds.includes(id)).map(child=>child.birthWinter+mechanics.config.childcareWinters);
                info.childcareUntilWinter=Math.min(info.childcareUntilWinter,Math.max(state.time.winter,...endpoints));
                if(info.childcareUntilWinter<=state.time.winter){info.caregiverId=null;info.caregiverLocked=false;}
            }
        }
    }
    return deaths.length;
}
