import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url)),state=core.createCampaign(32);
const {chromium}=createRequire(import.meta.url)(process.argv[2]+'/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const route of ['play','gameplay-lab']){
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5180/'+route);
  for(const id of ['founder-1','founder-2']){
   if(route==='play')await page.locator('#entity-picker').selectOption('persona:'+id);
   const selector=page.locator(route==='play'?'#occupation':'#occupation-'+id);await selector.waitFor();
   for(const role of core.occupationIds){
    const text=await selector.locator('option[value="'+role+'"]').innerText();
    assert.equal(text,role+' · '+(core.occupationAptitude(state,id,role)/100).toFixed(1)+'% fit');
   }
   assert.equal(await selector.locator('option[value=""]').innerText(),'No occupation');
   await selector.selectOption('farmer');
   if(route==='play')await page.getByRole('button',{name:'Assign occupation',exact:true}).click();
   else await page.locator('button[data-action=occupation][data-id="'+id+'"]').click();
   assert.equal(await selector.inputValue(),'farmer');
  }
  console.log('PASS '+route+': personal canonical fit for every occupation; assignment values unchanged');await page.close();
 }
}finally{await browser.close();}
