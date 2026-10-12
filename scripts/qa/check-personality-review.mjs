import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
    for(const width of [1440,390]) {
        const page=await browser.newPage({viewport:{width,height:900}});
        await page.goto('http://127.0.0.1:5180/docs/qa/personality-life-events/review.html');
        await page.locator('#counts tr').nth(5).waitFor();
        assert.equal(await page.locator('#error').innerText(),'');
        assert.match(await page.locator('#story').innerText(),/quarrelled/);
        assert.match(await page.locator('#story').innerText(),/reconciled through mediation/);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:'docs/qa/personality-life-events/browser/review-'+width+'.png'});
        await page.locator('summary').click();
        assert.match(await page.locator('#sources').innerText(),/FoodConsumed/);
        await page.close();
    }
    writeFileSync('docs/qa/personality-life-events/browser/review.json',JSON.stringify({passed:true,widths:[1440,390],checks:['counts','source-linked prose','context disclosure','no horizontal overflow']},null,2)+'\n');
    console.log('Review page passed at desktop and phone widths.');
} finally {await browser.close();}
