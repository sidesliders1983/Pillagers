import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));

test('family and founding events record historical names and ages at the public campaign boundary',()=>{
  let state=core.createCampaign(32,{initialFood:500},{fertilityChanceBps:10000,partnershipChanceBps:10000,careerReviewWinters:0});
  const founding=state.events.find(e=>e.type==='FoundingPartnershipPresent');
  assert.equal(founding.details.people.length,2);
  for(const fact of founding.details.people){assert.equal(fact.name,state.personas[fact.id].name);assert.equal(fact.age,core.personaAge(state,fact.id));}
  state=core.advanceWinter(state);
  const birth=state.events.find(e=>e.type==='ChildBorn');assert.ok(birth);
  assert.equal(birth.details.people.length,3);
  const recorded=structuredClone(birth.details.people);
  for(const p of Object.values(state.personas))p.name='Renamed later';
  assert.deepEqual(birth.details.people,recorded);
  assert.deepEqual(core.reconstructState(core.serializeState(state)).events,state.events);
});


test('Chronicle groups Winters newest first, aggregates production at first occurrence and retains ordered provenance',()=>{
  const {projectChronicle}=loadTypeScript(new URL('../src/lore/Chronicle.ts',import.meta.url));
  const event=(id,type,details,tick=0,winter=800)=>({id,type,time:{winter,tick},details});
  const events=[event('e1','ResourceProduced',{resource:'food',units:2}),event('e2','OccupationAssigned',{name:'Einar',occupation:'woodworker'},1),event('e3','CattleFoodProduced',{units:1},2),event('e4','ResourceProduced',{resource:'materials',units:3},3),event('e5','ResourceProduced',{resource:'food',units:4},4),event('e6','CattleFoodProduced',{units:2},5),event('e7','FutureUnknown',{motive:'heroic'},0,801)];
  const before=JSON.stringify(events),groups=projectChronicle(events,802);
  assert.deepEqual(groups.map(g=>g.winter),[802,801,800]);assert.equal(groups[0].entries.length,0);assert.equal(groups[1].entries.length,0);
  assert.deepEqual(groups[2].entries.map(e=>e.text),['The settlement produced 6 Food and 3 Materials this Winter.','Einar became a woodworker.','The herd produced 3 Food this Winter.']);
  assert.deepEqual(groups[2].entries.map(e=>e.sourceEventIds),[['e1','e4','e5'],['e2'],['e3','e6']]);
  assert.ok(groups[2].entries.every(e=>e.templateId&&e.templateVersion===1));assert.equal(JSON.stringify(events),before);
  assert.deepEqual(projectChronicle(events,802),groups);
});


test('Chronicle uses historical snapshots, supports actual decisions and roundtrips without duplicates or current-person lookups',()=>{
  const {projectChronicle}=loadTypeScript(new URL('../src/lore/Chronicle.ts',import.meta.url));
  let state=core.createCampaign(32,{initialFood:500,initialMaterials:500},{fertilityChanceBps:10000,partnershipChanceBps:10000,careerReviewWinters:0});
  for(const command of [
    {type:'KeepLongship',longshipId:'founding-longship'},
    {type:'SalvageLongship',longshipId:'founding-longship'},
    {type:'BuildHouse',householdId:'founder-1'},
    {type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'},
    {type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'},
    {type:'SpecializeBuilding',buildingId:'house-1',occupation:'farmer'},
    {type:'UpgradeBuilding',buildingId:'house-1'},
    {type:'SlaughterCattle',cattleId:'cattle-3'},
  ])state=core.applyCommand(state,command);
  state=core.advanceWinter(state);
  const before=projectChronicle(state.events,state.time.winter),entries=before.flatMap(g=>g.entries);
  const birth=state.events.find(e=>e.type==='ChildBorn');assert.ok(birth);
  const birthEntry=entries.find(e=>e.sourceEventIds.includes(birth.id));
  const parents=birth.details.parentIds.map(id=>birth.details.people.find(p=>p.id===id).name);
  assert.equal(birthEntry.text,`${birth.details.name} was born to ${parents[0]} and ${parents[1]}.`);
  for(const type of ['FoundingPartnershipPresent','HouseBuilt','ResidenceAssigned','OccupationAssigned','CattleAssigned','BuildingSpecialized','BuildingUpgraded','CattleSlaughtered','FarmyardFunctionChanged'])assert.ok(entries.some(e=>e.templateId===type),type);
  const allIds=new Set(state.events.map(e=>e.id));assert.ok(entries.every(e=>e.sourceEventIds.every(id=>allIds.has(id))));
  for(const person of Object.values(state.personas)){person.name='New name';person.birthWinter--;}
  assert.deepEqual(projectChronicle(state.events,state.time.winter),before);
  const saved=core.reconstructState(core.serializeState(state));assert.deepEqual(projectChronicle(saved.events,saved.time.winter),before);
  assert.equal(new Set(entries.flatMap(e=>e.sourceEventIds)).size,entries.flatMap(e=>e.sourceEventIds).length);
  const legacy=[{id:'old',type:'PartnershipFormed',time:{winter:800,tick:0},details:{participants:['a','b']}}];
  assert.equal(projectChronicle(legacy)[0].entries[0].text,'resident a and resident b became partners.');
});


test('supported debt, collapse and childcare facts have neutral templates; missing or unknown facts remain raw-only',()=>{
  const {projectChronicle}=loadTypeScript(new URL('../src/lore/Chronicle.ts',import.meta.url));
  const people=[{id:'m',name:'Liv',age:25},{id:'c',name:'Astrid',age:30}];
  const events=[
    {id:'debt',type:'MaintenanceDebtIncreased',details:{buildingId:'h',debtWinters:2,reason:'vacant'}},
    {id:'collapse',type:'BuildingCollapsed',details:{buildingId:'h',salvage:5}},
    {id:'care',type:'CaregiverAssigned',personaId:'m',details:{caregiverId:'c',people}},
    {id:'clear',type:'CaregiverAssigned',personaId:'m',details:{caregiverId:null,people}},
    {id:'bad',type:'BuildingUpgraded',details:{buildingId:'h',cost:1}},
    {id:'unknown',type:'Unsupported',details:{story:'invented drama'}},
  ].map(event=>({...event,time:{winter:800,tick:0}}));
  assert.deepEqual(projectChronicle(events)[0].entries.map(e=>e.text),[
    'Home h accumulated 2 Winters of maintenance debt (vacant).',
    'Home h collapsed; 5 Materials were salvaged.',
    'Astrid was assigned as caregiver for Liv.',
    'The mother was assigned to childcare for Liv.',
  ]);
});
