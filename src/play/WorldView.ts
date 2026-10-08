import {inspectWorld,missionOffer,missionTypes} from '../simulation/SimulationCore';
import type {SimulationState} from '../simulation/SimulationCore';
import type {Cargo} from '../simulation/WorldExpeditions';
/** All destination data comes from saved clan knowledge, never canonical target inventories. */
export function projectWorld(state:SimulationState,priorities:Cargo[]=['Food']){
 const view=inspectWorld(state);
 return {...view,regions:view.regions.map(r=>({...r,stale:r.observedAt!==null&&state.time.winter*1000+state.time.tick-r.observedAt>=1000,offers:view.groups.flatMap(g=>missionTypes.map(type=>{
  try{return {groupId:g.id,type,allowed:true,reason:null,...missionOffer(state,g.id,r.id,type,priorities)};}
  catch(e){return {groupId:g.id,type,allowed:false,reason:e instanceof Error?e.message:String(e),duration:null,foodCost:null,foodPerMember:null,successBps:null,casualtyBps:null,shipId:null};}
 }))}))};
}
