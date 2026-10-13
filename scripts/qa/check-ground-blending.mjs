import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'scratch/ground-blending';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
page.setDefaultTimeout(60000);
const evidence = { date: new Date().toISOString(), errors: [], checks: [], captures: [] };
page.on('pageerror', error => evidence.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    assert.equal(await page.locator('#world-ground-blending').count(), 1);
    assert.equal(await page.locator('#world-rock-tone').count(), 1);
    const saved = await readFile('scratch/environment-zoning/18.json');
    await page.locator('#world-import').setInputFiles({ name: 'zoned.json', mimeType: 'application/json', buffer: saved });
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}').seed === 18);
    await page.locator('#world-generate').waitFor({ state: 'visible' });
    for (const id of ['nature', 'village', 'water', 'fog']) await page.locator('#environment-' + id).uncheck();
    await page.locator('#environment-pause').check();
    const capture = async (mode, view, suffix = '', tone = 'cool-grey') => {
        await openEnvironmentSettings(page);
        await page.selectOption('#world-ground-blending', mode);
        await page.waitForFunction(m => JSON.parse(document.querySelector('canvas').dataset.ground).blending === m, mode);
        await page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
        if (mode === 'zoned') {
            await page.selectOption('#world-rock-tone', tone);
            await page.waitForFunction(t => JSON.parse(document.querySelector('canvas').dataset.ground).rockTone === t &&
                !document.querySelector('#world-generate').disabled, tone);
        }
        await page.selectOption('#environment-camera', view);
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(1000);
        const frames = await page.evaluate(() => new Promise(resolve => {
            const samples = []; let previous;
            function frame(now) {
                if (previous !== undefined) samples.push(now - previous);
                previous = now;
                if (samples.length >= 90) resolve(samples); else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }));
        const name = mode + '-' + view + suffix;
        await canvas.screenshot({ path: output + '/' + name + '.jpg', type: 'jpeg', quality: 90 });
        const data = await canvas.evaluate(element => ({
            fixture: JSON.parse(element.dataset.fixture), quality: document.querySelector('#environment-quality').value, ground: JSON.parse(element.dataset.ground),
            metrics: JSON.parse(element.dataset.metrics), world: JSON.parse(element.dataset.world),
            javascriptHeap: performance.memory ? { used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize } : null,
        }));
        evidence.captures.push({ name, frames, ...data });
        console.log(name, data.metrics);
    };
    const views = ['island-overhead', 'island-oblique', 'player-start', 'sand-close', 'sand-shore',
        'ground-grass', 'ground-mud', 'ground-rock', 'ground-highland', 'ground-gully', 'ground-sea-cliff', 'ground-rock-transition'];
    for (const mode of ['baseline', 'zoned']) for (const view of views) await capture(mode, view);
    for (const view of views) {
        const before = evidence.captures.find(item => item.name === 'baseline-' + view);
        const after = evidence.captures.find(item => item.name === 'zoned-' + view);
        assert.deepEqual(after.fixture.camera, before.fixture.camera, 'matched camera: ' + view);
        assert.deepEqual(after.fixture.lightSettings, before.fixture.lightSettings);
    }
    // Isolate the art direction from atlas/projection changes: only the rock colour image changes.
    for (const lighting of ['day', 'sun10']) {
        await openEnvironmentSettings(page);
        await page.selectOption('#environment-light', lighting);
        for (const view of ['ground-rock', 'ground-sea-cliff', 'ground-rock-transition', 'island-oblique']) {
            await capture('zoned', view, '-tone-source-' + lighting, 'source');
            await capture('zoned', view, '-tone-grey-' + lighting, 'cool-grey');
            const [before, after] = evidence.captures.slice(-2);
            assert.deepEqual(before.fixture, after.fixture, 'identical geography, camera and lighting');
            assert.deepEqual(before.ground.maps.filter(m => m.id !== 'mossy_rock'),
                after.ground.maps.filter(m => m.id !== 'mossy_rock'));
            const beforeRock = before.ground.maps.find(m => m.id === 'mossy_rock');
            const afterRock = after.ground.maps.find(m => m.id === 'mossy_rock');
            assert.deepEqual(beforeRock.textures.slice(1), afterRock.textures.slice(1), 'normal and roughness unchanged');
            assert.notEqual(beforeRock.textures[0].file, afterRock.textures[0].file);
            assert.equal(after.ground.snowLayerActive, false, 'grey rock is not snow');
        }
    }
    await openEnvironmentSettings(page);
    await page.selectOption('#environment-light', 'day');
    evidence.checks.push('source olive versus cool grey: colour only, no snow, identical normal/roughness, terrain, cameras and lights');
    for (const overlay of ['blend-dominant', 'blend-grass', 'blend-sand', 'blend-mud', 'blend-rock', 'rock-exposure', 'snow-potential']) {
        await page.selectOption('#world-overlay', overlay);
        assert.equal(await canvas.getAttribute('data-overlay'), overlay);
    }
    await page.selectOption('#world-overlay', 'none');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').click()]);
    assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), JSON.parse(saved));
    await download.delete();
    evidence.checks.push('same geometry and world export; seven field overlays; matched cameras and lighting');
    await page.locator('#world-snow-study').check();
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).snowLayerActive, false);
    await page.locator('#world-snow-study').uncheck();
    for (const quality of ['low', 'standard']) {
        await page.selectOption('#environment-quality', quality);
        await page.waitForFunction(q => document.querySelector('canvas').dataset.groundTier === q &&
            !document.querySelector('#world-generate').disabled, quality);
        for (const mode of ['baseline', 'zoned']) await capture(mode, 'ground-rock', '-' + quality);
        await openEnvironmentSettings(page);
    }
    for (const lighting of ['night', 'sun10']) {
        await page.selectOption('#environment-light', lighting);
        for (const mode of ['baseline', 'zoned']) await capture(mode, 'ground-rock', '-' + lighting);
        await openEnvironmentSettings(page);
    }
    await page.selectOption('#environment-light', 'day');
    for (const seed of [42, 1983]) {
        await page.locator('#world-import').setInputFiles('scratch/environment-zoning/' + seed + '.json');
        await page.waitForFunction(n => JSON.parse(document.querySelector('canvas').dataset.world).seed === n &&
            !document.querySelector('#world-generate').disabled, seed);
        for (const mode of ['baseline', 'zoned']) for (const view of ['player-start', 'ground-rock']) {
            await capture(mode, view, '-seed-' + seed);
        }
        await openEnvironmentSettings(page);
    }
    await page.locator('#world-import').setInputFiles('scratch/environment-zoning/18.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world).seed === 18 &&
        !document.querySelector('#world-generate').disabled);
    for (const id of ['nature', 'village', 'water']) await page.locator('#environment-' + id).check();
    for (const mode of ['baseline', 'zoned']) await capture(mode, 'player-start', '-settlement');
    await openEnvironmentSettings(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#environment-quality', 'low');
    await page.waitForFunction(() => document.querySelector('canvas').dataset.groundTier === 'low' &&
        !document.querySelector('#world-generate').disabled);
    for (const mode of ['baseline', 'zoned']) await capture(mode, 'player-start', '-tablet-low');
    await openEnvironmentSettings(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const id of ['nature', 'village', 'water']) await page.locator('#environment-' + id).uncheck();
    await page.selectOption('#environment-quality', 'standard');
    await page.waitForFunction(() => document.querySelector('canvas').dataset.groundTier === 'standard' &&
        !document.querySelector('#world-generate').disabled);
    await page.locator('#world-import').setInputFiles('scratch/ground-blending/18-cold.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world).environment.climate.meanAnnualTemperatureC === -8 &&
        !document.querySelector('#world-generate').disabled);
    await capture('zoned', 'island-oblique', '-cold-snow-off');
    await openEnvironmentSettings(page);
    await page.locator('#world-snow-study').tap();
    await capture('zoned', 'island-oblique', '-cold-snow-on');
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).snowLayerActive, true);
    await openEnvironmentSettings(page);
    await page.locator('#world-snow-study').uncheck();
    await page.locator('#world-import').setInputFiles('scratch/environment-zoning/18-baseline.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world).environment === null &&
        !document.querySelector('#world-generate').disabled);
    assert.equal(await page.locator('#world-ground-blending').isDisabled(), true);
    assert.equal(JSON.parse(await canvas.getAttribute('data-ground')).blending, 'baseline');
    await page.locator('#world-reference').click();
    assert.equal(await page.locator('#world-ground-blending').isDisabled(), true);
    evidence.checks.push('normal snow-free; cold potential on/off; Low, night, low sun, tablet touch; three seeds; unzoned fallback and reference return');
    assert.deepEqual(evidence.errors, []);
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    await browser.close();
}
