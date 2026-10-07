import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const fixture=core.applyCommand(core.createCampaign(32),{type:'AdvanceTicks',ticks:999});
const {chromium}=createRequire(import.meta.url)(process.argv[2]+'/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const route of ['play','gameplay-lab']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();await page.goto('http://127.0.0.1:5180/'+route);
  await page.locator('button[data-action=run]').waitFor();
  await page.locator('#import-file').setInputFiles({name:'near-winter.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(fixture))});
  await page.locator(route==='play'?'#cycle':'#speed').selectOption('1');
  await page.locator('button[data-action=run]').click();
  await page.clock.runFor(3000);
  assert.equal(await page.locator('button[data-action=run]').innerText(),'Pause');
  assert.match(await page.locator('header').innerText(),/801/);
  assert.match(await page.locator('header').innerText(),/Tick (?:[1-9]\d*)\/1000/);
  await page.getByRole('button',{name:'+1 Winter',exact:true}).click();
  await page.clock.runFor(1000);
  assert.match(await page.locator('header').innerText(),/802/);
  assert.equal(await page.locator('button[data-action=run]').innerText(),'Pause');
  await page.locator('button[data-action=run]').click();
  const paused=await page.locator('header').innerText();await page.clock.runFor(1000);
  assert.equal(await page.locator('header').innerText(),paused);
  assert.deepEqual(errors,[]);console.log('PASS '+route+': automatic rollover and running +1 Winter continue; Pause freezes clock');await page.close();
 }
}finally{await browser.close();}
