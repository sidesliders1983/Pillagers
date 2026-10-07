import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const checkpoints=[];
function run(split=false,resume=false,record=false){
  let state=core.createCampaign(32);
  state=core.applyCommand(state,{type:'KeepLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'AdvanceTicks',ticks:321});
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'EstablishFarmyard'});
  for(let n=0;n<50;n++){
    state=split?core.applyCommand(core.applyCommand(state,{type:'AdvanceTicks',ticks:137}),{type:'AdvanceTicks',ticks:863}):core.advanceWinter(state);
    if(n===10)state=core.applyCommand(state,{type:'SlaughterCattle',cattleId:'cattle-3'});
    if(n===25&&resume)state=core.reconstructState(core.serializeState(state));
    assert.ok(Number.isSafeInteger(state.stocks.food)&&state.stocks.food>=0);
    assert.ok(Number.isSafeInteger(state.stocks.materials)&&state.stocks.materials>=0);
    if(record)checkpoints.push({...core.landingSummary(state),tick:state.time.tick,personas:Object.keys(state.personas).length});
  }
  return state;
}
const final=run(false,false,true);assert.deepEqual(run(),final);assert.deepEqual(run(true),final);assert.deepEqual(run(true,true),final);
const events={};for(const e of final.events)events[e.type]=(events[e.type]??0)+1;
const report={seed:32,initial:core.landingSummary(core.createCampaign(32)),final:core.landingSummary(final),finalPersonas:Object.keys(final.personas).length,time:final.time,events,sha256:createHash('sha256').update(core.serializeState(final)).digest('hex'),checks:{repeat:'PASS',splitTicks:'PASS',saveResume:'PASS',integerNonnegativeStocks:'PASS'},checkpoints};
const output=new URL('../../artifacts/qa/the-landing/',import.meta.url);mkdirSync(output,{recursive:true});writeFileSync(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');writeFileSync(new URL('final-state.json',output),core.serializeState(final)+'\n');console.log(JSON.stringify({...report,checkpoints:undefined},null,2));
