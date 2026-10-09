import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import sharp from 'sharp';
const {chromium}=createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
page.setDefaultTimeout(120000);
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181')+'/environment-lab');
    const canvas=page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    for(const id of ['ground','nature','village'])await page.locator('#environment-'+id).uncheck();
    await page.locator('#environment-pause').check();
    await page.selectOption('#environment-camera','landscape');
    await page.waitForTimeout(1200);
    const fogged=await canvas.screenshot();
    await page.locator('#environment-fog').uncheck();
    await page.waitForTimeout(1000);
    const clear=await canvas.screenshot();
    const first=await sharp(fogged).removeAlpha().raw().toBuffer();
    const second=await sharp(clear).removeAlpha().raw().toBuffer();
    let changed=0;
    for(let i=0;i<first.length;i++)if(Math.abs(first[i]-second[i])>3)changed++;
    assert.ok(changed>500,'Native fog must affect the visible isolated sourced water');
    await page.locator('#environment-fog').check();
    await page.waitForTimeout(500);
    const {data,info}=await sharp(await canvas.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));
    const sky=pixel(Math.floor(info.width/2),10);
    const farWater=pixel(Math.floor(info.width/2),Math.floor(info.height*.6));
    console.log({sky,farWater});
    assert.ok(sky.every((channel,i)=>Math.abs(channel-farWater[i])<=2),
        'Distant water must join the native scene fog rather than exposing a hard dark horizon');
    console.log('PASS: sourced water joins the existing native fog at the far horizon.');
}finally{await browser.close();}
