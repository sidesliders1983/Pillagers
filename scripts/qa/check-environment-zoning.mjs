import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'scratch/environment-zoning-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
page.setDefaultTimeout(120000);
const evidence = { checks: [], captures: [], errors: [] };
page.on('pageerror', error => evidence.errors.push(String(error)));
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    assert.equal(await page.locator('#world-environment-zoning').count(), 1, 'explicit environment zoning control');
    assert.equal(await page.locator('#world-overlay option[value=environment]').evaluate(el => el.disabled), true);
    await page.selectOption('#world-preset', 'island');
    await page.locator('#world-site-planning').check();
    await page.locator('#world-environment-zoning').check();
    await page.locator('#world-seed').fill('18');
    await page.locator('#environment-fog').uncheck();
    await page.locator('#environment-pause').check();
    await page.locator('#world-generate').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}').environment?.version === 1);
    await page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
    const state = JSON.parse(await canvas.getAttribute('data-world'));
    assert.equal(state.validation.accepted, true);
    assert.equal(state.environment.maximumSnowPotential, 0);
    await page.locator('#world-environment-diagnostics > summary').click();
    assert.match(await page.locator('#world-environment-diagnostics').textContent(), /grass.*sand.*mud.*bedrock/s);
    await page.locator('#environment-nature').uncheck();
    await page.locator('#environment-village').uncheck();
    await page.locator('#environment-water').uncheck();
    for (const overlay of ['environment', 'forest-cover', 'moisture', 'shelter', 'slope', 'aspect', 'rock-exposure', 'snow-potential']) {
        await openEnvironmentSettings(page);
        await page.selectOption('#world-overlay', overlay);
        await page.selectOption('#environment-camera', 'island-overhead');
        assert.equal(await canvas.getAttribute('data-overlay'), overlay);
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(300);
        await canvas.screenshot({ path: output + '/' + overlay + '.png' });
        evidence.captures.push(overlay + '.png');
    }
    evidence.checks.push('explicit generation, accepted reserves, all eight overlays and zero normal-climate snow');
    await openEnvironmentSettings(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').click()]);
    const saved = await readFile(await download.path(), 'utf8');
    await download.delete();
    assert.equal(JSON.parse(saved).blueprint.environment.version, 1);
    await page.locator('#world-import').setInputFiles({ name: 'zoned.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
    await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations > count, state.generations);
    assert.equal(await page.locator('#world-environment-zoning').isChecked(), true);
    assert.deepEqual(JSON.parse(await canvas.getAttribute('data-world')).environment, state.environment);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#world-overlay', 'environment');
    await page.selectOption('#environment-camera', 'island-oblique');
    await page.locator('#environment-settings > summary').click();
    await canvas.screenshot({ path: output + '/tablet-oblique.png' });
    evidence.captures.push('tablet-oblique.png');
    await openEnvironmentSettings(page);
    await page.selectOption('#world-overlay', 'none');
    await page.selectOption('#environment-camera', 'player-start');
    await page.locator('#environment-nature').check();
    await page.locator('#environment-village').check();
    await page.locator('#environment-water').check();
    await page.locator('#environment-settings > summary').click();
    await page.waitForTimeout(1000);
    await canvas.screenshot({ path: output + '/tablet-source-materials.png' });
    evidence.captures.push('tablet-source-materials.png');
    evidence.rendererWindows = [];
    for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(650);
        evidence.rendererWindows.push(JSON.parse(await canvas.getAttribute('data-metrics')));
    }
    evidence.checks.push('export/import, tablet-sized controls and source-material view');
    await openEnvironmentSettings(page);
    // A separately generated legacy world must keep overlays unavailable after import.
    await page.selectOption('#world-preset', 'fjord');
    await page.locator('#world-environment-zoning').uncheck();
    const count = JSON.parse(await canvas.getAttribute('data-world')).generations;
    await page.locator('#world-generate').click();
    await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations > count, count);
    assert.equal(JSON.parse(await canvas.getAttribute('data-world')).environment, null);
    assert.equal(await page.locator('#world-overlay option[value=environment]').evaluate(el => el.disabled), true);
    assert.equal(await page.locator('#world-environment-diagnostics').isVisible(), false);
    await page.locator('#world-reference').click();
    assert.equal(await page.locator('#world-environment-diagnostics').isVisible(), false);
    assert.deepEqual(evidence.errors, []);
    evidence.checks.push('legacy generation and reference fallback clear zoning diagnostics');
    evidence.world = state;
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    await browser.close();
}
console.log(JSON.stringify(evidence));
