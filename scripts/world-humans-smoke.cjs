const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('http://127.0.0.1:4175/');
  await page.waitForFunction(()=>document.querySelector('#metrics')?.textContent.includes('0 LOD1 / 10 LOD2'),null,{timeout:60000});
  assert.equal(requests.filter(url=>url.includes('UniversalHuman_LOD2.glb')).length,1);
  assert.match(await page.locator('#metrics').textContent(),/:Walk/);
  await page.mouse.move(600,400);await page.mouse.wheel(0,-2500);
  await page.waitForFunction(()=>/Rigged humans: [1-9]\d* LOD1/.test(document.querySelector('#metrics')?.textContent),null,{timeout:60000});
  assert.equal(requests.filter(url=>url.includes('UniversalHuman_LOD1.glb')).length,1);
  console.log(await page.locator('#metrics').textContent());
  await page.screenshot({path:'artifacts/world-rigged-humans.png'});
  await page.goto('http://127.0.0.1:4175/character-lab');
  await page.waitForFunction(()=>document.querySelector('#lab-preview')?.dataset.ready==='true',null,{timeout:60000});
  for(const name of ['Walk','Run','Idle'])await page.getByRole('button',{name,exact:true}).click();
  assert.deepEqual(errors,[]);console.log('PASS: shared body loading, ten residents, walk, close LOD1 and Character Lab runtime.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
