import {personaAge,inspectCattle,inspectWeather,inspectWeatherExposure,landingSummary} from '../simulation/SimulationCore';
import type {SimulationState} from '../simulation/SimulationCore';
export type EntityKind='persona'|'household'|'building'|'cattle';
export type BoardEntity={kind:EntityKind;id:string;label:string;sprite:string;x:number;y:number;depth:number;farmyard:boolean;};
export function projectSettlement(state:SimulationState){
 const entities:BoardEntity[]=[],slots=new Map<string,{x:number;z:number}>();
 const homes=Object.values(state.households).sort((a,b)=>a.id.localeCompare(b.id));
 homes.forEach((h,i)=>slots.set(h.id,{x:(i%4)*8,z:Math.floor(i/4)*8}));
 const farmyards=state.landing?landingSummary(state).farmyards:[];
 const add=(kind:EntityKind,id:string,label:string,sprite:string,x:number,z:number,farmyard=false)=>entities.push({kind,id,label,sprite,x:(x-z)*(48/Math.sqrt(2)),y:(x+z)*(48/Math.sqrt(6)),depth:x+z,farmyard});
 const buildingSlots=new Map<string,{x:number;z:number}>();
 for(const [i,b] of Object.values(state.buildings).sort((a,b)=>a.id.localeCompare(b.id)).entries()){
  const home=homes.find(h=>h.residenceId&&state.residences[h.residenceId]?.buildingId===b.id);
  const slot=home?slots.get(home.id)!:{x:32+(i%4)*8,z:Math.floor(i/4)*8};buildingSlots.set(b.id,slot);
  const level=state.mechanics?.buildings[b.id]?.upgradeLevel??0;
  add('building',b.id,b.id,`house-${Math.min(level,3)}`,slot.x,slot.z,farmyards.some(f=>f.id===b.id));
 }
 for(const home of homes){
  const slot=slots.get(home.id)!,residence=home.residenceId?state.residences[home.residenceId]:null;
  if(home.memberIds.length&&residence?.kind!=='house')add('household',home.id,`Household ${home.id}`,'tent',slot.x,slot.z);
  home.memberIds.forEach((id,i)=>{const p=state.personas[id];if(p.deathWinter!==null)return;const age=personaAge(state,id);add('persona',id,p.name,age<16?'child':p.dna.sex==='female'?'female':'male',slot.x-2+(i%4)*1.7,slot.z+3+Math.floor(i/4)*1.6);});
 }
 const counts=new Map<string,number>();
 for(const c of Object.values(state.landing?.cattle??{}).filter(c=>c.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))){
  const key=c.farmyardId??'outside',i=counts.get(key)??0;counts.set(key,i+1);const slot=buildingSlots.get(key)??{x:20,z:22},view=inspectCattle(state,c.id);
  add('cattle',c.id,`${c.id} · ${view.stage}`,view.stage==='Young'?'calf':view.stage==='Young Adult'?'young-cattle':c.sex==='female'?'cow':'bull',slot.x+3+(i%5)*1.8,slot.z+Math.floor(i/5)*1.7);
 }
 entities.sort((a,b)=>a.depth-b.depth||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 return {entities,time:{...state.time},clan:state.clan.name,stocks:{...state.stocks},population:Object.values(state.personas).filter(p=>p.deathWinter===null).length,cattle:entities.filter(e=>e.kind==='cattle').length,weather:inspectWeather(state),exposure:inspectWeatherExposure(state)};
}
