import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function runScenario(seed,policy,winters=50){
 let state=core.createCampaign(seed);
 const configuration={landing:structuredClone(state.landing.config),mechanics:structuredClone(state.mechanics.config)};
 if(policy==='farmyard'){
  const founder=Object.keys(state.personas).sort()[0];
  state=core.applyCommand(state,{type:'SalvageLongship',longshipId:'founding-longship'});
  state=core.applyCommand(state,{type:'AssignOccupation',personaId:founder,occupation:'farmer'});
  const household=Object.values(state.households).find(h=>h.memberIds.includes(founder));
  state=core.applyCommand(state,{type:'HouseHousehold',householdId:household.id});
  const farmyardId=core.landingSummary(state).farmyards.find(f=>f.householdId===household.id).id;
  for(const cattleId of Object.keys(state.landing.cattle))state=core.applyCommand(state,{type:'AssignCattle',cattleId,farmyardId});
 }else assert.equal(policy,'outside');
 const annual=[];
 const observe=()=>{
  const animals=Object.values(state.landing.cattle),living=animals.filter(c=>c.deathWinter===null),events=state.events;
  const views=living.map(c=>core.inspectCattle(state,c.id));
  const row={winter:state.time.winter,living:living.length,cows:living.filter(c=>c.sex==='female').length,bulls:living.filter(c=>c.sex==='male').length,young:views.filter(c=>c.stage==='Young').length,youngAdult:views.filter(c=>c.stage==='Young Adult').length,adult:views.filter(c=>c.stage==='Adult').length,sheltered:views.filter(c=>c.sheltered).length,outside:views.filter(c=>!c.sheltered).length,overcrowded:core.landingSummary(state).farmyards.some(f=>f.overcrowding>0)?1:0,births:events.filter(e=>e.type==='CattleBorn').length,deaths:events.filter(e=>e.type==='CattleDied').length,slaughters:events.filter(e=>e.type==='CattleSlaughtered').length,foodProduced:events.filter(e=>e.type==='CattleFoodProduced').reduce((n,e)=>n+e.details.units,0),foodConsumed:events.filter(e=>e.type==='CattleFoodConsumed').reduce((n,e)=>n+e.details.units,0),foodRequired:events.filter(e=>e.type==='CattleFoodConsumed').reduce((n,e)=>n+e.details.required,0)};
  assert.equal(row.living,3+row.births-row.deaths-row.slaughters);
  assert.equal(row.young+row.youngAdult+row.adult,row.living);
  for(const c of animals){if(c.deathWinter!==null)assert.equal(c.farmyardId,null);if(c.origin==='reproduction'){assert.equal(c.parentIds.length,2);assert.ok(c.parentIds.every(id=>state.landing.cattle[id].birthWinter<c.birthWinter));}}
  return row;
 };
 annual.push(observe());
 for(let i=0;i<winters;i++){state=core.advanceWinter(state);if(i===Math.floor(winters/2)-1)state=core.reconstructState(core.serializeState(state));annual.push(observe());}
 return {seed,policy,winters,configuration,annual,finalStateHash:hash(core.serializeState(state)),births:state.events.filter(e=>e.type==='CattleBorn'),deaths:state.events.filter(e=>e.type==='CattleDied')};
}
async function batch(seeds,winters){
 const jobs=Array.from({length:seeds},(_,seed)=>['outside','farmyard'].map(policy=>({seed,policy}))).flat();let completed=0;
 const results=await Promise.all(Array.from({length:Math.min(4,jobs.length)},(_,index)=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{jobs:jobs.filter((_,i)=>i%4===index),winters}});let received=false;
  worker.on('message',m=>{if(m.progress){completed++;if(completed%20===0)console.log(`Completed ${completed}/${jobs.length} scenarios`);}if(m.results){received=true;resolve(m.results);}});
  worker.on('error',reject);worker.on('exit',code=>{if(code||!received)reject(new Error(`Cattle worker exited ${code}`));});
 })));
 return results.flat().sort((a,b)=>a.seed-b.seed||a.policy.localeCompare(b.policy));
}
async function main(){
 const args=process.argv.slice(2),value=(flag,fallback)=>args.includes(flag)?Number(args[args.indexOf(flag)+1]):fallback;
 for(let i=0;i<args.length;i++){if(!['--seeds','--winters','--verify'].includes(args[i]))throw new Error('Unknown option');if(args[i]!=='--verify')i++;}
 const seeds=value('--seeds',100),winters=value('--winters',50);
 if(!Number.isSafeInteger(seeds)||seeds<1||seeds>1000||!Number.isSafeInteger(winters)||winters<1||winters>200)throw new Error('Invalid batch dimensions');
 const results=await batch(seeds,winters),digest=hash(results);let verification='not requested';
 if(args.includes('--verify')){console.log('Repeating complete cattle batch');const repeated=await batch(seeds,winters);assert.deepEqual(repeated,results);verification='PASS: full repeated batch identical';}
 const median=values=>{const s=values.sort((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2;};
 const quantile=(values,q)=>{const s=values.sort((a,b)=>a-b),p=(s.length-1)*q;return s[Math.floor(p)]+(s[Math.ceil(p)]-s[Math.floor(p)])*(p-Math.floor(p));};
 const summary=Object.fromEntries(['outside','farmyard'].map(policy=>{const runs=results.filter(r=>r.policy===policy),final=runs.map(r=>r.annual.at(-1));return [policy,{runs:runs.length,winters,births:final.reduce((n,r)=>n+r.births,0),deaths:final.reduce((n,r)=>n+r.deaths,0),slaughters:final.reduce((n,r)=>n+r.slaughters,0),finalHerdMedian:median(final.map(r=>r.living)),finalHerdP10:quantile(final.map(r=>r.living),.1),finalHerdP90:quantile(final.map(r=>r.living),.9),finalCows:final.reduce((n,r)=>n+r.cows,0),finalBulls:final.reduce((n,r)=>n+r.bulls,0),finalYoung:final.reduce((n,r)=>n+r.young,0),finalYoungAdult:final.reduce((n,r)=>n+r.youngAdult,0),finalAdult:final.reduce((n,r)=>n+r.adult,0),extinctRuns:final.filter(r=>r.living===0).length,overcrowdedWinters:runs.reduce((n,r)=>n+r.annual.slice(1).reduce((a,b)=>a+b.overcrowded,0),0),foodProduced:final.reduce((n,r)=>n+r.foodProduced,0),foodConsumed:final.reduce((n,r)=>n+r.foodConsumed,0),foodRequired:final.reduce((n,r)=>n+r.foodRequired,0)}];}));
 const sourceFiles=dir=>readdirSync(new URL('../../src/'+dir+'/',import.meta.url),{withFileTypes:true}).flatMap(e=>e.isDirectory()?sourceFiles(dir+'/'+e.name):e.name.endsWith('.ts')?[dir+'/'+e.name]:[]);
 const sources=['simulation','characters'].flatMap(sourceFiles).sort();
 const manifest={version:1,seeds:{start:0,count:seeds},winters,runtime:process.version,configuration:results[0].configuration,verification,resultsHash:digest,harnessHash:hash(readFileSync(fileURLToPath(import.meta.url),'utf8')),sourceHash:hash(sources.map(name=>({name,text:readFileSync(new URL('../../src/'+name,import.meta.url),'utf8')}))),sourceFiles:sources,policies:{outside:'No scripted decisions; livestock remains initially unassigned.',farmyard:'Opening salvage, first founder by lexical ID assigned farmer, household housed, all founding livestock assigned. Thereafter canonical autonomy; no replacement or reassignment.'},interpretation:'Descriptive policies, not an isolated shelter experiment: opening housing and occupation also differ. No weather, starvation mortality or kinship restriction. Food baseline unchanged. Midpoint save/load.'};
 const out=new URL('../../artifacts/qa/cattle-lifecycle/',import.meta.url);mkdirSync(out,{recursive:true});
 for(const [name,data] of [['summary',summary],['manifest',manifest]])writeFileSync(new URL(name+'.json',out),JSON.stringify(data,null,2)+'\n');
 writeFileSync(new URL('results.json.gz',out),gzipSync(JSON.stringify(results)+'\n'));
 const fields=Object.keys(results[0].annual[0]);writeFileSync(new URL('trajectory.csv',out),'seed,policy,'+fields.join(',')+'\n'+results.flatMap(r=>r.annual.map(a=>[r.seed,r.policy,...fields.map(k=>a[k])].join(','))).join('\n')+'\n');
 console.log(JSON.stringify({verification,resultsHash:digest,summary},null,2));
}
if(!isMainThread){const results=[];for(const job of workerData.jobs){results.push(runScenario(job.seed,job.policy,workerData.winters));parentPort.postMessage({progress:true});}parentPort.postMessage({results});}
else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();

