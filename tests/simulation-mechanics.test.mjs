import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const quiet = {fertilityChanceBps: 0, partnershipChanceBps: 0, careerReviewWinters: 0};
function settlement(overrides = {}) {return core.createSettlement(27, {...quiet, ...overrides});}
function perfectFarmer(state, id = 'einar') {
  state.personas[id].dna.traits = {physicality:.7, agility:.6, intelligence:.6, cunning:.35, temperament:.25};
  return core.applyCommand(state, {type:'AssignOccupation', personaId:id, occupation:'farmer'});
}
function produced(state, resource) {return state.events.filter(e => e.type === 'ResourceProduced' && e.details.resource === resource).reduce((n,e) => n + e.details.units, 0);}

test('integer work production gives a tent household half the housed output', () => {
  const house = perfectFarmer(settlement());
  const tent = structuredClone(house);
  tent.residences.residence = {id:'residence', kind:'tent', buildingId:null};
  const housed = core.advanceWinter(house), exposed = core.advanceWinter(tent);
  assert.equal(produced(housed, 'food'), 10);
  assert.equal(produced(exposed, 'food'), 5);
  assert.deepEqual(housed.stocks, {food:25, materials:9});
  assert.deepEqual(exposed.stocks, {food:20, materials:10});
  assert.ok(Number.isSafeInteger(exposed.personas.einar.workProgress));
});

test('a vacant house pays no upkeep and collapses after three debt Winters with 50% salvage', () => {
  let state=settlement();
  state=core.applyCommand(state,{type:'AssignResidence',householdId:'home',residenceId:null});
  state=core.advanceWinter(state);
  assert.equal(state.mechanics.buildings.house.debtWinters,1);
  assert.equal(state.stocks.materials,10);
  state=core.advanceWinter(state);
  assert.equal(state.mechanics.buildings.house.debtWinters,2);
  state=core.advanceWinter(state);
  assert.equal(state.buildings.house,undefined);
  assert.equal(state.stocks.materials,15);
  assert.equal(state.residences[state.households.home.residenceId].kind,'tent');
  assert.equal(state.events.at(-1).type,'BuildingCollapsed');
});

test('reoccupation with paid upkeep clears two Winters of debt', () => {
  let state=core.applyCommand(settlement(),{type:'AssignResidence',householdId:'home',residenceId:null});
  state=core.advanceWinter(core.advanceWinter(state));
  state=core.applyCommand(state,{type:'AssignResidence',householdId:'home',residenceId:'residence'});
  state=core.advanceWinter(state);
  assert.equal(state.mechanics.buildings.house.debtWinters,0);
  assert.equal(state.stocks.materials,9);
  assert.ok(state.buildings.house);
});

test('upgrades bonus only matching work and collapse salvages half of total investment', () => {
  let base=perfectFarmer(settlement());base.stocks.materials=50;
  let matching=core.applyCommand(base,{type:'SpecializeBuilding',buildingId:'house',occupation:'farmer'});
  matching=core.applyCommand(matching,{type:'UpgradeBuilding',buildingId:'house'});
  assert.equal(matching.stocks.materials,45);
  assert.equal(matching.mechanics.buildings.house.investedMaterials,15);
  assert.equal(produced(core.advanceWinter(matching),'food'),12);
  let other=core.applyCommand(matching,{type:'SpecializeBuilding',buildingId:'house',occupation:'smith'});
  assert.equal(produced(core.advanceWinter(other),'food'),10);
  assert.equal(other.mechanics.buildings.house.upgradeLevel,1);
  other=core.applyCommand(other,{type:'AssignResidence',householdId:'home',residenceId:null});
  other=core.advanceWinter(core.advanceWinter(core.advanceWinter(other)));
  assert.equal(other.stocks.materials,52);
  assert.equal(other.buildings.house,undefined);
});

