import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
for(const [name,width,height] of [['desktop',1280,800],['mobile',390,844]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true});
 const page=await context.newPage();
 await page.addInitScript(()=>{
  window.loadingProfile={longTasks:[],gaps:[],start:performance.now()};let last=performance.now();
  setInterval(()=>{const now=performance.now();window.loadingProfile.gaps.push(now-last);last=now;},40);
  new PerformanceObserver(list=>window.loadingProfile.longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
  new MutationObserver(()=>{const c=document.querySelector('#fjord-canvas[data-ready="true"]');if(c&&!window.loadingProfile.ready){window.loadingProfile.ready=performance.now();document.querySelector('#fjord-run')?.click();}}).observe(document,{childList:true,subtree:true,attributes:true});
 });
 await page.goto('http://127.0.0.1:5180/fjord-play?seed=32');
 await page.locator('#fjord-canvas[data-ready="true"]').waitFor({timeout:240000});
 results.push({name,width,height,...await page.evaluate(()=>({...window.loadingProfile,gaps:undefined,maxHeartbeatGap:Math.max(...window.loadingProfile.gaps),memory:performance.memory?.usedJSHeapSize,resources:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0)}))});
 console.log(JSON.stringify(results.at(-1)));
 await context.close();
}
mkdirSync('docs/qa/cinematic-loading',{recursive:true});
writeFileSync('docs/qa/cinematic-loading/baseline.json',JSON.stringify({platform:'Windows Edge headless, touch emulation; not physical iPhone',results},null,2));
await browser.close();
