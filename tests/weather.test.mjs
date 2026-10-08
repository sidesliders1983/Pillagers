import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
test('new campaigns reveal one weather class at tick zero and save/load never rerolls it',()=>{
 const state=core.createCampaign(32);
 assert.equal(core.inspectWeather(state).class,'Normal');
 assert.equal(core.inspectWeather(state).winter,800);
 assert.equal(state.events.filter(e=>e.type==='WinterWeatherDetermined').length,1);
 assert.deepEqual(core.createCampaign(32),state);
 assert.deepEqual(core.reconstructState(core.serializeState(state)),state);
});
test('weather is revealed once per Winter only after outgoing resolution and split/save replay agrees',()=>{
 const initial=core.createCampaign(32);
 const partial=core.applyCommand(initial,{type:'AdvanceTicks',ticks:999});
 assert.equal(partial.events.filter(e=>e.type==='WinterWeatherDetermined').length,1);
 const next=core.applyCommand(core.reconstructState(core.serializeState(partial)),{type:'AdvanceTicks',ticks:1});
 assert.equal(core.inspectWeather(next).winter,801);
 assert.equal(next.events.at(-1).type,'WinterWeatherDetermined');
 assert.deepEqual(next,core.applyCommand(initial,{type:'AdvanceWinter'}));
 assert.equal(next.events.filter(e=>e.type==='WinterWeatherDetermined').length,2);
});
function forced(kind){const config=structuredClone(core.defaultWeatherConfig);for(const c of core.weatherClasses)config.profiles[c].probabilityBps=c===kind?10000:0;return config;}
test('weather modifies Food work and cow output using fixed point; Materials and slaughter are unchanged',()=>{
 const normal=core.createCampaign(32,{}, {},forced('Normal'));
 const severe=core.createCampaign(32,{}, {},forced('Severe'));
 const worker=Object.values(normal.personas).find(p=>core.inspectWork(normal,p.id).resource==='food');
 assert.equal(core.inspectWork(severe,worker.id).productivityBps,Math.floor(core.inspectWork(normal,worker.id).productivityBps/2));
 const wood=Object.values(normal.personas).find(p=>p.occupation==='woodworker');
 assert.equal(core.inspectWork(severe,wood.id).productivityBps,core.inspectWork(normal,wood.id).productivityBps);
 const a=core.applyCommand(normal,{type:'AdvanceTicks',ticks:500}),b=core.applyCommand(severe,{type:'AdvanceTicks',ticks:500});
 assert.equal(a.events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0),2);
 assert.equal(b.events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0),0);
 assert.equal(core.applyCommand(severe,{type:'SlaughterCattle',cattleId:'cattle-3'}).stocks.food-severe.stocks.food,15);
});
test('tent exposure adds to the existing death roll; permanent housing protects against that extra risk',()=>{
 const config=forced('Severe');config.profiles.Severe.tentMortalityBps=10000;
 let state=core.createCampaign(32,{initialMaterials:100,foundingCoupleChanceBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0,partnershipChanceBps:0},config);
 state=core.applyCommand(state,{type:'HouseHousehold',householdId:'founder-1'});
 state=core.advanceWinter(state);
 assert.equal(state.personas['founder-1'].deathWinter,null);
 assert.equal(Object.values(state.personas).filter(p=>p.deathWinter!==null).length,9);
 const event=state.events.find(e=>e.type==='PersonaDied');
 assert.equal(event.details.weatherClass,'Severe');assert.equal(event.details.weatherWinter,800);
 assert.equal(event.details.weatherExposureBps,10000);
 assert.equal(state.events.filter(e=>e.type==='PersonaDied').length,9);
});
const staticCattle={cattleBirthChanceBps:0,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0,cattleMortalityOlderBps:0,cattleMortalityOldBps:0,cattleCrowdingBps:0};
test('Severe cattle consumption applies once at the outgoing boundary for adult cattle',()=>{
 const config=forced('Severe');config.profiles.Severe.exposedCattleMortalityBps=0;
 let state=core.createCampaign(32,staticCattle,{},config);
 state=core.applyCommand(state,{type:'AdvanceTicks',ticks:999});
 assert.equal(state.events.filter(e=>e.type==='CattleFoodConsumed').length,0);
 state=core.applyCommand(state,{type:'AdvanceTicks',ticks:1});
 const consumption=state.events.filter(e=>e.type==='CattleFoodConsumed');
 assert.equal(consumption.length,1);assert.equal(consumption[0].details.required,9);
 assert.equal(consumption[0].details.weatherWinter,800);assert.equal(consumption[0].details.weatherClass,'Severe');
});
test('Farmyard shelter removes cattle weather exposure while preserving age/crowding mortality',()=>{
 const config=forced('Severe');config.profiles.Severe.exposedCattleMortalityBps=10000;config.profiles.Severe.tentMortalityBps=0;
 let state=core.createCampaign(32,{...staticCattle,initialMaterials:100,foundingCoupleChanceBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],careerReviewWinters:0},config);
 state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
 state=core.applyCommand(state,{type:'HouseHousehold',householdId:'founder-1'});
 state=core.applyCommand(state,{type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'});
 assert.equal(core.inspectCattle(state,'cattle-1').mortalityRiskBps,0);
 assert.equal(core.inspectCattle(state,'cattle-2').mortalityRiskBps,10000);
 state=core.advanceWinter(state);
 assert.equal(state.landing.cattle['cattle-1'].deathWinter,null);
 assert.equal(state.landing.cattle['cattle-2'].deathWinter,801);
 assert.equal(state.landing.cattle['cattle-3'].deathWinter,801);
 const death=state.events.find(e=>e.type==='CattleDied');
 assert.equal(death.details.weatherWinter,800);assert.equal(death.details.weatherExposureBps,10000);
});
test('disabled weather and pre-weather saves preserve baseline outcomes and RNG without weather events',()=>{
 const off=core.createCampaign(32,{}, {},{enabled:false});
 const old=structuredClone(off);delete old.weather;
 assert.equal(core.inspectWeather(off).enabled,false);assert.equal(off.rngState,32);
 let baseline=core.reconstructState(JSON.stringify(old)),disabled=off;
 for(let i=0;i<4;i++){baseline=core.advanceWinter(baseline);disabled=core.advanceWinter(disabled);}
 const compare=structuredClone(disabled);delete compare.weather;
 assert.deepEqual(compare,baseline);
 assert.equal(disabled.events.filter(e=>e.type==='WinterWeatherDetermined').length,0);
});
test('weather save validation rejects missing/current-year mismatch, invalid probabilities and malformed modifiers',()=>{
 const initial=core.createCampaign(32);
 for(const alter of [s=>s.weather.config.profiles.Mild.probabilityBps=2001,s=>s.weather.regions['landing-region'].winter=799,s=>s.weather.config.profiles.Severe.foodProductionBps=-1,s=>s.weather.config.enabled='yes',s=>delete s.weather.regions['landing-region'],s=>s.weather.regions['other']={winter:800,class:'Normal'}]){const bad=structuredClone(initial);alter(bad);assert.throws(()=>core.reconstructState(JSON.stringify(bad)),/weather/i);}
});
test('Normal has neutral modifiers and random/weather progression never depends on wall clocks',()=>{
 const config=forced('Normal');
 const landing={...staticCattle,foundingCoupleChanceBps:0};
 const mechanics={mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0,partnershipChanceBps:0,careerReviewWinters:0};
 const normal=core.advanceWinter(core.createCampaign(32,landing,mechanics,config));
 const off=core.advanceWinter(core.createCampaign(32,landing,mechanics,{enabled:false}));
 assert.deepEqual(normal.stocks,off.stocks);
 assert.deepEqual(normal.landing.cattle,off.landing.cattle);
 for(const id of Object.keys(normal.personas))assert.deepEqual(core.inspectWork(normal,id),core.inspectWork(off,id));
 const before=core.createCampaign(11,{}, {},config);const expected=core.advanceWinter(before);
 const oldNow=Date.now,oldRandom=Math.random;Date.now=()=>{throw new Error('No clocks');};Math.random=()=>{throw new Error('No random');};
 try{assert.deepEqual(core.advanceWinter(core.reconstructState(core.serializeState(before))),expected);}finally{Date.now=oldNow;Math.random=oldRandom;}
});
test('Severe weather leaves calves free until the saved Adult age threshold',()=>{
 const config=forced('Severe');config.profiles.Severe.exposedCattleMortalityBps=0;config.profiles.Severe.tentMortalityBps=0;
 let state=core.createCampaign(32,{...staticCattle,cattleBirthChanceBps:10000},{mortalityBands:[{minAge:0,chanceBps:0}]},config);
 state=core.advanceWinter(state);assert.equal(state.events.filter(e=>e.type==='CattleBorn').length,2);
 state=core.advanceWinter(state);assert.equal(state.events.filter(e=>e.type==='CattleFoodConsumed').at(-1).details.required,9);
 state=core.advanceWinter(state);assert.equal(state.events.filter(e=>e.type==='CattleFoodConsumed').at(-1).details.required,15);
});

test('Harsh Winters stop Food, Materials and cattle production without losing saved progress',()=>{
 const config=forced('Harsh');config.profiles.Harsh.tentMortalityBps=0;config.profiles.Harsh.exposedCattleMortalityBps=0;
 const initial=core.createCampaign(32,{}, {},config);
 const food=Object.values(initial.personas).find(p=>core.inspectWork(initial,p.id).resource==='food');
 const wood=Object.values(initial.personas).find(p=>p.occupation==='woodworker');
 assert.equal(core.inspectWork(initial,food.id).productivityBps,0);
 assert.equal(core.inspectWork(initial,wood.id).productivityBps,0);
 const next=core.applyCommand(core.reconstructState(core.serializeState(initial)),{type:'AdvanceTicks',ticks:999});
 assert.equal(next.stocks.food,initial.stocks.food);assert.equal(next.stocks.materials,initial.stocks.materials);
 assert.equal(next.events.some(e=>e.type==='ResourceProduced'||e.type==='CattleFoodProduced'),false);
});

test('Harsh consumption adds 50% for residents and cattle after save/load, rounding each total up',()=>{
 const config=forced('Harsh');config.profiles.Harsh.tentMortalityBps=0;config.profiles.Harsh.exposedCattleMortalityBps=0;
 const initial=core.createCampaign(32,{...staticCattle,initialFood:100,foundingCoupleChanceBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0,partnershipChanceBps:0},config);
 const next=core.advanceWinter(core.reconstructState(core.serializeState(initial)));
 assert.equal(next.events.filter(e=>e.type==='CattleFoodConsumed').at(-1).details.required,5);
 assert.equal(next.events.filter(e=>e.type==='FoodConsumed').at(-1).details.units,30);
 assert.equal(next.stocks.food,65);
 assert.deepEqual(next,core.advanceWinter(initial));
});
