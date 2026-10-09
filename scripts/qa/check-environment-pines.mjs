import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5181')+'/environment-lab');
 await page.locator('canvas[data-ready=true]').waitFor();
 await openEnvironmentSettings(page);
 const choice=page.getByLabel('Conifers',{exact:true});
 assert.equal(await choice.count(),1,'Environment Lab exposes the conifer choice');
 assert.equal(await choice.inputValue(),'ez-tree','Environment Lab opens with the accepted EZ-Tree crown');
 assert.deepEqual(errors,[]);console.log('PASS: Environment Lab opens with EZ-Tree conifers.');
}finally{await browser.close();}
