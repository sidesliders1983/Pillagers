import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const base = process.env.POPULATION_QA_URL ?? 'http://127.0.0.1:5190';
const directory = 'docs/qa/population-continuity/browser';
mkdirSync(directory, {recursive:true});
const browser = await chromium.launch({headless:true,channel:'msedge'});
const checks = [], errors = [];
async function download(page, selector) {
    const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
    return JSON.parse(readFileSync(await file.path(), 'utf8'));
}
try {
    for (const view of (process.env.POPULATION_QA_VIEWS ?? 'gameplay-lab,play,fjord-play').split(',')) {
        console.log('Checking '+view);
        const context = await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
        const page = await context.newPage();
        page.setDefaultTimeout(120000);
        page.on('pageerror', error => {errors.push({view,message:error.message});console.error(error.message);});
        const fjord = view === 'fjord-play', lab = view === 'gameplay-lab';
        const exporter = fjord ? '#fjord-export-core' : '[data-action="export"]';
        async function menu() {
            if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
            for (const selector of lab ? [] : fjord ? ['#fjord-menu','#fjord-campaign'] : ['#play-settings','#campaign-settings']) {
                if (await page.locator(selector).getAttribute('open') === null) await page.locator(selector+' > summary').click();
            }
        }
        async function pause() {
            const button = page.locator(fjord ? '#fjord-run' : '[data-action="run"]');
            if ((await button.textContent()).trim() === 'Pause') await button.click();
        }
        await page.goto(base+'/'+view);
        if (fjord) await page.locator('#fjord-canvas[data-ready="true"]').waitFor({timeout:120000});
        await pause(); await menu();
        await page.screenshot({path:directory+'/'+view+'-initial.png'});
        console.log('Export initial '+view);
        const first = await download(page, exporter);
        assert.equal(first.stocks.food,15);
        assert.equal(first.landing.config.initialFood,15);
        assert.equal(first.events[0].details.stocks.food,15);
        assert.ok(Object.values(first.world.targetClans).every(c=>c.landing.config.initialFood===30));
        const old = core.createCampaign(32,{initialFood:30}); old.stocks.food=47;
        await page.locator(fjord?'#fjord-import':'#import-file').setInputFiles({name:'old-rules.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(old))});
        await page.waitForFunction(({fjord,lab})=>document.body.textContent.includes(fjord?'Campaign imported, paused.':lab?'JSON loaded, paused.':'Campaign loaded, paused.'),{fjord,lab},{timeout:120000});
        await menu();
        assert.deepEqual(await download(page,exporter),old);
        await page.locator(fjord?'#fjord-founders':'#same-founders').check();
        await page.locator(fjord?'#fjord-restart':'[data-action="restart"]').click();
        if (fjord) await page.waitForFunction(()=>document.querySelector('#fjord-notice')?.textContent==='Campaign restarted.',null,{timeout:120000});
        await pause(); await menu();
        const restarted = await download(page,exporter);
        assert.equal(restarted.stocks.food,30);
        assert.equal(restarted.landing.config.initialFood,30);
        assert.equal(restarted.time.winter,800);
        assert.deepEqual(restarted,core.applyCommand(core.createCampaign(32,{initialFood:30}),{type:'AdvanceTicks',ticks:restarted.time.tick}));
        await page.locator(fjord?'#fjord-seed':'#seed').fill('17');
        await page.locator(fjord?'#fjord-new':'[data-action="new"]').click();
        if (fjord) await page.waitForFunction(()=>document.querySelector('#fjord-notice')?.textContent==='New campaign created.',null,{timeout:120000});
        await pause(); await menu();
        const fresh = await download(page,exporter);
        assert.equal(fresh.seed,17);
        assert.equal(fresh.stocks.food,15);
        assert.equal(fresh.events[0].details.stocks.food,15);
        if (!lab) {
            const bundle = await download(page,fjord?'#fjord-export':'[data-action="export-book"]');
            assert.equal(bundle.narrative.chapters[0].facts.stocks.food,15);
        }
        assert.equal((await page.locator('body').innerText()).includes('below the founding reserve of 30'),false);
        await page.screenshot({path:directory+'/'+view+'.png'});
        checks.push({view,passed:true,initial:15,imported:47,restarted:30,newAfterImport:15,cpuInitial:30});
        await context.close();
    }
    assert.deepEqual(errors,[]);
    writeFileSync(directory+'/results.json',JSON.stringify({passed:true,browser:'Edge Chromium, 1024×768 touch emulation',physicalIPad:false,checks,errors},null,2)+'\n');
    console.log(JSON.stringify({passed:true,checks}));
} finally { await browser.close(); }
