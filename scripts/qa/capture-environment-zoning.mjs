import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {openEnvironmentSettings} from './environment-settings.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output='scratch/environment-zoning-browser';
await mkdir(output,{recursive:true});
const batch=JSON.parse(await readFile('scratch/environment-zoning/batch.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});
page.setDefaultTimeout(120000);
const report={date:new Date().toISOString(),errors:[],seeds:[],rendererComparison:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180')+'/environment-lab');
    const canvas=page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    await page.locator('#environment-fog').uncheck();
    await page.locator('#environment-pause').check();
    await page.selectOption('#environment-quality','low');
    async function importWorld(name,buffer) {
        const previous=JSON.parse(await canvas.getAttribute('data-world') || '{}').generations || 0;
        await page.locator('#world-import').setInputFiles({name,mimeType:'application/json',buffer});
        await page.waitForFunction(n=>JSON.parse(document.querySelector('canvas').dataset.world || '{}').generations>n,previous);
        await page.waitForFunction(()=>!document.querySelector('#world-generate').disabled);
    }
    for(const seed of batch.seeds) {
        await openEnvironmentSettings(page);
        await importWorld(seed+'.json',await readFile('scratch/environment-zoning/'+seed+'.json'));
        await page.selectOption('#world-overlay','environment');
        await page.selectOption('#environment-camera','island-oblique');
        for(const control of ['nature','village','water']) await page.locator('#environment-'+control).uncheck();
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(250);
        await canvas.screenshot({path:output+'/'+seed+'-oblique.jpg',type:'jpeg',quality:84});
        await openEnvironmentSettings(page);
        await page.selectOption('#world-overlay','none');
        await page.selectOption('#environment-camera','shore');
        for(const control of ['nature','village','water']) await page.locator('#environment-'+control).check();
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(500);
        await canvas.screenshot({path:output+'/'+seed+'-normal.jpg',type:'jpeg',quality:84});
        report.seeds.push({seed,metrics:JSON.parse(await canvas.getAttribute('data-metrics')),
            camera:JSON.parse(await canvas.getAttribute('data-fixture')).camera});
        console.log('Captured seed '+seed);
    }
    for(const variant of ['baseline','zoned']) {
        await openEnvironmentSettings(page);
        const path=variant==='baseline'?'scratch/environment-zoning/18-baseline.json':'scratch/environment-zoning/18.json';
        await importWorld(variant+'.json',await readFile(path));
        await page.selectOption('#environment-camera','player-start');
        await page.selectOption('#world-overlay','none');
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(1200);
        const windows=[];
        for(let i=0;i<6;i++) {
            await page.waitForTimeout(650);
            windows.push(JSON.parse(await canvas.getAttribute('data-metrics')));
        }
        report.rendererComparison.push({variant,windows});
        await canvas.screenshot({path:output+'/18-'+variant+'-comparison.jpg',type:'jpeg',quality:86});
    }
    assert.deepEqual(report.errors,[]);
} finally {
    await writeFile(output+'/comparisons.json',JSON.stringify(report,null,2));
    await browser.close();
}
