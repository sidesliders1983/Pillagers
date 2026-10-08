import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {characterAppearance}=load('../src/characters/CharacterAppearance.ts');
const {availableHairStyles}=load('../src/character-lab/GeneratedHair.ts');
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1000}}),errors=[];
 page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4175/character-lab');
 await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true',null,{timeout:120000});
 await page.locator('.lab-json > summary').click();
 for(const style of availableHairStyles){
  let dna;
  for(let seed=0;seed<1000;seed++){const candidate={...defaultDNA(),seed};if(characterAppearance(candidate).hairStyle===style){dna=candidate;break;}}
  assert.ok(dna);
  await page.locator('#lab-json').fill(JSON.stringify(dna));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
  for(const lod of [0,1,2]){
   await page.getByRole('button',{name:`LOD${lod}`,exact:true}).click();
   await page.waitForFunction(lod=>document.querySelector('#lab-preview')?.dataset.ready==='true'&&document.querySelector('#lab-status')?.textContent.includes(`LOD${lod} ·`),lod,{timeout:120000});
   assert.match(await page.locator('#lab-status').textContent(),/reference hair/);
   for(const clip of ['Walk','Run','Idle']){await page.getByRole('button',{name:clip,exact:true}).click();await page.waitForTimeout(100);}
   await page.locator('#lab-preview').screenshot({path:`artifacts/generated-hair-${style}-LOD${lod}.png`});
  }
  console.log('PASS',style);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
