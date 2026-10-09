import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5181';
const output = process.env.QA_OUTPUT || 'scratch/fjordside-integration-review';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1400,height:900}});
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror',error => errors.push(error.message));
page.on('console',message => {if(message.type()==='error')errors.push(message.text());});
const shots = [],measurements = [];
const ready = async () => {
    await page.locator('canvas[data-ready=true]').waitFor();
    await page.waitForTimeout(800);
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
const reloadBy = async action => {
    await Promise.all([page.waitForEvent('framenavigated'),action()]);
    await ready();
};
const capture = async id => {
    await page.click('#debug-close');
    await page.waitForTimeout(700);
    const png = await page.locator('canvas').screenshot();
    await sharp(png).webp({quality:86}).toFile(output+'/'+id+'.webp');
    const fixture = JSON.parse(await page.locator('canvas').getAttribute('data-fixture'));
    const population = JSON.parse(await page.locator('canvas').getAttribute('data-population'));
    assert.equal(population.length,10);
    assert.ok(population.every(p => p.safe && Math.abs(p.y-p.ground)<.00001));
    shots.push({id,file:id+'.webp',fixture,population});
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
try {
    await page.goto(origin+'/?worldDev=1');
    await ready();
    for (const mode of ['reference',17,91]) {
        if(mode === 'reference') await reloadBy(() => page.click('#fjordside-reference'));
        else {
            await page.fill('#fjordside-seed',String(mode));
            await reloadBy(() => page.click('#fjordside-generate'));
        }
        for(const quality of ['standard','low']) {
            if(await page.locator('#fjordside-quality').inputValue()!==quality)
                await page.selectOption('#fjordside-quality',quality);
            await page.waitForTimeout(900);
            await page.click('#fjordside-pause');
            for(const lighting of ['day','night']) {
                await page.click('#lighting-'+lighting);
                for(const view of ['village','shore','overlook']) {
                    await page.selectOption('#fjordside-camera',view);
                    await page.waitForTimeout(800);
                    await capture(mode+'-'+quality+'-'+lighting+'-'+view);
                }
            }
            await page.click('#lighting-day');
            await page.selectOption('#fjordside-camera','overlook');
            await page.waitForTimeout(700);
            // Future measurements include animated residents/effects rather than the paused capture fixture.
            await page.click('#fjordside-pause');
            const hardware = await page.evaluate(() => {
                const gl=document.querySelector('canvas').getContext('webgl2');
                const extension=gl.getExtension('WEBGL_debug_renderer_info');
                return {userAgent:navigator.userAgent,vendor:extension?gl.getParameter(extension.UNMASKED_VENDOR_WEBGL):null,
                    renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):null};
            });
            const runs=[];
            for(let run=0;run<3;run++) {
                runs.push(await page.evaluate(() => new Promise(resolve => {
                    const frames=[];
                    let started,previous;
                    const sample=time => {
                        if(started===undefined)started=previous=time;
                        else {frames.push(time-previous);previous=time;}
                        if(time-started<4000)requestAnimationFrame(sample);
                        else resolve(frames);
                    };
                    requestAnimationFrame(sample);
                })));
            }
            measurements.push({mode,quality,hardware,runs,metrics:JSON.parse(await page.locator('canvas').getAttribute('data-metrics'))});
        }
    }
    assert.deepEqual(errors,[]);
    await writeFile(output+'/results.json',JSON.stringify({shots,measurements,errors},null,2));
    console.log('PASS: 36 real-world reference/17/91 captures, equal populations and raw timing intervals.');
} finally {
    await browser.close();
}
