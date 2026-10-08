import {resolveMortality} from './Mortality';
import {farmyards,reconcileFarmyards} from './Farmyards';
import {personaAge} from './PersonaAge';
import {isProvidingCare} from './FamilyMechanics';
import {stepMechanicsTick} from './Mechanics';
import {weatherProfile} from './Weather';
import {randomUint} from './Random';
import {eventFacts} from './EventFacts';
import type {SimulationState} from './SimulationCore';
import {seededRandom} from '../characters/seededRandom';
export const directions=['North','East','South','West'] as const;
export type Direction=typeof directions[number];
export type Knowledge={level:'Scouted'|'Surveyed';observedAt:number;terrain:string;resources:string[];settlementName:string|null;opportunity:boolean;resistance:'Low'|'Medium'|'High'|null};
export type Region={id:string;direction:Direction;requiresShip:boolean;terrain:string;resources:string[];targetClanId:string|null};
export const missionTypes=['Recon','Surveillance','Pillage'] as const;
export type MissionType=typeof missionTypes[number];
export type Cargo='Food'|'Materials'|'Cattle'|'People';
export type ExpeditionConfig={durations:Record<MissionType,number>;provisions:Record<MissionType,number>;successBps:Record<MissionType,number>;casualtyBps:Record<MissionType,number>;foodCapacity:number;materialsCapacity:number};
export const defaultExpeditionConfig:ExpeditionConfig={durations:{Recon:250,Surveillance:400,Pillage:500},provisions:{Recon:2,Surveillance:4,Pillage:5},successBps:{Recon:8000,Surveillance:9000,Pillage:6000},casualtyBps:{Recon:200,Surveillance:300,Pillage:1000},foodCapacity:10,materialsCapacity:5};
export type ExpeditionGroup={id:string;name:string;memberIds:string[]};
export type ExpeditionResult={success:boolean;discovery:Knowledge|null;casualtyIds:string[];survivorIds:string[];food:number;materials:number;cattleIds:string[];personaIds:string[];summary:string};
export type ExpeditionMission={id:string;groupId:string;groupName:string;regionId:string;type:MissionType;memberIds:string[];memberNames:string[];priorities:Cargo[];shipId:string|null;departedAt:number;returnsAt:number;foodCost:number;successBps:number;casualtyBps:number;status:'Away'|'Returned';returnedAt:number|null;result:ExpeditionResult|null};
export type ExpeditionCommand={type:'CreateExpeditionGroup';name:string;memberIds:string[]}|{type:'EditExpeditionGroup';groupId:string;name:string;memberIds:string[]}|{type:'DispatchExpedition';groupId:string;regionId:string;mission:MissionType;priorities?:Cargo[]};
export type WorldState={version:1;config:ExpeditionConfig;groups:Record<string,ExpeditionGroup>;missions:Record<string,ExpeditionMission>;regions:Record<string,Region>;knowledge:Record<string,Knowledge>;targetClans:Record<string,SimulationState>};
/** The graph is seeded independently: discovery never creates geography or changes the domestic RNG stream. */
export function initializeWorld(state:SimulationState,createTarget:(seed:number)=>SimulationState,overrides:Partial<ExpeditionConfig>={}):void {
 const random=seededRandom(state.seed,'world-expeditions-v1'),world:WorldState={version:1,config:structuredClone({...defaultExpeditionConfig,...overrides}),groups:{},missions:{},regions:{},knowledge:{},targetClans:{}};
 const settlementDirection=1+Math.floor(random()*3);
 directions.forEach((direction,i)=>{
  const id=`region-${direction.toLowerCase()}`,requiresShip=i===0;
  const terrain=requiresShip?'Coast':['Forest','Grassland','Hills'][Math.floor(random()*3)];
  const targetClanId=i===settlementDirection||random()<.5?`cpu-${direction.toLowerCase()}`:null;
  world.regions[id]={id,direction,requiresShip,terrain,resources:terrain==='Coast'?['Fishing']:terrain==='Forest'?['Forestry','Hunting']:terrain==='Grassland'?['Farming','Grazing']:['Grazing','Hunting'],targetClanId};
  if(targetClanId){const target=createTarget(Math.floor(random()*4294967296));const namespaced=namespaceTarget(target,targetClanId);namespaced.clan.name=`${direction} settlement`;world.targetClans[targetClanId]=namespaced;}
 });
 state.world=world;
}
export function inspectWorld(state:SimulationState){
 const world=state.world;
 return {enabled:!!world,carrying:world?{food:world.config.foodCapacity,materials:world.config.materialsCapacity}:null,eligible:world?Object.values(state.personas).filter(p=>expeditionEligible(state,p.id)).map(p=>({id:p.id,name:p.name,occupation:p.occupation,age:personaAge(state,p.id)})):[],groups:world?Object.values(world.groups).map(g=>({id:g.id,name:g.name,status:groupMission(state,g.id)?'Away':g.memberIds.every(id=>expeditionEligible(state,id,g.id))?'Ready':'Unavailable',location:groupMission(state,g.id)?.regionId??'Home',members:g.memberIds.map(id=>({id,name:state.personas[id]?.name??state.personaArchive?.[id]?.name??id,occupation:state.personas[id]?.occupation??null,alive:state.personas[id]?.deathWinter===null,age:state.personas[id]?personaAge(state,id):null}))})):[],missions:world?structuredClone(Object.values(world.missions)):[],regions:world?directions.map(direction=>{
  const region=Object.values(world.regions).find(r=>r.direction===direction)!,known=world.knowledge[region.id];
  return {id:region.id,direction,requiresShip:region.requiresShip,knowledge:known?.level??'Unknown',terrain:known?.terrain??null,resources:known?.resources? [...known.resources]:null,settlementName:known?.settlementName??null,opportunity:known?.opportunity??null,resistance:known?.resistance??null,observedAt:known?.observedAt??null};
 }):[]};
}
export function validateWorld(state:SimulationState,validateTarget:(target:SimulationState)=>void):void {
 const w=state.world;if(!w)return;
 if(w.version!==1||!w.regions||!w.knowledge||!w.targetClans||Object.keys(w.regions).length!==4)throw new Error('Invalid world graph');
 for(const direction of directions){const r=w.regions[`region-${direction.toLowerCase()}`];if(!r||r.direction!==direction||r.id!==`region-${direction.toLowerCase()}`||typeof r.terrain!=='string'||!Array.isArray(r.resources)||r.resources.some(x=>typeof x!=='string')||r.requiresShip!==(direction==='North')||(r.targetClanId!==null&&!w.targetClans[r.targetClanId]))throw new Error('Invalid world region');}
 for(const [id,k] of Object.entries(w.knowledge))if(!w.regions[id]||!['Scouted','Surveyed'].includes(k.level)||!Number.isSafeInteger(k.observedAt)||k.observedAt<800000||k.observedAt>state.time.winter*1000+state.time.tick||typeof k.opportunity!=='boolean'||!Array.isArray(k.resources)||k.resources.some(x=>typeof x!=='string'))throw new Error('Invalid world knowledge');
 const fail=()=>{throw new Error('Invalid expedition state');};
 const uint=(v:number,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isSafeInteger(v)||v<0||v>max)fail();};
 if(!w.config||!w.groups||!w.missions)fail();
 for(const kind of missionTypes){uint(w.config.durations[kind],1000000);if(w.config.durations[kind]===0)fail();uint(w.config.provisions[kind],1000000);uint(w.config.successBps[kind],10000);uint(w.config.casualtyBps[kind],10000);}
 uint(w.config.foodCapacity,1000000);uint(w.config.materialsCapacity,1000000);if(!w.config.foodCapacity||!w.config.materialsCapacity)fail();
 const grouped=new Set<string>(),away=new Set<string>(),ships=new Set<string>();
 for(const [id,g] of Object.entries(w.groups)){if(g.id!==id||!g.name?.trim()||g.name.length>60||!Array.isArray(g.memberIds)||!g.memberIds.length)fail();for(const member of g.memberIds){if(!state.personas[member]||grouped.has(member))fail();grouped.add(member);}}
 for(const [id,m] of Object.entries(w.missions)){
  if(m.id!==id||typeof m.groupName!=='string'||!m.groupName.trim()||!w.groups[m.groupId]||!w.regions[m.regionId]||!missionTypes.includes(m.type)||!['Away','Returned'].includes(m.status)||!Array.isArray(m.memberIds)||!m.memberIds.length||new Set(m.memberIds).size!==m.memberIds.length||m.memberIds.some(id=>!state.personas[id])||!Array.isArray(m.memberNames)||m.memberNames.length!==m.memberIds.length||!Array.isArray(m.priorities)||new Set(m.priorities).size!==m.priorities.length||m.priorities.some(p=>!['Food','Materials','Cattle','People'].includes(p)))fail();
  uint(m.departedAt,absoluteTick(state));uint(m.returnsAt);uint(m.foodCost);uint(m.successBps,10000);uint(m.casualtyBps,10000);if(m.returnsAt<=m.departedAt)fail();
  if(m.shipId!==null&&!state.landing?.longships[m.shipId])fail();
  if(m.status==='Away'){
   if(m.result!==null||m.returnedAt!==null||m.returnsAt<=absoluteTick(state)||m.memberIds.join()!==w.groups[m.groupId].memberIds.join())fail();
   for(const member of m.memberIds){if(away.has(member))fail();away.add(member);}
   if(m.shipId!==null){if(ships.has(m.shipId)||state.landing!.longships[m.shipId].salvagedWinter!==null)fail();ships.add(m.shipId);}
  }else{if(!m.result||typeof m.result.success!=='boolean'||m.returnedAt!==m.returnsAt||m.returnedAt>absoluteTick(state))fail();uint(m.result!.food);uint(m.result!.materials);}
 }
 for(const target of Object.values(w.targetClans)){if(!target.mechanics||!target.landing)throw new Error('Incomplete world target');if(absoluteTick(target)!==absoluteTick(state))throw new Error('Unsynchronised world target');if(target.world)throw new Error('Nested target world');validateTarget(target);}
}
export const absoluteTick=(state:SimulationState)=>state.time.winter*state.ticksPerWinter+state.time.tick;
export function groupMission(state:SimulationState,groupId:string){return Object.values(state.world?.missions??{}).find(m=>m.groupId===groupId&&m.status==='Away');}
export function personaAway(state:SimulationState,id:string):boolean{return Object.values(state.world?.missions??{}).some(m=>m.status==='Away'&&m.memberIds.includes(id));}
export function expeditionEligible(state:SimulationState,id:string,groupId?:string):boolean {
 const p=state.personas[id];return !!p&&p.deathWinter===null&&personaAge(state,id)>=(state.mechanics?.config.workAge??16)&&!isProvidingCare(state,id)&&!personaAway(state,id)&&!Object.values(state.world?.groups??{}).some(g=>g.id!==groupId&&g.memberIds.includes(id));
}
export function missionOffer(state:SimulationState,groupId:string,regionId:string,type:MissionType,priorities:Cargo[]=[]){
 const w=state.world,g=w?.groups[groupId],r=w?.regions[regionId];
 if(!w||!g||!r||!missionTypes.includes(type))throw new Error('Select a valid group, region and mission');
 if(groupMission(state,groupId))throw new Error('Group already on a mission');
 if(!g.memberIds.length||g.memberIds.some(id=>!expeditionEligible(state,id,groupId)))throw new Error('Group needs living eligible members without childcare');
 const known=w.knowledge[regionId];if(type!=='Recon'&&!known)throw new Error('Recon required before this mission');
 if(type==='Pillage'&&(!known?.opportunity||!r.targetClanId))throw new Error('No known viable pillage opportunity');
 if(type==='Pillage'&&(!priorities.length||new Set(priorities).size!==priorities.length||priorities.some(p=>!['Food','Materials','Cattle','People'].includes(p))))throw new Error('Choose distinct pillage priorities');
 const ship=r.requiresShip?Object.values(state.landing?.longships??{}).find(s=>s.salvagedWinter===null&&!Object.values(w.missions).some(m=>m.status==='Away'&&m.shipId===s.id)):undefined;
 if(r.requiresShip&&!ship)throw new Error('Available longship required for coastal expedition');
 const weather=weatherProfile(state),duration=Math.ceil(w.config.durations[type]*weather.travelDurationBps/10000);
 const perMember=Math.ceil(w.config.provisions[type]*duration/w.config.durations[type]);
 const foodCost=perMember*g.memberIds.length;if(state.stocks.food<foodCost)throw new Error(`Expedition needs ${foodCost} Food`);
 return {duration,foodCost,foodPerMember:perMember,successBps:w.config.successBps[type],casualtyBps:Math.min(10000,w.config.casualtyBps[type]+weather.travelRiskBps),shipId:ship?.id??null};
}
function record(state:SimulationState,type:string,details:Record<string,unknown>,personaId?:string){state.events.push({id:`event-${state.events.length+1}`,time:{...state.time},type,...(personaId?{personaId}:{}),details:eventFacts(state,details,personaId)});}
export function applyExpeditionCommand(state:SimulationState,command:ExpeditionCommand):void {
 const w=state.world;if(!w)throw new Error('World expeditions unavailable in this legacy campaign; start a new campaign');
 if(command.type==='DispatchExpedition'){
  const offer=missionOffer(state,command.groupId,command.regionId,command.mission,command.priorities),g=w.groups[command.groupId],id=`mission-${Object.keys(w.missions).length+1}`;
  state.stocks.food-=offer.foodCost;
  w.missions[id]={id,groupId:g.id,groupName:g.name,regionId:command.regionId,type:command.mission,memberIds:[...g.memberIds],memberNames:g.memberIds.map(id=>state.personas[id].name),priorities:[...(command.priorities??[])],shipId:offer.shipId,departedAt:absoluteTick(state),returnsAt:absoluteTick(state)+offer.duration,foodCost:offer.foodCost,successBps:offer.successBps,casualtyBps:offer.casualtyBps,status:'Away',returnedAt:null,result:null};
  record(state,'ExpeditionDeparted',{missionId:id,groupName:g.name,regionId:command.regionId,mission:command.mission,participants:[...g.memberIds],...offer});return;
 }
 const existing=command.type==='EditExpeditionGroup'?w.groups[command.groupId]:undefined;
 if(command.type==='EditExpeditionGroup'&&(!existing||groupMission(state,command.groupId)))throw new Error('Cannot edit a missing group or a group on a mission');
 if(typeof command.name!=='string'||!command.name.trim()||command.name.trim().length>60||!Array.isArray(command.memberIds)||!command.memberIds.length||new Set(command.memberIds).size!==command.memberIds.length||command.memberIds.some(id=>!expeditionEligible(state,id,existing?.id)))throw new Error('Group requires a name and distinct eligible members');
 const id=existing?.id??`group-${Object.keys(w.groups).length+1}`;
 w.groups[id]={id,name:command.name.trim(),memberIds:[...command.memberIds]};record(state,existing?'ExpeditionGroupEdited':'ExpeditionGroupCreated',{groupId:id,groupName:command.name.trim(),participants:[...command.memberIds]});
}
const chance=(state:SimulationState,bps:number)=>randomUint(state)<Math.floor(bps*4294967296/10000);
function discover(state:SimulationState,region:Region,level:'Scouted'|'Surveyed'):Knowledge {
 const target=region.targetClanId?state.world!.targetClans[region.targetClanId]:null;
 const population=target?Object.values(target.personas).filter(p=>p.deathWinter===null).length:0;
 return {level,observedAt:absoluteTick(state),terrain:region.terrain,resources:[...region.resources],settlementName:target?.clan.name??null,opportunity:!!target&&(target.stocks.food>0||target.stocks.materials>0||population>0||Object.values(target.landing?.cattle??{}).some(c=>c.deathWinter===null)),resistance:level==='Surveyed'?(population<5?'Low':population<15?'Medium':'High'):null};
}
export function stepWorld(state:SimulationState):void {
 const w=state.world;if(!w)return;
 for(const target of Object.values(w.targetClans))stepMechanicsTick(target);
 for(const m of Object.values(w.missions).filter(m=>m.status==='Away'&&m.returnsAt<=absoluteTick(state))){
  const previousFarmyards=farmyards(state).map(f=>f.id);
  const casualties=new Set(m.memberIds.filter(id=>state.personas[id]?.deathWinter===null&&chance(state,m.casualtyBps)));
  resolveMortality(state,()=>true,(type,id,details)=>record(state,type,{...details,cause:'Expedition',missionId:m.id,mortalityRiskBps:m.casualtyBps},id),casualties);
  reconcileFarmyards(state,previousFarmyards);
  const live=m.memberIds.filter(id=>state.personas[id]?.deathWinter===null),success=live.length>0&&chance(state,m.successBps);
  const discovery=success&&m.type!=='Pillage'?discover(state,w.regions[m.regionId],m.type==='Surveillance'?'Surveyed':w.knowledge[m.regionId]?.level??'Scouted'):null;
  if(discovery)w.knowledge[m.regionId]=discovery;
  const loot=success&&m.type==='Pillage'?recoverCargo(state,m,live):{food:0,materials:0,cattleIds:[],personaIds:[]};
  m.status='Returned';m.returnedAt=absoluteTick(state);m.result={success,discovery,casualtyIds:m.memberIds.filter(id=>!live.includes(id)),survivorIds:live,...loot,summary:success?m.type==='Pillage'&&!loot.food&&!loot.materials&&!loot.cattleIds.length&&!loot.personaIds.length?'Raid succeeded but no available assets were recovered.':'Mission completed.':'Mission failed; no discoveries or recovered assets.'};
  record(state,'ExpeditionReturned',{missionId:m.id,groupName:m.groupName,mission:m.type,regionId:m.regionId,participants:[...m.memberIds],...m.result});
 }
}

