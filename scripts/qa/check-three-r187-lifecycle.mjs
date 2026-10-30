import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installThreeSpikeProbe } from './three-r187-probe.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const arm = process.argv[2] || 'B';
const confirmCache = process.argv.includes('--confirm-cache');
const origin = `http://127.0.0.1:${arm === 'A' ? 5206 : 5207}`;
const outputArgument = process.argv.find(value => value.startsWith('--output='));
const directory = path.resolve(outputArgument?.slice('--output='.length) ||
    `scratch/three-r187-323/lifecycle-${arm}${confirmCache ? '-cache' : ''}`);
if (existsSync(path.join(directory, 'run.json'))) {
    throw new Error(`Preserve existing lifecycle evidence; choose a new --output directory: ${directory}`);
}
const temporary = path.resolve('scratch/three-r187-323/tmp');
await mkdir(directory, { recursive: true });
await mkdir(temporary, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temporary;
const fixtureDirectory = path.resolve('docs/qa/three-r187-323/fixtures');
const fixtureText = await readFile(path.join(fixtureDirectory, 'settlement-expedition.json'), 'utf8');
const report = { arm, origin, startedUtc: new Date().toISOString(), status: 'running', errors: [], imports: [], portraits: [], visuals: [] };
let observedPage;
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    args: ['--enable-precise-memory-info'] });
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await context.addInitScript(installThreeSpikeProbe);
    await context.addInitScript(text => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', text);
        localStorage.setItem('fjordside.entry-motion', 'off');
    }, fixtureText);
    const page = observedPage = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', dialog => { void dialog.accept(); });
    page.on('download', download => { void download.delete().catch(() => {}); });
    await page.goto(origin + '/fjord-play?debugPerf=1&debugLifecycle=1');
    await page.locator('[data-entry="continue"]').click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const cdp = await context.newCDPSession(page);
    const diagnostics = () => page.evaluate(() => {
        document.querySelector('[data-perf-export]').click();
        return JSON.parse(document.querySelector('#performance-overlay textarea').value);
    });
    const record = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        await page.waitForTimeout(1200);
        return { public: await diagnostics(), probe: await page.evaluate(() => window.fjordSpikeProbe.snapshot()),
            heap: await cdp.send('Runtime.getHeapUsage'),
            scene: await page.locator('#fjord-canvas').evaluate(canvas => ({ ...canvas.dataset })) };
    };
    const openMenuSection = async name => {
        const menu = page.locator('#fjord-menu');
        if (!await menu.evaluate(node => node.open)) await menu.locator(':scope > summary').click();
        const section = menu.locator('details').filter({has:page.locator('summary').filter({hasText:name})}).first();
        if (!await section.evaluate(node => node.open)) await section.locator(':scope > summary').click();
    };
    report.initial = await record();
    console.log(JSON.stringify({arm, stage:'initial-ready', notice:await page.locator('#fjord-notice').innerText()}));
    // Each import uses the real file input and scene replacement, preserving one
    // renderer owner; fresh browser launches would hide in-page resource leaks.
    const sequence = ['settlement-expedition.json', 'marsh.json', 'winter.json', 'settlement-expedition.json'];
    if (confirmCache) sequence.push('settlement-expedition.json', 'settlement-expedition.json');
    report.followup = confirmCache ? 'Two extra identical returns after the observed cross-island retention; same follow-up in both arms, primary evidence preserved.' : undefined;
    for (const fixture of sequence) {
        console.log(JSON.stringify({arm, stage:'import-start', fixture}));
        await openMenuSection('Load game');
        const before = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics')).attempt;
        const payload = JSON.parse(await readFile(path.join(fixtureDirectory, fixture), 'utf8'));
        let viewpoint;
        if (fixture !== 'settlement-expedition.json') {
            const sites = payload.fjord.campaign.mining.sites;
            const site = fixture === 'marsh.json' ? sites.find(item => item.appearance === 'bog-iron') : sites[0];
            const {x,y,z} = site.position;
            viewpoint = { target:[x,y+1,z], position:[x+36,y+32,z+44] };
            payload.presentation = {quality:'low', effects:'low', hdr:false, camera:viewpoint};
        }
        await page.locator('#fjord-import').setInputFiles({name:fixture, mimeType:'application/json',
            buffer:Buffer.from(JSON.stringify(payload.fjord))});
        await page.waitForTimeout(1000);
        console.log(JSON.stringify({arm, stage:'file-command-sent', notice:await page.locator('#fjord-notice').innerText(), loading:await page.locator('#island-loading').count()}));
        await page.waitForFunction(previous => {
            const canvas = document.querySelector('#fjord-canvas');
            const load = JSON.parse(canvas?.dataset.loadDiagnostics || '{}');
            return load.attempt !== previous && load.outcome === 'playable' && !document.body.classList.contains('island-preparing');
        }, before);
        const observation = await record();
        report.imports.push({ fixture, requestedViewpoint:viewpoint, note:"File imports use the exported Fjord bridge, not a SharedSettlement handoff; saved camera is verified separately at fresh startup.", ...observation });
        await writeFile(path.join(directory, 'progress.json'), JSON.stringify({ arm, imports: report.imports.length }));
        console.log(JSON.stringify({ arm, fixture, resources: observation.public.resources, heap: observation.heap }));
        await page.screenshot({ path: path.join(directory, `${report.imports.length}-${fixture.replace('.json','')}.png`) });
    }
    await openMenuSection('Settings');
    await page.locator('#fjord-quality').selectOption('standard');
    await page.locator('#fjord-hdr').check();
    await page.waitForFunction(() => document.querySelector('#fjord-hdr-status').textContent === 'HDR lighting enabled.');
    await page.locator('[data-menu-close]').click();
    await page.waitForTimeout(1500);
    report.hdr = await record();
    await page.screenshot({ path: path.join(directory,'standard-hdr.png') });
    const state = JSON.parse(fixtureText).fjord.campaign;
    const ids = Object.values(state.personas).filter(person => person.deathWinter === null &&
        !['founder-1','founder-2'].includes(person.id)).slice(0,3).map(person => person.id);
    for (const id of ids) {
        await page.getByRole('button', { name:'Settlement residents', exact:true }).click();
        await page.locator(`[data-kind="persona"][data-id="${id}"]`).first().click();
        const image = page.locator('#entity-panel .fjord-portrait img');
        await image.waitFor();
        await page.waitForTimeout(300);
        const source = await image.getAttribute('src');
        assert.ok(source.startsWith('data:image/'), 'Portrait is an actual encoded 2D snapshot.');
        report.portraits.push({ id, dataURL:source, diagnostics:await diagnostics(),
            camera:await page.locator('#fjord-canvas').getAttribute('data-camera') });
        await page.screenshot({ path:path.join(directory,`portrait-${id}.png`) });
    }
    report.final = await record();
    assert.deepEqual(report.errors, [], 'No runtime exceptions during imports, HDR or repeated portrait selection.');
    report.status = 'complete';
} catch (error) {
    report.status = 'technical-failure';
    if (observedPage) {
        report.failurePage = await observedPage.evaluate(() => ({bodyClass:document.body.className,
            notice:document.querySelector('#fjord-notice')?.textContent,
            canvas:document.querySelector('#fjord-canvas')?.dataset,
            loader:document.querySelector('#island-loading')?.textContent?.slice(0,1500)})).catch(() => null);
        await observedPage.screenshot({path:path.join(directory,'failure.png')}).catch(() => {});
    }
    report.failure = { message:error.message, stack:error.stack };
    process.exitCode = 1;
} finally {
    report.finishedUtc = new Date().toISOString();
    await writeFile(path.join(directory,'run.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({ arm, status:report.status, failure:report.failure }));
    await browser.close();
}
