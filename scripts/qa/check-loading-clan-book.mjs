import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const viewport = process.env.QA_TABLET ? { width: 1024, height: 768 } : { width: 390, height: 844 };
const output = process.env.QA_OUTPUT || 'docs/qa/cinematic-loading/book';
mkdirSync(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport, hasTouch: true });
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
    assert.equal(await page.title(), 'FjordSide');
    assert.equal(await page.locator('.island-loading-eyebrow').textContent(), 'FjordSide · a new shore');
    assert.equal(await page.locator('meta[name="application-name"]').getAttribute('content'), 'FjordSide');
    assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'), 'FjordSide');
    const manifestURL = await page.locator('link[rel="manifest"]').getAttribute('href');
    const response = await page.request.get(new URL(manifestURL, page.url()).href);
    assert.ok(response.ok());
    const manifest = await response.json();
    assert.equal(manifest.name, 'FjordSide');
    assert.equal(manifest.short_name, 'FjordSide');
    assert.equal(manifest.start_url, '/fjord-play');
    assert.equal(manifest.display, 'standalone');
    const icons = await page.evaluate(async manifestIcons => {
        const links = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')];
        const definitions = [...links.map(link => ({ src: link.href, sizes: link.sizes.value })), ...manifestIcons];
        return Promise.all(definitions.map(async icon => {
            const image = new Image();
            image.src = icon.src;
            await image.decode();
            return { src: new URL(icon.src, location.href).pathname, expected: icon.sizes,
                actual: image.naturalWidth + 'x' + image.naturalHeight };
        }));
    }, manifest.icons);
    assert.equal(icons.length, 6);
    for (const icon of icons) assert.equal(icon.actual, icon.expected, icon.src);
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
    const entrance = await page.locator('#fjord-canvas').evaluate(element => {
        const w = JSON.parse(element.dataset.camera).world;
        const fire = JSON.parse(element.dataset.campfire).transform;
        return { distance: Math.hypot(w[12] - fire.x, w[13] - fire.y, w[14] - fire.z),
            precipitation: JSON.parse(element.dataset.precipitation),
            clearance: JSON.parse(element.dataset.cameraClearance) };
    });
    assert.ok(entrance.distance < 65, 'Arrival should bring the player close to the campfire: ' + entrance.distance);
    assert.ok(entrance.clearance.groundClearance >= 2 - 1e-7);
    assert.ok(entrance.clearance.minimumBoomClearance >= .35 - 1e-7);
    assert.equal(entrance.precipitation.targetSnow, 0);
    assert.equal(entrance.precipitation.targetRain, 0);
    assert.equal(entrance.precipitation.snow, 0);
    assert.equal(entrance.precipitation.rain, 0);
    assert.equal(await story.textContent(), opening, 'Loading completion does not dismiss or rewrite the chapter.');
    assert.equal(await story.evaluate(element => element.scrollTop), scroll);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    assert.equal(saved.fjord.narrative.chapters[0].text, opening, 'Same bytes in the final saved book.');
    assert.deepEqual(saved.fjord.campaign.time, { winter: 800, tick: 500 });
    assert.equal(await page.locator('#clan-book-reader').isVisible(), false, 'No duplicate automatic opening.');
    await page.getByRole('button', { name: 'Close founding chapter', exact: true }).tap();
    assert.equal(await story.count(), 0);
    const collapse = page.getByRole('button', { name: 'Collapse management panel', exact: true });
    if (await collapse.isVisible()) await collapse.tap();
    await page.screenshot({ path: output + '/arrival.png' });
    await page.locator('#fjord-menu > summary').tap();
    assert.equal(await page.locator('#fjord-menu h1').textContent(), 'FjordSide');
    await page.screenshot({ path: output + '/menu.png' });
    await page.locator('#fjord-campaign > summary').tap();
    const exports = [];
    for (const [selector, filename] of [
        ['#fjord-export', 'fjordside-campaign.json'], ['#fjord-export-core', 'fjordside-core.json'],
    ]) {
        const downloaded = page.waitForEvent('download');
        await page.locator(selector).tap();
        const download = await downloaded;
        assert.equal(download.suggestedFilename(), filename);
        exports.push(filename);
        await download.delete();
    }
    await page.locator('#fjord-campaign > summary').tap();
    await page.locator('#clan-book-open').tap();
    const inGameText = (await page.locator('#clan-book-story > p').allTextContents()).join('\n\n');
    assert.equal(inGameText, opening, 'The ordinary menu reader keeps the same published prose.');
    assert.deepEqual(errors, []);
    writeFileSync(output + '/results.json', JSON.stringify({ viewport, touchEmulation: true,
        exactOpening: true, retainedAfterArrival: true, retainedScroll: true,
        playableTime: saved.fjord.campaign.time, entrance, branding: { title: await page.title(), icons, manifest, exports }, errors }, null, 2));
    console.log('Canonical founding chapter remains readable through loading and matches the in-game book.');
} finally {
    await browser.close();
}
