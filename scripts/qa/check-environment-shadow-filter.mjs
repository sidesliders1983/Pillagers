import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage();page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5181')+'/environment-lab');await page.locator('canvas[data-ready=true]').waitFor();
 await openEnvironmentSettings(page);
 const filter=page.getByRole('spinbutton',{name:'PCF shadow radius',exact:true});
 assert.equal(await filter.count(),1,'The Lab exposes the native shadow filter radius');
 assert.equal(await filter.isDisabled(),true);
 await page.selectOption('#environment-light','sun20-front');
 for(const value of [1.5,4]){await filter.fill(String(value));await filter.dispatchEvent('change');await page.waitForFunction(v=>JSON.parse(document.querySelector('canvas').dataset.fixture).lightSettings.shadow.radius===v,value);}
 await page.selectOption('#environment-light','day');
 await page.waitForFunction(()=>JSON.parse(document.querySelector('canvas').dataset.fixture).lightSettings.shadow.radius===4);
 assert.equal(await filter.isDisabled(),true);assert.deepEqual(errors,[]);console.log('PASS: native PCF filter controls and baseline restoration.');
}finally{await browser.close();}
