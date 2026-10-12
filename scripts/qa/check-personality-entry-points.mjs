import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {loadTypeScript} from '../load-typescript.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const browser=await chromium.launch({headless:true,channel:'msedge'});
const checks=[],errors=[];
async function exported(page,selector){
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
    return JSON.parse(readFileSync(await download.path(),'utf8'));
}
try {
    for(const view of ['play','fjord-play']) {
        console.log('Checking actual entry point: '+view);
        const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto('http://127.0.0.1:5180/'+view);
        if(view==='fjord-play')await page.locator('#fjord-canvas[data-ready="true"]').waitFor({timeout:120000});
        await page.waitForTimeout(250);
        if(await page.locator('#clan-book-close').isVisible())await page.locator('#clan-book-close').click();
        const menu=view==='play'?'#play-settings':'#fjord-menu';
        await page.locator(menu+' > summary').click();
        if(view==='fjord-play')await page.locator('#fjord-campaign > summary').click();
        const exporter=view==='play'?'[data-action="export"]':'#fjord-export-core';
        const created=await exported(page,exporter);
        assert.equal(created.social.config.enabled,true);
        assert.ok(Object.values(created.world.targetClans).every(target=>target.social===undefined));
        const input=view==='play'?'#import-file':'#fjord-import';
        await page.locator(input).setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(core.createCampaign(32)))});
        const notice=view==='play'?'.play-notice':'#fjord-notice';
        await page.waitForFunction((isFjord)=>document.body.textContent.includes(isFjord?'Campaign imported, paused.':'Campaign loaded, paused.'),view==='fjord-play',{timeout:120000});
        // Menu disclosure is preserved by import; reopen only when necessary.
        if(!(await page.locator(menu).getAttribute('open')!==null))await page.locator(menu+' > summary').click();
        const imported=await exported(page,exporter);
        assert.equal(imported.social,undefined);
        const campaign=view==='play'?'#campaign-settings':'#fjord-campaign';
        const disclosure=page.locator(campaign);
        if(await disclosure.count()&&await disclosure.getAttribute('open')===null)await disclosure.locator('summary').click();
        if(view==='fjord-play'){
            const seed=page.locator('#fjord-seed');
            // The real Campaign disclosure may use a different id; open its nearest details if needed.
            if(!await seed.isVisible())await seed.locator('xpath=ancestor::details[1]').locator('summary').click();
            await seed.fill('17');await page.locator('#fjord-new').click();
            await page.waitForFunction(()=>document.querySelector('#fjord-notice')?.textContent==='New campaign created.',undefined,{timeout:120000});
        } else {
            await page.locator('#seed').fill('17');await page.locator('[data-action="new"]').click();
        }
        if(await page.locator('#clan-book-close').isVisible())await page.locator('#clan-book-close').click();
        if(await page.locator(menu).getAttribute('open')===null)await page.locator(menu+' > summary').click();
        const fresh=await exported(page,exporter);
        assert.equal(fresh.seed,17);assert.equal(fresh.social.config.enabled,true);
        checks.push({view,passed:true,checks:['real initial player factory','CPU neighbours disabled','legacy import stays off','real new-campaign button uses default-on']});
        await page.close();
    }
    assert.deepEqual(errors,[]);
    writeFileSync('docs/qa/personality-rollout/browser/entry-points.json',JSON.stringify({passed:true,checks,errors},null,2)+'\n');
    console.log(JSON.stringify({passed:true,checks}));
} finally {await browser.close();}
