const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {PerspectiveCamera,Vector3}=require('three');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 try{for(const mobile of [false,true]){
  const width=mobile?390:1200,height=mobile?844:800;
  const page=await browser.newPage({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
  await page.addInitScript(()=>{window.simulationTestTime=1000;performance.now=()=>window.simulationTestTime;});
  await page.goto('http://127.0.0.1:4175/');await page.waitForFunction(()=>document.querySelector('#world')?.dataset.population,null,{timeout:60000});
  const camera=new PerspectiveCamera(45,width/height,.1,240);camera.position.set(Math.sin(.45)*28,32,2+Math.cos(.45)*28);camera.lookAt(0,0,2);camera.updateMatrixWorld();
  const population=()=>page.locator('#world').evaluate(el=>JSON.parse(el.dataset.population));
  const select=async(predicate,headHeight)=>{
   for(const p of (await population()).filter(predicate)){
    const {load}=await import('../tests/load-source.mjs');const {heightAt}=load('../src/world/Terrain.ts');
    const point=new Vector3(p.x,heightAt(p.x,p.z)+headHeight,p.z).project(camera),x=(point.x+1)*width/2,y=(1-point.y)*height/2;
    if(x<12||x>width-12||y<150||y>height-80)continue;
    if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
    if(await page.locator('#character-profile').isVisible()){
     const id=Number(await page.locator('#character-profile').getAttribute('data-character-id')),chosen=(await population())[id];
     if(predicate(chosen))return chosen;
     await page.getByRole('button',{name:'Close character profile'}).click();
    }
   }
   throw new Error('Expected selectable resident was not found');
  };
  const old=await select(p=>p.age>=60,.7);assert.match(await page.locator('.profile-identity').textContent(),new RegExp(`${old.age} years`));
  await page.evaluate(()=>window.simulationTestTime=61000);await page.waitForFunction(()=>document.querySelector('#world-year').textContent==='Year: 1201 DC',null,{timeout:60000});
  assert.ok(await page.locator('#character-profile').isHidden(),'The deceased persona card closes');
  assert.ok(await page.locator('#year-summary').isVisible());
  assert.match(await page.locator('#year-summary-count').textContent(),/10 persons/);
  const paused=await population();
  await page.evaluate(()=>window.simulationTestTime=181000);
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#world-year').textContent(),'Year: 1201 DC');
  assert.deepEqual(await population(),paused);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await select(p=>p.age===5,.45);assert.match(await page.locator('.profile-identity').textContent(),/5 years/);
  await page.evaluate(()=>window.simulationTestTime=241000);await page.waitForFunction(()=>document.querySelector('.profile-identity').textContent.includes('6 years'),null,{timeout:60000});
  assert.equal((await population()).length,10);console.log(`${mobile?'Mobile':'Desktop'}: deceased card closes, replacement child selectable and selected age refreshes from 5 to 6.`);
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
