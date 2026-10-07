import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {loadTypeScript} from '../load-typescript.mjs';
import {runScenario as economy,summarize} from './run-economy-calibration.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const hash=v=>createHash('sha256').update(v).digest('hex');
export function runWeather({seed,winters=25}){
 let state=core.createCampaign(seed);const policy=seed%2===0?'opening-farmyard':'passive-outside';
 if(policy==='opening-farmyard'){
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:'founder-1',occupation:'farmer'});
  const household=Object.values(state.households).find(h=>h.memberIds.includes('founder-1'));
  state=core.applyCommand(state,{type:'HouseHousehold',householdId:household.id});
  for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId:'house-1'});
 }
 const configuration={landing:structuredClone(state.landing.config),mechanics:structuredClone(state.mechanics.config),weather:structuredClone(state.weather.config)},annual=[];
 for(let i=0;i<winters;i++){
  const weather=core.inspectWeather(state),exposure=core.inspectWeatherExposure(state),startFood=state.stocks.food,offset=state.events.length;
  if(i===Math.floor(winters/2))state=core.reconstructState(core.serializeState(state));
  state=core.advanceWinter(state);const added=state.events.slice(offset);
  const sum=(type,key)=>added.filter(e=>e.type===type).reduce((n,e)=>n+(e.details[key]??0),0);
  const produced=added.filter(e=>e.type==='ResourceProduced'&&e.details.resource==='food').reduce((n,e)=>n+e.details.units,0)+sum('CattleFoodProduced','units');
  const consumed=sum('FoodConsumed','units')+sum('CattleFoodConsumed','units');
  assert.equal(state.stocks.food,startFood+produced-consumed);assert.equal(added.at(-1).type,'WinterWeatherDetermined');
  const deaths=type=>added.filter(e=>e.type===type).map(e=>({sheltered:type==='PersonaDied'?e.details.permanentlySheltered:e.details.sheltered,risk:e.details.mortalityRiskBps,exposure:e.details.weatherExposureBps}));
  annual.push({winter:weather.winter,weather:weather.class,exposedResidents:exposure.residentIds.length,exposedCattle:exposure.cattleIds.length,food:state.stocks.food,materials:state.stocks.materials,produced,consumed,shortfall:sum('FoodConsumed','shortfall')+sum('CattleFoodConsumed','shortfall'),population:Object.values(state.personas).filter(p=>p.deathWinter===null).length,cattle:Object.values(state.landing.cattle).filter(c=>c.deathWinter===null).length,cattleBirths:added.filter(e=>e.type==='CattleBorn').length,residentDeaths:deaths('PersonaDied'),cattleDeaths:deaths('CattleDied')});
 }
 return {seed,policy,configuration,annual,finalStateHash:hash(core.serializeState(state))};
}
function perform(job){return {...(job.kind==='weather'?runWeather(job):economy(job)),kind:job.kind};}
export async function runBatch(jobs,workers=4){
 let done=0;const chunks=Array.from({length:Math.min(workers,jobs.length)},(_,i)=>jobs.filter((_,n)=>n%workers===i));
 const results=await Promise.all(chunks.map(chunk=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{weatherRisk:true,jobs:chunk}});let received=false;
  worker.on('message',m=>{if(m.progress){done++;if(done%10===0)console.log(`${done}/${jobs.length} scenarios`);}if(m.results){received=true;resolve(m.results);}});
  worker.on('error',reject);worker.on('exit',code=>{if(code||!received)reject(new Error(`Worker exited ${code}`));});
 })));
 return results.flat().sort((a,b)=>a.kind.localeCompare(b.kind)||a.seed-b.seed);
}
if(!isMainThread&&workerData?.weatherRisk){const results=[];for(const job of workerData.jobs){results.push(perform(job));parentPort.postMessage({progress:true});}parentPort.postMessage({results});}
if(isMainThread&&process.argv[1]===fileURLToPath(import.meta.url)){
 const jobs=Array.from({length:100},(_,seed)=>[{kind:'weather',seed,winters:25},{kind:'economy-on',seed,baseline:10,winters:15,weatherEnabled:true},{kind:'economy-off',seed,baseline:10,winters:15,weatherEnabled:false}]).flat();
 const started=new Date().toISOString(),source={};
 function fingerprint(directory){for(const entry of readdirSync(new URL('../../'+directory+'/',import.meta.url),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=directory+'/'+entry.name;if(entry.isDirectory())fingerprint(path);else if(/\.(ts|mjs)$/.test(path))source[path]=hash(readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'));}}
 for(const dir of ['src/simulation','src/characters','scripts/qa'])fingerprint(dir);
 console.log('First measurement batch');const results=await runBatch(jobs);console.log('Full deterministic repeat');assert.deepEqual(await runBatch(jobs),results);
 const rows=results.filter(r=>r.kind==='weather').flatMap(r=>r.annual.map(a=>({...a,seed:r.seed,policy:r.policy})));
 const deaths=(rows,key)=>({sheltered:rows.flatMap(r=>r[key]).filter(d=>d.sheltered).length,exposed:rows.flatMap(r=>r[key]).filter(d=>!d.sheltered).length});
 const weather=core.weatherClasses.map(kind=>{const group=rows.filter(r=>r.weather===kind);return {class:kind,winters:group.length,frequencyPercent:100*group.length/rows.length,shortageWinters:group.filter(r=>r.shortfall>0).length,residentDeaths:deaths(group,'residentDeaths'),cattleDeaths:deaths(group,'cattleDeaths')};});
 const summary={status:'PASS',scenarios:300,fullRepeat:true,resolvedWeatherWinters:rows.length,weather,economyOn:summarize(results.filter(r=>r.kind==='economy-on')),economyOff:summarize(results.filter(r=>r.kind==='economy-off')),policies:['opening-farmyard','passive-outside'].map(policy=>{const group=results.filter(r=>r.kind==='weather'&&r.policy===policy);return {policy,runs:group.length,extinctCattle:group.filter(r=>r.annual.at(-1).cattle===0).length,residentDeaths:deaths(group.flatMap(r=>r.annual),'residentDeaths'),cattleDeaths:deaths(group.flatMap(r=>r.annual),'cattleDeaths')};})};
 const out=new URL('../../artifacts/qa/winter-weather/',import.meta.url);mkdirSync(out,{recursive:true});writeFileSync(new URL('results.json.gz',out),gzipSync(JSON.stringify(results)));writeFileSync(new URL('summary.json',out),JSON.stringify(summary,null,2));
 writeFileSync(new URL('manifest.json',out),JSON.stringify({started,completed:new Date().toISOString(),node:process.version,seeds:[0,99],weatherWinters:25,economyWinters:15,baseline:10,workers:4,fullRepeat:true,hashNormalization:'UTF-8 with LF',source,resultsHash:hash(JSON.stringify(results)),configuration:results.find(r=>r.kind==='weather').configuration,policy:'Even seeds salvage ship, house founder-1 as farmer and assign all founding cattle; odd seeds are passive. No subsequent decisions.'},null,2));
 const columns=['seed','policy','winter','weather','food','materials','population','cattle','produced','consumed','shortfall','exposedResidents','exposedCattle','cattleBirths'];writeFileSync(new URL('annual.csv',out),columns.join(',')+'\n'+rows.map(r=>columns.map(c=>r[c]).join(',')).join('\n')+'\n');console.log(JSON.stringify(summary,null,2));
}
