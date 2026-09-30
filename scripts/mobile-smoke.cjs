const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
try{
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto(process.env.PROTOTYPE_URL||'http://127.0.0.1:4175/');await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Center '));
assert.ok(await page.locator('.touch-control').first().isVisible());assert.equal(await page.locator('.desktop-control').first().isVisible(),false);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
const cdp=await page.context().newCDPSession(page);
const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y}))});
const read=async()=>{const text=await page.locator('#metrics').textContent();return {camera:text.match(/Camera ([^\n]+)/)[1].split(',').map(Number),center:text.match(/Center ([^\n]+)/)[1].split(',').map(Number),text};};
const radius=s=>Math.hypot(...s.camera.map((v,i)=>v-s.center[i]));
const waitRadius=async(value,direction)=>page.waitForFunction(({value,direction})=>{const text=document.querySelector('#metrics').textContent;const camera=text.match(/Camera ([^\n]+)/)?.[1].split(',').map(Number),center=text.match(/Center ([^\n]+)/)?.[1].split(',').map(Number);if(!camera||!center)return false;const r=Math.hypot(...camera.map((v,i)=>v-center[i]));return direction==='in'?r<value:r>value;},{value,direction},{timeout:60000});
const before=await read();let rotated=before;if(process.env.ZOOM_ONLY!=='1'){await send('touchStart',[[1,290,430]]);await send('touchEnd',[]);
await page.waitForFunction(previous=>document.querySelector('#metrics').textContent.match(/Center ([^\n]+)/)?.[1]!==previous,before.center.map(v=>v.toFixed(1)).join(', '),{timeout:60000});await page.waitForTimeout(2000);
const tapped=await read();assert.ok(Math.hypot(tapped.center[0]-before.center[0],tapped.center[2]-before.center[2])>1);
await send('touchStart',[[2,140,420]]);await send('touchMove',[[2,170,420]]);await send('touchMove',[[2,240,420]]);await send('touchEnd',[]);
await page.waitForFunction(previous=>document.querySelector('#metrics').textContent.match(/Camera ([^\n]+)/)?.[1]!==previous,tapped.camera.map(v=>v.toFixed(1)).join(', '),{timeout:60000});await page.waitForTimeout(1500);
rotated=await read();assert.ok(Math.hypot(...rotated.center.map((v,i)=>v-tapped.center[i]))<.3);assert.ok(Math.abs(radius(rotated)-radius(tapped))<.3);
}
await send('touchStart',[[3,130,420],[4,260,420]]);await send('touchMove',[[3,170,420],[4,220,420]]);await send('touchEnd',[]);
await waitRadius(radius(rotated)*1.3,'out');const pinched=await read();
await send('touchStart',[[5,170,420],[6,220,420]]);await send('touchMove',[[5,110,420],[6,280,420]]);await send('touchEnd',[]);
await waitRadius(radius(pinched)*.75,'in');
await page.click('#home');await page.waitForTimeout(1500);fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/mobile-lan.png'});
assert.deepEqual(errors,[]);console.log((await read()).text);console.log(process.env.ZOOM_ONLY==='1'?'Mobile zoom passed: pinch out and spread in on LAN production build.':'Mobile browser passed: LAN loading, responsive UI, terrain tap, centered orbit, pinch out and spread in.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