function recoverCargo(state:SimulationState,m:ExpeditionMission,survivors:string[]){
 const w=state.world!,region=w.regions[m.regionId],target=region.targetClanId?w.targetClans[region.targetClanId]:null;
 const loot={food:0,materials:0,cattleIds:[] as string[],personaIds:[] as string[]};if(!target)return loot;
 for(const member of survivors){
  for(const priority of m.priorities){
   if(priority==='Food'&&target.stocks.food>0){const units=Math.min(w.config.foodCapacity,target.stocks.food);target.stocks.food-=units;state.stocks.food+=units;loot.food+=units;break;}
   if(priority==='Cattle'){const cattle=Object.values(target.landing!.cattle).filter(c=>c.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))[0];if(cattle){transferCattle(target,state,cattle.id);loot.cattleIds.push(cattle.id);break;}}
   if(priority==='People'){const victim=Object.values(target.personas).filter(p=>p.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))[0];if(victim){transferPersona(target,state,victim.id,m.id);loot.personaIds.push(victim.id);break;}}
   if(priority==='Materials'&&target.stocks.materials>0){const units=Math.min(w.config.materialsCapacity,target.stocks.materials);target.stocks.materials-=units;state.stocks.materials+=units;loot.materials+=units;break;}
  }
 }
 record(target,'SettlementPillaged',{missionId:m.id,raiderClanId:state.clan.id,...loot});return loot;
}
function namespaceTarget(target:SimulationState,clanId:string):SimulationState {
 const ids=new Set([target.clan.id,...Object.keys(target.personas),...Object.keys(target.families),...Object.keys(target.households),...Object.keys(target.residences),...Object.keys(target.buildings),...Object.keys(target.landing?.cattle??{}),...Object.keys(target.landing?.longships??{})]);
 const rename=(value:string)=>value===target.clan.id?clanId:ids.has(value)?`${clanId}:${value}`:value;
 const walk=(v:unknown):unknown=>typeof v==='string'?rename(v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[rename(k),walk(x)])):v;
 const next=walk(target) as SimulationState;next.entityPrefix=`${clanId}:`;return next;
}
function transferPersona(source:SimulationState,destination:SimulationState,id:string,missionId:string):void {
 const p=source.personas[id],info=source.mechanics!.people[id],formerPartnerId=p.partnerId;
 const previousFarmyards=farmyards(source).map(f=>f.id);
 source.personaArchive??={};source.personaArchive[id]=historicalSnapshot(p,source);
 destination.personaArchive??={};const seen=new Set<string>();
 const archiveParents=(parentId:string)=>{if(seen.has(parentId)||destination.personas[parentId])return;seen.add(parentId);const parent=source.personas[parentId]??source.personaArchive?.[parentId];if(parent){destination.personaArchive![parentId]=historicalSnapshot(parent,source);parent.parentIds.forEach(archiveParents);}};
 p.parentIds.forEach(archiveParents);
 if(p.partnerId!==null&&source.personas[p.partnerId]){source.personas[p.partnerId].partnerId=null;p.partnerId=null;}
 for(const home of Object.values(source.households)){home.memberIds=home.memberIds.filter(x=>x!==id);if(!home.memberIds.length)home.residenceId=null;}
 for(const control of Object.values(source.mechanics!.people))if(control.caregiverId===id){control.caregiverId=null;control.caregiverLocked=false;}
 info.caregiverId=null;info.caregiverLocked=false;info.childcareUntilWinter=Math.min(info.childcareUntilWinter,source.time.winter);
 delete source.personas[id];delete source.mechanics!.people[id];
 delete destination.personaArchive[id];destination.personas[id]=p;destination.mechanics!.people[id]=info;
 const householdId=`arrival-${id}`,residenceId=`tent-${householdId}`;
 destination.households[householdId]={id:householdId,memberIds:[id],residenceId};destination.residences[residenceId]={id:residenceId,kind:'tent',buildingId:null};
 destination.families[householdId]={id:householdId,memberIds:[id]};
 reconcileFarmyards(source,previousFarmyards);
 record(source,'PersonaTransferredOut',{missionId,personaId:id,name:p.name,formerPartnerId,destinationClanId:destination.clan.id});
 record(destination,'PersonaTransferredIn',{missionId,personaId:id,name:p.name,formerPartnerId,originClanId:p.originClanId},id);
}
function transferCattle(source:SimulationState,destination:SimulationState,id:string):void {
 const from=source.landing!,to=destination.landing!,c=from.cattle[id];
 from.cattleArchive??={};from.cattleArchive[id]=structuredClone(c);to.cattleArchive??={};const seen=new Set<string>();
 const archiveParents=(parentId:string)=>{if(seen.has(parentId)||to.cattle[parentId])return;seen.add(parentId);const parent=from.cattle[parentId]??from.cattleArchive?.[parentId];if(parent){to.cattleArchive![parentId]=structuredClone(parent);parent.parentIds.forEach(archiveParents);}};
 c.parentIds.forEach(archiveParents);delete from.cattle[id];delete to.cattleArchive[id];c.farmyardId=null;to.cattle[id]=c;
}

function historicalSnapshot(person:import('./SimulationCore').Persona,state:SimulationState){const copy=structuredClone(person),active=copy.occupationHistory.at(-1);if(active?.endedAt===null)active.endedAt={...state.time};return copy;}
