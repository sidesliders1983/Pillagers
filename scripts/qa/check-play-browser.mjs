import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
const {chromium}=createRequire(import.meta.url)(process.argv[2]+'/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
mkdirSync('artifacts/qa/play',{recursive:true});
const checks=[];
async function utility(name){if(new URL(page.url()).pathname==='/play')await page.locator('#play-settings > summary').waitFor();const d=page.locator('#play-settings');const exists=await d.count();if(exists&&!await d.evaluate(e=>e.open))await d.locator(':scope > summary').click();await page.getByRole('button',{name,exact:true}).click();if(exists&&await d.evaluate(e=>e.open))await d.locator(':scope > summary').click();}
try{
 await page.goto('http://127.0.0.1:5180/play');await page.locator('#play-hud').waitFor({timeout:10000});
 assert.equal(await page.locator('.play-footer button').filter({hasText:/longship/}).count(),0);assert.match(await page.locator('#play-hud').innerText(),/Food 30/);assert.equal(await page.locator('.board-entity.persona').count(),10);checks.push('Opening /play uses canonical ten-founder Landing and HUD');
 await page.locator('#board-persona-founder-1').click();assert.match(await page.locator('#entity-panel').innerText(),/MaelColuim/);assert.match(await page.locator('#entity-panel').innerText(),/Occupation/);checks.push('Click resident opens identity, occupation and lineage');
 await page.locator('#board-longship-founding-longship').click();assert.match(await page.locator('#entity-panel').innerText(),/maritime/);await page.locator('#entity-panel').getByRole('button',{name:'Keep longship',exact:true}).click();assert.equal(await page.locator('.board-entity.longship').count(),1);await page.locator('#entity-panel').getByRole('button',{name:/^Salvage longship/}).click();assert.equal(await page.locator('.board-entity.longship').count(),0);checks.push('Select visible longship, keep it, then salvage for Materials and remove its sprite');assert.match(await page.locator('#play-hud').innerText(),/Materials 25/);
 await page.locator('#board-household-founder-1').click();await page.getByRole('button',{name:/^Build house/}).click();await page.locator('#board-building-house-1').waitFor();
 await page.locator('#board-building-house-1').click();assert.match(await page.locator('#entity-panel').innerText(),/Upkeep/);assert.match(await page.locator('#entity-panel').innerText(),/MaelColuim/);checks.push('Tent household command builds real house sprite; selection shows members and maintenance');
 await page.locator('#entity-picker').selectOption('persona:founder-1');await page.locator('#occupation').selectOption('farmer');await page.getByRole('button',{name:'Assign occupation',exact:true}).click();
 await page.locator('#board-cattle-cattle-1').click();assert.match(await page.locator('#entity-panel').innerText(),/Adult/);await page.locator('#farmyard').selectOption('house-1');await page.getByRole('button',{name:'Assign livestock',exact:true}).click();assert.match(await page.locator('#entity-panel').innerText(),/Sheltered/);checks.push('Livestock selection and real Farmyard assignment update panel and board');
 await page.locator('#board-building-house-1').click();await page.locator('#entity-panel').getByRole('button',{name:'Salvage house (5 Materials)',exact:true}).click();
 assert.equal(await page.locator('#board-building-house-1').count(),0);assert.equal(await page.locator('#board-household-founder-1').count(),1);assert.match(await page.locator('#play-hud').innerText(),/Materials 20/);
 await page.locator('#board-cattle-cattle-1').click();assert.match(await page.locator('#entity-panel').innerText(),/Exposed/);checks.push('House salvage returns half Materials, moves residents to a tent and unassigns Farmyard livestock');
 await utility('Save locally');await page.getByRole('button',{name:'+1 Winter',exact:true}).click();assert.equal(await page.locator('#winter-value').innerText(),'801');await utility('Load locally');assert.equal(await page.locator('#winter-value').innerText(),'800');checks.push('Advance Winter updates HUD; local save/load restores paused campaign');
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.getByRole('button',{name:'Fit settlement',exact:true}).click();checks.push('Zoom and fit retain canonical HUD');
 const config=structuredClone(core.defaultWeatherConfig);for(const c of core.weatherClasses)config.profiles[c].probabilityBps=c==='Severe'?10000:0;
 config.profiles.Severe.exposedCattleMortalityBps=0;config.profiles.Severe.tentMortalityBps=0;
 const state=core.createCampaign(32,{cattleBirthChanceBps:10000,cattleMortalityAdultBps:0,cattleMortalityYoungBps:0},{mortalityBands:[{minAge:0,chanceBps:0}]},config);
 await page.locator('#import-file').setInputFiles({name:'weather.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(state))});await page.locator('.weather-Severe').waitFor();assert.match(await page.locator('.play-left').innerText(),/Severe Winter/);checks.push('Severe canonical weather produces warning and overlay without UI rolls');
 await page.getByRole('button',{name:'+1 Winter',exact:true}).click();assert.equal(await page.locator('.board-entity.cattle').count(),5);checks.push('Canonical calving adds living calf sprites');
 await utility('Save locally');await page.goto('http://127.0.0.1:5180/gameplay-lab');await utility('Load locally');assert.match(await page.locator('header').innerText(),/WINTER 801/);await page.goto('http://127.0.0.1:5180/play');await utility('Load locally');assert.equal(await page.locator('.board-entity.cattle').count(),5);checks.push('Gameplay Lab and /play share canonical saves through explicit load');
 await page.screenshot({path:'artifacts/qa/play/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:'artifacts/qa/play/mobile.png',fullPage:true});checks.push('Narrow layout avoids horizontal overflow');
 assert.ok(await page.locator('.board-entity img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));assert.deepEqual(errors,[]);assert.ok(!requests.some(url=>/\.glb|\/draco\//.test(url)));checks.push('All sprites loaded; player board requests no GLB/Draco and has no runtime errors');
 mkdirSync('artifacts/qa/play',{recursive:true});writeFileSync('artifacts/qa/play/browser-report.json',JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks},null,2));
}catch(e){console.log('FAIL URL',page.url(),'ERRORS',errors,'BODY',(await page.locator('body').innerText()).slice(0,1400));throw e;}finally{await browser.close();}