test('housing chooses a vacant house, then builds for 10 Materials, then falls back to a tent', () => {
  let state=core.applyCommand(settlement(),{type:'AssignResidence',householdId:'home',residenceId:null});
  state=core.applyCommand(state,{type:'HouseHousehold',householdId:'home'});
  assert.equal(state.households.home.residenceId,'residence');
  assert.equal(state.stocks.materials,10);
  state=core.applyCommand(state,{type:'BuildHouse',householdId:'home'});
  assert.equal(state.stocks.materials,0);
  assert.equal(Object.keys(state.buildings).length,2);
  state.households.new={id:'new',memberIds:['astrid'],residenceId:null};
  state.households.home.memberIds=state.households.home.memberIds.filter(id=>id!=='astrid');
  state=core.applyCommand(state,{type:'HouseHousehold',householdId:'new'});
  assert.equal(state.households.new.residenceId,'residence');
  state.households.last={id:'last',memberIds:['liv'],residenceId:null};
  state.households.home.memberIds=state.households.home.memberIds.filter(id=>id!=='liv');
  state=core.applyCommand(state,{type:'HouseHousehold',householdId:'last'});
  assert.equal(state.residences[state.households.last.residenceId].kind,'tent');
  assert.throws(()=>core.applyCommand(state,{type:'BuildHouse',householdId:'last'}));
});

test('career switches keep history, apply 75% for 1000 ticks and preserve progress by occupation', () => {
  let state=settlement();
  state.mechanics.config.occupations.fisher={...state.mechanics.config.occupations.farmer};
  state=perfectFarmer(state);
  state=core.applyCommand(state,{type:'AdvanceTicks',ticks:430});
  assert.equal(produced(state,'food'),4);
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'fisher'});
  assert.equal(state.personas.einar.workProgress,0);
  assert.deepEqual(state.personas.einar.occupationHistory[0].endedAt,{winter:800,tick:430});
  state=core.advanceWinter(state);
  assert.equal(produced(state,'food'),11);
  state=core.advanceWinter(state);
  assert.equal(produced(state,'food'),21);
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'});
  assert.equal(state.personas.einar.workProgress,3000000);
  assert.equal(state.mechanics.people.einar.occupationLocked,true);
});

test('parent occupation experience gives one capped apprenticeship bonus through CharacterDNA aptitude', () => {
  let state=perfectFarmer(settlement());
  state.personas.astrid.birthWinter=784;
  state=core.advanceWinter(state);
  state.personas.astrid.dna.traits={...state.personas.einar.dna.traits};
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'astrid',occupation:'farmer'});
  const before=state.events.length;
  state=core.advanceWinter(state);
  const output=state.events.slice(before).filter(e=>e.type==='ResourceProduced'&&e.personaId==='astrid').reduce((sum,e)=>sum+e.details.units,0);
  assert.equal(output,11);
});

test('current age controls work eligibility, consumption and the gradual productivity floor', () => {
  const initial=settlement();
  initial.personas.astrid.birthWinter=784;
  let worker=perfectFarmer(initial,'astrid');
  const grown=core.advanceWinter(worker);
  assert.equal(produced(grown,'food'),10);
  assert.equal(grown.events.find(e=>e.type==='FoodConsumed').details.units,6);
  const fifty=settlement();fifty.personas.einar.birthWinter=750;fifty.personas.einar.dna.age=1;
  const older=core.advanceWinter(perfectFarmer(fifty));
  assert.equal(produced(older,'food'),9);
  assert.equal(older.personas.einar.workProgress,8000000);
  const seventyFive=settlement();seventyFive.personas.einar.birthWinter=725;
  assert.equal(produced(core.advanceWinter(perfectFarmer(seventyFive)),'food'),5);
  assert.throws(()=>core.applyCommand(settlement(),{type:'AssignOccupation',personaId:'astrid',occupation:'farmer'}));
});

test('player occupation locks override career autonomy until explicitly released', () => {
  let state=settlement({careerReviewWinters:5});
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'liv',occupation:null});
  state.personas.einar.dna.traits={physicality:.7,agility:.6,intelligence:.6,cunning:.35,temperament:.25};
  state.mechanics.config.occupations.smith.preferences=[0,0,0,1,1];
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'smith'});
  for(let year=0;year<5;year++)state=core.advanceWinter(state);
  assert.equal(state.personas.einar.occupation,'smith');
  state=core.applyCommand(state,{type:'ReleaseOccupation',personaId:'einar'});
  for(let year=0;year<5;year++)state=core.advanceWinter(state);
  assert.equal(state.personas.einar.occupation,'farmer');
  assert.equal(state.personas.einar.occupationHistory[0].occupation,'smith');
  assert.equal(state.mechanics.people.einar.occupationLocked,false);
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'woodworker'});
  for(let year=0;year<5;year++)state=core.advanceWinter(state);
  assert.equal(state.personas.einar.occupation,'woodworker');
});


