import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.argv[2]+'/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1920,height:920}});
try{
 await page.goto('http://127.0.0.1:5180/play');
 for(let i=0;i<6;i++)await page.getByRole('button',{name:'+1 Winter',exact:true}).click();
 const chronicle=page.locator('.play-left details');await chronicle.locator('summary').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'desktop settlement should not scroll the page');
 const before=await page.locator('#board-scene').getAttribute('style');
 await page.locator('#settlement-board').hover();await page.mouse.wheel(0,-240);await page.waitForTimeout(100);
 assert.notEqual(await page.locator('#board-scene').getAttribute('style'),before);
 assert.equal(await page.evaluate(()=>scrollY),0);
 const watch=page.locator('.play-left');await watch.hover();await page.mouse.wheel(0,600);await page.waitForTimeout(100);
 assert.ok(await watch.evaluate(e=>e.scrollTop)>0,'long Winter watch remains independently scrollable');
 assert.equal(await page.evaluate(()=>scrollY),0);
 await page.locator('#play-settings > summary').click();
 await page.locator('#campaign-settings summary').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'campaign settings should not push the board outside the viewport');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'mobile should retain page scrolling');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: desktop viewport, independent sidebar scrolling, board wheel zoom, campaign settings and mobile scrolling');
}finally{await browser.close();}
