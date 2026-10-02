import {createRequire} from 'node:module';
import {mkdirSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {loadTypeScript} from './load-typescript.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const {characterOutfit,baseOutfits}=loadTypeScript(new URL('../src/characters/CharacterAssets.ts',import.meta.url));
const {goldenCharacterDNA}=loadTypeScript(new URL('../src/characters/GoldenCharacters.ts',import.meta.url));
mkdirSync('artifacts/clothing',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
    for(const mobile of [false,true]){
        const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:1100},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});page.setDefaultTimeout(60000);
        await page.goto(`${process.env.PROTOTYPE_URL??'http://127.0.0.1:4175'}/character-lab`);
        const ready=()=>page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');await ready();
        await page.locator('.lab-json > summary').click();
        for(const outfit of baseOutfits){
            const seed=Array.from({length:100},(_,i)=>i).find(seed=>characterOutfit(seed).style===outfit.style);
            for(const profile of mobile?['child','overweight']:['neutral','feminine','overweight','older','child']){
                const dna={...goldenCharacterDNA(`golden_${profile}_01`),seed};
                await page.locator('#lab-json').fill(JSON.stringify(dna));await page.locator('[data-action="import"]').click();await ready();
                await page.locator('.lab-fit-debug > summary').evaluate(element=>element.parentElement.open=true);
                const snapshot=JSON.parse(await page.locator('#lab-fit-metadata').textContent());
                assert.ok(snapshot.modules.some(module=>module.id===`garment/${outfit.style}`));assert.ok(!snapshot.modules.some(module=>module.id==='technical-waist-wrap'));
                await page.locator('[data-action="walk"]').click();await page.locator('[data-action="run"]').click();await page.locator('[data-action="idle"]').click();
                await page.locator('#lab-preview').scrollIntoViewIfNeeded();
                await page.locator('#lab-preview').screenshot({path:`artifacts/clothing/${mobile?'mobile':'desktop'}-${outfit.style}-${profile}.png`});
            }
        }
        if(!mobile){
            const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export-glb"]').click();
            const download=await downloadPromise,path='artifacts/clothing/export-review.glb';await download.saveAs(path);
            const bytes=readFileSync(path),length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
            assert.equal(json.skins.length,1);assert.ok(json.nodes.some(node=>node.extras?.garmentRegion==='skirt'));
            assert.deepEqual(json.animations.map(clip=>clip.name).sort(),['Idle','Run','Walk']);
        }
        assert.deepEqual(errors,[]);console.log(`PASS ${mobile?'mobile':'desktop'} three seed outfits, pose controls, Golden extremes${mobile?'':', GLB export with one rig'}`);await page.close();
    }
}finally{await browser.close();}
