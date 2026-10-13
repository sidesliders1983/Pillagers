import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'docs/qa/summer-founding';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const errors = [];
const flows = [];
page.setDefaultTimeout(180000);
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
    window.openingEvidence = [];
    new MutationObserver(() => {
        const canvas = document.querySelector('#fjord-canvas');
        const stored = sessionStorage.getItem('pillagers.fjord-play.active.v1');
        if (!canvas || !stored) return;
        const time = JSON.parse(stored).fjord.campaign.time;
        if (canvas.dataset.ready !== 'true') {
            if (window.openingEvidence.length < 20) window.openingEvidence.push(time);
        } else if (!window.readyEvidence) {
            window.readyEvidence = { time, season: document.querySelector('#fjord-season').textContent,
                materials: JSON.parse(canvas.dataset.seasonMaterials), structures: JSON.parse(canvas.dataset.structureSnow) };
        }
        if (canvas.dataset.ready === 'true' && time.winter === 800 && time.tick === 500 &&
            document.querySelector('#fjord-run').textContent === 'Pause') document.querySelector('#fjord-run').click();
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-ready', 'data-time'] });
});
try {
    await page.goto(origin + '/fjord-play?seed=32&start=summer', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    const ready = await page.evaluate(() => window.readyEvidence);
    assert.equal(ready.season, 'Summer');
    assert.deepEqual(ready.time, { winter: 800, tick: 500 });
    assert.ok(ready.materials.snowAmounts.every(value => value === 0));
    assert.ok(ready.structures.every(item => item.amount === 0));
    assert.match(await page.locator('#fjord-weather-information').innerText(), /Year 800.*annual weather/);
    assert.ok((await page.evaluate(() => window.openingEvidence)).every(time => time.winter === 800 && time.tick === 500));
    await page.waitForFunction(() => document.querySelector('#fjord-canvas').dataset.camera);
    await page.screenshot({ path: output + '/summer-opening.jpg', type: 'jpeg', quality: 86 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.screenshot({ path: output + '/summer-settlement.jpg', type: 'jpeg', quality: 86 });
    const stored = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord);
    const menu = async () => {
        if (!await page.locator('#fjord-menu').evaluate(element => element.open)) await page.locator('#fjord-menu > summary').click();
        if (!await page.locator('#fjord-campaign').evaluate(element => element.open)) await page.locator('#fjord-campaign > summary').click();
    };
    const closeBook = async () => { if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click(); };
    const initial = await stored();
    await menu();
    const downloaded = page.waitForEvent('download');
    await page.locator('#fjord-export').click();
    assert.deepEqual(JSON.parse(await readFile(await (await downloaded).path(), 'utf8')).campaign, initial.campaign);
    await page.locator('#fjord-save').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign and exact Fjord saved locally.');
    await page.locator('#fjord-next').click();
    await page.waitForFunction(() => document.querySelector('#fjord-year').textContent === '801');
    assert.deepEqual((await stored()).campaign.time, { winter: 801, tick: 500 });
    await menu();
    await page.locator('#fjord-load').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Shared campaign loaded, paused.');
    assert.deepEqual((await stored()).campaign, initial.campaign);
    flows.push('Export and local save/load preserve the Summer checkpoint; +1 Year keeps its full-year behavior (801:500).');
    await closeBook();
    await menu();
    await page.locator('#fjord-restart').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign restarted.');
    assert.deepEqual((await stored()).campaign, initial.campaign);
    await closeBook();
    await menu();
    await page.locator('#fjord-founders').uncheck();
    await page.locator('#fjord-restart').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign restarted.');
    assert.notEqual((await stored()).campaign.seed, 32);
    assert.deepEqual((await stored()).campaign.time, { winter: 800, tick: 500 });
    await closeBook();
    await menu();
    await page.locator('#fjord-seed').fill('32');
    await page.locator('#fjord-new').click();
    await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'New campaign created.');
    assert.deepEqual((await stored()).campaign, initial.campaign);
    flows.push('Same founders restart, random founders restart and New campaign from seed start directly at 800:500.');
    for (const [phase, ticks] of [[undefined, 123], ['summer-800-v1', 200]]) {
        await closeBook();
        await menu();
        const state = core.applyCommand(core.createCampaign(32, {}, {}, {}, {}, { enabled: true }, {}, phase), { type: 'AdvanceTicks', ticks });
        await page.locator('#fjord-import').setInputFiles({ name: 'checkpoint.json', mimeType: 'application/json', buffer: Buffer.from(core.serializeState(state)) });
        await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Campaign imported, paused.');
        assert.deepEqual((await stored()).campaign, state);
        assert.equal(await page.locator('#fjord-run').textContent(), 'Start');
    }
    flows.push('Preview URL leaves legacy tick 123 and Summer tick 700 imports exactly as saved, paused.');
    await closeBook();
    const beforeTransfer = (await stored()).campaign;
    await menu();
    await page.locator('a[data-settlement-view="board"]').click();
    await page.waitForURL('**/play');
    await page.locator('a[data-settlement-view="fjord"]').click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await stored()).campaign, beforeTransfer);
    flows.push('2D to 3D transfer retains canonical tick 700 and paused playback.');
    await page.setViewportSize({ width: 1024, height: 768 });
    await closeBook();
    await page.locator('#fjord-menu > summary').tap();
    assert.ok(await page.locator('#clan-book-open').isVisible());
    await page.locator('#clan-book-open').tap();
    assert.ok(await page.locator('#clan-book-close').isVisible());
    await page.locator('#clan-book-close').tap();
    flows.push('Tablet viewport and touch taps open the menu and Clan Book. Physical iPad not tested in this run.');
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ ready, flows, errors }, null, 2));
    console.log('Summer opening, initial scene and paused loading passed.');
} finally { await browser.close(); }
