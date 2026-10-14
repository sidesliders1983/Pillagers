import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { load } from '../../tests/load-source.mjs';

const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const saved = new SharedSettlement(32).handoff('fjord');
const expected = JSON.parse(saved).fjord.blueprint;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    await page.addInitScript(saved => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', saved);
        window.introductions = 0;
        new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes)
                if (node.id === 'island-loading') window.introductions++;
        }).observe(document, { subtree: true, childList: true });
    }, saved);
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-menu > summary').click();
    await page.locator('#fjord-campaign > summary').click();
    await page.locator('#fjord-founders').check();
    await page.locator('#fjord-restart').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign restarted.');
    const actual = await page.evaluate(() => ({ introductions: window.introductions,
        blueprint: JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.blueprint }));
    assert.equal(actual.introductions, 0, 'legacy restart does not show an unrelated new-island introduction');
    assert.deepEqual(actual.blueprint, expected, 'same-founder restart retains the saved legacy geography');
    writeFileSync('docs/qa/cinematic-loading/legacy.json', JSON.stringify({
        introductions: actual.introductions, legacyGeographyPreserved: true
    }, null, 2));
    console.log('legacy restart preserves its established route and geography');
} finally {
    await browser.close();
}
