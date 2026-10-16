import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(text => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', '{damaged');
        localStorage.setItem('fjordside.resume-checkpoint.v1', text);
    }, fixture);
    await page.route('**/*GenerationWorker*', route => route.abort('failed'));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#campaign-recovery').waitFor({ timeout: 5000 });
    assert.match(await page.locator('#campaign-recovery').innerText(), /existing saves have not been replaced/i);
    assert.equal(await page.locator('#fjord-canvas').count(), 0, 'Recovery does not silently create a new campaign');
    const raw = () => page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'));
    assert.equal(await raw(), '{damaged');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Active session recovery file' }).tap();
    const file = await downloading;
    assert.equal(await readFile(await file.path(), 'utf8'), '{damaged');
    await page.getByRole('button', { name: 'Restore last resume checkpoint' }).tap();
    await page.getByRole('button', { name: 'Retry restoration', exact: true }).waitFor();
    assert.equal(await raw(), '{damaged', 'Worker failure cannot replace the old raw save');
    await page.unroute('**/*GenerationWorker*');
    await page.getByRole('button', { name: 'Retry restoration', exact: true }).tap();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual(JSON.parse(await raw()).fjord.campaign, JSON.parse(fixture).fjord.campaign);
    assert.equal(await page.evaluate(() => localStorage.getItem('fjordside.resume-checkpoint.v1')), fixture);
    assert.deepEqual(errors, []);
    console.log('Recovery offers the exact checkpoint, exports damaged input, and survives a worker failure without overwriting saves.');
} finally { await browser.close(); }