function addPerson(state,id,parents=[],sex='male',birthWinter=780) {
  const template=state.personas.einar;
  state.personas[id]={...structuredClone(template),id,name:id,birthWinter,deathWinter:null,parentIds:parents,partnerId:null,occupation:null,occupationHistory:[],workProgress:0,dna:{...structuredClone(template.dna),sex,age:800-birthWinter}};
  state.mechanics.people[id]={dominantLegacy:{},occupationLocked:false,switchedUntilTick:0,progress:{},lastBirthWinter:null,childcareUntilWinter:0,caregiverId:null,caregiverLocked:false,caregiverWorkedWinter:null};
}
test('first cousins may partner; direct ancestors, siblings, half-siblings and aunt/nephew may not', () => {
  const state=settlement();
  addPerson(state,'grandfather',[],'male',740);addPerson(state,'grandmother',[],'female',740);
  addPerson(state,'father',['grandfather','grandmother'],'male',760);
  addPerson(state,'aunt',['grandfather','grandmother'],'female',760);
  addPerson(state,'son',['father'],'male');addPerson(state,'daughter',['father'],'female');
  addPerson(state,'cousin',['aunt'],'female');
  assert.equal(core.canPartner(state,'son','cousin'),true);
  assert.equal(core.canPartner(state,'son','aunt'),false);
  assert.equal(core.canPartner(state,'father','daughter'),false);
  assert.equal(core.canPartner(state,'grandfather','daughter'),false);
  assert.equal(core.canPartner(state,'son','daughter'),false);
});

test('adult children stay in the parental household until autonomous partnership creates a new household', () => {
  let state=settlement({partnershipChanceBps:0});
  state.personas.einar.dna.sex='male';state.personas.liv.dna.sex='female';
  state.personas.astrid.birthWinter=782;state.personas.astrid.dna.sex='female';
  addPerson(state,'outsider',[],'male',780);
  state.households.outsider={id:'outsider',memberIds:['outsider'],residenceId:null};
  state=core.advanceWinter(state);
  assert.ok(state.households.home.memberIds.includes('astrid'));
  state.mechanics.config.partnershipChanceBps=10000;
  state=core.advanceWinter(state);
  assert.equal(state.personas.astrid.partnerId,'outsider');
  assert.equal(state.personas.outsider.partnerId,'astrid');
  assert.ok(!state.households.home.memberIds.includes('astrid'));
  const home=Object.values(state.households).find(h=>h.memberIds.includes('astrid'));
  assert.deepEqual(home.memberIds,['astrid','outsider']);
  assert.ok(state.residences[home.residenceId]);
  assert.ok(state.events.some(e=>e.type==='PartnershipFormed'));
  assert.notEqual(state.rngState,27);
});

function fertile(overrides={}) {
  const state=settlement({fertilityChanceBps:10000,...overrides});
  state.personas.einar.dna.sex='male';state.personas.liv.dna.sex='female';
  state.personas.astrid.birthWinter=790;state.mechanics.people.liv.lastBirthWinter=790;state.mechanics.people.liv.childcareUntilWinter=795;
  state.stocks.food=500;state.stocks.materials=500;
  return state;
}
test('births preserve lineage, obey two complete cooldown Winters and are blocked by Food shortage', () => {
  let state=fertile();
  state=core.advanceWinter(state);
  assert.equal(Object.keys(state.personas).length,4);
  const born=state.events.find(e=>e.type==='ChildBorn');
  assert.deepEqual(state.personas[born.personaId].parentIds,['einar','liv']);
  assert.equal(state.personas[born.personaId].birthWinter,801);
  state=core.advanceWinter(core.advanceWinter(state));
  assert.equal(Object.keys(state.personas).length,4);
  state=core.advanceWinter(state);
  assert.equal(Object.keys(state.personas).length,5);
  assert.equal(state.mechanics.people.liv.childcareUntilWinter,809);
  const shortage=fertile();shortage.stocks.food=5;
  assert.equal(Object.keys(core.advanceWinter(shortage).personas).length,3);
});


