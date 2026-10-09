import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)(process.argv[2]?process.argv[2]+'/playwright':process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1024,height:768}});page.setDefaultTimeout(60000);
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());if(r.url().includes('/ground-materials/'))requests.push(r.url());});
// Select the public pause control before assets finish loading: capture phase is zero.
await page.addInitScript(()=>{const observer=new MutationObserver(()=>{const pause=document.querySelector('#environment-pause');if(pause){pause.checked=true;observer.disconnect();}});observer.observe(document,{childList:true,subtree:true});});
const report=process.env.GROUND_QA_DIR||'docs/qa/ground-terrain-v02/sourced-grass';
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const sample=()=>page.evaluate(()=>new Promise(resolve=>{const stamps=[],start=performance.now();function frame(t){stamps.push(t);if(t-start<10000)return requestAnimationFrame(frame);const gaps=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);resolve({durationMs:t-start,frames:stamps.length,medianFrameMs:gaps[Math.floor(gaps.length/2)],p95FrameMs:gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.95))],renderer:JSON.parse(document.querySelector('#environment-canvas').dataset.metrics)});}requestAnimationFrame(frame);}));
try{
 await mkdir(report,{recursive:true});
 await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:5181')+'/environment-lab');
 await page.locator('#environment-canvas[data-ready=true]').waitFor();
 await openEnvironmentSettings(page);
 assert.match(await page.locator('#environment-status').innerText(),/Ground v0.2/,'the lab renders the ground pass directly');
 assert.equal(await page.locator('#environment-grass').count(),1,'the lab exposes sourced grass structure');
 assert.equal(await page.locator('#environment-grass').isChecked(),false,'ground QA starts without optional GrassField');
 assert.equal(await page.locator('#environment-variant').count(),0,'no comparison UI');
 assert.equal(await page.locator('#environment-quality').inputValue(),'standard');
 for(const name of ['normal.png','roughness.png'])assert.ok(requests.some(url=>url.endsWith(name)),'the published '+name+' loads');
 console.log('Ground material and public controls ready');
 const canvas=page.locator('#environment-canvas');

 const pixels=async()=>canvas.screenshot();
 await settle();const day=await pixels();await page.waitForTimeout(400);assert.ok(day.equals(await pixels()),'paused preview is repeatable');
 await page.screenshot({path:report+'/ground-day.png'});
 await page.locator('#environment-grass').check();await settle();const grassOn=await pixels();await page.locator('#environment-grass').uncheck();await settle();
 assert.ok(!grassOn.equals(await pixels()),'sourced grass contributes visible structure');
 const samples={standard:await sample()};console.log('Standard sample complete');
 await page.selectOption('#environment-light','night');await settle();assert.ok(!day.equals(await pixels()),'night changes visible ground and water');await page.screenshot({path:report+'/ground-night.png'});
 await page.selectOption('#environment-light','day');
 for(const camera of ['overview','water','shore']){
  await page.selectOption('#environment-camera',camera);await settle();const view=await pixels();
  if(camera!=='shore')assert.ok(!day.equals(view),'camera changes the rendered view');
  await page.screenshot({path:report+'/ground-'+camera+'.png'});
 }
 for(const tier of ['low','legacy']){
  await page.selectOption('#environment-quality',tier);
  await page.waitForFunction(t=>document.querySelector('#environment-metrics').textContent.includes(t==='legacy'?'compatibility fallback':'Fjord water · '+t),tier);
  for(let i=0;i<4;i++)await settle();
  samples[tier]=await sample();console.log(tier+' sample complete');
 }
 assert.ok(samples.low.renderer.triangles<samples.standard.renderer.triangles,'Low keeps its lower geometry budget');
 await page.selectOption('#environment-quality','standard');await settle();
 const waterOn=await pixels();await page.locator('#environment-water').uncheck();await settle();
 assert.ok(!waterOn.equals(await pixels()),'water visibility control works with the ground pass');
 await page.locator('#environment-grass').check();await settle();const windPaused=await pixels();await page.locator('#environment-pause').uncheck();await page.waitForTimeout(600);
 assert.ok(!windPaused.equals(await pixels()),'published grass wind moves while water is hidden');
 await page.locator('#environment-pause').check();await page.locator('#environment-water').check();await settle();
 const beforeMotion=await pixels();await page.locator('#environment-pause').uncheck();await page.waitForTimeout(600);
 assert.ok(!beforeMotion.equals(await pixels()),'waves resume');await page.locator('#environment-pause').check();
 assert.deepEqual(errors,[]);
 const baseline=JSON.parse(await readFile('docs/qa/environment-lab/source-baseline.json','utf8'));
 await writeFile(report+'/measurements.json',JSON.stringify({renderer:'Edge headless / SwiftShader software; whole scene, not isolated GPU terrain time',viewport:[1024,768],seed:1983,captureWavePhase:0,samples,pass1:baseline.samples,checks:['published normal and roughness maps load','optional GrassField defaults off; enabling changes visible pixels','no comparison UI','repeatable paused pixels','day/night','near/far presets','Low triangle budget','compatibility fallback','water visibility','grass wind with water hidden','waves resume'],errors},null,2)+'\n');
 console.log('Ground Terrain browser QA passed');
}finally{await browser.close();}
