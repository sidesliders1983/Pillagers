import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadTypeScript} from '../load-typescript.mjs';
const core=loadTypeScript(new URL('../../src/simulation/SimulationCore.ts',import.meta.url));
let state=core.advanceWinter(core.createCampaign(32,{cattleBirthChanceBps:10000,cattleMortalityYoungBps:0,cattleMortalityAdultBps:0},{mortalityBands:[{minAge:0,chanceBps:0}],fertilityChanceBps:0}));
const calf=Object.values(state.landing.cattle).find(c=>c.origin==='reproduction');
const {chromium}=createRequire(import.meta.url)(process.argv[2]+'/playwright');const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const amount of [5,10,15]){
  for(const route of ['play','gameplay-lab']){
   const page=await browser.newPage();await page.goto('http://127.0.0.1:5180/'+route);
   await page.locator('#import-file').setInputFiles({name:'calf.json',mimeType:'application/json',buffer:Buffer.from(core.serializeState(state))});
   if(route==='play')await page.locator('#entity-picker').selectOption('cattle:'+calf.id);
   const panel=page.locator(route==='play'?'#entity-panel':'#livestock-'+calf.id);
   await panel.getByRole('button',{name:'Slaughter ('+amount+' Food)',exact:true}).click();
   await page.getByRole('button',{name:'Save locally',exact:true}).click();
   const saved=core.reconstructState(await page.evaluate(()=>localStorage.getItem('pillagers.gameplay-lab.v1')));
   assert.equal(saved.stocks.food,state.stocks.food+amount);
   assert.equal(saved.landing.cattle[calf.id].deathWinter,state.time.winter);await page.close();
  }
  state=core.advanceWinter(state);
 }
 console.log('PASS: both screens show and grant 5/10/15 Food for the three cattle stages');
}finally{await browser.close();}
