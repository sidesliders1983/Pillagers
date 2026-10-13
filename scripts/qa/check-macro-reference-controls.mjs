import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5191') + '/environment-lab');
    await page.locator('canvas[data-ready=true]').waitFor({ timeout: 90000 });
    for (const view of ['island-overhead', 'island-oblique']) {
        assert.equal(await page.locator('#environment-camera option[value="' + view + '"]').evaluate(el => el.disabled), true,
            'Island cameras cannot be selected before a blueprint exists');
    }
    console.log('PASS: unavailable island cameras are disabled in Reference mode');
} finally { await browser.close(); }
