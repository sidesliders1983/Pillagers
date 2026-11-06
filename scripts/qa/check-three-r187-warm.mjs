import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installThreeSpikeProbe } from './three-r187-probe.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const arm=process.argv[2] || 'A';
const origin=`http://127.0.0.1:${arm==='A'?5206:5207}`;
const outputArgument = process.argv.find(value => value.startsWith('--output='));
const output = path.resolve(outputArgument?.slice('--output='.length) || `scratch/three-r187-323/warm-${arm}`);
if (existsSync(path.join(output, 'run.json'))) {
    throw new Error(`Preserve existing warm-load evidence; choose a new --output directory: ${output}`);
}
const temporary=path.resolve('scratch/three-r187-323/tmp');
await mkdir(output,{recursive:true}); await mkdir(temporary,{recursive:true});
process.env.TEMP=process.env.TMP=process.env.TMPDIR=temporary;
const fixture=await readFile('docs/qa/three-r187-323/fixtures/settlement-expedition.json','utf8');
const browser=await chromium.launch({headless:true,chromiumSandbox:true,
    executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',args:['--enable-precise-memory-info']});
const report={arm,origin,browser:browser.version(),startedUtc:new Date().toISOString(),status:'running',rows:[],errors:[]};
try {
    const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
    await context.addInitScript(installThreeSpikeProbe);
    await context.addInitScript(text=>{
        sessionStorage.setItem('pillagers.fjord-play.active.v1',text);
        localStorage.setItem('fjordside.entry-motion','off');
    },fixture);
    const page=await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror',error=>report.errors.push(error.message));
    for(const cache of ['fresh-context','same-context-reload']) {
        const started=performance.now();
        if(cache==='fresh-context') await page.goto(origin+'/fjord-play?debugPerf=1');
        else await page.reload();
        await page.locator('[data-entry="continue"]').click();
        await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
        report.rows.push({cache,toReadyMs:performance.now()-started,
            loading:JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics')),
            contexts:await page.evaluate(()=>window.fjordSpikeProbe.snapshot().contexts)});
    }
    assert.deepEqual(report.errors,[]);
    report.status='complete';
} catch(error) {report.status='technical-failure';report.failure=error.message;process.exitCode=1;}
finally {
    report.finishedUtc=new Date().toISOString();
    await writeFile(path.join(output,'run.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({arm,status:report.status,rows:report.rows.map(row=>({cache:row.cache,toReadyMs:row.toReadyMs})),failure:report.failure}));
    await browser.close();
}