test('dominant genetic legacy is rolled per child and its marker lasts only one generation', () => {
  let state=fertile({dominantLegacyChanceBps:10000});
  for(const key of ['physicality','agility','intelligence','cunning','temperament']){state.personas.einar.dna.traits[key]=.8;state.personas.liv.dna.traits[key]=.2;}
  state=core.advanceWinter(state);
  const childId=state.events.find(e=>e.type==='ChildBorn').personaId;
  const child=state.personas[childId], markers=state.mechanics.people[childId].dominantLegacy;
  assert.equal(Object.keys(markers).length,5);
  for(const [trait,parentId] of Object.entries(markers))assert.equal(child.dna.traits[trait],state.personas[parentId].dna.traits[trait]);
  state.mechanics.config.fertilityChanceBps=0;
  for(let year=0;year<18;year++)state=core.advanceWinter(state);
  state.personas[childId].dna.sex='female';
  addPerson(state,'outsider',[],'male',780);
  state.personas.outsider.dna.traits={physicality:.4,agility:.4,intelligence:.4,cunning:.4,temperament:.4};
  state.households.outsider={id:'outsider',memberIds:['outsider'],residenceId:null};
  state.personas[childId].partnerId='outsider';state.personas.outsider.partnerId=childId;
  state.stocks.food=500;state.mechanics.config.fertilityChanceBps=10000;state.mechanics.config.dominantLegacyChanceBps=0;
  state=core.advanceWinter(state);
  const grandId=state.events.filter(e=>e.type==='ChildBorn').at(-1).personaId;
  assert.notEqual(grandId,childId);
  assert.deepEqual(state.mechanics.people[grandId].dominantLegacy,{});
  for(const trait of Object.keys(markers))assert.equal(state.personas[grandId].dna.traits[trait],(state.personas[childId].dna.traits[trait]+.4)/2);
  assert.deepEqual(state.mechanics.people[childId].dominantLegacy,markers);
});


test('childcare stops mother output; an eligible player caregiver restores it at work and fertility opportunity cost', () => {
  let state=perfectFarmer(fertile(),'liv');
  state=core.advanceWinter(state);
  state.mechanics.config.fertilityChanceBps=0;
  const before=produced(state,'food');
  state=core.advanceWinter(state);
  assert.equal(produced(state,'food')-before,0);
  addPerson(state,'caregiver',[],'female',780);addPerson(state,'caregiver-partner',[],'male',780);
  state.personas.caregiver.partnerId='caregiver-partner';state.personas['caregiver-partner'].partnerId='caregiver';
  state.households.caregiver={id:'caregiver',memberIds:['caregiver','caregiver-partner'],residenceId:null};
  state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'caregiver'});
  assert.equal(state.mechanics.people.liv.caregiverId,'caregiver');
  assert.throws(()=>core.applyCommand(state,{type:'AssignOccupation',personaId:'caregiver',occupation:'farmer'}));
  state.mechanics.config.fertilityChanceBps=10000;
  const restored=core.advanceWinter(state);
  assert.equal(produced(restored,'food')-produced(state,'food'),10);
  assert.equal(restored.events.filter(e=>e.type==='ChildBorn'&&e.details.parentIds.includes('caregiver')).length,0);
  const returned=core.applyCommand(restored,{type:'AssignCaregiver',motherId:'liv',caregiverId:null});
  assert.equal(returned.mechanics.people.liv.caregiverId,null);
  assert.equal(returned.mechanics.people.liv.caregiverLocked,true);
  assert.equal(produced(core.applyCommand(returned,{type:'AdvanceTicks',ticks:999}),'food'),produced(returned,'food'));
});

test('initial family births also seed maternal cooldown and childcare state', () => {
  const state=core.createSettlement(27,{...quiet,fertilityChanceBps:10000});
  assert.equal(state.mechanics.people.liv.lastBirthWinter,800);
  assert.equal(state.mechanics.people.liv.childcareUntilWinter,805);
  assert.equal(state.personas.liv.dna.sex,'female');
  let next=core.advanceWinter(state);next=core.advanceWinter(next);
  assert.equal(next.events.filter(e=>e.type==='ChildBorn').length,0);
});

test('save/load rejects fractional prototype economics, invalid genealogy and inconsistent mechanic records', () => {
  for(const mutate of [
    s=>s.mechanics.config.adultFood=1.5,
    s=>s.mechanics.config.fertilityChanceBps=10001,
    s=>s.mechanics.config.occupations.farmer.weights=[1],
    s=>s.mechanics.people.einar.progress.farmer=.5,
    s=>delete s.mechanics.people.liv,
    s=>s.mechanics.buildings.house.upgradeLevel=4,
    s=>s.mechanics.people.liv.caregiverId='missing',
    s=>s.personas.einar.parentIds=['astrid'],
  ]) {
    const invalid=fertile();mutate(invalid);
    assert.throws(()=>core.reconstructState(JSON.stringify(invalid)));
    assert.throws(()=>core.advanceWinter(invalid));
  }
});

