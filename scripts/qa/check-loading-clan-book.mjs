import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'docs/qa/cinematic-loading/book';
mkdirSync(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        new MutationObserver(() => {
            if (document.querySelector('#fjord-canvas')?.dataset.ready === 'true' &&
                !document.querySelector('#island-loading') && document.querySelector('#fjord-run')?.textContent === 'Pause')
                document.querySelector('#fjord-run').click();
        }).observe(document, { subtree: true, attributes: true, childList: true,
            characterData: true, attributeFilter: ['data-ready'] });
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play?seed=32',
        { waitUntil: 'domcontentloaded' });
    const story = page.locator('#loading-clan-book-text');
    await story.waitFor({ timeout: 5000 });
    const opening = await story.textContent();
    assert.ok(opening.length > 100);
    assert.equal(await page.locator('#loading-clan-book-title').textContent(), 'The founding');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')), null);
    await page.locator('#island-loading[data-preview]').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: output + '/mobile-reading.png' });
    await story.evaluate(element => { element.scrollTop = 120; });
    const scroll = await story.evaluate(element => element.scrollTop);
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await story.textContent(), opening, 'Loading completion does not dismiss or rewrite the chapter.');
    assert.equal(await story.evaluate(element => element.scrollTop), scroll);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    assert.equal(saved.fjord.narrative.chapters[0].text, opening, 'Same bytes in the final saved book.');
    assert.deepEqual(saved.fjord.campaign.time, { winter: 800, tick: 500 });
    assert.equal(await page.locator('#clan-book-reader').isVisible(), false, 'No duplicate automatic opening.');
    await page.getByRole('button', { name: 'Close founding chapter', exact: true }).tap();
    assert.equal(await story.count(), 0);
    await page.locator('#fjord-menu > summary').tap();
    await page.locator('#clan-book-open').tap();
    const inGameText = (await page.locator('#clan-book-story > p').allTextContents()).join('\n\n');
    assert.equal(inGameText, opening, 'The ordinary menu reader keeps the same published prose.');
    assert.deepEqual(errors, []);
    writeFileSync(output + '/results.json', JSON.stringify({ viewport: '390x844 touch emulation',
        exactOpening: true, retainedAfterArrival: true, retainedScroll: true,
        playableTime: saved.fjord.campaign.time, errors }, null, 2));
    console.log('Canonical founding chapter remains readable through loading and matches the in-game book.');
} finally {
    await browser.close();
}
