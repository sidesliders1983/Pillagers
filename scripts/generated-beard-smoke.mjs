import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE);
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {universalHumanProfile}=load('../src/characters/UniversalHumanProfile.ts');
let dna;for(let seed=0;seed<10000;seed++){const candidate={...defaultDNA(),seed,age:35,morphology:{masculinity:.77,height:1.5}};if(universalHumanProfile(candidate).appearance.beardStyle==='braid'){dna=candidate;break;}}
assert.ok(dna);console.log('Seed',dna.seed);
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
 const page=await browser.newPage({viewport:{width:1024,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
 await page.goto('http://127.0.0.1:4175/character-lab');await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');
 await page.locator('.lab-json > summary').click();await page.locator('#lab-json').fill(JSON.stringify(dna));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
 for(const lod of [0,1,2]){
  await page.getByRole('button',{name:`LOD${lod}`,exact:true}).click();
  await page.waitForFunction(lod=>document.querySelector('#lab-preview')?.dataset.ready==='true'&&document.querySelector('#lab-status')?.textContent.includes(`LOD${lod} ·`)&&document.querySelector('#lab-status')?.textContent.includes('reference beard'),lod);
  for(const clip of ['Walk','Run','Idle']){await page.getByRole('button',{name:clip,exact:true}).click();await page.waitForTimeout(150);}
  await page.locator('#lab-preview').screenshot({path:`artifacts/generated-beard-braid-LOD${lod}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS braid all LODs and clips');
}finally{await browser.close();}
