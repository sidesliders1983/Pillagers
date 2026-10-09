import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.setDefaultTimeout(120000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
            const pause = document.querySelector('#environment-pause');
            if (pause) { pause.checked = true; observer.disconnect(); }
        });
        observer.observe(document, { subtree: true, childList: true });
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    const study = page.getByRole('checkbox', { name: 'Sand study · approved ReferenceWater', exact: true });
    assert.equal(await study.count(), 1, 'The sand experiment is explicitly opt-in in Environment Lab');
    assert.equal(await study.isChecked(), false);
    await study.check();
    await page.click('#world-generate');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.ground || '{}').sandStudy === true);
    const exportHash = async () => {
        const download = page.waitForEvent('download');
        await page.click('#world-export');
        const bytes = await readFile(await (await download).path());
        return createHash('sha256').update(bytes).digest('hex');
    };
    const before = await exportHash();
    const actors = await canvas.getAttribute('data-reference-actors');
    const first = JSON.parse(await canvas.getAttribute('data-ground'));
    assert.equal(first.sandPixels, 256);
    await page.selectOption('#world-sand-resolution', '512');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.ground).sandPixels === 512);
    const loaded = JSON.parse(await canvas.getAttribute('data-ground')).maps.find(map => map.id === 'Ground054');
    assert.ok(loaded.textures.every(texture => texture.width === 512 && texture.height === 512),
        'The actual decoded sand maps must be 512px, not only the selected label');
    assert.equal(await exportHash(), before, 'A map-resolution switch never regenerates saved geography');
    assert.equal(await canvas.getAttribute('data-reference-actors'), actors, 'Paused residents retain their positions');
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).waterSource, 'reference-water');
    await page.selectOption('#environment-quality', 'low');
    await page.waitForFunction(() => document.querySelector('canvas').dataset.groundTier === 'low');
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).sandPixels, 128);
    assert.equal(await exportHash(), before);
    await page.selectOption('#environment-quality', 'standard');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.ground).sandPixels === 512);
    assert.equal(await exportHash(), before);
    await study.uncheck();
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.ground).sandStudy === false);
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).sandPixels, 256);
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).waterSource, 'boona13');
    assert.deepEqual(errors, []);
    console.log('PASS: opt-in sand resolution, unchanged blueprint/residents, fixed water, unchanged Low and reversible activation.');
} finally { await browser.close(); }
