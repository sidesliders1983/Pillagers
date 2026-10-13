import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './load-source.mjs';

test('asynchronous generation keeps the canonical blueprint and exposes only bounded terrain previews', async()=>{
 const {runGenerationTask}=load('../src/world-generation/GenerationTask.ts');
 const {generateWorld}=load('../src/world-generation/GenerateWorld.ts');
 const request={kind:'world',config:{seed:42,conifers:'ez-tree',environment:{version:1}}};
 const messages=[];
 const result=runGenerationTask(request,event=>messages.push(event));
 assert.deepEqual(result.world,generateWorld(request.config));
 assert.equal(result.plan,undefined);
 const previews=messages.filter(e=>e.type==='preview').map(e=>e.preview);
 assert.ok(previews.length>=1);
 for(const p of previews){
  assert.deepEqual(Object.keys(p).sort(),['bounds','columns','ground','heights','rows','waterLevel'].sort());
  assert.ok(p.columns<=128&&p.rows<=128);
  assert.equal(p.heights.length,p.columns*p.rows);
  assert.ok(p.heights.byteLength+p.ground.byteLength<=128*128*5);
 }
 assert.ok(messages.some(e=>e.type==='phase'));
 assert.ok(messages.some(e=>e.type==='timing'&&e.milliseconds>=0));
});

test('superseding, cancellation, worker errors and timeout cannot publish stale results', async()=>{
 const {GenerationClient}=load('../src/world-generation/GenerationClient.ts');
 const ports=[];
 const client=new GenerationClient(()=>{const port={postMessage(m){this.request=m;},terminate(){this.terminated=true;},onmessage:null,onerror:null};ports.push(port);return port;},1000);
 const task={kind:'world',config:{seed:42}};
 const progress=[];
 const first=client.generate(task,e=>progress.push(e));
 const rejected=assert.rejects(first,{name:'AbortError'});
 const second=client.generate(task,e=>progress.push(e));
 await rejected;
 assert.equal(ports[0].terminated,true);
 ports[0].onmessage({data:{id:ports[0].request.id,type:'phase',stage:'stale'}});
 assert.deepEqual(progress,[]);
 ports[1].onmessage({data:{id:ports[1].request.id,type:'result',result:{world:'current'}}});
 assert.deepEqual(await second,{world:'current'});
 assert.equal(ports[1].terminated,true);
 const cancelled=client.generate(task);
 const cancelRejection=assert.rejects(cancelled,{name:'AbortError'});
 client.cancel(); await cancelRejection;
 const failed=client.generate(task);const failRejection=assert.rejects(failed,/worker failed/);
 ports.at(-1).onerror({message:'worker failed',preventDefault(){}});await failRejection;
 const slow=new GenerationClient(()=>({postMessage(){},terminate(){},onmessage:null,onerror:null}),5);
 await assert.rejects(slow.generate(task),/timed out/);
 slow.dispose();client.dispose();
 await assert.rejects(client.generate(task),/disposed/);
 const unavailable=new GenerationClient(()=>{throw new Error('blocked');});
 await assert.rejects(unavailable.generate(task),/blocked/);
});

test('a worker-produced campaign keeps the pinned island recipe, foundations and save identity', async()=>{
 const {adoptCampaignIsland,createCampaignIsland,campaignIslandPlan}=load('../src/fjord-play/CampaignIsland.ts');
 assert.equal(typeof adoptCampaignIsland,'function');
 const {Worker}=await import('node:worker_threads');
 const {createHash}=await import('node:crypto');
 const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const worker=new Worker(new URL('./fixtures/generation-worker.mjs',import.meta.url));
 const result=await new Promise((resolve,reject)=>{
  worker.on('message',m=>{if(m.type==='result')resolve(m.result);if(m.type==='error')reject(new Error(m.message));});worker.on('error',reject);
  worker.postMessage({kind:'campaign',seed:32});
 }).finally(()=>worker.terminate());
 const expected=createCampaignIsland(32);
 assert.equal(digest(result.world),digest(expected));
 assert.deepEqual(result.plan,campaignIslandPlan(expected));
 adoptCampaignIsland(32,result.world,result.plan);
 assert.equal(createCampaignIsland(32),result.world);
 assert.ok(Object.isFrozen(result.world.terrain.heights));
 assert.equal(campaignIslandPlan(result.world).recipe.version,'island-pool-v1');
 assert.throws(()=>adoptCampaignIsland(1,result.world,{...result.plan,recipe:{...result.plan.recipe,seed:999}}),/recipe/);
});

test('yielding scene geometry preserves the canonical terrain mesh',async()=>{
 const {createBlueprintTerrain,createBlueprintTerrainAsync,disposeBlueprintTerrain}=load('../src/world/BlueprintTerrain.ts');
 assert.equal(typeof createBlueprintTerrainAsync,'function');
 const {generateWorld}=load('../src/world-generation/GenerateWorld.ts');
 const {MeshStandardMaterial}=await import('three');
 const sources=new Map(['Ground037','Ground054','grass_path_2','mossy_rock'].map(id=>[id,new MeshStandardMaterial({name:id})]));
 const world=generateWorld({seed:42,environment:{version:1}});
 const sync=createBlueprintTerrain(world,sources,'none',undefined,'zoned');
 let yields=0;
 const asyncMesh=await createBlueprintTerrainAsync(world,sources,'none',undefined,'zoned',false,async()=>{yields++;});
 assert.ok(yields>1);
 for(const name of Object.keys(sync.geometry.attributes))assert.deepEqual(asyncMesh.geometry.attributes[name].array,sync.geometry.attributes[name].array);
 assert.deepEqual(asyncMesh.geometry.groups,sync.geometry.groups);
 assert.deepEqual(asyncMesh.geometry.index.array,sync.geometry.index.array);
 for(let i=1;i<sync.material.length;i++)assert.deepEqual(asyncMesh.material[i].alphaMap.image.data,sync.material[i].alphaMap.image.data);
 disposeBlueprintTerrain(sync);disposeBlueprintTerrain(asyncMesh);for(const material of sources.values())material.dispose();
});
