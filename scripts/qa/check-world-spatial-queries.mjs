import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'scratch/world-spatial-queries';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
page.setDefaultTimeout(120000);
const evidence = { date: new Date().toISOString(), errors: [], checks: [], overlays: [] };
page.on('pageerror', error => evidence.errors.push(String(error)));
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    assert.equal(await page.locator('#world-spatial-diagnostics').count(), 1, 'spatial query inspector exists');
    const saved = await readFile('scratch/environment-zoning/18.json');
    await page.locator('#world-import').setInputFiles({ name: 'zoned.json', mimeType: 'application/json', buffer: saved });
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}').seed === 18);
    await page.locator('#world-spatial-diagnostics > summary').click();
    await page.locator('#world-query-x').fill('0');
    await page.locator('#world-query-z').fill('0');
    await page.locator('#world-query-inspect').tap();
    const result = JSON.parse(await page.locator('#world-query-result').textContent());
    await page.locator('#world-query-connectivity').tap();
    assert.equal(JSON.parse(await page.locator('#world-query-result').textContent()).accepted, true);
    await page.locator('#world-query-inspect').tap();
    assert.equal(result.cell.id, 'spatial-v1:400:400');
    assert.ok(result.zone);
    await page.locator('#world-query-x').fill('10000');
    await page.locator('#world-query-inspect').tap();
    assert.match(await page.locator('#world-query-result').textContent(), /Outside/);
    for (const overlay of ['grid-ground', 'grid-movement', 'grid-buildability', 'grid-reservations', 'grid-slope', 'grid-aspect']) {
        const start = performance.now();
        await page.selectOption('#world-overlay', overlay);
        assert.equal(await canvas.getAttribute('data-overlay'), overlay);
        await page.selectOption('#environment-camera', 'island-overhead');
        for (const id of ['nature', 'village', 'water', 'fog']) await page.locator('#environment-' + id).uncheck();
        await page.locator('#environment-pause').check();
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(1800);
        await canvas.screenshot({ path: output + '/' + overlay + '.jpg', type: 'jpeg', quality: 85 });
        evidence.overlays.push({ overlay, elapsedMs: performance.now() - start,
            construction: JSON.parse(await canvas.getAttribute('data-spatial')),
            metrics: JSON.parse(await canvas.getAttribute('data-metrics')) });
        await openEnvironmentSettings(page);
    }
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').click()]);
    assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), JSON.parse(saved));
    await download.delete();
    evidence.checks.push('touch query, bounds error, six cell overlays, byte-equivalent world data after queries');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#world-overlay', 'grid-buildability');
    await page.selectOption('#environment-camera', 'player-start');
    await page.locator('#environment-settings > summary').click();
    await canvas.screenshot({ path: output + '/tablet-reserves.jpg', type: 'jpeg', quality: 85 });
    await openEnvironmentSettings(page);
    const count = JSON.parse(await canvas.getAttribute('data-world')).generations;
    await page.locator('#world-import').setInputFiles('scratch/environment-zoning/18-baseline.json');
    await page.waitForFunction(n => JSON.parse(document.querySelector('canvas').dataset.world).generations > n, count);
    await page.locator('#world-query-x').fill('0');
    await page.locator('#world-query-inspect').tap();
    assert.equal(JSON.parse(await page.locator('#world-query-result').textContent()).zone, null);
    await page.locator('#world-reference').click();
    assert.equal(await page.locator('#world-spatial-diagnostics').isVisible(), false);
    evidence.checks.push('tablet-sized controls, legacy import without regeneration, reference clears query');
    assert.deepEqual(evidence.errors, []);
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    await browser.close();
}
console.log(JSON.stringify(evidence));
