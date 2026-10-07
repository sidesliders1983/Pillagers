import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const bands=[0,16,50,60,70,80,90];
const ageBand=age=>[...bands].reverse().find(min=>min<=age);
const quantile=(values,q)=>{if(!values.length)return null;const v=[...values].sort((a,b)=>a-b),p=(v.length-1)*q;return v[Math.floor(p)]+(v[Math.ceil(p)]-v[Math.floor(p)])*(p-Math.floor(p));};
export function runScenario(seed,winters=50){
 let state=core.createCampaign(seed);
 const founders=new Set(Object.keys(state.personas)),annual=[];
 const configuration={mechanics:structuredClone(state.mechanics.config),landing:structuredClone(state.landing.config)};
 const observe=()=>{
  const living=Object.values(state.personas).filter(p=>p.deathWinter===null);
  return {winter:state.time.winter,population:living.length,children:living.filter(p=>core.personaAge(state,p.id)<16).length,livingFounders:living.filter(p=>founders.has(p.id)).length,births:state.events.filter(e=>e.type==='ChildBorn').length,deaths:state.events.filter(e=>e.type==='PersonaDied').length,food:state.stocks.food,materials:state.stocks.materials,houses:Object.keys(state.buildings).length};
 };
 annual.push(observe());
 for(let i=0;i<winters;i++){
  try{state=core.advanceWinter(state);}catch(error){throw new Error(`Seed ${seed}, incoming Winter ${state.time.winter+1}: ${error.message}`,{cause:error});}
  if(i===Math.floor(winters/2)-1)state=core.reconstructState(core.serializeState(state));
  annual.push(observe());
 }
 const deaths=state.events.filter(e=>e.type==='PersonaDied').map(e=>({personaId:e.personaId,name:state.personas[e.personaId].name,winter:e.time.winter,age:e.details.age,ageBand:ageBand(e.details.age),founder:founders.has(e.personaId)}));
 assert.equal(annual.at(-1).population,founders.size+annual.at(-1).births-deaths.length);
 for(const d of deaths){const p=state.personas[d.personaId];assert.equal(p.deathWinter,d.winter);assert.equal(core.personaAge(state,p.id),d.age);assert.equal(p.occupation,null);assert.equal(p.partnerId,null);assert.ok(Object.values(state.households).every(h=>!h.memberIds.includes(p.id)));}
 return {seed,winters,configuration,annual,deaths,finalStateHash:hash(core.serializeState(state))};
}
async function batch(seeds,winters){
 let completed=0;
 const chunks=Array.from({length:Math.min(4,seeds)},(_,index)=>Array.from({length:seeds},(_,seed)=>seed).filter(seed=>seed%4===index));
 const results=await Promise.all(chunks.map(chunk=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{seeds:chunk,winters}});let received=false;
  worker.on('message',m=>{if(m.progress){completed++;if(completed%10===0||completed===seeds)console.log(`Completed ${completed}/${seeds} seeds`);}if(m.results){received=true;resolve(m.results);}});
  worker.on('error',reject);worker.on('exit',code=>{if(code||!received)reject(new Error(`Mortality worker exited ${code}`));});
 })));
 return results.flat().sort((a,b)=>a.seed-b.seed);
}
async function main(){
 const args=process.argv.slice(2),get=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:Number(args[i+1]);};
 for(let i=0;i<args.length;i++){if(!['--seeds','--winters','--verify'].includes(args[i]))throw new Error('Unknown option');if(args[i]!=='--verify')i++;}
 const seeds=get('--seeds',100),winters=get('--winters',50);
 if(!Number.isSafeInteger(seeds)||seeds<1||seeds>1000||!Number.isSafeInteger(winters)||winters<1||winters>200)throw new Error('Invalid batch dimensions');
 const results=await batch(seeds,winters),digest=hash(results);let verification='not requested';
 if(args.includes('--verify')){console.log('Repeating complete mortality batch');const repeated=await batch(seeds,winters);assert.equal(hash(repeated),digest);assert.deepEqual(repeated,results);verification='PASS: full repeated batch identical';}
 const deaths=results.flatMap(r=>r.deaths),ages=deaths.map(d=>d.age),founderAges=deaths.filter(d=>d.founder).map(d=>d.age);
 const distribution=values=>({n:values.length,p10:quantile(values,.1),median:quantile(values,.5),p90:quantile(values,.9)});
 const summary={runs:seeds,winters,births:results.reduce((sum,r)=>sum+r.annual.at(-1).births,0),deaths:deaths.length,childDeaths:deaths.filter(d=>d.age<16).length,adultDeaths:deaths.filter(d=>d.age>=16).length,deathsByAgeBand:Object.fromEntries(bands.map(min=>[min,deaths.filter(d=>d.ageBand===min).length])),observedAgeAtDeath:distribution(ages),observedFounderAgeAtDeath:distribution(founderAges),trajectory:Array.from({length:winters+1},(_,i)=>{const rows=results.map(r=>r.annual[i]);return {winter:800+i,populationP10:quantile(rows.map(r=>r.population),.1),populationMedian:quantile(rows.map(r=>r.population),.5),populationP90:quantile(rows.map(r=>r.population),.9),livingFoundersMedian:quantile(rows.map(r=>r.livingFounders),.5),totalLivingFounders:rows.reduce((sum,r)=>sum+r.livingFounders,0),birthsMedian:quantile(rows.map(r=>r.births),.5),deathsMedian:quantile(rows.map(r=>r.deaths),.5)};})};
 const sourceFiles=dir=>readdirSync(new URL('../../src/'+dir+'/',import.meta.url),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(dir+'/'+entry.name):entry.name.endsWith('.ts')?[dir+'/'+entry.name]:[]);
 const sources=['simulation','characters'].flatMap(sourceFiles).sort();
 const manifest={version:1,seeds:{start:0,count:seeds},winters,runtime:process.version,configuration:results[0].configuration,policy:'No scripted decisions; default Landing assets, Food baseline 10 and canonical autonomy; midpoint save/load; no survival optimization.',ageDefinition:'birthWinter-derived age at incoming Winter; deaths precede consumption/upkeep/partnerships/births.',censoring:'Age-at-death percentiles include observed deaths only; survivors are right-censored and founders enter at their initial age. Not life expectancy.',verification,resultsHash:digest,harnessHash:hash(readFileSync(fileURLToPath(import.meta.url),'utf8')),sourceHash:hash(sources.map(name=>({name,text:readFileSync(new URL('../../src/'+name,import.meta.url),'utf8')}))),sourceFiles:sources};
 const output=new URL('../../artifacts/qa/persona-mortality/',import.meta.url);mkdirSync(output,{recursive:true});
 for(const [name,data]of [['results',results],['summary',summary],['manifest',manifest]])writeFileSync(new URL(name+'.json',output),JSON.stringify(data,null,2)+'\n');
 const header='seed,winter,population,children,livingFounders,births,deaths,food,materials,houses';
 writeFileSync(new URL('trajectory.csv',output),header+'\n'+results.flatMap(r=>r.annual.map(a=>[r.seed,a.winter,a.population,a.children,a.livingFounders,a.births,a.deaths,a.food,a.materials,a.houses].join(','))).join('\n')+'\n');
 writeFileSync(new URL('deaths.csv',output),'seed,personaId,winter,age,ageBand,founder\n'+results.flatMap(r=>r.deaths.map(d=>[r.seed,d.personaId,d.winter,d.age,d.ageBand,d.founder].join(','))).join('\n')+'\n');
 console.log(JSON.stringify({verification,resultsHash:digest,summary:{...summary,trajectory:summary.trajectory.filter(t=>(t.winter-800)%10===0)}},null,2));
}
if(!isMainThread){const results=[];for(const seed of workerData.seeds){results.push(runScenario(seed,workerData.winters));parentPort.postMessage({progress:true});}parentPort.postMessage({results});}
else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
