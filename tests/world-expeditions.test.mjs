import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
test('new campaigns have four persistent unknown neighbours and a coastal longship connection, without leaking target inventories',()=>{
 const state=core.createCampaign(32),view=core.inspectWorld(state);
 assert.equal(view.regions.length,4);assert.equal(view.regions.filter(r=>r.requiresShip).length,1);
 assert.ok(view.regions.every(r=>r.knowledge==='Unknown'&&r.terrain===null&&r.opportunity===null));
 assert.equal(JSON.stringify(view).includes('targetClans'),false);
 assert.deepEqual(core.inspectWorld(core.reconstructState(core.serializeState(state))),view);
 assert.deepEqual(core.createCampaign(32),state);
});

test('a reusable named expedition group reserves its members, pays duration-related provisions and stops home work until recon returns',()=>{
 let state=core.createCampaign(32,{}, {},{enabled:false});const ids=Object.keys(state.personas).slice(0,2);
 state=core.applyCommand(state,{type:'CreateExpeditionGroup',name:'First scouts',memberIds:ids});
 const group=core.inspectWorld(state).groups[0];assert.equal(group.name,'First scouts');assert.deepEqual(group.members.map(p=>p.id),ids);
 assert.throws(()=>core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Duplicate',memberIds:[ids[0]]}),/group/i);
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:group.id,regionId:'region-east',mission:'Recon'});
 assert.equal(state.stocks.food,26);assert.equal(core.inspectWork(state,ids[0]).reason,'expedition');
 assert.throws(()=>core.applyCommand(state,{type:'AssignOccupation',personaId:ids[0],occupation:'woodworker'}),/expedition/i);
 assert.throws(()=>core.applyCommand(state,{type:'EditExpeditionGroup',groupId:group.id,name:'Changed',memberIds:[ids[0]]}),/mission/i);
 const resumed=core.reconstructState(core.serializeState(state));
 const next=core.applyCommand(resumed,{type:'AdvanceTicks',ticks:250});
 assert.equal(core.inspectWorld(next).groups[0].status,'Ready');assert.equal(core.inspectWorld(next).missions[0].status,'Returned');
 assert.deepEqual(next,core.applyCommand(state,{type:'AdvanceTicks',ticks:250}));
});

function peaceful(){return core.createCampaign(32,{initialFood:400,cattleBirthChanceBps:0,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0,partnershipChanceBps:0},{enabled:false},{successBps:{Recon:10000,Surveillance:10000,Pillage:10000},casualtyBps:{Recon:0,Surveillance:0,Pillage:0}});}
function scout(state,ids=Object.keys(state.personas).slice(0,1)){
 const region=Object.values(state.world.regions).find(r=>r.targetClanId&&!r.requiresShip);
 state=core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Raiders',memberIds:ids});
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Recon'});
 return {state:core.applyCommand(state,{type:'AdvanceTicks',ticks:250}),region};
}
test('Recon alone permits known-target Pillage and each returning member carries only one category',()=>{
 let {state,region}=scout(peaceful());assert.equal(core.inspectWorld(state).regions.find(r=>r.id===region.id).knowledge,'Scouted');
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Pillage',priorities:['Food','Materials','Cattle','People']});
 const baseline=core.applyCommand(state.world.targetClans[region.targetClanId],{type:'AdvanceTicks',ticks:500});
 const next=core.applyCommand(core.reconstructState(core.serializeState(state)),{type:'AdvanceTicks',ticks:500});
 const report=core.inspectWorld(next).missions.at(-1).result;
 assert.equal(report.food,10);assert.equal(report.materials,0);assert.deepEqual(report.cattleIds,[]);assert.deepEqual(report.personaIds,[]);
 assert.equal(next.world.targetClans[region.targetClanId].stocks.food,baseline.stocks.food-10);
 assert.deepEqual(core.reconstructState(core.serializeState(next)),next);
});

test('mission casualties affect the actual personas and provide no carrying capacity',()=>{
 let {state,region}=scout(peaceful());const config=structuredClone(core.defaultExpeditionConfig);config.casualtyBps={Recon:0,Surveillance:0,Pillage:10000};
 const original=peaceful();original.world.config.casualtyBps.Pillage=10000;
 ({state,region}=scout(core.reconstructState(core.serializeState(original))));
 const member=state.world.groups['group-1'].memberIds[0];
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Pillage',priorities:['Food']});
 state=core.applyCommand(state,{type:'AdvanceTicks',ticks:500});
 assert.equal(state.personas[member].deathWinter,800);assert.equal(state.personas[member].occupation,null);
 const report=core.inspectWorld(state).missions.at(-1).result;assert.deepEqual(report.casualtyIds,[member]);assert.equal(report.food,0);assert.equal(report.success,false);
 assert.ok(state.events.some(e=>e.type==='PersonaDied'&&e.details.cause==='Expedition'));
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});

