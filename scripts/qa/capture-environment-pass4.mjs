import {createRequire} from 'node:module';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out='docs/qa/environment-pass4';await mkdir(out,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});
const p=await b.newPage({viewport:{width:1640,height:1330},deviceScaleFactor:1});
const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});p.setDefaultTimeout(90000);
await p.addInitScript(()=>{const o=new MutationObserver(()=>{const c=document.querySelector('#environment-pause');if(c){c.checked=true;o.disconnect();}});o.observe(document,{subtree:true,childList:true});});
const captures=[];
try {
 await p.goto('http://127.0.0.1:5181/environment-lab');await p.locator('canvas[data-ready=true]').waitFor();
 const css=await p.addStyleTag({content:'.environment-lab main{max-width:none;width:1536px;padding:0}.environment-lab canvas{width:1536px!important;height:1024px!important;min-height:0!important}'});
 const tier=async value=>{if(await p.inputValue('#environment-quality')!==value)await p.selectOption('#environment-quality',value,{force:true});await p.waitForFunction(t=>document.querySelector('canvas').dataset.groundTier===(t==='standard'?'standard':'low')&&!document.querySelector('#environment-status').textContent.startsWith('Loading'),value);};
 const capture=async(name,layer='combined')=>{await p.waitForTimeout(800);const c=p.locator('canvas'),bytes=await sharp(await c.screenshot()).webp({quality:94}).toBuffer();await writeFile(out+'/'+name+'.webp',bytes);captures.push({file:name+'.webp',sha256:createHash('sha256').update(bytes).digest('hex'),canvas:await c.boundingBox(),fixture:JSON.parse(await c.getAttribute('data-fixture')),metrics:JSON.parse(await c.getAttribute('data-metrics')),ground:JSON.parse(await c.getAttribute('data-ground')),layer,quality:await p.inputValue('#environment-quality'),historicalFallback:await p.inputValue('#environment-quality')==='legacy'});console.log(name);};
 for(const quality of ['standard','low','legacy']){await tier(quality);for(const camera of ['shore','village','forest'])for(const light of ['day','night']){await p.selectOption('#environment-camera',camera,{force:true});await p.selectOption('#environment-light',light,{force:true});await capture(`${camera}-${quality}-${light}`);}}
 await tier('standard');await p.selectOption('#environment-light','day',{force:true});
 for(const camera of ['shore','village','forest'])for(const [distance,delta] of [['near',-800],['far',800]]){await p.selectOption('#environment-camera',camera,{force:true});await p.locator('canvas').hover();await p.mouse.wheel(0,delta);await capture(`${camera}-standard-day-${distance}`);}
 for(const camera of ['shore','village']){
  await p.selectOption('#environment-camera',camera,{force:true});
  for(const [layer,ground,nature,village,water] of [['ground-only',true,false,false,true],['kaykit-only',false,true,false,false],['combined',true,true,true,true]]){for(const [id,value] of [['ground',ground],['nature',nature],['village',village],['water',water]])await p.locator('#environment-'+id).setChecked(value,{force:true});await capture(`${camera}-${layer}`,layer);}
 }
 await p.selectOption('#environment-camera','village',{force:true});await p.locator('#environment-grass').check({force:true});await capture('village-grass-on');await p.locator('#environment-grass').uncheck({force:true});await capture('village-grass-off');
 await p.selectOption('#environment-camera','overview',{force:true});await capture('overview-standard-day');
 await css.evaluate(el=>el.textContent='.environment-lab main{max-width:none;width:1024px;padding:0}.environment-lab canvas{width:1024px!important;height:768px!important;min-height:0!important}');
 for(const camera of ['shore','village','forest']){await p.selectOption('#environment-camera',camera,{force:true});await capture(`${camera}-standard-day-1024`);}
 const hardware=await p.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(d.UNMASKED_RENDERER_WEBGL),vendor:g.getParameter(d.UNMASKED_VENDOR_WEBGL),userAgent:navigator.userAgent};});
 await writeFile(out+'/capture-manifest.json',JSON.stringify({renderCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),hardware,phase:0,pixelRatio:1,grassDefault:false,canvasSizes:[[1536,1024],[1024,768]],dusk:'Blocked: Environment Lab exposes no dusk preset',captures,errors},null,2)+'\n');
 if(errors.length)throw Error(errors.join('\n'));
} finally {await b.close();}
