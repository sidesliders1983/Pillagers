import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import {chromium,openStudy,generate,variant,light,fixture,canvas,settle,exportBlueprint,digest,origin} from './sand-study-browser.mjs';
const root='docs/qa/generated-sand-resolution/post-main71';
await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1640,height:1400},deviceScaleFactor:1});
const errors=[],pairs=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await openStudy(page);
 for(const seed of [17,91]) {
  if(seed!==17)await generate(page,seed);
  await light(page,'low-sun');
  await page.selectOption('#environment-camera','sand-shore');
  await settle(page);
  const blueprint=await exportBlueprint(page);
  assert.equal(blueprint.sha256,digest(await readFile('docs/qa/generated-sand-resolution/blueprint-'+seed+'.json')));
  const shots=[];
  for(const pixels of [256,512]) {
   await variant(page,pixels);
   const data=await fixture(page);
   const sand=data.ground.maps.find(m=>m.id==='Ground054');
   assert.ok(sand.textures.every(t=>t.width===pixels&&t.height===pixels));
   const file=seed+'-'+pixels+'.webp';
   await sharp(await canvas(page).screenshot()).webp({quality:92}).toFile(root+'/'+file);
   shots.push({file,...data});
  }
  assert.deepEqual(shots[0].fixture.camera,shots[1].fixture.camera);
  assert.deepEqual(shots[0].fixture.lightSettings,shots[1].fixture.lightSettings);
  assert.deepEqual(shots[0].water,shots[1].water);
  assert.deepEqual(shots[0].actors,shots[1].actors);
  pairs.push({seed,blueprintSha256:blueprint.sha256,shots});
 }
 assert.deepEqual(errors,[]);
 const sources=['src/environment-lab/LabWorldGeneration.ts','src/world/WorldGroundMaterials.ts','src/characters/MeshyHuman.ts'];
 const runtimeSources=[];
 for(const file of sources)runtimeSources.push({file,lfSha256:digest((await readFile(file,'utf8')).replace(/\r\n/g,'\n'))});
 await writeFile(root+'/evidence.json',JSON.stringify({testedRuntimeCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrationMain:'80a862a00c3ee7b3c3cdf5a103ad78a3b71eefa2',origin,runtimeSources,pairs,errors,notes:'Post-main71 production A/B smoke. Earlier 76 images and timing remain historical controlled #80-baseline evidence; the newer actor runtime is not represented by those timing numbers.'},null,2)+'\n');
 console.log('PASS: post-main71 production A/B, both unchanged exported blueprints, decoded dimensions, camera/light/water/actors and no errors.');
} finally {await browser.close();}
