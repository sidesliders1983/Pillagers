import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
let page;
const flows=[];const errors=[];const passed=message=>{flows.push(message);console.log(message);};
try{
 page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});page.setDefaultTimeout(240000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;let fail=true;
  window.workerEvidence={created:0,terminated:0};
  window.Worker=class extends NativeWorker{
   constructor(...args){const generation=String(args[0]).includes('GenerationWorker');if(fail&&generation){fail=false;throw new Error('Worker unavailable (injected QA failure)');}super(...args);this.generation=generation;if(generation)window.workerEvidence.created++;}
   terminate(){if(this.generation)window.workerEvidence.terminated++;super.terminate();}
  };
  new MutationObserver(()=>{
   const c=document.querySelector('#fjord-canvas'),run=document.querySelector('#fjord-run');
   if(c?.dataset.ready==='true'&&!document.querySelector('#island-loading')&&run?.textContent==='Pause')run.click();
  }).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-ready']});
 });
 await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5180')+'/fjord-play?seed=32',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Retry loading'}).waitFor();
 assert.match(await page.locator('#island-loading-status').textContent(),/Worker unavailable/);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('pillagers.fjord-play.active.v1')),null);
 const opening=await page.locator('#loading-clan-book-text').textContent();
 await page.getByRole('button',{name:'Retry loading'}).click();
 await page.locator('#island-loading[data-preview]').waitFor();
 await page.waitForTimeout(700);
 await page.screenshot({path:'docs/qa/cinematic-loading/book/tablet-reading.png'});
 await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
 assert.equal(await page.locator('#loading-clan-book-text').textContent(),opening);
 passed('worker unavailable: retry retains the same prepared founding chapter');
 if(await page.locator('#clan-book-close').isVisible())await page.locator('#clan-book-close').click();
 const core=()=>page.evaluate(()=>JSON.stringify(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign));
 const saved=await core();
 const menu=async()=>{
  if(await page.locator('#loading-clan-book').isVisible())await page.getByRole('button',{name:'Close founding chapter'}).tap();
  if(!await page.locator('#fjord-menu').evaluate(e=>e.open))await page.locator('#fjord-menu > summary').click();
  if(!await page.locator('#fjord-campaign').evaluate(e=>e.open))await page.locator('#fjord-campaign > summary').click();
 };
 await menu();await page.locator('#fjord-seed').fill('1');await page.locator('#fjord-new').click();
 await page.locator('#island-loading').waitFor();await page.getByRole('button',{name:'Cancel & Return to Game',exact:true}).click();
 await page.locator('#island-loading').waitFor({state:'detached'});
 assert.equal(await core(),saved);passed('cancel during generation preserves the previous Core and campaign');
 await menu();await page.locator('#fjord-seed').fill('1');await page.locator('#fjord-new').click();
 await page.locator('#island-loading.island-loading-arrival').waitFor();
 await page.getByRole('button',{name:'Cancel & Return to Game',exact:true}).click();
 await page.locator('#island-loading').waitFor({state:'detached'});
 assert.equal(await core(),saved);passed('cancel during camera arrival rolls back Core, geography and scene');
 await menu();await page.locator('#fjord-seed').fill('1');await page.locator('#fjord-new').click();
 await page.locator('#island-loading.island-loading-arrival').waitFor();
 const newOpening=await page.locator('#loading-clan-book-text').textContent();
 await page.getByRole('button',{name:'Close founding chapter'}).tap();
 assert.equal(await page.locator('#island-loading').isVisible(),true);
 await page.getByRole('button',{name:'Skip camera arrival'}).click();
 await page.locator('#island-loading').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('#fjord-notice').textContent==='New campaign created.');
 const next=JSON.parse(await core());assert.equal(next.seed,1);assert.deepEqual(next.time,{winter:800,tick:500});
 assert.equal(await page.locator('#loading-clan-book').count(),0);
 assert.equal(await page.locator('#clan-book-reader').isVisible(),false);
 assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.narrative.chapters[0].text),newOpening);
 passed('closing the new-seed chapter does not cancel loading or reopen it at arrival');
 if(await page.locator('#clan-book-close').isVisible())await page.locator('#clan-book-close').click();
 await menu();await page.locator('#fjord-founders').check();await page.locator('#fjord-restart').click();
 await page.locator('#island-loading').waitFor();
 await page.getByRole('button',{name:'Cancel & Return to Game',exact:true}).tap();
 await page.locator('#island-loading').waitFor({state:'detached'});
 assert.equal(JSON.parse(await core()).seed,1);
 passed('same-founder restart allows touch cancellation back to the playable campaign');
 await menu();await page.locator('#fjord-save').click();const beforeLoad=await core();
 await page.locator('#fjord-load').click();await page.waitForFunction(()=>document.querySelector('#fjord-notice').textContent==='Shared campaign loaded, paused.');
 assert.equal(await core(),beforeLoad);assert.equal(await page.locator('#island-loading').count(),0);
 passed('explicit saved load remains outside the new-campaign intro and preserves Core');
 const worker=await page.evaluate(()=>window.workerEvidence);assert.equal(worker.created,worker.terminated);
 assert.deepEqual(errors,[]);
 mkdirSync('docs/qa/cinematic-loading',{recursive:true});
 writeFileSync('docs/qa/cinematic-loading/flows.json',JSON.stringify({flows,worker,errors},null,2));
 console.log(JSON.stringify({flows,worker,errors}));
}catch(error){
 console.error('UI at failure:',await page?.locator('body').innerText().catch(()=>''));
 await page?.screenshot({path:'docs/qa/cinematic-loading/book/flow-failure.png'}).catch(()=>{});
 console.error(error);throw error;
}finally{await browser.close();}
