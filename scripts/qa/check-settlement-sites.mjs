import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'scratch/settlement-sites-refinement';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = { browser: 'Edge Chromium', physicalIPad: false, checks: [], captures: [], errors: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5191') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    assert.equal(await page.locator('#world-site-planning').count(), 1, 'placement can be selected explicitly');
    await page.selectOption('#world-preset', 'island');
    await page.locator('#world-site-planning').check();
    await page.locator('#world-seed').fill('18');
    await page.locator('#environment-fog').uncheck();
    await page.locator('#environment-pause').check();
    await page.getByRole('button', { name: 'Generate World', exact: true }).click();
    await page.waitForFunction(() => {
        const data = document.querySelector('canvas').dataset.world;
        return data && JSON.parse(data).generatorVersion === 'fjordside-island-v0.3e';
    });
    await page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
    const state = JSON.parse(await canvas.getAttribute('data-world'));
    assert.equal(state.validation.accepted, true);
    assert.equal(state.siteSelection.exposedRays, 0);
    assert.ok(state.siteSelection.rivalSite);
    await page.locator('#world-sites-diagnostics > summary').click();
    assert.ok((await page.locator('#world-site-pair option').count()) > 1);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /160.*40.*240/s);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /Geographical compartment coverage/);
    await page.selectOption('#world-overlay', 'sites');
    await page.selectOption('#environment-camera', 'island-overhead');
    await page.locator('#environment-nature').uncheck();
    await page.locator('#environment-settings > summary').click();
    await canvas.screenshot({ path: output + '/sites-overhead.png' });
    evidence.captures.push('sites-overhead.png');
    await openEnvironmentSettings(page);
    await page.selectOption('#environment-camera', 'player-start');
    await page.selectOption('#world-overlay', 'none');
    await page.locator('#environment-village').check();
    await page.locator('#environment-settings > summary').click();
    await canvas.screenshot({ path: output + '/player-start.png' });
    evidence.captures.push('player-start.png');
    const fixture = JSON.parse(await canvas.getAttribute('data-fixture'));
    evidence.camera = fixture.camera;
    await openEnvironmentSettings(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').click()]);
    const saved = await readFile(await download.path(), 'utf8');
    await download.delete();
    const world = JSON.parse(saved).blueprint;
    const startView = world.siteSelection.viewpoints.find(v => v.id === 'player-start-camera');
    [startView.x, startView.y, startView.z].forEach((coordinate, i) =>
        assert.ok(Math.abs(fixture.camera.position[i] - coordinate) < 1e-6,
            'the rendered camera matches the visibility proof within floating-point roundoff'));
    await page.locator('#world-import').setInputFiles({ name: 'sites.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
    await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations > count, state.generations);
    evidence.checks.push('seed 18 selection, scores, LOS overlay, actual starting camera and save/import');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#world-overlay', 'sites');
    await page.selectOption('#environment-camera', 'island-oblique');
    await page.locator('#environment-settings > summary').click();
    await canvas.screenshot({ path: output + '/tablet-oblique.png' });
    evidence.captures.push('tablet-oblique.png');
    const before = JSON.parse(await canvas.getAttribute('data-fixture')).camera.position;
    await canvas.tap({ position: { x: 80, y: 80 } });
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(470, 430, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.notDeepEqual(JSON.parse(await canvas.getAttribute('data-fixture')).camera.position, before);
    evidence.checks.push('tablet viewport and orbit interaction');
    await openEnvironmentSettings(page);
    const generation = JSON.parse(await canvas.getAttribute('data-world')).generations;
    await page.locator('#world-seed').fill('17');
    await page.getByRole('button', { name: 'Generate World', exact: true }).click();
    await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations > count, generation);
    const rejected = JSON.parse(await canvas.getAttribute('data-world'));
    assert.equal(rejected.validation.accepted, false);
    assert.equal(rejected.siteSelection.rivalSite, null);
    assert.match(await page.locator('#world-generation-status').textContent(), /REJECTED/);
    evidence.layouts = [];
    for (const seed of [42, 1983, 211, 819]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await openEnvironmentSettings(page);
        const previous = JSON.parse(await canvas.getAttribute('data-world')).generations;
        await page.locator('#world-seed').fill(String(seed));
        await page.locator('#world-generate').click();
        await page.waitForFunction(count => JSON.parse(document.querySelector('canvas').dataset.world).generations > count, previous);
        const generated = JSON.parse(await canvas.getAttribute('data-world'));
        assert.equal(generated.validation.accepted, true, `seed ${seed} should retain its accepted pair`);
        await page.selectOption('#world-overlay', 'sites');
        await page.selectOption('#environment-camera', 'island-overhead');
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(700);
        await canvas.screenshot({ path: output + `/seed-${seed}-overhead.png` });
        await openEnvironmentSettings(page);
        await page.selectOption('#environment-camera', 'player-start');
        await page.selectOption('#world-overlay', 'none');
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(700);
        await canvas.screenshot({ path: output + `/seed-${seed}-start.png` });
        const windows = [];
        for (let i = 0; i < 4; i++) {
            await page.waitForTimeout(600);
            windows.push(JSON.parse(await canvas.getAttribute('data-metrics')));
        }
        evidence.layouts.push({ seed, world: generated, rendererWindows: windows,
            camera: JSON.parse(await canvas.getAttribute('data-fixture')).camera });
        evidence.captures.push(`seed-${seed}-overhead.png`, `seed-${seed}-start.png`);
    }
    // Capture the same composed view at tablet size, then exercise rotation again.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(700);
    evidence.tabletMetrics = JSON.parse(await canvas.getAttribute('data-metrics'));
    await canvas.screenshot({ path: output + '/tablet-start.png' });
    evidence.captures.push('tablet-start.png');
    evidence.checks.push('four additional distinct seeds: top-down reservations, exact player camera, renderer windows');
    await openEnvironmentSettings(page);
    await page.locator('#world-reference').click();
    assert.equal(await page.locator('#world-sites-diagnostics').isVisible(), false);
    assert.equal(await page.locator('#environment-camera option[value="player-start"]').evaluate(el => el.disabled), true);
    evidence.checks.push('rejected seed retains diagnostics without a rival; reference fallback clears site UI');
    assert.deepEqual(evidence.errors, []);
    evidence.world = state;
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    await browser.close();
}
console.log(JSON.stringify({ checks: evidence.checks, errors: evidence.errors }));
