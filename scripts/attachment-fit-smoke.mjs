import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const {fitPresetLabels}=load('../src/characters/FitPresets.ts');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:1100}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4175/character-lab');await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
  await page.locator('.lab-fit-debug > summary').click();
  for(const key of ['sockets','landmarks','cages','bounds'])await page.locator(`[data-action="debug-${key}"]`).click();
  await page.locator('[data-action="run"]').click();
  const presets=process.env.FIT_REVIEW_PRESETS?.split(',')??(mobile?['child','older']:Object.keys(fitPresetLabels));
  for(const key of presets){
   await page.locator('#lab-fit-preset').selectOption(key);await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
   const metadata=JSON.parse(await page.locator('#lab-fit-metadata').textContent());assert.equal(metadata.version,'pillagers-fit/0.1');assert.equal(metadata.sockets.length,16);assert.equal(Object.keys(metadata.cages).length,4);assert.ok(metadata.modules.some(module=>module.type==='hair'));
   const canvas=page.locator('#lab-preview');await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(200);
   await canvas.screenshot({path:`artifacts/attachment-fit-${mobile?'mobile':'desktop'}-${key}.png`});console.log('PASS fit debug',mobile?'mobile':'desktop',key);
  }
  await page.locator('[data-action="debug-coverage"]').click();await page.locator('#lab-preview').screenshot({path:`artifacts/attachment-fit-${mobile?'mobile':'desktop'}-coverage.png`});
  for(const key of ['sockets','landmarks','cages','bounds','coverage'])await page.locator(`[data-action="debug-${key}"]`).click();
  await page.locator('[data-action="defaults"]').click();await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');await page.locator('#lab-preview').screenshot({path:`artifacts/attachment-fit-${mobile?'mobile':'desktop'}-normal.png`});assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