test('pillage transfers the same persona with DNA and experience, retaining valid histories and genealogy in both clans',()=>{
 let {state,region}=scout(peaceful());const target=state.world.targetClans[region.targetClanId];
 const victim=Object.values(target.personas).filter(p=>p.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))[0];
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Pillage',priorities:['People']});
 const next=core.applyCommand(state,{type:'AdvanceTicks',ticks:500}),report=core.inspectWorld(next).missions.at(-1).result;
 assert.deepEqual(report.personaIds,[victim.id]);assert.equal(next.world.targetClans[region.targetClanId].personas[victim.id],undefined);
 assert.equal(next.personas[victim.id].name,victim.name);assert.deepEqual(next.personas[victim.id].dna,victim.dna);
 assert.equal(next.personas[victim.id].originClanId,victim.originClanId);assert.deepEqual(next.personas[victim.id].occupationHistory,victim.occupationHistory);
 assert.ok(next.world.targetClans[region.targetClanId].personaArchive[victim.id]);
 assert.deepEqual(core.reconstructState(core.serializeState(next)),next);
 assert.doesNotThrow(()=>core.advanceWinter(next));
});

test('livestock transfers as the same animal without breaking the remaining herd ancestry',()=>{
 let initial=peaceful();initial.landing.config.cattleBirthChanceBps=10000;
 for(const target of Object.values(initial.world.targetClans))target.landing.config.cattleBirthChanceBps=10000;
 initial=core.advanceWinter(core.reconstructState(core.serializeState(initial)));
 let {state,region}=scout(initial);const original=Object.values(state.world.targetClans[region.targetClanId].landing.cattle).filter(c=>c.deathWinter===null).sort((a,b)=>a.id.localeCompare(b.id))[0];
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Pillage',priorities:['Cattle']});
 state=core.applyCommand(state,{type:'AdvanceTicks',ticks:500});
 assert.deepEqual(core.inspectWorld(state).missions.at(-1).result.cattleIds,[original.id]);
 assert.equal(state.landing.cattle[original.id].birthWinter,original.birthWinter);
 assert.equal(state.world.targetClans[region.targetClanId].landing.cattle[original.id],undefined);
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
 assert.doesNotThrow(()=>core.advanceWinter(state));
});

test('coastal missions reserve a real longship and are blocked once it is salvaged',()=>{
 let state=peaceful();state=core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Seafarers',memberIds:[Object.keys(state.personas)[0]]});
 const command={type:'DispatchExpedition',groupId:'group-1',regionId:'region-north',mission:'Recon'};
 const away=core.applyCommand(state,command);
 assert.throws(()=>core.applyCommand(away,{type:'SalvageLongship',longshipId:'founding-longship'}),/away|expedition/i);
 const salvaged=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
 assert.throws(()=>core.applyCommand(salvaged,command),/longship/i);
});

test('weather extends carried provisions, missions survive Winter boundaries without home consumption, and split replay is deterministic',()=>{
 let state=peaceful();const weather=structuredClone(core.defaultWeatherConfig);for(const c of core.weatherClasses)weather.profiles[c].probabilityBps=c==='Harsh'?10000:0;
 weather.profiles.Harsh.tentMortalityBps=0;weather.profiles.Harsh.exposedCattleMortalityBps=0;
 state=core.createCampaign(32,{initialFood:400},state.mechanics.config,weather,{...core.defaultExpeditionConfig,durations:{Recon:1250,Surveillance:1400,Pillage:1500},casualtyBps:{Recon:0,Surveillance:0,Pillage:0}});
 const id=Object.keys(state.personas)[0];state=core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Long journey',memberIds:[id]});
 assert.equal(core.missionOffer(state,'group-1','region-east','Recon').foodPerMember,3);
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:'region-east',mission:'Recon'});
 const boundary=core.advanceWinter(state);assert.equal(core.inspectWork(boundary,id).reason,'expedition');
 assert.equal(boundary.events.filter(e=>e.type==='FoodConsumed').at(-1).details.units,27);
 const full=core.applyCommand(state,{type:'AdvanceTicks',ticks:1563}),split=core.applyCommand(core.reconstructState(core.serializeState(boundary)),{type:'AdvanceTicks',ticks:563});
 assert.deepEqual(split,full);assert.equal(core.inspectWorld(full).missions[0].status,'Returned');
});

