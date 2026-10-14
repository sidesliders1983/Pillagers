import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await page.addInitScript(() => {
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(...args) {
                if (String(args[0]).includes('GenerationWorker')) throw new Error('Worker unavailable (QA)');
                super(...args);
            }
        };
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play?seed=32',
        { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Retry generation', exact: true }).waitFor();
    assert.equal(await page.locator('#island-loading-cancel').isVisible(), false,
        'First launch has no playable campaign to return to.');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#island-loading').isVisible(), true);
    assert.equal(await page.locator('a[href="/"]').isVisible(), false);
    await page.getByRole('button', { name: 'Close founding chapter' }).tap();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Retry generation' }).evaluate(e =>
        e === document.activeElement), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')), null);
    console.log('First launch keeps recovery available without cancellation or prototype navigation.');
} finally {
    await browser.close();
}
