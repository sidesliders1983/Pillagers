import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const foodRoles=['farmer','fisher','hunter'];
const uint=(n,label,min=0,max=0xffffffff)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`Invalid ${label}`);};
function observe(state){
  const people=Object.values(state.personas).filter(p=>p.deathWinter===null),config=state.mechanics.config;
  const eligible=people.filter(p=>core.personaAge(state,p.id)>=config.workAge);
  const roles=Object.fromEntries(foodRoles.map(role=>[role,eligible.filter(p=>p.occupation===role).length]));
  const active=eligible.filter(p=>core.inspectWork(state,p.id).reason===null);
  const foodWorkers=active.filter(p=>config.occupations[p.occupation].resource==='food').length;
  const materialsWorkers=active.filter(p=>config.occupations[p.occupation].resource==='materials').length;
  return {winter:state.time.winter,food:state.stocks.food,materials:state.stocks.materials,population:people.length,
    children:people.filter(p=>core.personaAge(state,p.id)<config.foodAdultAge).length,adults:people.filter(p=>core.personaAge(state,p.id)>=config.foodAdultAge).length,
    workAgePopulation:eligible.length,foodWorkers,foodWorkerShare:eligible.length?foodWorkers/eligible.length:0,materialsWorkers,...roles,
    childcareActive:people.filter(p=>core.inspectWork(state,p.id).reason==='childcare').length,
    houses:Object.values(state.buildings).filter(b=>b.kind==='house').length,cattleAlive:Object.values(state.landing.cattle).filter(c=>c.deathWinter===null).length,
    longshipAlive:Object.values(state.landing.longships).some(s=>s.salvagedWinter===null)};
}
/** Observe canonical core events and annual stocks; never inject player decisions. */
export function runScenario({seed,baseline,winters=15,weatherEnabled=true}){
  uint(seed,'seed');uint(baseline,'baseline',1,1000000);uint(winters,'Winters',1,100);
  if(typeof weatherEnabled!=='boolean')throw new Error('Invalid weather option');
  const original=core.createCampaign(seed,{}, {},{enabled:weatherEnabled}),mechanics=structuredClone(original.mechanics.config);
  for(const role of foodRoles)mechanics.occupations[role].unitsPerWinter=baseline;
  let state=core.createCampaign(seed,{},mechanics,{enabled:weatherEnabled});
  const initialObservation=observe(state);
  const assignedFood=Object.values(state.personas).filter(p=>foodRoles.includes(p.occupation)).length;
  const assignedMaterials=Object.values(state.personas).filter(p=>mechanics.occupations[p.occupation]?.resource==='materials').length;
  const initial={...initialObservation,foodWorkers:assignedFood,materialsWorkers:assignedMaterials,inactiveWorkers:initialObservation.population-assignedFood-assignedMaterials,
    foundingCouples:state.events.filter(e=>e.type==='FoundingPartnershipPresent').length,
    founderFingerprint:hash({personas:state.personas,families:state.families,households:state.households,residences:state.residences,landing:state.landing,stocks:state.stocks})};
  const configuration={landing:structuredClone(state.landing.config),mechanics:structuredClone(mechanics),weather:structuredClone(state.weather.config)};
  const annual=[initialObservation];let minimum=state.stocks.food,childcareActiveWinters=0,childcarePersonWinters=0;
  const food={residentProduced:0,cattleProduced:0,residentConsumed:0,cattleConsumed:0,shortageWinters:0,residentShortfall:0,cattleShortfall:0};
  let births=0;
  for(let index=0;index<winters;index++){
    const care=annual.at(-1).childcareActive;childcareActiveWinters+=care>0?1:0;childcarePersonWinters+=care;
    const offset=state.events.length;state=core.advanceWinter(state);const added=state.events.slice(offset);
    let shortage=false;
    for(const event of added){const d=event.details??{};
      if(event.type==='ResourceProduced'&&d.resource==='food')food.residentProduced+=d.units;
      if(event.type==='CattleFoodProduced')food.cattleProduced+=d.units;
      if(event.type==='FoodConsumed'){food.residentConsumed+=d.units;food.residentShortfall+=d.shortfall;shortage||=d.shortfall>0;}
      if(event.type==='CattleFoodConsumed'){food.cattleConsumed+=d.units;food.cattleShortfall+=d.shortfall;shortage||=d.shortfall>0;}
      if(event.type==='ChildBorn')births++;
    }
    // Under this policy consumption is annual and between-boundary Food only increases.
    food.shortageWinters+=shortage?1:0;minimum=Math.min(minimum,state.stocks.food);
    annual.push(observe(state));
    assert.ok(Number.isSafeInteger(state.stocks.food)&&state.stocks.food>=0);assert.ok(Number.isSafeInteger(state.stocks.materials)&&state.stocks.materials>=0);
  }
  food.totalProduced=food.residentProduced+food.cattleProduced;food.totalConsumed=food.residentConsumed+food.cattleConsumed;
  food.minimum=minimum;food.hitZero=minimum===0;food.anyShortage=food.shortageWinters>0;
  assert.equal(state.stocks.food,initial.food+food.totalProduced-food.totalConsumed);
  return {seed,baseline,winters,configuration,initial,annual,checkpoints:Object.fromEntries(annual.filter(a=>[805,810,815].includes(a.winter)).map(a=>[a.winter,a])),food,births,childcareActiveWinters,childcarePersonWinters,
    meanFoodWorkerShare:annual.slice(0,-1).reduce((sum,a)=>sum+a.foodWorkerShare,0)/winters,finalStateHash:hash(core.serializeState(state))};
}
/** Stable baseline/seed ordering is independent of worker scheduling. */
export async function runBatch({seedStart=0,seedCount=100,winters=15,baselines=[4,5,6,7,10],workers=4,onProgress=()=>{}}={}){
  uint(seedStart,'first seed');uint(seedCount,'seed count',1,10000);uint(seedStart+seedCount-1,'last seed');uint(winters,'Winters',1,100);uint(workers,'workers',1,32);
  if(!Array.isArray(baselines)||!baselines.length||new Set(baselines).size!==baselines.length)throw new Error('Invalid baseline list');baselines.forEach(b=>uint(b,'baseline',1,1000000));
  const jobs=[...baselines].sort((a,b)=>a-b).flatMap(baseline=>Array.from({length:seedCount},(_,i)=>({seed:seedStart+i,baseline,winters})));
  if(workers===1)return jobs.map((job,index)=>{const result=runScenario(job);onProgress(index+1,jobs.length);return result;});
  let completed=0;
  const chunks=Array.from({length:Math.min(workers,jobs.length)},(_,i)=>jobs.filter((_,index)=>index%workers===i));
  const results=await Promise.all(chunks.map(chunk=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{calibration:true,jobs:chunk}});let received=false;
    worker.on('message',message=>{if(message.progress){completed+=message.progress;onProgress(completed,jobs.length);}if(message.results){received=true;resolve(message.results);}});
    worker.on('error',reject);worker.on('exit',code=>{if(code!==0||!received)reject(new Error(`Calibration worker exited ${code}`));});
  })));
  return results.flat().sort((a,b)=>a.baseline-b.baseline||a.seed-b.seed);
}
const quantile=(values,q)=>{const v=[...values].sort((a,b)=>a-b),position=(v.length-1)*q,lo=Math.floor(position),hi=Math.ceil(position);return v[lo]+(v[hi]-v[lo])*(position-lo);};
function correlation(rows){const xs=rows.map(r=>r.initial.foodWorkers),ys=rows.map(r=>r.annual.at(-1).food),mean=v=>v.reduce((s,n)=>s+n,0)/v.length,mx=mean(xs),my=mean(ys);let cov=0,xx=0,yy=0;for(let i=0;i<xs.length;i++){cov+=(xs[i]-mx)*(ys[i]-my);xx+=(xs[i]-mx)**2;yy+=(ys[i]-my)**2;}return xx&&yy?cov/Math.sqrt(xx*yy):null;}
export function summarize(results){
  return [...new Set(results.map(r=>r.baseline))].sort((a,b)=>a-b).map(baseline=>{
    const rows=results.filter(r=>r.baseline===baseline),n=rows.length,final=rows.map(r=>r.annual.at(-1)),food=final.map(r=>r.food),median=v=>quantile(v,.5);
    const outliers=[...rows].sort((a,b)=>a.annual.at(-1).food-b.annual.at(-1).food||a.seed-b.seed);
    return {baseline,runs:n,shortagePercent:100*rows.filter(r=>r.food.anyShortage).length/n,zeroPercent:100*rows.filter(r=>r.food.hitZero).length/n,
      foodMedian:median(food),foodP10:quantile(food,.1),foodP90:quantile(food,.9),foodMin:Math.min(...food),foodMax:Math.max(...food),minimumFoodMedian:median(rows.map(r=>r.food.minimum)),
      populationMedian:median(final.map(r=>r.population)),materialsMedian:median(final.map(r=>r.materials)),foodWorkerShareMedian:median(final.map(r=>r.foodWorkerShare)),meanFoodWorkerShareMedian:median(rows.map(r=>r.meanFoodWorkerShare)),birthsMedian:median(rows.map(r=>r.births)),
      cattleProducedMedian:median(rows.map(r=>r.food.cattleProduced)),cattleConsumedMedian:median(rows.map(r=>r.food.cattleConsumed)),childcarePersonWintersMedian:median(rows.map(r=>r.childcarePersonWinters)),initialFoodCountCorrelation:correlation(rows),
      initialMixGroups:[...new Set(rows.map(r=>r.initial.foodWorkers))].sort((a,b)=>a-b).map(count=>{const group=rows.filter(r=>r.initial.foodWorkers===count);return {foodWorkers:count,runs:group.length,foodMedian:median(group.map(r=>r.annual.at(-1).food)),shortagePercent:100*group.filter(r=>r.food.anyShortage).length/group.length};}),
      outliersLow:outliers.slice(0,5).map(r=>({seed:r.seed,food:r.annual.at(-1).food,initialFoodWorkers:r.initial.foodWorkers,shortageWinters:r.food.shortageWinters})),outliersHigh:outliers.slice(-5).reverse().map(r=>({seed:r.seed,food:r.annual.at(-1).food,initialFoodWorkers:r.initial.foodWorkers,shortageWinters:r.food.shortageWinters}))};
  });
}
function csv(results){
  const headers=['baseline','seed','initialFoodWorkers','initialMaterialsWorkers','initialInactiveWorkers','food805','food810','food815','materials805','materials810','materials815','population805','population810','population815','minimumFood','shortageWinters','hitZero','foodProduced','foodConsumed','cattleProduced','cattleConsumed','births','childcarePersonWinters','foodWorkerShare815','meanFoodWorkerShare','finalStateHash'];
  const rows=results.map(r=>[r.baseline,r.seed,r.initial.foodWorkers,r.initial.materialsWorkers,r.initial.inactiveWorkers,...[805,810,815].map(w=>r.checkpoints[w]?.food??''),...[805,810,815].map(w=>r.checkpoints[w]?.materials??''),...[805,810,815].map(w=>r.checkpoints[w]?.population??''),r.food.minimum,r.food.shortageWinters,r.food.hitZero,r.food.totalProduced,r.food.totalConsumed,r.food.cattleProduced,r.food.cattleConsumed,r.births,r.childcarePersonWinters,r.checkpoints[815]?.foodWorkerShare??'',r.meanFoodWorkerShare,r.finalStateHash]);
  return [headers,...rows].map(row=>row.join(',')).join('\n')+'\n';
}
async function main(){
  const args=process.argv.slice(2),value=(flag,fallback)=>{const i=args.indexOf(flag);return i<0?fallback:args[i+1];};
  const known=new Set(['--seed-start','--seeds','--winters','--baselines','--workers','--verify']);
  for(let i=0;i<args.length;i++){if(!known.has(args[i]))throw new Error(`Unknown argument ${args[i]}`);if(args[i]!=='--verify')i++;}
  const settings={seedStart:Number(value('--seed-start',0)),seedCount:Number(value('--seeds',100)),winters:Number(value('--winters',15)),baselines:String(value('--baselines','4,5,6,7,10')).split(',').map(Number),workers:Number(value('--workers',4))};
  const onProgress=(done,total)=>{if(done%25===0||done===total)console.log(`Completed ${done}/${total} campaigns`);};
  const results=await runBatch({...settings,onProgress});const digest=hash(results);let verification='not requested';
  if(args.includes('--verify')){console.log('Repeating full batch for determinism');const repeated=await runBatch({...settings,onProgress});assert.equal(hash(repeated),digest);assert.deepEqual(repeated,results);verification='PASS: full repeated batch identical';}
  const sourceFiles=dir=>readdirSync(new URL('../../src/'+dir+'/',import.meta.url),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(dir+'/'+entry.name):entry.name.endsWith('.ts')?[dir+'/'+entry.name]:[]);
  const sources=['simulation','characters'].flatMap(sourceFiles).sort();
  const sourceHash=hash(sources.map(name=>({name,text:readFileSync(new URL('../../src/'+name,import.meta.url),'utf8')})));
  const configurations=Object.fromEntries(settings.baselines.map(b=>[b,results.find(r=>r.baseline===b).configuration]));
  const manifest={version:1,runtime:process.version,sourceFiles:sources,seedStart:settings.seedStart,seedCount:settings.seedCount,winters:settings.winters,baselines:settings.baselines,policy:'No scripted decisions; retain initial assets and roles, reuse default canonical autonomy, housing and care. No per-baseline optimization.',minimumSampling:'Initial and annual post-boundary stock; Food only increases between boundaries under this policy.',shareDefinition:'Active Food workers / living work-age residents (including temporarily unavailable care providers); average uses Winter-start samples.',childAdultDefinition:'Food consumption threshold (16), not partnership adulthood (18).',sourceHash,harnessHash:hash(readFileSync(fileURLToPath(import.meta.url),'utf8')),resultsHash:digest,verification,configurations};
  const output=new URL('../../artifacts/qa/economy-calibration/',import.meta.url);mkdirSync(output,{recursive:true});
  writeFileSync(new URL('results.json',output),JSON.stringify(results,null,2)+'\n');writeFileSync(new URL('results.csv',output),csv(results));writeFileSync(new URL('manifest.json',output),JSON.stringify(manifest,null,2)+'\n');writeFileSync(new URL('summary.json',output),JSON.stringify(summarize(results),null,2)+'\n');
  console.log(JSON.stringify({resultsHash:digest,verification,summary:summarize(results)},null,2));
}
if(!isMainThread&&workerData?.calibration){const results=[];let pending=0;for(const job of workerData.jobs){results.push(runScenario(job));pending++;if(pending===5){parentPort.postMessage({progress:pending});pending=0;}}if(pending)parentPort.postMessage({progress:pending});parentPort.postMessage({results});}
else if(isMainThread&&process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){await main();}
