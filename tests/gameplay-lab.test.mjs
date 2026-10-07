import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTypeScript} from '../scripts/load-typescript.mjs';
const {GameplaySession}=loadTypeScript(new URL('../src/gameplay-lab/GameplaySession.ts',import.meta.url));
const core=loadTypeScript(new URL('../src/simulation/SimulationCore.ts',import.meta.url));
test('Lab pacing turns active elapsed time into explicit ticks and pause prevents progression',()=>{
  const lab=new GameplaySession(32);
  const initial=lab.snapshot();
  lab.elapse(60000);assert.deepEqual(lab.snapshot(),initial);
  lab.setMinutesPerWinter(1);lab.setRunning(true);lab.elapse(60000);
  assert.deepEqual(lab.snapshot(),core.advanceWinter(initial));
  lab.setRunning(false);lab.elapse(300000);assert.equal(lab.snapshot().time.winter,801);
  lab.setMinutesPerWinter(3);lab.setRunning(true);lab.elapse(90000);assert.equal(lab.snapshot().time.tick,500);
  lab.setMinutesPerWinter(5);lab.elapse(150000);assert.deepEqual(lab.snapshot().time,{winter:802,tick:0});
});
test('Lab commands use core state, expose stock changes and save/load resumes paused without offline progress',()=>{
  const lab=new GameplaySession(32),initial=lab.snapshot();
  lab.command({type:'SalvageLongship',longshipId:'founding-longship'});
  assert.deepEqual(lab.snapshot(),core.applyCommand(initial,{type:'SalvageLongship',longshipId:'founding-longship'}));
  assert.deepEqual(lab.trend,{food:0,materials:20});
  lab.setRunning(true);lab.elapse(1234);
  const saved=lab.saveJSON(),expected=lab.snapshot();
  lab.loadJSON(saved);assert.equal(lab.running,false);lab.elapse(999999);assert.deepEqual(lab.snapshot(),expected);
  assert.throws(()=>lab.loadJSON('{invalid'));assert.deepEqual(lab.snapshot(),expected);
  assert.throws(()=>lab.loadJSON(core.serializeState(core.createFixtureClan(1))));
  const detached=lab.snapshot();detached.stocks.food=999;assert.deepEqual(lab.snapshot(),expected);
  lab.newCampaign(99);assert.deepEqual(lab.snapshot(),core.createCampaign(99));assert.equal(lab.running,false);
});
test('public work inspection matches canonical productivity and care blocking without changing state',()=>{
  const state=core.createSettlement(27,{fertilityChanceBps:0,partnershipChanceBps:0,careerReviewWinters:0});
  state.personas.einar.dna.traits={physicality:.7,agility:.6,intelligence:.6,cunning:.35,temperament:.25};
  const assigned=core.applyCommand(state,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'});
  assert.equal(core.inspectWork(assigned,'einar').aptitudeBps,10000);
  assert.equal(core.inspectWork(assigned,'einar').productivityBps,10000);
  const tent=core.applyCommand(assigned,{type:'AssignResidence',householdId:'home',residenceId:null});
  assert.equal(core.inspectWork(tent,'einar').productivityBps,5000);
  const mother=core.applyCommand(assigned,{type:'AssignOccupation',personaId:'liv',occupation:'farmer'});
  assert.equal(core.inspectWork(mother,'liv').productivityBps,0);
  assert.equal(core.inspectWork(mother,'liv').reason,'childcare');
  const before=core.serializeState(tent);core.inspectWork(tent,'einar');assert.equal(core.serializeState(tent),before);
});


test('restart resets the campaign with the same founders or a fresh seed, including after loading a save',()=>{
  const lab=new GameplaySession(32),initial=lab.snapshot();
  lab.command({type:'SalvageLongship',longshipId:'founding-longship'});lab.command({type:'AdvanceWinter'});
  lab.setRunning(true);lab.elapse(50);lab.loadJSON(lab.saveJSON());
  lab.restartCampaign(true,()=>{throw new Error('Same founders must not draw randomness');});
  assert.deepEqual(lab.snapshot(),initial);assert.equal(lab.running,false);assert.deepEqual(lab.trend,{food:0,materials:0});
  lab.restartCampaign(false,()=>99);
  assert.deepEqual(lab.snapshot(),core.createCampaign(99));assert.notDeepEqual(lab.snapshot().personas,initial.personas);
  lab.restartCampaign(false,()=>99);
  assert.notEqual(lab.snapshot().seed,99);assert.deepEqual(lab.snapshot().time,{winter:800,tick:0});
});


test('one- and five-minute cycles with speed changes and clickable core decisions yield identical state and history',()=>{
  const fast=new GameplaySession(32),slow=new GameplaySession(32);
  fast.setMinutesPerWinter(1);slow.setMinutesPerWinter(5);
  fast.setRunning(true);slow.setRunning(true);
  fast.elapse(30000);slow.elapse(150000);
  assert.deepEqual(fast.snapshot().time,{winter:800,tick:500});assert.deepEqual(slow.snapshot(),fast.snapshot());
  const commands=[
    {type:'SalvageLongship',longshipId:'founding-longship'},
    {type:'BuildHouse',householdId:'founder-1'},
    {type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'},
    {type:'AssignCattle',cattleId:'cattle-1',farmyardId:'house-1'},
  ];
  let expected=fast.snapshot();
  for(const command of commands){expected=core.applyCommand(expected,command);fast.command(command);slow.command(command);}
  fast.setMinutesPerWinter(5);slow.setMinutesPerWinter(1);
  assert.deepEqual(fast.snapshot(),expected);assert.deepEqual(slow.snapshot(),expected);
  fast.elapse(150000);slow.elapse(30000);
  expected=core.applyCommand(expected,{type:'AdvanceTicks',ticks:500});
  assert.deepEqual(fast.snapshot(),expected);assert.deepEqual(slow.snapshot(),expected);
  assert.deepEqual(core.reconstructState(fast.saveJSON()),expected);
});
