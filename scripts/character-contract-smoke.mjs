import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {loadTypeScript} from './load-typescript.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
const {goldenCharacters,goldenCharacterDNA}=loadTypeScript(new URL('../src/characters/GoldenCharacters.ts',import.meta.url));
const {serializeCharacterDNA}=loadTypeScript(new URL('../src/characters/CharacterDNA.ts',import.meta.url));
mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
    for(const mobile of [false,true]){
        const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile}),errors=[],failed=[];
        page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)failed.push(response.url());});
        await page.goto(`${process.env.PROTOTYPE_URL??'http://127.0.0.1:4175'}/character-lab`);
        const ready=()=>page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true');await ready();
        await page.locator('.lab-fit-debug > summary').click();
        const fixtures=mobile?goldenCharacters.filter(f=>f.id==='golden_child_01'||f.id==='golden_mixed_01'):goldenCharacters;
        for(const fixture of fixtures){
            await page.locator('#lab-golden-character').selectOption(fixture.id);await ready();
            assert.equal(await page.locator('#lab-json').inputValue(),serializeCharacterDNA(goldenCharacterDNA(fixture.id)));
            const metadata=JSON.parse(await page.locator('#lab-fit-metadata').textContent());assert.equal(metadata.sockets.length,16);assert.equal(Object.keys(metadata.cages).length,4);
            await page.locator('[data-action="walk"]').click();await page.locator('[data-action="run"]').click();
        }
        await page.locator('.lab-json > summary').click();
        const legacy=goldenCharacterDNA('golden_neutral_01');delete legacy.schemaVersion;
        await page.locator('#lab-json').fill(JSON.stringify(legacy));await page.locator('[data-action="import"]').click();await ready();
        assert.equal(JSON.parse(await page.locator('#lab-json').inputValue()).schemaVersion,1);
        await page.locator('#lab-json').fill(JSON.stringify({...legacy,schemaVersion:99}));await page.locator('[data-action="import"]').click();
        assert.match(await page.locator('#lab-status').textContent(),/unsupported schemaVersion 99/);
        await page.locator('#lab-golden-character').selectOption('golden_child_01');await ready();
        await page.locator('#lab-preview').scrollIntoViewIfNeeded();await page.locator('#lab-preview').screenshot({path:`artifacts/character-contract-${mobile?'mobile':'desktop'}.png`});
        assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);console.log(`PASS ${mobile?'mobile':'desktop'} Golden selection, legacy migration, future version rejection and rendered modules`);await page.close();
    }
}finally{await browser.close();}
