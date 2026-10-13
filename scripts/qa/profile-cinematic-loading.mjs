import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const output='docs/qa/cinematic-loading';mkdirSync(output,{recursive:true});
const reports=[];
try{
 const cases=[
  ['desktop',1280,800,'low'],['desktop',1280,800,'standard'],
  ['mobile',390,844,'low'],['mobile',390,844,'standard'],
  ['tablet',1024,768,'low'],['tablet',1024,768,'standard']
 ];
 for(const [name,width,height,quality] of process.env.QA_SMOKE ? cases.slice(0,1) : cases){
  const reduced=name==='mobile'&&quality==='standard';
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(180000);
  await page.addInitScript(({quality})=>{
   const evidence=window.loadingQA={longTasks:[],maxGap:0,stages:[],times:[],qualitySet:false,frames:0};
   let last=performance.now();setInterval(()=>{const now=performance.now();if(!evidence.ready)evidence.maxGap=Math.max(evidence.maxGap,now-last);last=now;},40);
   new PerformanceObserver(list=>{if(!evidence.ready)evidence.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({type:'longtask',buffered:true});
   const frame=()=>{if(!evidence.ready)evidence.frames++;requestAnimationFrame(frame);};requestAnimationFrame(frame);
   new MutationObserver(()=>{
    const root=document.querySelector('#island-loading'),canvas=document.querySelector('#fjord-canvas'),q=document.querySelector('#fjord-quality');
    if(q&&!evidence.qualitySet){q.value=quality;evidence.qualitySet=true;}
    if(root&&root.dataset.stage!==evidence.stages.at(-1)?.stage)evidence.stages.push({stage:root.dataset.stage,time:performance.now()});
    if(root&&canvas?.dataset.time&&evidence.times.at(-1)!==canvas.dataset.time)evidence.times.push(canvas.dataset.time);
    if(canvas?.dataset.ready==='true'&&!evidence.ready){
     evidence.ready=performance.now();evidence.time=JSON.parse(canvas.dataset.time);evidence.season=document.querySelector('#fjord-season').textContent;
     if(document.querySelector('#fjord-run').textContent==='Pause')document.querySelector('#fjord-run').click();
    }
   }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-stage','data-ready','data-time']});
  },{quality});
  await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5180')+'/fjord-play?seed=32&profileLoading=1',{waitUntil:'domcontentloaded'});
  await page.locator('#island-loading').waitFor();
  if(name==='desktop'&&quality==='low'){
   await page.screenshot({path:output+'/sea.jpg',type:'jpeg',quality:85});
  }
  await page.locator('#island-loading[data-preview]').waitFor();
  if(quality==='low')await page.screenshot({path:output+'/'+name+'-preview.jpg',type:'jpeg',quality:85});
  if(!reduced){
   await page.locator('#island-loading.island-loading-arrival').waitFor();
   if(name==='desktop'&&quality==='low'){
    await page.waitForTimeout(1000);await page.screenshot({path:output+'/arrival.jpg',type:'jpeg',quality:85});
   }
   if(name==='tablet'&&quality==='standard')await page.getByRole('button',{name:'Skip camera arrival'}).click();
  }
  await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
  const report=await page.evaluate(()=>({...window.loadingQA,loading:JSON.parse(document.querySelector('#fjord-canvas').dataset.loading),memory:performance.memory?.usedJSHeapSize,resources:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0)}));
  assert.deepEqual(report.time,{winter:800,tick:500,ticksPerWinter:1000});assert.equal(report.season,'Summer');
  assert.ok(report.times.every(t=>JSON.parse(t).tick===500));assert.ok(report.frames>20);
  assert.equal(await page.locator('#island-loading').count(),0);
  assert.equal(await page.locator('#fjord-play').evaluate(e=>e.inert),false);
  assert.deepEqual(errors,[]);
  if(await page.locator('#clan-book-close').isVisible())await page.locator('#clan-book-close').click();
  if(quality==='low')await page.screenshot({path:output+'/'+name+'-settlement.jpg',type:'jpeg',quality:85});
  reports.push({name,width,height,quality,reducedMotion:reduced,errors,...report});
  console.log(JSON.stringify({name,quality,ready:report.ready,maxGap:report.maxGap,firstPreview:report.loading.firstPreview,frames:report.frames}));
  writeFileSync(output+'/after.json',JSON.stringify({platform:'Windows Edge headless, touch emulation; not physical iPhone/iPad',reports},null,2));
  await context.close();
 }
}finally{await browser.close();}
