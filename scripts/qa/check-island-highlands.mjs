import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT ?? 'scratch/island-highlands';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
page.setDefaultTimeout(120000);
const evidence = { date: new Date().toISOString(), errors: [], checks: [], captures: [] };
page.on('pageerror', e => evidence.errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') evidence.errors.push(m.text()); });
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    const waitReady = () => page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
    const summary = () => canvas.evaluate(e => JSON.parse(e.dataset.world));
    const importWorld = async (seed, mode) => {
        await openEnvironmentSettings(page);
        await page.locator('#world-import').setInputFiles(output + '/' + seed + '-' + mode + '.json');
        await page.waitForFunction(({ seed, version }) => {
            const world = JSON.parse(document.querySelector('canvas').dataset.world ?? '{}');
            return world.seed === seed && world.generatorVersion === version && !document.querySelector('#world-generate').disabled;
        }, { seed, version: mode === 'before' ? 'fjordside-island-v0.3e' : 'fjordside-island-v0.3e-r2' });
    };
    await importWorld(18, 'before');
    for (const id of ['nature', 'village', 'water', 'fog']) await page.locator('#environment-' + id).uncheck();
    await page.locator('#environment-pause').check();
    await page.selectOption('#environment-light', 'day');
    await page.selectOption('#world-ground-blending', 'zoned');
    await waitReady();
    const capture = async (seed, mode, view, overlay) => {
        await openEnvironmentSettings(page);
        await page.selectOption('#world-overlay', overlay);
        await page.selectOption('#environment-camera', view);
        await page.locator('#environment-settings > summary').click();
        await page.waitForTimeout(1200);
        const file = seed + '-' + mode + '-' + view + '-' + overlay + '.jpg';
        await canvas.screenshot({ path: output + '/' + file, type: 'jpeg', quality: 90 });
        const fixture = await canvas.evaluate(e => JSON.parse(e.dataset.fixture));
        evidence.captures.push({ seed, mode, view, overlay, file, fixture });
        if (mode === 'after' && view !== 'player-start') {
            const before = evidence.captures.find(c => c.seed === seed && c.mode === 'before' && c.view === view && c.overlay === overlay);
            assert.deepEqual(fixture.camera, before.fixture.camera, 'same camera');
            for (const key of ['preset', 'direction', 'sun', 'fill', 'exposure']) {
                assert.deepEqual(fixture.lightSettings[key], before.fixture.lightSettings[key], 'same light: ' + key);
            }
            // The directional light's fitted shadow bounds follow the changed terrain.
            // These bounds are recorded, not misreported as identical.
        }
        console.log(file);
    };
    for (const seed of [18, 42, 1983, 7, 256]) {
        for (const mode of ['before', 'after']) {
            await importWorld(seed, mode);
            for (const [view, overlay] of [['island-oblique', 'form'], ['overview', 'form'], ['overview', 'none'], ['island-oblique', 'none']]) {
                await capture(seed, mode, view, overlay);
            }
        }
    }
    evidence.checks.push('five fixed seeds: identical cameras and lighting for bare terrain and unchanged material pipeline');
    await importWorld(18, 'after');
    await openEnvironmentSettings(page);
    for (const id of ['nature', 'village', 'water']) await page.locator('#environment-' + id).check();
    await capture(18, 'after', 'player-start', 'none');
    await openEnvironmentSettings(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#environment-quality', 'low');
    await waitReady();
    await page.selectOption('#environment-conifers', 'ez-tree');
    await waitReady();
    await page.selectOption('#world-preset', 'island');
    await page.locator('#world-seed').fill('18');
    await page.locator('#world-site-planning').check();
    await page.locator('#world-environment-zoning').check();
    await page.getByRole('button', { name: 'Generate World', exact: true }).tap();
    await waitReady();
    assert.equal((await summary()).generatorVersion, 'fjordside-island-v0.3e-r2');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').tap()]);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    const fixture = JSON.parse(await readFile(output + '/18-after.json', 'utf8'));
    assert.deepEqual(exported, fixture, 'touch generation in Lab reproduces the measured versioned blueprint');
    await download.delete();
    await page.locator('#world-site-planning').uncheck();
    await page.getByRole('button', { name: 'Generate World', exact: true }).tap();
    await waitReady();
    assert.equal((await summary()).generatorVersion, 'fjordside-island-v0.3b-r3');
    evidence.checks.push('tablet touch: Generate World with/without placement; export equals measured blueprint; Low quality');
    await importWorld(18, 'before');
    const [oldDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').tap()]);
    assert.deepEqual(JSON.parse(await readFile(await oldDownload.path(), 'utf8')),
        JSON.parse(await readFile(output + '/18-before.json', 'utf8')), 'import never upgrades old geography');
    await oldDownload.delete();
    evidence.checks.push('previous version import/export preserves its full stored geography');
    assert.deepEqual(evidence.errors, []);
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    await browser.close();
}
