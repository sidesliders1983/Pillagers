import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
const quiet={fertilityChanceBps:0,partnershipChanceBps:0,careerReviewWinters:0};
const curve=[{minAge:0,chanceBps:0},{minAge:33,chanceBps:10000}];
test('death at the incoming Winter closes participation and preserves identity and lineage',()=>{
 let state=core.createSettlement(41,{...quiet,mortalityBands:curve});
 state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'});
 const before=structuredClone(state.personas.einar);
 const almost=core.applyCommand(state,{type:'AdvanceTicks',ticks:999});
 assert.equal(almost.personas.einar.deathWinter,null);
 const ended=core.applyCommand(almost,{type:'AdvanceTicks',ticks:1});
 const person=ended.personas.einar;
 assert.equal(person.deathWinter,801);assert.equal(core.personaAge(ended,'einar'),33);
 assert.deepEqual(person.dna,before.dna);assert.equal(person.name,before.name);
 assert.equal(person.occupation,null);assert.deepEqual(person.occupationHistory.at(-1).endedAt,{winter:801,tick:0});
 assert.equal(person.partnerId,null);assert.equal(ended.personas.liv.partnerId,null);
 assert.deepEqual(ended.households.home.memberIds,['liv','astrid']);
 assert.ok(ended.families.family.memberIds.includes('einar'));assert.ok(ended.personas.astrid.parentIds.includes('einar'));
 assert.equal(ended.events.find(e=>e.type==='FoodConsumed').details.units,3);
 const event=ended.events.find(e=>e.type==='PersonaDied');
 assert.equal(event.personaId,'einar');assert.equal(event.details.age,33);assert.equal(event.details.householdId,'home');assert.equal(event.details.occupation,'farmer');
 const next=core.advanceWinter(ended);
 assert.equal(next.events.filter(e=>e.type==='ResourceProduced'&&e.personaId==='einar'&&e.time.winter>=802).length,0);
 assert.equal(next.personas.einar.workProgress,person.workProgress);
 assert.deepEqual(core.reconstructState(core.serializeState(ended)),ended);
 assert.equal(core.canApplyCommand(ended,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'}),false);
});

test('legacy mechanics saves preserve zero mortality and their saved RNG through migration',()=>{
 const legacy=core.createSettlement(9,quiet);
 legacy.mechanics.version=1;delete legacy.mechanics.config.mortalityBands;
 const old=JSON.stringify(legacy),loaded=core.reconstructState(old);
 assert.equal(loaded.mechanics.version,2);
 assert.deepEqual(loaded.mechanics.config.mortalityBands,[{minAge:0,chanceBps:0}]);
 assert.equal(loaded.rngState,legacy.rngState);
 const ended=core.applyCommand(loaded,{type:'AdvanceTicks',ticks:100000});
 assert.equal(ended.events.filter(e=>e.type==='PersonaDied').length,0);assert.equal(ended.rngState,legacy.rngState);
 assert.equal(ended.personas.einar.deathWinter,null);
 assert.ok(core.createCampaign(9).mechanics.config.mortalityBands.some(b=>b.chanceBps>0));
 const malformed=structuredClone(loaded);malformed.mechanics.config.mortalityBands=[{minAge:5,chanceBps:10}];
 assert.throws(()=>core.reconstructState(JSON.stringify(malformed)),/mortality/);
});

test('deceased residents cannot release occupations or participate in player actions',()=>{
 const ended=core.advanceWinter(core.createSettlement(41,{...quiet,mortalityBands:curve}));
 assert.equal(core.canApplyCommand(ended,{type:'ReleaseOccupation',personaId:'einar'}),false);
});

test('saved RNG drives repeatable boundary deaths across splits, save/load and forbidden wall clocks',()=>{
 const input=core.createSettlement(41,{...quiet,mortalityBands:[{minAge:0,chanceBps:5000}]});
 const before=core.applyCommand(input,{type:'AdvanceTicks',ticks:999});
 const saved=core.serializeState(before);
 const date=globalThis.Date,random=Math.random;
 try{
  globalThis.Date=class{constructor(){throw Error('wall clock');}static now(){throw Error('wall clock');}};
  Math.random=()=>{throw Error('unseeded random');};
  const whole=core.advanceWinter(input);
  assert.ok(whole.events.some(e=>e.type==='PersonaDied'));
  assert.deepEqual(core.advanceWinter(input),whole);
  assert.deepEqual(core.applyCommand(core.reconstructState(saved),{type:'AdvanceTicks',ticks:1}),whole);
  assert.deepEqual(core.applyCommand(before,{type:'AdvanceTicks',ticks:1}),whole);
  const identityAges=structuredClone(input);for(const p of Object.values(identityAges.personas))p.dna.age=90;
  assert.deepEqual(core.advanceWinter(identityAges).events,whole.events);
 }finally{globalThis.Date=date;Math.random=random;}
});

test('last occupant death releases a residence and existing vacancy debt collapses the house',()=>{
 const input=core.createSettlement(41,{...quiet,mortalityBands:[{minAge:0,chanceBps:10000}]});
 let state=core.advanceWinter(input);
 assert.deepEqual(state.households.home.memberIds,[]);assert.equal(state.households.home.residenceId,null);
 assert.equal(core.inspectBuilding(state,'house').occupied,false);
 assert.equal(state.mechanics.buildings.house.debtWinters,1);assert.equal(state.stocks.materials,10);
 state=core.advanceWinter(core.advanceWinter(state));
 assert.equal(state.buildings.house,undefined);assert.equal(state.stocks.materials,15);
 assert.ok(state.events.some(e=>e.type==='BuildingCollapsed'));
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});

function addResident(state,id,age,parents=[]){
 const template=state.personas.astrid;
 state.personas[id]={...structuredClone(template),id,name:id,birthWinter:800-age,parentIds:parents,dna:{...structuredClone(template.dna),age}};
 state.mechanics.people[id]=structuredClone(state.mechanics.people.einar);
 state.households.home.memberIds.push(id);state.families.family.memberIds.push(id);
}
test('caregiver death releases a locked donor and canonical care selects a living replacement',()=>{
 let state=core.createSettlement(41,{...quiet,mortalityBands:[{minAge:0,chanceBps:0},{minAge:41,chanceBps:10000}]});
 addResident(state,'donor',40);addResident(state,'replacement',20);
 state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'donor'});
 state=core.advanceWinter(state);
 assert.equal(state.personas.donor.deathWinter,801);
 assert.equal(state.mechanics.people.liv.caregiverId,'replacement');assert.equal(state.mechanics.people.liv.caregiverLocked,false);
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});

