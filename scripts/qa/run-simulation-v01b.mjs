import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const initial=core.createSettlement(27);
initial.stocks={food:100,materials:100};
for(let n=1;n<=7;n++){
  const id=`resident-${n}`,age=18+n*3;
  initial.personas[id]={...structuredClone(initial.personas.einar),id,name:id,birthWinter:800-age,parentIds:[],partnerId:null,occupation:null,occupationHistory:[],workProgress:0,dna:{...structuredClone(initial.personas.einar.dna),sex:n%2?'female':'male',age}};
  initial.mechanics.people[id]=structuredClone(initial.mechanics.people.einar);
  initial.households.home.memberIds.push(id);
}
let start=core.applyCommand(initial,{type:'AssignOccupation',personaId:'einar',occupation:'farmer'});
start=core.applyCommand(start,{type:'SpecializeBuilding',buildingId:'house',occupation:'farmer'});
start=core.applyCommand(start,{type:'UpgradeBuilding',buildingId:'house'});
const saved=core.serializeState(start);
function run(split=false,resume=false){
  let state=core.reconstructState(saved);const checkpoints=[];
  for(let n=1;n<=50;n++){
    state=split?core.applyCommand(core.applyCommand(state,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863}):core.advanceWinter(state);
    if(resume&&n===25)state=core.reconstructState(core.serializeState(state));
    assert.deepEqual(state.time,{winter:800+n,tick:0});
    assert.ok(Number.isSafeInteger(state.stocks.food)&&state.stocks.food>=0);
    assert.ok(Number.isSafeInteger(state.stocks.materials)&&state.stocks.materials>=0);
    checkpoints.push({winter:state.time.winter,personas:Object.keys(state.personas).length,stocks:state.stocks,buildings:Object.keys(state.buildings).length});
  }
  return {state,checkpoints};
}
const expected=run();
assert.deepEqual(run().state,expected.state);
assert.deepEqual(run(true).state,expected.state);
assert.deepEqual(run(true,true).state,expected.state);
const counts={};for(const event of expected.state.events)counts[event.type]=(counts[event.type]??0)+1;
const report={seed:27,startPersonas:10,winters:50,finalPersonas:Object.keys(expected.state.personas).length,finalStocks:expected.state.stocks,events:counts,sha256:createHash('sha256').update(core.serializeState(expected.state)).digest('hex'),checks:{integerNonnegativeStocks:'PASS',calendar:'PASS',repeatReplay:'PASS',splitReplay:'PASS',midpointSaveReplay:'PASS'},checkpoints:expected.checkpoints};
const output=new URL('../../artifacts/qa/simulation-v01b/',import.meta.url);mkdirSync(output,{recursive:true});
writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');
writeFileSync(new URL('final-state.json',output),core.serializeState(expected.state)+'\n');
console.log(JSON.stringify({...report,checkpoints:undefined},null,2));
