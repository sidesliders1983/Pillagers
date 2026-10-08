import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='docs/qa/environment-pass4';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});
const p=await b.newPage({viewport:{width:1120,height:1140},deviceScaleFactor:1});p.setDefaultTimeout(90000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{const o=new MutationObserver(()=>{const c=document.querySelector('#environment-pause');if(c){c.checked=true;o.disconnect();}});o.observe(document,{subtree:true,childList:true});});
try{
 await p.goto('http://127.0.0.1:5181/environment-lab');await p.locator('canvas[data-ready=true]').waitFor();await p.addStyleTag({content:'.environment-lab main{max-width:none;width:1024px;padding:0}.environment-lab canvas{width:1024px!important;height:768px!important;min-height:0!important}'});
 const hardware=await p.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(d.UNMASKED_RENDERER_WEBGL),vendor:g.getParameter(d.UNMASKED_VENDOR_WEBGL),userAgent:navigator.userAgent};});if(/SwiftShader|Software|llvmpipe/i.test(hardware.renderer))throw Error('Hardware renderer required');
 const report={renderCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hardware,canvas:[1024,768],pixelRatio:1,phase:0,grass:false,warmupMs:10000,sampleMs:30000,baseline:'Previous Ground v0.2 with identical KayKit/Meshy/water/lighting; isolates ground change, not whole historical release',method:'Whole composed-scene rAF presentation intervals, not isolated GPU/CPU execution time',samples:[],errors};
 const select=async(material,tier)=>{if(material==='baseline'&&await p.inputValue('#environment-material')!==material)await p.selectOption('#environment-material',material,{force:true});if(await p.inputValue('#environment-quality')!==tier)await p.selectOption('#environment-quality',tier,{force:true});if(material==='regional'&&await p.inputValue('#environment-material')!==material)await p.selectOption('#environment-material',material,{force:true});await p.waitForFunction(([m,t])=>document.querySelector('canvas').dataset.groundTier===(m==='baseline'?'baseline':t)&&!document.querySelector('#environment-status').textContent.startsWith('Loading'),[material,tier]);};
 // Alternate baseline/candidate at each repetition to reduce ordering confounds.
 for(const camera of ['village','forest'])for(const tier of ['standard','low'])for(let run=1;run<=3;run++)for(const material of run%2?['baseline','regional']:['regional','baseline']){
  await p.selectOption('#environment-camera',camera,{force:true});await select(material,tier);await p.waitForTimeout(report.warmupMs);
  const sample=await p.evaluate(ms=>new Promise(resolve=>{const stamps=[],start=performance.now();function f(t){stamps.push(t);if(t-start<ms)return requestAnimationFrame(f);const gaps=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);resolve({durationMs:t-start,frames:stamps.length,medianFrameMs:gaps[Math.floor(gaps.length*.5)],p95FrameMs:gaps[Math.floor(gaps.length*.95)],metrics:JSON.parse(document.querySelector('canvas').dataset.metrics),fixture:JSON.parse(document.querySelector('canvas').dataset.fixture),visibility:document.visibilityState});}requestAnimationFrame(f);}),report.sampleMs);
  report.samples.push({camera,tier,material,run,...sample});await writeFile(out+'/hardware-measurements.json',JSON.stringify(report,null,2)+'\n');console.log(`${camera} ${tier} ${material} run ${run}: median ${sample.medianFrameMs.toFixed(1)} p95 ${sample.p95FrameMs.toFixed(1)}`);
 }
 if(errors.length)throw Error(errors.join('\n'));
} finally {await b.close();}
