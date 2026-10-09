import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    const generate = page.getByRole('button', { name: 'Generate World', exact: true });
    assert.equal(await generate.count(), 1, 'The existing Environment Lab can generate a new landscape');
    await page.getByRole('spinbutton', { name: 'World seed', exact: true }).fill('17');
    await generate.click();
    await page.waitForFunction(() => { const data = document.querySelector('canvas').dataset.world; return data && JSON.parse(data).seed === 17; });
    const world = JSON.parse(await canvas.getAttribute('data-world'));
    assert.equal(world.validation.accepted, true, JSON.stringify(world.validation));
    assert.equal(world.generatorVersion, 'fjordside-v0.1');
    assert.equal(world.referenceResidents, 10);
    assert.ok(world.naturePlacements > 150);
    const exported = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export world', exact: true }).click();
    const download = await exported;
    assert.ok(download.suggestedFilename().includes('17'));
    assert.deepEqual(errors, []);
    console.log('PASS: seed entry, generated terrain and reference settlement/residents in the Lab.');
} finally {
    await browser.close();
}
