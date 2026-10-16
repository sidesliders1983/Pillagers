import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fixture = JSON.parse(await readFile('docs/qa/fjord-runtime-performance/fixtures/developed-810.json', 'utf8'));
fixture.pace.running = false;
delete fixture.target;
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const browser = await chromium.launch({ channel: 'msedge', headless: true,
    ignoreDefaultArgs: ['--disable-back-forward-cache'] });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    const notRestored = [];
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.backForwardCacheNotUsed', event => notRestored.push(event));
    await page.addInitScript(raw => {
        if (sessionStorage.getItem('qa-native-cache-seeded')) return;
        sessionStorage.setItem('pillagers.fjord-play.active.v1', raw);
        sessionStorage.setItem('qa-native-cache-seeded', 'true');
    }, JSON.stringify(fixture));
    await page.goto(origin + '/fjord-play?debugLifecycle=1');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.evaluate(() => window.nativeCacheCanvas = document.querySelector('#fjord-canvas'));
    const before = JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    await page.goto(origin + '/docs/qa/terrain-shading/review.html');
    await page.goBack({ waitUntil: 'commit' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    const sameCanvas = await page.evaluate(() => window.nativeCacheCanvas === document.querySelector('#fjord-canvas'));
    const trace = await page.evaluate(() => JSON.parse(document.documentElement.dataset.fjordLifecycle));
    const actualCached = trace.some(record => record.event === 'pageshow' && record.persisted);
    if (actualCached) assert.equal(sameCanvas, true, 'Native cached return retains the same live renderer');
    else assert.equal(sameCanvas, false, 'Uncached history navigation is honestly classified as a cold restore');
    const after = JSON.parse(await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    assert.deepEqual(after.fjord.campaign, before.fjord.campaign);
    assert.deepEqual(after.fjord.island, before.fjord.island);
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    await mkdir('artifacts/campaign-resume', { recursive: true });
    await writeFile('artifacts/campaign-resume/bfcache.json', JSON.stringify({ browser: browser.version(),
        actualCached, sameCanvas, exactCampaign: true, notRestored, trace,
        note: 'Actual Edge history navigation with the default Playwright BFCache-disabling flag removed; not physical Safari.' }, null, 2));
    console.log(JSON.stringify({ actualCached, sameCanvas, exactCampaign: true }));
} finally { await browser.close(); }
