import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-navigation-performance/production-tap';
await mkdir(output, { recursive: true });
const checkpoint = JSON.parse(await readFile('docs/qa/fjord-runtime-improvements/170/fixtures/developed-810.json', 'utf8'));
checkpoint.target = 'fjord'; checkpoint.pace.running = false;
const fixture = JSON.stringify(checkpoint);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage(); page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), fixture);
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5195') + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
    await page.evaluate(() => {
        const select = document.querySelector('#fjord-quality'); select.value = 'low'; select.dispatchEvent(new Event('change'));
    });
    if (await page.locator('#fjord-management-toggle').getAttribute('aria-expanded') === 'true')
        await page.locator('#fjord-management-toggle').click();
    await page.waitForTimeout(1000);
    const rect = await page.locator('#fjord-canvas').boundingBox();
    await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas'), before = canvas.dataset.camera;
        window.__navigationPublic = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('No public camera movement after the ground tap')), 5000);
            canvas.addEventListener('pointerup', event => {
                const start = performance.now();
                const sample = () => {
                    if (canvas.dataset.camera === before) { requestAnimationFrame(sample); return; }
                    clearTimeout(timeout);
                    resolve({ pointerType: event.pointerType, cameraSignatureChangedAfterMs: performance.now() - start,
                        selected: canvas.dataset.selected, cameraBefore: before, cameraAfter: canvas.dataset.camera });
                };
                requestAnimationFrame(sample);
            }, { once: true, capture: true });
        });
    });
    await page.touchscreen.tap(rect.x + rect.width * .2, rect.y + rect.height * .6);
    const navigation = await page.evaluate(() => window.__navigationPublic);
    assert.equal(navigation.pointerType, 'touch'); assert.equal(navigation.selected, '');
    await page.evaluate(() => { document.querySelector('#fjord-menu').open = true; document.querySelector('#fjord-campaign').open = true; });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
    const core = JSON.parse(await readFile(await download.path(), 'utf8')); await download.delete();
    assert.ok(isDeepStrictEqual(core, checkpoint.fjord.campaign), 'Paused public navigation preserves every Core fact');
    const placeholders = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered).filter(row => row.placeholder).map(row => row.key));
    assert.deepEqual(placeholders, []); assert.deepEqual(errors, []);
    await page.screenshot({ path: output + '/after-tap.png' });
    const result = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browser: browser.version(), physicalIOS: false, qaBridgeAbsent: true, viewport: { width: 390, height: 844 },
        navigation, coreUnchanged: true, placeholders, errors,
        note: 'Public controls of the ordinary production build. One functional smoke, not the repeated CPU benchmark or a physical display latency measurement.' };
    await writeFile(output + '/result.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, ...navigation, coreUnchanged: true }));
} finally { await browser.close(); }
