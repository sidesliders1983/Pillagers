import {createRequire} from 'node:module';import {mkdir,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import sharp from 'sharp';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),output='docs/qa/ground-v04';await mkdir(output,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true}),p=await b.newPage({viewport:{width:1360,height:1200},deviceScaleFactor:1}),errors=[];p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{const o=new MutationObserver(()=>{const c=document.querySelector('#environment-pause');if(c){c.checked=true;o.disconnect();}});o.observe(document,{subtree:true,childList:true});});
const captures=[];try{
 await p.goto('http://127.0.0.1:5181/environment-lab');await p.locator('canvas[data-ready=true]').waitFor({timeout:90000});await p.addStyleTag({content:'.environment-lab main{max-width:none;width:1280px;padding:0}.environment-lab canvas{width:1280px!important;height:800px!important;min-height:0!important}'});
 const settle=()=>p.waitForTimeout(650);
 const capture=async name=>{await settle();const c=p.locator('canvas'),bytes=await sharp(await c.screenshot()).webp({quality:92}).toBuffer();await writeFile(output+'/'+name+'.webp',bytes);captures.push({file:name+'.webp',sha256:createHash('sha256').update(bytes).digest('hex'),fixture:JSON.parse(await c.getAttribute('data-fixture')),metrics:JSON.parse(await c.getAttribute('data-metrics')),ground:JSON.parse(await c.getAttribute('data-ground'))});console.log(name);};
 for(const material of ['baseline','regional']){
  await p.selectOption('#environment-material',material, {force:true});await p.waitForFunction(v=>!document.querySelector('#environment-status').textContent.startsWith('Loading')&&document.querySelector('canvas').dataset.groundTier===(v==='baseline'?'baseline':'standard'),material,{timeout:90000});
  for(const tier of ['standard','low']){
   await p.selectOption('#environment-quality',tier, {force:true});await p.waitForFunction(([m,t])=>!document.querySelector('#environment-status').textContent.startsWith('Loading')&&document.querySelector('canvas').dataset.groundTier===(m==='baseline'?'baseline':t),[material,tier],{timeout:90000});
   for(const camera of ['village','shore','forest'])for(const light of ['day','night']){
    await p.selectOption('#environment-camera',camera, {force:true});await p.selectOption('#environment-light',light, {force:true});
    for(const composed of [true,false]){await p.locator('#environment-nature').setChecked(composed);await p.locator('#environment-village').setChecked(composed);await capture(`${material}-${camera}-${tier}-${light}-${composed?'composed':'ground'}`);}
   }
  }
  await p.selectOption('#environment-quality','standard', {force:true});await p.waitForFunction(m=>!document.querySelector('#environment-status').textContent.startsWith('Loading')&&document.querySelector('canvas').dataset.groundTier===(m==='baseline'?'baseline':'standard'),material,{timeout:90000});await p.selectOption('#environment-light','day', {force:true});
  for(const camera of ['village','shore','forest'])for(const [distance,delta] of [['near',-800],['far',800]]){
   await p.selectOption('#environment-camera',camera, {force:true});await p.locator('canvas').hover();await p.mouse.wheel(0,delta);await settle();
   for(const composed of [true,false]){await p.locator('#environment-nature').setChecked(composed);await p.locator('#environment-village').setChecked(composed);await capture(`${material}-${camera}-standard-day-${distance}-${composed?'composed':'ground'}`);}
  }
 }
 const hardware=await p.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2'),d=g.getExtension('WEBGL_debug_renderer_info');return {renderer:g.getParameter(d.UNMASKED_RENDERER_WEBGL),vendor:g.getParameter(d.UNMASKED_VENDOR_WEBGL),userAgent:navigator.userAgent,maxAnisotropy:g.getParameter(g.getExtension('EXT_texture_filter_anisotropic').MAX_TEXTURE_MAX_ANISOTROPY_EXT)};});
 await writeFile(output+'/capture-manifest.json',JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:'ground-v04 candidate; pin final implementation in PR',hardware,canvas:[1280,800],pixelRatio:1,phase:0,grass:false,dusk:'Unavailable: no preset',captures,errors},null,2)+'\n');
}finally{await b.close();}
