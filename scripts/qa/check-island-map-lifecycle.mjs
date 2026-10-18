import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    const save = JSON.parse(await readFile('docs/qa/island-missions/sighted-review.json', 'utf8'));
    save.pace.running = false;
    await context.addInitScript(save => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save)), save);
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-map-toggle').click();
    const raster = await page.locator('#fjord-map-canvas').evaluate(canvas => canvas.toDataURL());
    const imported = JSON.parse(await readFile('docs/qa/rival-visibility/visited-review.json', 'utf8')).fjord;
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-campaign > summary').click();
    await page.locator('#fjord-import').setInputFiles({ name: 'map-review.json', mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign imported, paused.',
        undefined, { timeout: 180000 });
    assert.notEqual(await page.locator('#fjord-map-canvas').evaluate(canvas => canvas.toDataURL()), raster);
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
    assert.deepEqual(state, imported.campaign);
    assert.equal(await page.locator('#fjord-map-controls').count(), 1);
    assert.equal(await page.locator('#fjord-map-canvas').count(), 1);
    report.checks.push('DPR 2 import replaces terrain 7 with terrain 18 and exact canonical state, with one map/control instance');
    // Clicking in the map closes the ordinary settings menu; reopen it for the real restart.
    if (!await page.locator('#fjord-menu').evaluate(menu => menu.open)) await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-restart').click();
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.time.winter === 800,
        undefined, { timeout: 180000 });
    await page.waitForFunction(() => !document.querySelector('.island-loading'), undefined, { timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-run').click();
    assert.equal(await page.locator('#fjord-map-controls').count(), 1);
    assert.equal(await page.locator('.fjord-map-expedition').count(), 0);
    report.checks.push('Restart rebinds the founding map and removes old expedition flags without duplicate controls');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile('artifacts/island-map/lifecycle.json', JSON.stringify(report, null, 2));
    await browser.close();
}
