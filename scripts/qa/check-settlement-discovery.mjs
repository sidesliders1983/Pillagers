import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { parseWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const output = process.env.QA_OUTPUT ?? 'scratch/settlement-discovery';
await mkdir(output, { recursive: true });
const evidence = { date: new Date().toISOString(), passed: false, checks: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
page.setDefaultTimeout(120000);
page.on('pageerror', error => evidence.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    await page.selectOption('#environment-quality', 'low');
    const waitReady = () => page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
    const summary = () => canvas.evaluate(element => JSON.parse(element.dataset.world));
    await waitReady();
    await page.selectOption('#world-preset', 'island');
    assert.match(await page.locator('label', { has: page.locator('#world-site-planning') }).textContent(),
        /Player & rival sites/);
    await page.locator('#world-seed').fill('256');
    await page.locator('#world-site-planning').check();
    await page.locator('#world-environment-zoning').check();
    await page.locator('#world-generate').tap();
    await waitReady();
    const current = await summary();
    assert.equal(current.generatorVersion, 'fjordside-island-v0.3e-r3');
    assert.equal(current.validation.accepted, true);
    assert.ok(current.siteSelection.exposedRays > 0);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /Sightlines are diagnostic/);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /Accepted: separate natural compartments and connected/);
    const [download] = await Promise.all([
        page.waitForEvent('download'), page.locator('#world-export').tap(),
    ]);
    const saved = await readFile(await download.path(), 'utf8');
    const parsed = parseWorld(saved);
    assert.equal(parsed.siteSelection.visibility.hidden, false);
    await writeFile(output + '/256-current.json', saved);
    await download.delete();
    evidence.checks.push('Touch Generate World accepts an exposed rival, reports it honestly and exports a valid save.');
    await page.selectOption('#world-overlay', 'sites');
    await page.selectOption('#environment-camera', 'island-oblique');
    for (const id of ['fog', 'nature', 'village']) await page.locator('#environment-' + id).uncheck();
    await page.locator('#environment-settings > summary').click();
    await page.waitForTimeout(1500);
    await canvas.screenshot({ path: output + '/sites.jpg', type: 'jpeg', quality: 90 });
    evidence.summary = current;
    evidence.fixture = await canvas.evaluate(element => JSON.parse(element.dataset.fixture));

    await openEnvironmentSettings(page);
    await page.locator('#world-import').setInputFiles(output + '/256-legacy.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}')
        .generatorVersion === 'fjordside-island-v0.3e-r2' && !document.querySelector('#world-generate').disabled);
    assert.equal((await summary()).generatorVersion, 'fjordside-island-v0.3e-r2');
    assert.equal((await summary()).siteSelection.exposedRays, 0);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /Terrain concealment is required by this saved generator version/);
    evidence.checks.push('An existing r2 world retains its concealed site and legacy rule explanation.');

    await page.locator('#world-import').setInputFiles(output + '/256-current.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}')
        .generatorVersion === 'fjordside-island-v0.3e-r3' && !document.querySelector('#world-generate').disabled);
    assert.deepEqual((await summary()).siteSelection, current.siteSelection);
    assert.match(await page.locator('#world-sites-diagnostics').textContent(), /Sightlines are diagnostic/);
    evidence.checks.push('Reimport restores the complete exposed-rival selection.');
    assert.deepEqual(evidence.errors, []);
    evidence.passed = true;
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2) + '\n');
    await browser.close();
}
console.log(JSON.stringify(evidence, null, 2));
