const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const {load}=await import('../tests/load-source.mjs');
 const {MovementSystem}=load('../src/systems/MovementSystem.ts'),{Villager}=load('../src/entities/Villager.ts');
 const {generateCharacterDNA}=load('../src/characters/generateCharacterDNA.ts'),{generatePhenotype}=load('../src/characters/generatePhenotype.ts');
 const {characterName,fullName}=load('../src/characters/naming/generateName.ts');
 const {PerspectiveCamera,Vector3}=require('three');
 const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-webgl']});
 try{for(const mobile of [false,true]){
  const width=mobile?390:1200,height=mobile?844:800,errors=[];
  const page=await browser.newPage({viewport:{width,height},isMobile:mobile,hasTouch:mobile});page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>raf(time=>{if(!window.holdWorldFrames)callback(time);});});
  await page.goto(process.env.PROTOTYPE_URL||'http://127.0.0.1:4175/');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('10 inhabitants'));await page.evaluate(()=>window.holdWorldFrames=true);
  const units=Array.from({length:10},(_,i)=>new Villager(i));new MovementSystem(units);
  const camera=new PerspectiveCamera(45,width/height,.1,240);camera.position.set(Math.sin(.45)*28,32,2+Math.cos(.45)*28);camera.lookAt(0,0,2);camera.updateMatrixWorld();
  const tap=async(x,y)=>{if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.click(x,y);};
  let selected=false;
  for(const unit of units){
   const dna=generateCharacterDNA((1983+Math.imul(unit.id+1,2654435761))>>>0),phenotype=generatePhenotype(dna);
   const point=new Vector3().copy(unit.visual.position);point.y+=phenotype.height*.5;point.project(camera);
   const x=(point.x+1)*width/2,y=(1-point.y)*height/2;if(x<10||x>width-10||y<170||y>height-120)continue;
   await tap(x,y);
   if(await page.locator('#character-profile').isVisible()){
    const id=Number(await page.locator('#character-profile').getAttribute('data-character-id'));
    const expected=generateCharacterDNA((1983+Math.imul(id+1,2654435761))>>>0);
    assert.equal(await page.locator('#character-profile h2').textContent(),fullName(characterName(expected)));
    assert.match(await page.locator('.profile-identity').textContent(),new RegExp(`${expected.age} years`));
    assert.match(await page.locator('.profile-identity').textContent(),new RegExp(expected.sex==='male'?'Male':'Female'));
    assert.equal(await page.locator('.profile-traits dt').count(),5);assert.equal(await page.locator('.profile-heritage>div').count(),6);
    const box=await page.locator('#character-profile').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);
    fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:`artifacts/world-profile-${mobile?'mobile':'desktop'}.png`});
    await page.getByRole('button',{name:'Close character profile'}).click();assert.ok(await page.locator('#character-profile').isHidden());selected=true;break;
   }
  }
  assert.ok(selected,`A resident can be ${mobile?'tapped':'clicked'}`);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('World profiles passed: ten generated residents, desktop click/mobile tap, matching seeded name/age/gender/traits/heritage, bounded card and close.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
