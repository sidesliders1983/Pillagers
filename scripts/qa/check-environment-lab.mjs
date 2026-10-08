import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({channel:process.env.QA_BROWSER_CHANNEL||'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1024,height:768}});page.setDefaultTimeout(60000);
const errors=[];page.on('response',r=>{if(r.status()>=400)console.log('HTTP '+r.status()+' '+r.url());});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const reportPath='docs/qa/environment-lab';
const url=process.env.PROTOTYPE_URL||'http://127.0.0.1:5181';
const sample=async()=>page.evaluate(()=>new Promise(resolve=>{const stamps=[];const start=performance.now();function frame(t){stamps.push(t);if(t-start<10000)return requestAnimationFrame(frame);const gaps=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);resolve({durationMs:t-start,frames:stamps.length,medianFrameMs:gaps[Math.floor(gaps.length/2)],p95FrameMs:gaps[Math.min(gaps.length-1,Math.floor(gaps.length*.95))],renderer:JSON.parse(document.querySelector('#environment-canvas').dataset.metrics)});}requestAnimationFrame(frame);}));
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const metrics=()=>page.locator('#environment-metrics').innerText();
const settledMetrics=async()=>{for(let i=0;i<6;i++)await settle();await page.waitForTimeout(1200);return metrics();};
const triangles=text=>Number(text.match(/([\d.,]+) triangles/)[1].replace(/[.,]/g,''));
try{
 await mkdir(reportPath,{recursive:true});
 console.log('Opening lab');await page.goto(url+'/environment-lab');await page.waitForSelector('#environment-canvas[data-ready="true"]',{timeout:60000});
 assert.equal(await page.locator('#environment-variant').count(),0,'the lab must open the new water without a comparison control');
 assert.equal(await page.locator('#environment-quality').inputValue(),'standard');
 assert.match(await page.locator('#environment-status').innerText(),/boona13\/threejs-grass-water-shaders/, 'the lab identifies the selected sourced water implementation');
 console.log('Lab ready');const canvas=page.locator('#environment-canvas');const capture=async()=>page.screenshot({clip:await canvas.boundingBox()});
 await page.locator('#environment-pause').check();await settle();const paused=await capture();await page.waitForTimeout(400);assert.ok(paused.equals(await capture()),'paused water must hold its visible phase');
 await page.locator('#environment-pause').uncheck();await page.waitForTimeout(600);assert.ok(!paused.equals(await capture()),'water must visibly move after resume');await page.locator('#environment-pause').check();await settle();
 await page.screenshot({path:reportPath+'/source-water-day.png'});const day=await capture();await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.includes('triangles'));const standard=await settledMetrics();console.log('Standard capture');const standardSample=await sample();
 await page.selectOption('#environment-light','night');await settle();assert.ok(!day.equals(await capture()),'night lighting must change the rendered scene');await page.screenshot({path:reportPath+'/source-water-night.png'});
 await page.selectOption('#environment-light','day');
 for(const camera of ['overview','water','shore']){await page.selectOption('#environment-camera',camera);await settle();await page.screenshot({path:reportPath+'/source-water-'+camera+'.png'});}
 await page.selectOption('#environment-quality','low');await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.startsWith('Fjord water · low'));const low=await settledMetrics();console.log('Low quality');const lowSample=await sample();assert.ok(triangles(low)<triangles(standard),'Low quality must lower rendered triangles');assert.equal(await page.locator('#environment-camera').inputValue(),'shore');
 await page.selectOption('#environment-quality','legacy');await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.includes('compatibility fallback'));const fallback=await settledMetrics();console.log('Compatibility');const fallbackSample=await sample();assert.equal(await page.locator('#environment-camera').inputValue(),'shore');
 await page.selectOption('#environment-quality','standard');await settle();const waterOn=await capture();await page.locator('#environment-water').uncheck();await settle();assert.ok(!waterOn.equals(await capture()),'water toggle must hide the surface');await page.locator('#environment-water').check();
 await page.goto(url+'/play');await page.waitForSelector('#play-root',{timeout:60000});assert.ok((await page.locator('#play-root').innerText()).length>100);
 await page.goto(url+'/');await page.waitForFunction(()=>document.querySelector('#world')?.dataset.interactions,{timeout:60000});assert.equal(await page.locator('#world').getAttribute('data-character-source'),'meshy');
 assert.deepEqual(errors,[]);await writeFile(reportPath+'/source-baseline.json',JSON.stringify({renderer:'Chromium headless / SwiftShader software rendering; frame times are not a hardware benchmark',viewport:[1024,768],standard,low,fallback,samples:{standard:standardSample,low:lowSample,fallback:fallbackSample},checks:['no comparison control','visible wave pause/resume','day/night','three camera presets','lower triangle count at Low quality','compatibility fallback','water visibility','latest main settlement route','Meshy Fjordside'],errors},null,2));
 console.log('Environment Lab UI, water behavior and rebased settlement/Fjordside routes passed.');
}catch(error){console.log(JSON.stringify({error:String(error),errors,body:(await page.locator('body').innerText()).slice(-1000)}));throw error;}finally{await browser.close();}
