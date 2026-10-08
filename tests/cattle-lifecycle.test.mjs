import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
test('founding cattle expose canonical age and Adult stage through the public core',()=>{
 const state=core.createCampaign(32);
 assert.equal(core.inspectCattle(state,'cattle-1').age,3);
 assert.equal(core.inspectCattle(state,'cattle-1').stage,'Adult');
});
test('eligible outside cows produce persistent calves with parents, cooldown and derived stages',()=>{
 let state=core.createCampaign(32,{cattleBirthChanceBps:10000,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0});
 state=core.applyCommand(state,{type:'AdvanceWinter'});
 const calves=Object.values(state.landing.cattle).filter(c=>c.origin==='reproduction');
 assert.equal(calves.length,2);
 assert.deepEqual(calves[0].parentIds,['cattle-1','cattle-3']);
 assert.equal(calves[0].farmyardId,null);
 assert.equal(core.inspectCattle(state,calves[0].id).stage,'Young');
 state=core.reconstructState(core.serializeState(state));
 state=core.applyCommand(state,{type:'AdvanceWinter'});
 assert.equal(Object.values(state.landing.cattle).length,5);
 assert.equal(core.inspectCattle(state,calves[0].id).stage,'Young Adult');
 state=core.applyCommand(state,{type:'AdvanceWinter'});
 assert.equal(core.inspectCattle(state,calves[0].id).stage,'Adult');
 assert.ok(state.events.some(e=>e.type==='CattleBorn'));
});
test('natural cattle death retains ancestry, freezes age and releases shelter without slaughter Food',()=>{
 const initial=core.createCampaign(32,{cattleBirthChanceBps:0,cattleMortalityAdultBps:10000});
 const state=core.applyCommand(initial,{type:'AdvanceWinter'});
 assert.equal(core.landingSummary(state).cattle,0);
 assert.equal(state.events.filter(e=>e.type==='CattleDied').length,3);
 assert.equal(state.events.filter(e=>e.type==='CattleSlaughtered').length,0);
 assert.equal(state.events.find(e=>e.type==='CattleFoodConsumed').details.required,0);
 const later=core.applyCommand(state,{type:'AdvanceWinter'});
 assert.equal(core.inspectCattle(later,'cattle-1').age,4);
 assert.equal(later.events.filter(e=>e.type==='CattleFoodProduced').length,state.events.filter(e=>e.type==='CattleFoodProduced').length);
 assert.throws(()=>core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-1'}));
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
const noDeaths={cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0,cattleCrowdingBps:0};
function herd(overrides={}){return core.createCampaign(32,{...noDeaths,cattleBirthChanceBps:10000,initialMaterials:100,foundingCoupleChanceBps:0,...overrides},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0,partnershipChanceBps:0,careerReviewWinters:0});}
function home(state){state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});return core.applyCommand(state,{type:'HouseHousehold',householdId:'founder-1'});}
test('slaughtering the only bull prevents breeding; a bull in a different herd cannot cover outside cows',()=>{
 let state=herd();state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-3'});
 state=core.advanceWinter(state);assert.equal(Object.keys(state.landing.cattle).length,3);
 state=home(herd());state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-3',farmyardId:'house-1'});
 state=core.advanceWinter(state);assert.equal(Object.keys(state.landing.cattle).length,3);
});
test('Farmyard births inherit shelter above the soft cap; all members share the derived overcrowding risk',()=>{
 let state=home(herd({farmyardCapacity:2,cattleCrowdingBps:200}));
 for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId:'house-1'});
 assert.equal(core.inspectCattle(state,'cattle-1').mortalityRiskBps,200);
 // Zero crowd mortality only for the birth boundary, then inspect the configured risk.
 state.landing.config.cattleCrowdingBps=0;state=core.advanceWinter(state);
 const calves=Object.values(state.landing.cattle).filter(c=>c.origin==='reproduction');
 assert.equal(calves.length,2);assert.ok(calves.every(c=>c.farmyardId==='house-1'));
 state.landing.config.cattleCrowdingBps=200;
 assert.equal(core.inspectCattle(state,calves[0].id).overcrowding,3);
 assert.equal(core.inspectCattle(state,calves[0].id).mortalityRiskBps,600);
 assert.equal(core.inspectCattle(state,'cattle-3').mortalityRiskBps,600);
 const before=state.events.length;state.landing.config.cattleCrowdingBps=10000;state=core.advanceWinter(state);
 const deaths=state.events.slice(before).filter(e=>e.type==='CattleDied');
 assert.equal(deaths.length,5);assert.ok(deaths.every(e=>e.details.mortalityRiskBps===10000));
 assert.equal(core.landingSummary(state).farmyards[0].occupants,0);
});
test('newborn calves neither produce adult output nor consume Food before age two',()=>{
 let state=core.advanceWinter(herd());const ids=Object.keys(state.landing.cattle).filter(id=>!['cattle-1','cattle-2','cattle-3'].includes(id));
 const before=state.events.length;state=core.advanceWinter(state);
 assert.equal(state.events.slice(before).filter(e=>e.type==='CattleFoodProduced'&&ids.includes(e.details.cattleId)).length,0);
 assert.equal(state.events.slice(before).find(e=>e.type==='CattleFoodConsumed').details.required,3);
 state=core.advanceWinter(state);
 assert.equal(state.events.filter(e=>e.type==='CattleFoodConsumed').at(-1).details.required,5);
});
test('version two saves retain static cattle and their RNG while new campaigns enable lifecycle rules',()=>{
 const state=herd(),old=structuredClone(state);old.landing.version=2;
 for(const key of Object.keys(old.landing.config))if(key.startsWith('cattle')&&key!=='cattleAdultAge')delete old.landing.config[key];
 for(const c of Object.values(old.landing.cattle))delete c.lastCalvingWinter;
 const restored=core.reconstructState(JSON.stringify(old));
 assert.equal(restored.rngState,old.rngState);assert.equal(restored.landing.config.cattleBirthChanceBps,0);
 assert.equal(restored.landing.config.cattleMortalityOldBps,0);
 let later=restored;for(let i=0;i<15;i++)later=core.advanceWinter(later);
 assert.equal(Object.values(later.landing.cattle).filter(c=>c.deathWinter===null).length,3);
 assert.equal(core.createCampaign(32).landing.config.cattleBirthChanceBps,5000);
});
test('save/load rejects duplicate cattle parents and invalid fertility ranges',()=>{
 const state=core.advanceWinter(herd()),calf=Object.values(state.landing.cattle).find(c=>c.origin==='reproduction');
 const bad=structuredClone(state);bad.landing.cattle[calf.id].parentIds=['cattle-1','cattle-1'];
 assert.throws(()=>core.reconstructState(JSON.stringify(bad)),/genealogy/);
 assert.throws(()=>core.createCampaign(32,{cattleFertileMinAge:13,cattleFertileMaxAge:12}));
});
test('cattle lifecycle replay is identical across split ticks and save/load with natural mortality enabled',()=>{
 const initial=core.createCampaign(42);
 const whole=core.advanceWinter(initial);
 const split=core.applyCommand(core.applyCommand(initial,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863});
 assert.deepEqual(split,whole);
 let continuous=initial,resumed=core.reconstructState(core.serializeState(initial));
 for(let i=0;i<6;i++){continuous=core.advanceWinter(continuous);resumed=core.reconstructState(core.serializeState(core.advanceWinter(resumed)));}
 assert.deepEqual(resumed,continuous);
});
test('life stages and Adult output follow saved configurable age thresholds',()=>{
 let state=herd({cattleYoungAdultAge:2,cattleAdultAge:4,cattleFertileMinAge:4});
 assert.equal(core.inspectCattle(state,'cattle-1').stage,'Young Adult');
 assert.equal(core.applyCommand(state,{type:'AdvanceTicks',ticks:999}).events.filter(e=>e.type==='CattleFoodProduced').length,0);
 state=core.advanceWinter(state);assert.equal(core.inspectCattle(state,'cattle-1').stage,'Adult');
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
test('legacy saves preserve custom Adult ages even when the new stage and fertility defaults differ',()=>{
 for(const age of [1,15]){
  const old=herd();old.landing.version=2;old.landing.config.cattleAdultAge=age;
  for(const key of Object.keys(old.landing.config))if(key.startsWith('cattle')&&key!=='cattleAdultAge')delete old.landing.config[key];
  for(const c of Object.values(old.landing.cattle))delete c.lastCalvingWinter;
  const restored=core.reconstructState(JSON.stringify(old));assert.equal(restored.landing.config.cattleAdultAge,age);
  assert.equal(restored.landing.config.cattleBirthChanceBps,0);
 }
});

test('slaughter yields follow Young, Young Adult and Adult stages and survive save/load',()=>{
 let state=core.createCampaign(32,{cattleBirthChanceBps:10000,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0});
 state=core.advanceWinter(state);
 const calf=Object.values(state.landing.cattle).find(c=>c.origin==='reproduction');
 for(const [expectedStage,expectedFood] of [['Young',5],['Young Adult',10],['Adult',15]]){
  const loaded=core.reconstructState(core.serializeState(state));
  assert.equal(core.inspectCattle(loaded,calf.id).stage,expectedStage);
  const slaughtered=core.applyCommand(loaded,{type:'SlaughterCattle',cattleId:calf.id});
  assert.equal(slaughtered.stocks.food-loaded.stocks.food,expectedFood);
  assert.equal(slaughtered.events.at(-1).details.food,expectedFood);
  assert.throws(()=>core.applyCommand(slaughtered,{type:'SlaughterCattle',cattleId:calf.id}));
  state=core.advanceWinter(state);
 }
});
