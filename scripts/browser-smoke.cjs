const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:800}});const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(process.env.PROTOTYPE_URL||'http://127.0.0.1:5173/');
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('8 inhabitants'),{timeout:30000});
    await page.click('#debug-toggle');await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Camera '));
    const before=await page.locator('#metrics').textContent();
    await page.keyboard.down('d');await page.waitForFunction(previous=>document.querySelector('#metrics').textContent.split('Camera ')[1]!==previous,before.split('Camera ')[1],{timeout:30000});await page.keyboard.up('d');await page.waitForTimeout(800);
    const after=await page.locator('#metrics').textContent();assert.notEqual(before.split('Camera ')[1],after.split('Camera ')[1]);
    const cameraHeight=after.split('Camera ')[1].split(',')[1];
    await page.mouse.move(720,500);await page.mouse.wheel(0,-500);
    await page.waitForFunction(previous=>document.querySelector('#metrics').textContent.split('Camera ')[1]?.split(',')[1]!==previous,cameraHeight,{timeout:30000});
    await page.locator('#fog').uncheck();await page.locator('#shadows').uncheck();await page.locator('#helpers').check();await page.waitForTimeout(300);
    await page.locator('#fog').check();await page.locator('#shadows').check();await page.locator('#helpers').uncheck();await page.click('#home');
    await page.waitForFunction(()=>{const coords=document.querySelector('#metrics').textContent.split('Camera ')[1]?.split(',').map(Number);return coords&&Math.abs(coords[1]-32)<.1&&Math.abs(coords[0]-12.2)<.2;},null,{timeout:60000});
    console.log(await page.locator('#metrics').textContent());await page.click('#debug-toggle');
    fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/world-prototype.png'});
    if(process.env.VISUAL_REVIEW==='1'){
      await page.click('#debug-toggle');await page.mouse.move(650,400);await page.mouse.wheel(0,2400);
      await page.waitForFunction(()=>Number(document.querySelector('#metrics').textContent.split('Camera ')[1]?.split(',')[1])>51.8,null,{timeout:60000});
      await page.click('#debug-toggle');await page.screenshot({path:'artifacts/world-overview.png'});
      await page.click('#debug-toggle');await page.mouse.move(650,400);await page.mouse.wheel(0,-3000);
      await page.waitForFunction(()=>Number(document.querySelector('#metrics').textContent.split('Camera ')[1]?.split(',')[1])<12.2,null,{timeout:60000});
      await page.click('#debug-toggle');await page.screenshot({path:'artifacts/world-closeup.png'});
      await page.click('#home');
    }
    assert.deepEqual(errors,[]);console.log('Browser smoke passed: assets, rendering, pan, zoom, home and debug controls.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
