import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let release;
const assetGate = new Promise(resolve => { release = resolve; });
try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    let requestsHeld = 0;
    await page.route('**/*.glb', async route => {
        requestsHeld++;
        await assetGate;
        await route.continue().catch(() => {});
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await page.locator('summary').filter({ hasText: /^Campaign$/ }).click();
    await page.locator('#fjord-seed').fill('17');
    await page.getByRole('button', { name: 'New campaign from seed', exact: true }).click();
    await page.locator('#fjord-notice').filter({ hasText: 'New campaign, paused.' }).waitFor();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    await page.waitForTimeout(1600);
    assert.ok(requestsHeld > 0, 'Real GLB requests are delayed at the network boundary, never replaced.');
    assert.equal(await page.locator('#fjord-canvas').getAttribute('data-ready'), null);
    assert.match(await page.locator('#fjord-winter').innerText(), /Winter 800 · tick 0$/, 'Loading time must not advance canonical simulation time.');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    release();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const environment = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-environment'));
    assert.equal(environment.seed, 17, 'The rendered world belongs to the campaign chosen during loading.');
    const output = process.env.QA_OUTPUT || 'docs/qa/interactive-fjord';
    await mkdir(output, { recursive: true });
    await writeFile(output + '/loading.json', JSON.stringify({ delayedRealGLBRequests: requestsHeld, ticksDuringLoading: 0, renderedSeed: environment.seed }, null, 2));
    console.log('Loading preserves canonical time and uses the campaign selected before the assets finish.');
} finally {
    release();
    await browser.close();
}
