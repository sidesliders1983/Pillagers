import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'artifacts/navigation-initial';
await mkdir(output, { recursive: true });
const fixture = await readFile('docs/qa/fjord-runtime-improvements/170/fixtures/developed-810.json', 'utf8');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const result = { browser: browser.version(), physicalIOS: false, runs: [], errors: [] };
try {
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
 const page = await context.newPage(); page.setDefaultTimeout(180000);
 page.on('pageerror', e => result.errors.push(e.stack));
 await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), fixture);
 await page.goto('http://127.0.0.1:5190/fjord-play');
 await page.waitForFunction(() => window.__fjordAudit?.references && document.querySelector('#fjord-canvas')?.dataset.ready);
 console.log('World ready');
 await page.evaluate(() => { const select=document.querySelector('#fjord-quality');select.value='low';select.dispatchEvent(new Event('change')); });
 if (await page.locator('#fjord-management-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#fjord-management-toggle').click();
 await page.evaluate(async () => {
  const refs = window.__fjordAudit.references;
  const { Raycaster, Vector2 } = await import(performance.getEntriesByType('resource').find(entry => /\/deps\/three\.js/.test(entry.name)).name);
  refs.setPlayback(false);
  const state = window.__navigation = { spans: [], frames: [], refs,
   startView: { position: refs.camera.position.toArray(), target: refs.controller.focus.toArray() } };
  function wrap(object, name, label) {
   const original = object[name];
   object[name] = function(...args) {
    const start=performance.now();
    try { return original.apply(this,args); }
    finally { if(state.recording) state.spans.push({ name:label, start, ms:performance.now()-start }); }
   };
  }
  wrap(refs.layer,'pick','entity.pick'); wrap(refs.controller,'navigate','navigate');
  const originalRay = Raycaster.prototype.intersectObject;
  Raycaster.prototype.intersectObject = function(object,...args) {
   const start=performance.now();
   try { return originalRay.call(this,object,...args); }
   finally { if(state.recording) state.spans.push({ name:object===refs.layer.root?'entity.ray':object===refs.world.terrain?'terrain.ray':'other.ray',start,ms:performance.now()-start }); }
  };
  const originalUpdate=refs.controller.update;
  refs.controller.update=function(dt) {
   const start=performance.now(), value=originalUpdate.call(this,dt);
   if(state.recording) state.frames.push({ time:performance.now(),dt,cpu:performance.now()-start,
    focus:this.focus.toArray(),eye:refs.camera.position.toArray(),...this.inspectClearance() });
   return value;
  };
  state.findTarget=()=>{
   const canvas=document.querySelector('#fjord-canvas'), rect=canvas.getBoundingClientRect();
   refs.camera.updateMatrixWorld(true);
   for(const fy of [.6,.75,.45,.3]) for(const fx of [.2,.8,.35,.65]) {
    const x=rect.left+rect.width*fx,y=rect.top+rect.height*fy;
    if(refs.layer.pick(refs.camera,x,y,rect,'touch')) continue;
    const ray=new Raycaster();ray.setFromCamera(new Vector2(fx*2-1,1-fy*2),refs.camera);
    const hit=ray.intersectObject(refs.world.terrain,false)[0];
    if(hit && Math.hypot(hit.point.x-refs.controller.focus.x,hit.point.z-refs.controller.focus.z)>3)
     return {x,y,point:hit.point.toArray()};
   }
   throw Error('No empty navigable target');
  };
 });
 console.log('Instrumentation ready');
 const cdp=await context.newCDPSession(page);
 for(const running of [false,true]) for(let repeat=1;repeat<=2;repeat++) {
  const target=await page.evaluate(running=>{
   const s=window.__navigation;s.recording=false;s.refs.setPlayback(running);
   s.refs.controller.setView(s.startView); return s.findTarget();
  },running);
  await page.waitForTimeout(1000);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
  const start=await page.evaluate(()=>{const s=window.__navigation;s.frames=[];s.spans=[];s.recording=true;return performance.now();});
  await page.touchscreen.tap(target.x,target.y);
  await page.waitForTimeout(3500);
  const capture=await page.evaluate(()=>{const s=window.__navigation;s.recording=false;return {spans:s.spans,frames:s.frames,desired:s.refs.controller.desired.toArray(),focus:s.refs.controller.focus.toArray(),selected:document.querySelector('#fjord-canvas').dataset.selected};});
  const profile=await cdp.send('Profiler.stop'); await cdp.send('Profiler.disable');
  await writeFile(output+`/${running?'running':'paused'}-${repeat}.cpuprofile.gz`,gzipSync(JSON.stringify(profile.profile)));
  result.runs.push({running,repeat,start,target,...capture});
  await writeFile(output+'/results.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({running,repeat,target,spans:capture.spans.filter(s=>s.name!=='other.ray'),frames:capture.frames.length,
   cameraMaxMs:Math.max(...capture.frames.map(f=>f.cpu)),conservative:capture.frames.filter(f=>f.conservative).length,
   maxLift:Math.max(...capture.frames.map(f=>f.lift))}));
 }
 assert.deepEqual(result.errors,[]);
} catch(error) { result.failure=String(error);await writeFile(output+'/results.json',JSON.stringify(result,null,2)+'\n');throw error; }
finally { await browser.close(); }
