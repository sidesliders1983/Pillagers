// Browser regression for the owner's withdrawal of legacy outfits.
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE??'playwright');
mkdirSync('artifacts/clothing',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:1000},isMobile:mobile,hasTouch:mobile});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));page.setDefaultTimeout(60000);
  await page.goto(`${process.env.PROTOTYPE_URL??'http://127.0.0.1:5181'}/character-lab`);
  await page.locator('#lab-preview[data-ready=true]').waitFor();
  await page.selectOption('#lab-body-source','published');
  await page.waitForFunction(()=>document.querySelector('#lab-source-status')?.textContent.includes('retired')&&document.querySelector('#lab-preview')?.dataset.ready==='true');
  const outfits=await page.locator('#lab-module-outfit option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.deepEqual(outfits,['auto','none']);
  await page.locator('.lab-fit-debug > summary').evaluate(e=>e.parentElement.open=true);
  const snapshot=JSON.parse(await page.locator('#lab-fit-metadata').textContent());
  assert.equal(snapshot.modules.some(m=>m.id.startsWith('garment/')),false);
  assert.ok(snapshot.modules.some(m=>m.id.startsWith('hair/')));
  for(const clip of ['Walk','Run','Idle'])await page.selectOption('#lab-animation',clip);
  await page.locator('#lab-preview').screenshot({path:`artifacts/clothing/retired-${mobile?'mobile':'desktop'}.png`});
  assert.equal(requests.some(path=>path.startsWith('/clothing/')),false);assert.deepEqual(errors,[]);
  console.log(`PASS ${mobile?'mobile-emulated':'desktop'} no old outfit choices/requests, head appearance and pose controls`);await page.close();
 }
}finally{await browser.close();}
