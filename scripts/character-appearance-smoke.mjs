import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {load} from '../tests/load-source.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {defaultDNA}=load('../src/characters/CharacterDNA.ts');
const {characterAppearance,hairStyles,beardStyles}=load('../src/characters/CharacterAppearance.ts');
const cases=[],hair=new Set(),beard=new Set();
for(let seed=0;seed<500;seed++){
    const dna={...defaultDNA(),seed,age:35,morphology:{masculinity:.85,height:1.44}},p=characterAppearance(dna);
    if(!hair.has(p.hairStyle)||!beard.has(p.beardStyle)){cases.push({label:`modules-${seed}-${p.hairStyle}-${p.beardStyle}`,dna});hair.add(p.hairStyle);beard.add(p.beardStyle);}
    if(hair.size===hairStyles.length&&beard.size===beardStyles.length)break;
}
for(const fit of [{hair:1.3,beard:.75,clothing:1.3},{hair:1,beard:1.5,clothing:1}])cases.push({label:`fit-${fit.beard}`,dna:{...defaultDNA(),seed:7,appearanceFit:fit}});
for(const age of [6,14,30,45,55,70,90])cases.push({label:`age-${age}`,dna:{...defaultDNA(),seed:7,age,morphology:{masculinity:.9,height:1.44}}});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
    const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto((process.env.PROTOTYPE_URL||'http://127.0.0.1:4175')+'/character-lab');
    await page.waitForFunction(()=>document.querySelector('#lab-status')?.textContent.includes('one shared rig'));
    await page.locator('.lab-json > summary').click();
    for(const {dna,label} of cases){
        await page.locator('#lab-json').fill(JSON.stringify(dna));await page.getByRole('button',{name:'Apply JSON',exact:true}).click();
        await page.waitForTimeout(200);
        const p=JSON.parse(await page.locator('#lab-phenotype').textContent()).universalHuman;
        assert.deepEqual(p.appearance,characterAppearance(dna));
        assert.deepEqual(p.appearanceFit,dna.appearanceFit??{hair:1,beard:1,clothing:1});
        for(const lod of label.startsWith('age')?['LOD0','LOD1','LOD2']:['LOD0']){
            await page.getByRole('button',{name:lod,exact:true}).click();await page.waitForFunction(lod=>document.querySelector('#lab-status')?.textContent.includes(lod+' ·'),lod);
            for(const clip of ['Idle','Walk','Run']){await page.getByRole('button',{name:clip,exact:true}).click();await page.waitForTimeout(150);}
            await page.getByRole('button',{name:'Idle',exact:true}).click();
            await page.locator('#lab-preview').screenshot({path:`artifacts/appearance-${label}-${lod}.png`});
        }
    }
    await page.locator('#fit-hair').fill('120');await page.locator('#fit-hair').dispatchEvent('input');
    assert.equal(JSON.parse(await page.locator('#lab-json').inputValue()).appearanceFit.hair,1.2);
    await page.getByRole('button',{name:'Pin comparison',exact:true}).click();await page.locator('#lab-age').fill('6');await page.locator('#lab-age').dispatchEvent('input');
    await page.waitForTimeout(300);await page.locator('#lab-preview').screenshot({path:'artifacts/appearance-child-elder-comparison.png'});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
    console.log(`PASS: ${cases.length} automatic module/age cases, all LODs for age progression, shared animations, compare and mobile.`);
}finally{await browser.close();}
