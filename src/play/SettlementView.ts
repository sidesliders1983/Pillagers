import {personaAge,inspectCattle,inspectWeather,inspectWeatherExposure,landingSummary} from '../simulation/SimulationCore';
import type {SimulationState} from '../simulation/SimulationCore';
export type EntityKind='persona'|'household'|'building'|'cattle'|'longship';
export type BoardEntity={kind:EntityKind;id:string;label:string;sprite:string;x:number;y:number;depth:number;farmyard:boolean;};
export function projectSettlement(state:SimulationState){
 const entities:BoardEntity[]=[],slots=new Map<string,{x:number;z:number}>();
 const homes=Object.values(state.households).sort((a,b)=>a.id.localeCompare(b.id));
 homes.forEach((h,i)=>slots.set(h.id,{x:6+(i%3)*16,z:4+Math.floor(i/3)*16}));
 const farmyards=state.landing?landingSummary(state).farmyards:[];
 const add=(kind:EntityKind,id:string,label:string,sprite:string,x:number,z:number,farmyard=false)=>entities.push({kind,id,label,sprite,x:(x-z)*(48/Math.sqrt(2)),y:(x+z)*(48/Math.sqrt(6)),depth:x+z,farmyard});
 for(const [i,ship] of Object.values(state.landing?.longships??{}).filter(s=>s.salvagedWinter===null).sort((a,b)=>a.id.localeCompare(b.id)).entries())add('longship',ship.id,'Longship','longship',14+i*14,-3);
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
  home.memberIds.forEach((id,i)=>{const p=state.personas[id];if(p.deathWinter!==null)return;const age=personaAge(state,id);add('persona',id,p.name,age<16?'child':p.dna.sex==='female'?'female':'male',slot.x-3+(i%4)*3,slot.z+5+Math.floor(i/4)*3);});
 }
 const counts=new Map<string,number>();
 for(const c of Object.values(state.landing?.cattle??{}).filter(c=>c.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))){
  const key=c.farmyardId??'outside',i=counts.get(key)??0;counts.set(key,i+1);const slot=buildingSlots.get(key)??{x:14,z:38},view=inspectCattle(state,c.id);
  add('cattle',c.id,`${c.id} · ${view.stage}`,view.stage==='Young'?'calf':view.stage==='Young Adult'?'young-cattle':c.sex==='female'?'cow':'bull',slot.x+6+(i%5)*3.5,slot.z+3+Math.floor(i/5)*3);
 }
 entities.sort((a,b)=>a.depth-b.depth||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 const world=entities.map(e=>({x:(e.x/(48/Math.sqrt(2))+e.y/(48/Math.sqrt(6)))/2,z:(e.y/(48/Math.sqrt(6))-e.x/(48/Math.sqrt(2)))/2}));
 const maxX=Math.max(44,...world.map(p=>p.x+4)),maxZ=Math.max(46,...world.map(p=>p.z+4));
 const ground=[{x:-4,z:-4},{x:maxX,z:-4},{x:maxX,z:maxZ},{x:-4,z:maxZ}].map(p=>({x:(p.x-p.z)*(48/Math.sqrt(2)),y:(p.x+p.z)*(48/Math.sqrt(6))}));
 return {entities,ground,time:{...state.time},clan:state.clan.name,stocks:{...state.stocks},population:Object.values(state.personas).filter(p=>p.deathWinter===null).length,cattle:entities.filter(e=>e.kind==='cattle').length,weather:inspectWeather(state),exposure:inspectWeatherExposure(state)};
}
