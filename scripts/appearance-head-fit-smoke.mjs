import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
const examples=[defaultDNA(),{seed:1885184954,sex:'male',age:20,traits:{physicality:.78,agility:.57,intelligence:.12,cunning:.2,temperament:.71},heritage:{scandinavian:.028440025880589824,angloSaxon:.23439964981313144,gaelic:.1594962292471368,finnic:.17366774106331118,sami:.17360313309252673,baltic:.23039322090330414}}];
try {
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:1000}});page.setDefaultTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4175/character-lab');await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
  await page.locator('.lab-json > summary').click();
  const profiles=[...examples];
  if(!mobile)for(const kind of ['hair','beard'])for(const style of kind==='hair'?['short','medium','long','tied','bun','braid']:['stubble','short','medium','long','split-braid','braid']){
   for(let seed=0;seed<10000;seed++){
    const dna={...defaultDNA(),seed,age:45,morphology:{masculinity:.77,height:1.5}};
    if(universalHumanProfile(dna).appearance[kind+'Style']===style){profiles.push(dna);break;}
   }
  }
  for(let n=0;n<profiles.length;n++){
   await page.locator('#lab-json').fill(JSON.stringify(profiles[n]));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
   await page.getByRole('button',{name:'Reset view',exact:true}).click();
   const canvas=page.locator('#lab-preview');await canvas.scrollIntoViewIfNeeded();let box=await canvas.boundingBox();
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-420);await page.waitForTimeout(250);
   for(const view of ['front','side','back']){
    if(view!=='front'){
     box=await canvas.boundingBox();await page.mouse.move(box.x+box.width*.3,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.3+box.height*.25,box.y+box.height*.55,{steps:12});await page.mouse.up();await page.waitForTimeout(250);
    }
    await canvas.screenshot({path:`artifacts/head-fit-${mobile?'mobile':'desktop'}-${n}-${view}.png`});
   }
   console.log('PASS',mobile?'mobile':'desktop',n,JSON.stringify(universalHumanProfile(profiles[n]).appearance));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
