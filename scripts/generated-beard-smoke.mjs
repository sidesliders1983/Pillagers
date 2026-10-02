import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
const {availableBeardStyles}=load('../src/character-lab/GeneratedBeard.ts');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
 await page.goto('http://127.0.0.1:4175/character-lab');await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
 assert.match(await page.locator('#lab-status').textContent(),/LOD2/);
 assert.equal(await page.locator('[data-action="lod2"]').getAttribute('aria-pressed'),'true');
 await page.locator('.lab-json > summary').click();
 // Exact desktop report: legacy seed 1983 with no morphology/fit overrides.
 await page.locator('#lab-json').fill(JSON.stringify(defaultDNA()));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true'&&document.querySelector('#lab-status')?.textContent.includes('reference beard'));
 for(const clip of ['Walk','Run','Idle']){await page.getByRole('button',{name:clip,exact:true}).click();await page.waitForTimeout(150);}
 await page.locator('#lab-preview').screenshot({path:'artifacts/generated-beard-seed1983-LOD2.png'});
 for(const style of availableBeardStyles){
  for(const age of [35,70]){
   let dna;for(let seed=0;seed<10000;seed++){const candidate={...defaultDNA(),seed,age,morphology:{masculinity:.77,height:1.5},appearanceFit:{hair:1,beard:age===70?1.5:1,clothing:1}};if(universalHumanProfile(candidate).appearance.beardStyle===style){dna=candidate;break;}}
   assert.ok(dna);
   await page.locator('#lab-json').fill(JSON.stringify(dna));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true'&&document.querySelector('#lab-status')?.textContent.includes('reference beard'));
   assert.equal(await page.locator('#fit-beard').isEnabled(),true);
   for(const clip of ['Walk','Run','Idle']){await page.getByRole('button',{name:clip,exact:true}).click();await page.waitForTimeout(150);}
   await page.locator('#lab-preview').screenshot({path:`artifacts/generated-beard-${style}-age${age}-LOD2.png`});
   console.log('PASS',style,'age',age,'seed',dna.seed);
  }
 }
 for(const dna of [{...defaultDNA(),age:17,morphology:{masculinity:.77,height:1.5}},{...defaultDNA(),age:35,morphology:{masculinity:.19,height:1.5}}]){
  await page.locator('#lab-json').fill(JSON.stringify(dna));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
  assert.doesNotMatch(await page.locator('#lab-status').textContent(),/reference beard/);
  assert.equal(await page.locator('#fit-beard').isEnabled(),false);
 }
 assert.deepEqual(errors,[]);console.log('PASS all beard LOD2 assets, animations and eligibility');
}finally{await browser.close();}