test('autonomous caregiver selection respects player replacement and care ends after five complete Winters', () => {
  let state=perfectFarmer(fertile(),'liv');
  addPerson(state,'a-donor',[],'female',780);addPerson(state,'b-donor',[],'female',780);
  state.households.donors={id:'donors',memberIds:['a-donor','b-donor'],residenceId:null};
  state=core.advanceWinter(state);
  assert.equal(state.mechanics.people.liv.caregiverId,'a-donor');
  state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'b-donor'});
  state.mechanics.config.fertilityChanceBps=0;
  state=core.advanceWinter(state);
  assert.equal(state.mechanics.people.liv.caregiverId,'b-donor');
  state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:null});
  const before=produced(state,'food');
  for(let year=0;year<4;year++)state=core.advanceWinter(state);
  assert.deepEqual(state.time,{winter:806,tick:0});
  assert.equal(produced(state,'food'),before);
  assert.equal(state.mechanics.people.liv.caregiverId,null);
  assert.equal(produced(core.advanceWinter(state),'food')-before,10);
});

test('active economy and seeded families replay identically across split ticks, midpoint saves and forbidden wall clocks', () => {
  const initial=fertile({partnershipChanceBps:10000,careerReviewWinters:5});
  initial.personas.astrid.birthWinter=782;
  addPerson(initial,'outsider',[],'male',780);
  initial.households.outsider={id:'outsider',memberIds:['outsider'],residenceId:null};
  const saved=core.serializeState(initial);
  const run=(split=false,resume=false)=>{
    let state=core.reconstructState(saved);
    state=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'});
    state=core.applyCommand(state,{type:'SpecializeBuilding',buildingId:'house',occupation:'farmer'});
    state=core.applyCommand(state,{type:'UpgradeBuilding',buildingId:'house'});
    for(let year=0;year<12;year++){
      state=split?core.applyCommand(core.applyCommand(state,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863}):core.advanceWinter(state);
      if(resume&&year===5)state=core.reconstructState(core.serializeState(state));
      assert.ok(Number.isSafeInteger(state.stocks.food)&&Number.isSafeInteger(state.stocks.materials));
    }
    return state;
  };
  const expected=run();
  assert.deepEqual(run(),expected);
  assert.deepEqual(run(true),expected);
  assert.deepEqual(run(false,true),expected);
  assert.deepEqual(run(true,true),expected);
  assert.ok(expected.events.some(e=>e.type==='ChildBorn'));
  assert.ok(expected.events.some(e=>e.type==='PartnershipFormed'));
  assert.notEqual(expected.rngState,27);
  const clock=Date.now,random=Math.random;
  try {Date.now=()=>{throw new Error('Wall clock forbidden');};Math.random=()=>{throw new Error('Unseeded randomness forbidden');};assert.deepEqual(run(true,true),expected);}
  finally {Date.now=clock;Math.random=random;}
  assert.equal(core.serializeState(initial),saved);
});
test('caregiving earlier in a Winter blocks donor fertility after removal and a save', () => {
  let state=core.advanceWinter(fertile());
  addPerson(state,'donor',[],'female',780);addPerson(state,'donor-partner',[],'male',780);
  state.personas.donor.partnerId='donor-partner';state.personas['donor-partner'].partnerId='donor';
  state.households.donor={id:'donor',memberIds:['donor','donor-partner'],residenceId:null};
  state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:'donor'});
  state=core.applyCommand(state,{type:'AdvanceTicks',ticks:999});
  state=core.applyCommand(state,{type:'AssignCaregiver',motherId:'liv',caregiverId:null});
  const resumed=core.reconstructState(core.serializeState(state));
  const final=core.applyCommand(resumed,{type:'AdvanceTicks',ticks:1});
  assert.equal(final.events.filter(e=>e.type==='ChildBorn'&&e.details.parentIds.includes('donor')).length,0);
  assert.deepEqual(final,core.applyCommand(state,{type:'AdvanceTicks',ticks:1}));
});
test('loaded prohibited and self partnerships are rejected before simulation', () => {
  for(const pair of [['einar','astrid'],['liv','liv']]) {
    const state=settlement();state.personas.einar.partnerId=null;state.personas.liv.partnerId=null;
    state.personas[pair[0]].partnerId=pair[1];state.personas[pair[1]].partnerId=pair[0];
    assert.throws(()=>core.reconstructState(JSON.stringify(state)));
  }
});
