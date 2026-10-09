import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage();try{await p.goto('http://127.0.0.1:5181/environment-lab');await p.locator('#environment-canvas[data-ready=true]').waitFor({timeout:60000});
 await openEnvironmentSettings(p);assert.equal(await p.locator('#environment-nature').count(),1,'authored KayKit scenery can be isolated for review');assert.equal(await p.locator('#environment-nature').isChecked(),true);assert.match(await p.locator('#environment-status').innerText(),/KayKit Forest Nature Pack 1.0 FREE/);}finally{await b.close();}
