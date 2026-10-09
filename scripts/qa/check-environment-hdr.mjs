import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const b=await chromium.launch({channel:'msedge',headless:true}),p=await b.newPage();p.setDefaultTimeout(90000);
const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{await p.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5181')+'/environment-lab');await p.locator('canvas[data-ready=true]').waitFor();
 await openEnvironmentSettings(p);
 const hdr=p.getByLabel('HDR material lighting',{exact:true});assert.equal(await hdr.count(),1,'User can compare native HDR material lighting');assert.equal(await hdr.isChecked(),false);
 await hdr.check();await p.waitForFunction(()=>document.querySelector('#environment-hdr-status').textContent.includes('HDR ON'));
 await p.selectOption('#environment-light','night');await p.waitForFunction(()=>document.querySelector('#environment-hdr-status').textContent.includes('disabled at night'));
 await p.selectOption('#environment-light','sun20-front');await p.waitForFunction(()=>document.querySelector('#environment-hdr-status').textContent.includes('HDR ON'));
 await hdr.uncheck();await p.waitForFunction(()=>document.querySelector('#environment-hdr-status').textContent.includes('HDR OFF'));assert.deepEqual(errors,[]);console.log('PASS: HDR OFF/ON, night suppression and day restoration.');
}finally{await b.close();}
