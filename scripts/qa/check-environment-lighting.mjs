import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(90000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
 await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5181')+'/environment-lab');
 await page.locator('canvas[data-ready=true]').waitFor();
 await openEnvironmentSettings(page);
 const lighting=page.locator('#environment-light');
 await lighting.waitFor();
 assert.ok((await lighting.locator('option').allTextContents()).includes('Low sun · 20°'),'User can choose a static low northern sun');
 await lighting.selectOption('sun20');
 await page.waitForFunction(text=>document.querySelector('#environment-lighting-status').textContent.includes(text),'20°');
 await lighting.selectOption('night');
 await page.waitForFunction(text=>document.querySelector('#environment-lighting-status').textContent.includes(text),'Night');
 await lighting.selectOption('day');
 await page.waitForFunction(text=>document.querySelector('#environment-lighting-status').textContent.includes(text),'Current day');
 assert.deepEqual(errors,[]);console.log('PASS: low sun, night and current-day controls.');
} finally {await browser.close();}
