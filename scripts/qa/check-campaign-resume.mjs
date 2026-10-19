import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.pace.running = false;
delete fixture.target;
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const output = process.env.QA_OUTPUT || 'artifacts/campaign-resume';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(raw => {
        if (!sessionStorage.getItem('qa-resume-seeded')) {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', raw);
            sessionStorage.setItem('qa-resume-seeded', 'true');
        }
        window.resumeHeartbeats = 0;
        setInterval(() => window.resumeHeartbeats++, 50);
    }, JSON.stringify(fixture));
    await page.goto(origin + '/fjord-play?debugLifecycle=1', { waitUntil: 'domcontentloaded' });
    await page.locator('#island-loading[data-mode="resume"]').waitFor({ timeout: 5000 });
    assert.match(await page.locator('#island-loading').innerText(), /Returning to your settlement/);
    assert.match(await page.locator('#island-loading').innerText(), /Summer 810/);
    const before = await page.evaluate(() => window.resumeHeartbeats);
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => window.resumeHeartbeats) > before + 2, 'Resume shell stays responsive');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#island-loading').count(), 0);
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
    const restored = JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    assert.deepEqual(restored.fjord.campaign, fixture.fjord.campaign);
    assert.deepEqual(restored.fjord.narrative, fixture.fjord.narrative);
    assert.deepEqual(restored.fjord.island, fixture.fjord.island);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: output + '/restored-mobile.png' });
    await page.locator('#fjord-run').tap();
    await page.waitForTimeout(600);
    const suspension = await page.evaluate(() => {
        window.resumeCanvas = document.querySelector('#fjord-canvas');
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        return sessionStorage.getItem('pillagers.fjord-play.active.v1');
    });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.resumeCanvas === document.querySelector('#fjord-canvas')), true,
        'Cached return keeps the same canvas and renderer instead of reloading');
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
    const afterReturn = await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'));
    assert.deepEqual(JSON.parse(afterReturn).fjord.campaign, JSON.parse(suspension).fjord.campaign,
        'Suspension never advances canonical time or RNG');
    console.log('Synthetic persisted page lifecycle retains the exact live scene and pauses playback.');
    await page.locator('#fjord-run').tap();
    assert.equal(await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas');
        window.resumeGl = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!window.resumeGl) return false;
        window.resumeGl.loseContext();
        return true;
    }), true, 'This browser must support a real context-loss test');
    await page.locator('#fjord-context-recovery').waitFor({ timeout: 5000 });
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
    const contextCheckpoint = await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.resumeGl.restoreContext());
    await page.locator('#fjord-context-recovery').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.resumeCanvas === document.querySelector('#fjord-canvas')), true);
    assert.deepEqual(JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'))).fjord.campaign,
        JSON.parse(contextCheckpoint).fjord.campaign, 'Graphics recovery cannot advance or replace Core');
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
    console.log('Real WebGL context loss/restoration recovers the existing scene with exact paused Core.');
    const beforeReload = JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#island-loading[data-mode="resume"]').waitFor();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual(JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'))).fjord.campaign,
        beforeReload.fjord.campaign, 'A genuine reload restores the exact suspension checkpoint');
    const trace = await page.evaluate(() => JSON.parse(document.documentElement.dataset.fjordLifecycle || '[]'));
    for (const event of ['cold-restore', 'pagehide', 'pageshow', 'webglcontextlost', 'webglcontextrestored'])
        assert.ok(trace.some(record => record.event === event), 'Diagnostic trace records ' + event);
    assert.ok(trace.length <= 64);
    assert.equal(trace.filter(record => record.event === 'cold-restore').length, 2, 'Opt-in diagnostics retain the prior document through a real reload');
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ coldRestore: true, noStateAdvance: true, errors }, null, 2));
    console.log('Cold saved-campaign restore is styled, responsive and exact.');
} finally { await browser.close(); }
