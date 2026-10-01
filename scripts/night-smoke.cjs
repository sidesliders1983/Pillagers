const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});try{
for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(process.env.PROTOTYPE_URL||'http://127.0.0.1:4175/');
 await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Lighting day'));
 const metrics=()=>page.locator('#metrics').textContent(),before=await metrics();
 assert.match(before,/3 emissive window materials/);
 await page.getByLabel('Development tools',{exact:true}).click();await page.locator('#debug-toggle').click();
 await page.locator('#lighting-night').click();await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Lighting night'));
 // Exclude initial shader compilation from the steady presentation sample.
 await page.evaluate(()=>new Promise((resolve,reject)=>{let samples=0;const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Night metrics did not settle.'));},30000);const observer=new MutationObserver(()=>{if(++samples>=4){observer.disconnect();clearTimeout(timer);resolve();}});observer.observe(document.querySelector('#metrics'),{childList:true});}));
 assert.equal(await page.locator('#lighting-night').getAttribute('aria-pressed'),'true');
 const night=await metrics();assert.match(night,/2 direct lights/);assert.match(night,/1 shadow source · 1024px/);
 assert.ok(Number(night.match(/(\d+) draw calls/)[1])<Number(before.match(/(\d+) draw calls/)[1])*1.3);
 await page.locator('#debug-close').click();await page.waitForTimeout(800);
 fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/world-night-${mobile?'mobile':'desktop'}.png`});
 await page.getByLabel('Development tools',{exact:true}).click();await page.locator('#debug-toggle').click();
 await page.locator('#fog').uncheck();await page.locator('#shadows').uncheck();await page.locator('#lighting-day').click();
 await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Lighting day')&&document.querySelector('#metrics').textContent.includes('0 shadow source'));
 assert.equal(await page.locator('#fog').isChecked(),false);assert.equal(await page.locator('#shadows').isChecked(),false);
 await page.locator('#fog').check();await page.locator('#shadows').check();await page.locator('#lighting-night').click();await page.locator('#lighting-day').click();
 await page.waitForFunction(()=>document.querySelector('#metrics').textContent.includes('Lighting day')&&document.querySelector('#metrics').textContent.includes('2048px'));
 await page.locator('#debug-close').click();await page.waitForTimeout(800);await page.screenshot({path:`artifacts/world-day-restored-${mobile?'mobile':'desktop'}.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log(`${mobile?'Mobile':'Desktop'} day/night passed. Day:\n${before}\nNight:\n${night}`);await page.close();
}
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
