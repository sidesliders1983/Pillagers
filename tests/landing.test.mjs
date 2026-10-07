import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
test('seeded landing generates ten viable named founders in tents with founding assets at Winter 800',()=>{
  const state=core.createCampaign(32);
  assert.deepEqual(state.time,{winter:800,tick:0});
  const founders=Object.values(state.personas);
  assert.equal(founders.length,10);
  for(const sex of ['female','male'])assert.ok(founders.filter(p=>p.dna.sex===sex).length>=4);
  for(const p of founders){assert.ok(p.name);assert.ok(core.personaAge(state,p.id)>=18&&core.personaAge(state,p.id)<=40);}
  assert.equal(Object.keys(state.buildings).length,0);
  assert.equal(Object.values(state.residences).every(r=>r.kind==='tent'),true);
  assert.equal(Object.keys(state.households).length,10-state.events.filter(e=>e.type==='FoundingPartnershipPresent').length);
  assert.deepEqual(state.stocks,{food:30,materials:5});
  assert.equal(Object.keys(state.landing.longships).length,1);
  assert.deepEqual(Object.values(state.landing.cattle).map(c=>c.sex).sort(),['female','female','male']);
  assert.equal(Object.values(state.landing.cattle).every(c=>c.farmyardId===null&&c.deathWinter===null),true);
  assert.equal(state.landing.region.settledByClanId,null);
  assert.equal(state.events[0].type,'FoundingPartyLanded');
  assert.deepEqual(core.createCampaign(32),state);
  assert.notDeepEqual(core.createCampaign(33).personas,state.personas);
  assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
test('keeping the longship preserves capability; salvage is a configurable irreversible one-off command',()=>{
  const initial=core.createCampaign(32,{longshipSalvage:17});
  const kept=core.applyCommand(initial,{type:'KeepLongship',longshipId:'founding-longship'});
  assert.equal(kept.stocks.materials,5);
  assert.equal(core.landingSummary(kept).maritimeCapable,true);
  const salvaged=core.applyCommand(kept,{type:'SalvageLongship',longshipId:'founding-longship'});
  assert.equal(salvaged.stocks.materials,22);
  assert.equal(core.landingSummary(salvaged).longships,0);
  assert.equal(core.landingSummary(salvaged).maritimeCapable,false);
  assert.equal(salvaged.events.at(-1).type,'FoundingLongshipSalvaged');
  assert.equal(salvaged.landing.longships['founding-longship'].salvagedWinter,800);
  assert.throws(()=>core.applyCommand(salvaged,{type:'SalvageLongship',longshipId:'founding-longship'}));
  assert.throws(()=>core.applyCommand(salvaged,{type:'KeepLongship',longshipId:'founding-longship'}));
  assert.equal(initial.stocks.materials,5);
  assert.deepEqual(core.reconstructState(core.serializeState(salvaged)),salvaged);
});
function idleCampaign(overrides={}){
  let state=core.createCampaign(32,{foundingCoupleChanceBps:0,cattleBirthChanceBps:0,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0,cattleCrowdingBps:0,...overrides},{partnershipChanceBps:0,fertilityChanceBps:0,careerReviewWinters:0});
  for(const id of Object.keys(state.personas))state=core.applyCommand(state,{type:'AssignOccupation',personaId:id,occupation:null});
  return state;
}
test('founding cows produce half output while all three cattle consume full Food from the first Winter',()=>{
  const initial=idleCampaign();
  const state=core.advanceWinter(initial);
  assert.equal(state.stocks.food,11); // 30 + 2 cows * 2 output - 10 adults * 2 - 3 cattle * 1
  assert.equal(state.events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0),4);
  assert.equal(state.events.filter(e=>e.type==='CattleFoodConsumed').reduce((n,e)=>n+e.details.units,0),3);
  assert.equal(core.landingSummary(state).unshelteredCattle,3);
  const split=core.applyCommand(core.applyCommand(initial,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863});
  assert.deepEqual(split,state);
  assert.equal(core.applyCommand(initial,{type:'AdvanceTicks',ticks:500}).stocks.food,32);
});
test('only a permanent farmer household gains a free Farmyard function; cattle are individually assigned beyond the soft cap',()=>{
  let state=idleCampaign({farmyardCapacity:2});
  state.mechanics.config.occupations.farmer.unitsPerWinter=0;
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
  assert.equal(core.landingSummary(state).farmyards.length,0);
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
  assert.equal(state.stocks.materials,15);
  assert.equal(core.landingSummary(state).farmyards[0].id,'house-1');
  assert.equal(core.landingSummary(state).unshelteredCattle,3);
  assert.throws(()=>core.applyCommand(state,{type:'EstablishFarmyard'}));
  for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId:'house-1'});
  const summary=core.landingSummary(state);
  assert.equal(summary.unshelteredCattle,0);
  assert.equal(summary.farmyards[0].capacity,2);
  assert.equal(summary.farmyards[0].occupants,3);
  assert.equal(summary.farmyards[0].overcrowding,1);
  const final=core.advanceWinter(state);
  assert.equal(final.stocks.food,15);
  assert.equal(final.stocks.materials,14);
  assert.equal(Object.keys(final.landing.cattle).length,3);
});
test('slaughter grants configured Food once and removes the animal from living output and consumption',()=>{
  const initial=idleCampaign({slaughterFood:17});
  const state=core.applyCommand(initial,{type:'SlaughterCattle',cattleId:'cattle-3'});
  assert.equal(state.stocks.food,47);
  assert.equal(core.landingSummary(state).cattle,2);
  assert.equal(state.landing.cattle['cattle-3'].deathWinter,800);
  assert.equal(state.events.at(-1).type,'CattleSlaughtered');
  assert.throws(()=>core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-3'}));
  assert.equal(core.advanceWinter(state).stocks.food,29); // 47 + 4 - 20 - 2
  assert.equal(initial.landing.cattle['cattle-3'].deathWinter,null);
  assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
test('campaign commands and save/load reject invalid assets and fractional or unbounded landing configuration atomically',()=>{
  for(const overrides of [{initialFood:1.5},{exposedProductivityBps:10001},{farmyardCapacity:0},{cowFoodPerWinter:10000001},{unexpected:1}])assert.throws(()=>core.createCampaign(32,overrides));
  const initial=idleCampaign();
  for(const mutate of [
    s=>s.landing.cattle['cattle-1'].birthWinter=801,
    s=>s.landing.cattle['cattle-1'].foodProgress=.5,
    s=>s.landing.cattle['cattle-1'].farmyardId='missing',
    s=>s.landing.longships['founding-longship'].salvagedWinter=801,
    s=>s.landing.founderIds=['missing'],
    s=>delete s.mechanics,
    s=>s.landing.version=99,
  ]){const invalid=structuredClone(initial);mutate(invalid);assert.throws(()=>core.reconstructState(JSON.stringify(invalid)));assert.throws(()=>core.advanceWinter(invalid));}
  assert.throws(()=>core.applyCommand(initial,{type:'SalvageLongship',longshipId:'missing'}));
  assert.throws(()=>core.applyCommand(initial,{type:'SlaughterCattle',cattleId:'missing'}));
  assert.deepEqual(initial.stocks,{food:30,materials:5});
});
test('Farmyard unpaid upkeep collapses after three Winters, exposes surviving cattle and salvages investment',()=>{
  let state=idleCampaign();state.mechanics.config.occupations.farmer.unitsPerWinter=0;
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
  for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId:'house-1'});
  state.stocks.materials=0;
  for(let n=0;n<3;n++)state=core.advanceWinter(state);
  assert.equal(state.buildings['house-1'],undefined);
  assert.equal(state.stocks.materials,5);
  assert.equal(core.landingSummary(state).unshelteredCattle,3);
  assert.equal(Object.values(state.landing.cattle).every(c=>c.farmyardId===null&&c.deathWinter===null),true);
  const before=state.events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0);
  const next=core.advanceWinter(state);
  assert.equal(next.events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0)-before,4);
});
test('landing commands and fifty Winters replay across split ticks and midpoint saves without wall-clock randomness',()=>{
  function run(split=false,resume=false){
    let state=core.createCampaign(32);
    state=core.applyCommand(state,{type:'KeepLongship',longshipId:'founding-longship'});
    state=core.applyCommand(state,{type:'AdvanceTicks',ticks:321});
    state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
    state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
    state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
    for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId:'house-1'});
    for(let n=0;n<50;n++){
      state=split?core.applyCommand(core.applyCommand(state,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863}):core.advanceWinter(state);
      if(n===10)state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-3'});
      if(n===25&&resume)state=core.reconstructState(core.serializeState(state));
      assert.ok(Number.isSafeInteger(state.stocks.food)&&state.stocks.food>=0);
      assert.ok(Number.isSafeInteger(state.stocks.materials)&&state.stocks.materials>=0);
    }
    return state;
  }
  const expected=run();
  assert.deepEqual(expected.time,{winter:850,tick:321});
  assert.deepEqual(run(true),expected);
  assert.deepEqual(run(true,true),expected);
  const clock=Date.now,random=Math.random;
  try{Date.now=()=>{throw new Error('Wall clock forbidden');};Math.random=()=>{throw new Error('Unseeded randomness forbidden');};assert.deepEqual(run(false,true),expected);}
  finally{Date.now=clock;Math.random=random;}
});
test('the last farmer leaving removes the home function and unassigns cattle; other farmers keep it active',()=>{
  let state=idleCampaign();state.households['founder-1'].memberIds.push('founder-2');state.households['founder-2'].memberIds=[];
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'BuildHouse',householdId:'founder-1'});
  for(const personaId of ['founder-1','founder-2'])state=core.applyCommand(state,{type:'AssignOccupation',personaId,occupation:'farmer'});
  state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'});
  assert.equal(state.events.filter(e=>e.type==='FarmyardFunctionChanged'&&e.details.active).length,1);
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'woodworker'});
  assert.equal(state.landing.cattle['cattle-1'].farmyardId,'house-1');
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-2',occupation:'woodworker'});
  assert.equal(core.landingSummary(state).farmyards.length,0);
  assert.equal(state.landing.cattle['cattle-1'].farmyardId,null);
  assert.equal(state.buildings['house-1'].kind,'house');
  assert.equal(core.landingSummary(state).unshelteredCattle,3);
  assert.throws(()=>core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-2',farmyardId:'house-1'}));
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
  assert.equal(core.landingSummary(state).farmyards.length,1);
  assert.equal(state.landing.cattle['cattle-1'].farmyardId,null); // never automatically reassign
  state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'});
  state=core.applyCommand(state,{type:'AssignResidence',householdId:'founder-1',residenceId:null});
  assert.equal(core.landingSummary(state).farmyards.length,0);
  assert.equal(state.landing.cattle['cattle-1'].farmyardId,null);
  assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
test('old standalone-Farmyard saves migrate without compensation and with unassigned cattle without losing history',()=>{
  const legacy=idleCampaign();legacy.landing.version=1;legacy.landing.config.farmyardCost=10;
  legacy.buildings['old-farmyard']={id:'old-farmyard',kind:'farmyard',specialization:null};
  legacy.mechanics.buildings['old-farmyard']={debtWinters:0,investedMaterials:10,upgradeLevel:0};
  legacy.landing.cattle['cattle-1'].farmyardId='old-farmyard';
  legacy.events.push({id:`event-${legacy.events.length+1}`,time:{...legacy.time},type:'FarmyardEstablished',details:{buildingId:'old-farmyard',cost:10}});
  const serialized=JSON.stringify(legacy),migrated=core.reconstructState(serialized);
  assert.equal(migrated.landing.version,3);
  assert.equal(migrated.landing.config.farmyardCost,undefined);
  assert.equal(migrated.buildings['old-farmyard'],undefined);
  assert.equal(migrated.stocks.materials,legacy.stocks.materials);
  assert.equal(migrated.landing.cattle['cattle-1'].farmyardId,null);
  assert.equal(migrated.events.at(-1).type,'FarmyardModelMigrated');
  assert.ok(migrated.events.some(e=>e.type==='FarmyardEstablished'));
  assert.deepEqual(core.reconstructState(core.serializeState(migrated)),migrated);
  assert.equal(JSON.stringify(legacy),serialized);
});


test('founding couples are seeded, eligible, share a tent and record presence rather than formation',()=>{
  const counts=new Set();let middle=0;
  for(let seed=0;seed<100;seed++){
    const state=core.createCampaign(seed),events=state.events.filter(e=>e.type==='FoundingPartnershipPresent');
    counts.add(events.length);if(events.length===1||events.length===2)middle++;
    assert.ok(events.length<=3);assert.equal(state.events.some(e=>e.type==='PartnershipFormed'),false);
    assert.equal(Object.keys(state.households).length,10-events.length);
    for(const event of events){
      const [a,b]=event.details.participants;
      assert.equal(state.personas[a].partnerId,b);assert.equal(state.personas[b].partnerId,a);
      const unmarried=structuredClone(state);unmarried.personas[a].partnerId=null;unmarried.personas[b].partnerId=null;
      assert.equal(core.canPartner(unmarried,a,b),true);
      const home=Object.values(state.households).find(h=>h.memberIds.includes(a));
      assert.ok(home.memberIds.includes(b));assert.equal(state.residences[home.residenceId].kind,'tent');
    }
    assert.deepEqual(core.createCampaign(seed),state);
    assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
  }
  assert.deepEqual([...counts].sort(),[0,1,2,3]);assert.ok(middle>50);
  assert.equal(core.createCampaign(32,{foundingCoupleChanceBps:0}).events.filter(e=>e.type==='FoundingPartnershipPresent').length,0);
  assert.equal(core.createCampaign(32,{foundingCoupleChanceBps:10000,foundingCoupleCap:2}).events.filter(e=>e.type==='FoundingPartnershipPresent').length,2);
  assert.throws(()=>core.createCampaign(32,{foundingCoupleChanceBps:10001}));
  assert.throws(()=>core.createCampaign(32,{foundingCoupleCap:4}));
  const oldSave=core.createCampaign(32,{foundingCoupleChanceBps:0});
  oldSave.landing.version=2;
  delete oldSave.landing.config.foundingCoupleChanceBps;delete oldSave.landing.config.foundingCoupleCap;
  const restored=core.reconstructState(JSON.stringify(oldSave));
  assert.equal(Object.keys(restored.households).length,10);
  assert.equal(restored.events.some(e=>e.type==='FoundingPartnershipPresent'),false);

});
