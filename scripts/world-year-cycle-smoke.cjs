const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {load}=await import('../tests/load-source.mjs');
 const {agePersona}=load('../src/systems/AnnualCycle.ts'),{generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts');
 const {walkable}=load('../src/systems/MovementSystem.ts');
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1200,height:800},isMobile:mobile,hasTouch:mobile}),errors=[],bodies=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('UniversalHuman_LOD2.glb'))bodies.push(r.url());});
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  // Drive the real simulation clock at exact boundaries; the production duration stays 60,000ms.
  await page.addInitScript(()=>{window.simulationTestTime=1000;performance.now=()=>window.simulationTestTime;});
  await page.goto('http://127.0.0.1:4175/');
  await page.waitForFunction(()=>document.querySelector('#world')?.dataset.population,null,{timeout:60000});
  const population=()=>page.locator('#world').evaluate(el=>JSON.parse(el.dataset.population));
  const step=async(ms,year,progress)=>{
   await page.evaluate(ms=>window.simulationTestTime=1000+ms,ms);
   await page.waitForFunction(({year,progress})=>document.querySelector('#world-year').textContent===`Year: ${year} DC`&&Math.abs(Number(document.querySelector('#world').dataset.yearProgress)-progress)<.00001,{year,progress},{timeout:60000});
   assert.equal(await page.locator('dialog[open]').count(),0);
   assert.equal(await page.locator('#world').getAttribute('data-paused'),'false');
  };
  let expected=Array.from({length:10},(_,i)=>generateCharacterDNA((1983+Math.imul(i+1,2654435761))>>>0));
  assert.deepEqual((await population()).map(p=>p.age),expected.map(p=>p.age));
  await step(59999,1200,59999/60000);assert.match(await page.locator('#world-fps').textContent(),/^FPS: \d+$/);
  await page.locator('#debug').evaluate(el=>el.hidden=false);
  await page.click('#time-day-night');assert.equal(await page.locator('#time-day-night').getAttribute('aria-pressed'),'true');
  await step(60000,1201,0);expected=expected.map((dna,i)=>agePersona(dna,1201,i).dna);
  const first=await population();assert.equal(first.length,10);assert.deepEqual(first.map(p=>p.age),expected.map(p=>p.age));assert.deepEqual(first.map(p=>p.seed),expected.map(p=>p.seed));
  assert.ok(first.every(p=>walkable(p.x,p.z)));assert.ok(first.some(p=>p.age===5));
  await step(90000,1201,.5);assert.equal(await page.locator('body').getAttribute('data-lighting'),'day');
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/year-noon-${mobile?'mobile':'desktop'}.png`,timeout:90000});
  await page.click('#time-seasons');assert.equal(await page.locator('#world-year').textContent(),'Year: 1201 DC');
  assert.equal(Number(await page.locator('#world').getAttribute('data-year-progress')),.5);assert.deepEqual((await population()).map(p=>p.age),expected.map(p=>p.age));
  await step(105000,1201,.75);await page.screenshot({path:`artifacts/year-autumn-${mobile?'mobile':'desktop'}.png`,timeout:90000});
  await step(120000,1202,0);expected=expected.map((dna,i)=>agePersona(dna,1202,i).dna);
  assert.deepEqual((await population()).map(p=>p.age),expected.map(p=>p.age));
  // A delayed frame catches every annual tick and supports repeated death/respawn cycles.
  const endYear=process.env.SKIP_CATCHUP?1202:1260;
  for(let year=1203;year<=endYear;year++){expected=expected.map((dna,i)=>agePersona(dna,year,i).dna);await step((year-1200)*60000,year,0);}
  const later=await population();
  assert.equal(later.length,10);assert.deepEqual(later.map(p=>p.age),expected.map(p=>p.age));assert.deepEqual(later.map(p=>p.seed),expected.map(p=>p.seed));assert.ok(later.every(p=>walkable(p.x,p.z)));
  assert.equal(bodies.length,1,'Respawns reuse the cached GLB');
  await page.click('#time-off');assert.equal(await page.locator('#world-year').textContent(),`Year: ${endYear} DC`);
  assert.ok(await page.locator('#world-year').isVisible());assert.ok(await page.locator('#world-fps').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log(`${mobile?'Mobile':'Desktop'}: exact 60s boundary, ages, five-year-old safe respawns, constant population, ${endYear-1200} years, visualization switches and cached source passed.`);
  await page.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
