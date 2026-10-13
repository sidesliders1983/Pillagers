import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await page.goto('http://127.0.0.1:5180/fjord-play?seed=32',{waitUntil:'domcontentloaded'});
 await page.locator('#island-loading').waitFor({timeout:5000});
 assert.equal(await page.locator('#island-loading-status').textContent(),'Shaping coast & valleys');
 await page.getByRole('button',{name:'Cancel loading',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('pillagers.fjord-play.active.v1')),null);
 console.log('initial preview and cancellation passed');
}finally{await browser.close();}