test('maternal death ends the care group and releases its surviving donor',()=>{
 let state=core.createSettlement(41,{...quiet,mortalityBands:[{minAge:0,chanceBps:0},{minAge:31,chanceBps:10000}]});
 addResident(state,'donor',20);
 state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'donor'});
 state=core.advanceWinter(state);
 assert.equal(state.personas.liv.deathWinter,801);assert.equal(state.personas.donor.deathWinter,null);
 assert.equal(state.mechanics.people.liv.caregiverId,null);assert.equal(state.mechanics.people.liv.childcareUntilWinter,801);
 assert.equal(core.inspectWork(state,'donor').reason,'unassigned');
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});

test('child death shortens childcare to surviving siblings and ends an empty child group',()=>{
 const childCurve=[{minAge:0,chanceBps:10000},{minAge:2,chanceBps:0}];
 let input=core.createSettlement(41,{...quiet,mortalityBands:childCurve});
 addResident(input,'sibling',1,['einar','liv']);
 const state=core.advanceWinter(input);
 assert.equal(state.personas.astrid.deathWinter,801);assert.equal(state.personas.sibling.deathWinter,null);
 assert.equal(state.mechanics.people.liv.childcareUntilWinter,804);
 assert.equal(core.inspectWork(state,'liv').reason,'childcare');
 const last=core.advanceWinter(core.createSettlement(41,{...quiet,mortalityBands:childCurve}));
 assert.equal(last.mechanics.people.liv.childcareUntilWinter,801);assert.equal(last.mechanics.people.liv.caregiverId,null);
 assert.equal(core.inspectWork(last,'liv').reason,'unassigned');
 assert.ok(last.personas.astrid.parentIds.includes('liv'));
});

test('last farmer death removes the Farmyard function and exposes assigned cattle exactly once',()=>{
 let state=core.createCampaign(41,{}, {...quiet,mortalityBands:[{minAge:0,chanceBps:10000}]});
 state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
 state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
 state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
 const yard=core.landingSummary(state).farmyards.find(f=>f.householdId==='founder-1');
 state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-1',farmyardId:yard.id});
 const offset=state.events.length;
 state=core.advanceWinter(state);
 assert.equal(core.landingSummary(state).farmyards.length,0);
 assert.equal(state.landing.cattle['cattle-1'].farmyardId,null);
 assert.equal(state.events.slice(offset).filter(e=>e.type==='FarmyardFunctionChanged'&&e.details.buildingId===yard.id&&e.details.active===false).length,1);
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});

test('a new birth cannot retain a former caregiver who resumed an occupation on the same boundary',()=>{
 let state=core.createSettlement(41,{...quiet,mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:10000,birthCooldownWinters:4,careerReviewWinters:5});
 state.time.winter=804;state.stocks.food=1000;state.stocks.materials=0;
 addResident(state,'donor',20);
 state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'donor'});
 const ended=core.advanceWinter(state);
 assert.equal(ended.personas.donor.occupation,'woodworker');
 assert.equal(ended.mechanics.people.liv.lastBirthWinter,805);
 assert.equal(ended.mechanics.people.liv.caregiverId,null);
 assert.equal(core.inspectWork(ended,'liv').reason,'childcare');
 assert.deepEqual(core.reconstructState(core.serializeState(ended)),ended);
});
