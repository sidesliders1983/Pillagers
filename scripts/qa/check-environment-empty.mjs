import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5181')+'/environment-lab');await page.locator('canvas[data-ready=true]').waitFor();await page.selectOption('#environment-light','sun20-front');
 for(const layer of ['water','ground','nature','village'])await page.locator('#environment-'+layer).uncheck();
 await page.waitForTimeout(900);const settings=JSON.parse(await page.locator('canvas').getAttribute('data-fixture')).lightSettings;
 assert.ok(Object.values(settings.shadow.frustum).every(Number.isFinite),'The public lighting fixture stays valid when every scene layer is hidden');
 await page.locator('#environment-ground').check();await page.waitForTimeout(900);const visible=JSON.parse(await page.locator('canvas').getAttribute('data-fixture')).lightSettings;
 assert.ok(Object.values(visible.shadow.frustum).every(Number.isFinite));assert.deepEqual(errors,[]);console.log('PASS: empty and restored scene lighting has finite shadow coverage.');
}finally{await browser.close();}
