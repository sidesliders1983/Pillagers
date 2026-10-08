import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const reportPath='docs/qa/environment-lab';
const url=process.env.PROTOTYPE_URL||'http://127.0.0.1:5181';
const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const metrics=()=>page.locator('#environment-metrics').innerText();
const settledMetrics=async()=>{for(let i=0;i<6;i++)await settle();await page.waitForTimeout(1200);return metrics();};
const triangles=text=>Number(text.match(/([\d,]+) triangles/)[1].replaceAll(',',''));
try{
 await mkdir(reportPath,{recursive:true});
 await page.goto(url+'/environment-lab');await page.waitForSelector('#environment-canvas[data-ready="true"]',{timeout:60000});
 assert.equal(await page.locator('#environment-variant').count(),0,'the lab must open the new water without a comparison control');
 assert.equal(await page.locator('#environment-quality').inputValue(),'standard');
 const canvas=page.locator('#environment-canvas');
 await page.locator('#environment-pause').check();await settle();const paused=await canvas.screenshot();await page.waitForTimeout(400);assert.ok(paused.equals(await canvas.screenshot()),'paused water must hold its visible phase');
 await page.locator('#environment-pause').uncheck();await page.waitForTimeout(600);assert.ok(!paused.equals(await canvas.screenshot()),'water must visibly move after resume');await page.locator('#environment-pause').check();await settle();
 await page.screenshot({path:reportPath+'/fjord-water-day.png'});const day=await canvas.screenshot();await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.includes('triangles'));const standard=await settledMetrics();
 await page.selectOption('#environment-light','night');await settle();assert.ok(!day.equals(await canvas.screenshot()),'night lighting must change the rendered scene');await page.screenshot({path:reportPath+'/fjord-water-night.png'});
 await page.selectOption('#environment-light','day');
 for(const camera of ['overview','water','shore']){await page.selectOption('#environment-camera',camera);await settle();await page.screenshot({path:reportPath+'/fjord-water-'+camera+'.png'});}
 await page.selectOption('#environment-quality','low');await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.startsWith('Fjord water · low'));const low=await settledMetrics();assert.ok(triangles(low)<triangles(standard),'Low quality must lower rendered triangles');assert.equal(await page.locator('#environment-camera').inputValue(),'shore');
 await page.selectOption('#environment-quality','legacy');await page.waitForFunction(()=>document.querySelector('#environment-metrics').textContent.includes('compatibility fallback'));const fallback=await settledMetrics();assert.equal(await page.locator('#environment-camera').inputValue(),'shore');
 await page.selectOption('#environment-quality','standard');await settle();const waterOn=await canvas.screenshot();await page.locator('#environment-water').uncheck();await settle();assert.ok(!waterOn.equals(await canvas.screenshot()),'water toggle must hide the surface');await page.locator('#environment-water').check();
 await page.goto(url+'/play');await page.waitForSelector('#play-root',{timeout:60000});assert.ok((await page.locator('#play-root').innerText()).length>100);
 await page.goto(url+'/');await page.waitForFunction(()=>document.querySelector('#world')?.dataset.interactions,{timeout:60000});assert.equal(await page.locator('#world').getAttribute('data-character-source'),'meshy');
 assert.deepEqual(errors,[]);await writeFile(reportPath+'/baseline.json',JSON.stringify({renderer:'Chromium headless / SwiftShader software rendering; frame times are not a hardware benchmark',viewport:[1440,1000],standard,low,fallback,checks:['no comparison control','visible wave pause/resume','day/night','three camera presets','lower triangle count at Low quality','compatibility fallback','water visibility','latest main settlement route','Meshy Fjordside'],errors},null,2));
 console.log('Environment Lab UI, water behavior and rebased settlement/Fjordside routes passed.');
}catch(error){console.log(JSON.stringify({error:String(error),errors,body:(await page.locator('body').innerText()).slice(-1000)}));throw error;}finally{await browser.close();}
