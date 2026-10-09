import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
page.setDefaultTimeout(180000);
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=async()=>{await page.locator('canvas[data-ready=true]').waitFor();await page.locator('#world-dev > summary').click();await page.click('#debug-toggle');};
const save=async()=>{
    const [download]=await Promise.all([page.waitForEvent('download'),page.click('#fjordside-export')]);
    return readFile(await download.path(),'utf8');
};
try{
    await page.goto((process.env.QA_ORIGIN||'http://127.0.0.1:5184')+'/?worldDev=1');
    await ready();
    await Promise.all([page.waitForEvent('framenavigated'),page.click('#fjordside-generate')]);
    await ready();
    await page.waitForTimeout(1500);
    const before=JSON.parse(await page.locator('canvas').getAttribute('data-population'));
    const originalSave=await save();
    assert.ok(before.some(p=>p.speed>0 && p.animation==='Walk'),'Real residents walk on the new geography');
    await page.click('#time-seasons');
    assert.equal(await page.locator('#time-seasons').getAttribute('aria-pressed'),'true');
    await page.click('#time-day-night');
    assert.equal(await page.locator('#time-day-night').getAttribute('aria-pressed'),'true');
    await page.click('#time-off');
    await page.click('#debug-close');
    await page.locator('#year-summary[open]').waitFor({timeout:80000});
    const after=JSON.parse(await page.locator('canvas').getAttribute('data-population'));
    assert.equal(after.length,10);
    for(const person of after){
        const original=before.find(p=>p.id===person.id);
        assert.equal(person.age,original.age+1<60?original.age+1:5);
        assert.ok(person.safe && Math.abs(person.y-person.ground)<.00001);
    }
    await page.click('#year-continue');
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
    assert.equal(await save(),originalSave,'Annual time never regenerates the stored geography');
    assert.equal(await page.locator('canvas').getAttribute('data-paused'),'false');
    await page.click('#fjordside-pause');
    await page.waitForTimeout(1200);
    const people=JSON.parse(await page.locator('canvas').getAttribute('data-population'));
    let selected=false;
    await page.click('#debug-close');
    for(const person of people){
        const [x,y]=person.screen;
        if(Math.abs(x)>.9 || Math.abs(y)>.9)continue;
        await page.mouse.click((x+1)*700,(1-y)*450);
        if(await page.locator('#character-profile').isVisible()){selected=true;break;}
    }
    assert.equal(selected,true,'A real resident remains selectable and opens their profile');
    assert.deepEqual(errors,[]);
    console.log('PASS: real Walk, seasons/day-night, annual aging/Continue, selection and unchanged stored geography.');
}finally{await browser.close();}