test('save validation rejects conflicting group membership, corrupt mission timing and nested target worlds',()=>{
 let state=peaceful();state=core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Scouts',memberIds:[Object.keys(state.personas)[0]]});
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:'region-east',mission:'Recon'});
 for(const alter of [s=>s.world.groups['group-2']={...s.world.groups['group-1'],id:'group-2'},s=>s.world.missions['mission-1'].returnsAt=-1,s=>s.world.config.durations.Recon=0,s=>s.world.missions['mission-1'].memberIds=['missing'],s=>Object.values(s.world.targetClans)[0].world=structuredClone(s.world)]){
  const corrupt=structuredClone(state);alter(corrupt);assert.throws(()=>core.reconstructState(JSON.stringify(corrupt)),/world|expedition|mission|group/i);
 }
});

test('surveillance refines saved knowledge without exposing current enemy inventory through the presentation projection',()=>{
 const presentation=loadTypeScript(new URL('../src/play/WorldView.ts',import.meta.url));let {state,region}=scout(peaceful());
 const before=presentation.projectWorld(state);assert.equal(before.regions.find(r=>r.id===region.id).offers.find(o=>o.type==='Pillage').allowed,true);
 assert.equal(before.regions.find(r=>r.id===region.id).resistance,null);
 state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Surveillance'});
 state=core.applyCommand(state,{type:'AdvanceTicks',ticks:400});const view=presentation.projectWorld(state);
 assert.equal(view.regions.find(r=>r.id===region.id).knowledge,'Surveyed');assert.equal(view.regions.find(r=>r.id===region.id).resistance,'Medium');
 assert.equal(JSON.stringify(view).includes('targetClans'),false);assert.equal(JSON.stringify(view).includes('occupationHistory'),false);
});

test('captured parents and their children remain playable across later Winters with historical relatives in the other clan',()=>{
 let initial=peaceful();initial.mechanics.config.fertilityChanceBps=10000;
 for(const target of Object.values(initial.world.targetClans))target.mechanics.config.fertilityChanceBps=10000;
 initial=core.advanceWinter(initial);
 let {state,region}=scout(initial,Object.keys(initial.personas).filter(id=>!core.inspectWork(initial,id).reason||core.inspectWork(initial,id).reason==='inactive-role').slice(0,2));
 // Keep raiding the persistent target: survivors carry one actual person each trip.
 for(let i=0;i<8;i++){
  state=core.applyCommand(state,{type:'DispatchExpedition',groupId:'group-1',regionId:region.id,mission:'Pillage',priorities:['People']});
  state=core.applyCommand(state,{type:'AdvanceTicks',ticks:500});
  state=core.reconstructState(core.serializeState(state));
 }
 const arrivals=Object.values(state.personas).filter(p=>p.originClanId===region.targetClanId);assert.ok(arrivals.length>0);
 assert.ok(arrivals.some(p=>p.parentIds.length));assert.doesNotThrow(()=>core.advanceWinter(state));
});

test('old saves without a world extension preserve domestic replay and require a new campaign for expeditions',()=>{
 const modern=peaceful(),legacy=structuredClone(modern);delete legacy.world;
 const saved=core.reconstructState(core.serializeState(legacy));assert.equal(core.inspectWorld(saved).enabled,false);
 const later=core.advanceWinter(saved),current=core.advanceWinter(modern);assert.deepEqual(later.stocks,current.stocks);assert.deepEqual(later.events,current.events);
 assert.throws(()=>core.applyCommand(saved,{type:'CreateExpeditionGroup',name:'Scouts',memberIds:[Object.keys(saved.personas)[0]]}),/legacy|new campaign/i);
});

test('underage residents and active caregivers cannot join an expedition group',()=>{
 let state=core.createCampaign(32,{initialFood:400,foundingCoupleChanceBps:10000},{fertilityChanceBps:10000,mortalityBands:[{minAge:0,chanceBps:0}]},{enabled:false});state=core.advanceWinter(state);
 const birth=state.events.find(e=>e.type==='ChildBorn');assert.ok(birth);
 const childId=birth.personaId,motherId=birth.details.parentIds.find(id=>state.personas[id].dna.sex==='female');
 assert.throws(()=>core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Too young',memberIds:[childId]}),/eligible/i);
 assert.throws(()=>core.applyCommand(state,{type:'CreateExpeditionGroup',name:'Providing care',memberIds:[motherId]}),/eligible/i);
 assert.equal(core.inspectWorld(state).eligible.some(p=>p.id===childId||p.id===motherId),false);
});
