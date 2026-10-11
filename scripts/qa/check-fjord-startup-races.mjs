import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const browser = await chromium.launch(process.env.QA_NATIVE === '1' ?
    { headless: true, channel: 'msedge' } :
    { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const observations = [], errors = [];
const output = process.env.QA_OUTPUT || 'docs/qa/living-fjord';
async function exportCore(page) {
    const campaign = page.getByText('Campaign', { exact: true });
    if (!await page.locator('#fjord-export-core').isVisible()) await campaign.click();
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 90000 }), page.locator('#fjord-export-core').click(),
    ]);
    const json = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    return json;
}
async function delayAsset(page, pattern) {
    let release, received;
    const gate = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { received = resolve; });
    let held = false;
    const handler = async route => {
        if (!held) { held = true; received(); await gate; }
        await route.continue();
    };
    await page.route(pattern, handler);
    return { requested, release, remove: () => page.unroute(pattern, handler) };
}
async function newPage() {
    const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.qaHidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.qaHidden });
    });
    return page;
}
async function hide(page) {
    await page.evaluate(() => { window.qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
}
function record(name, before, after) {
    const hash = state => createHash('sha256').update(JSON.stringify(state)).digest('hex');
    observations.push({ case: name, before: before.time, after: after.time,
        careWinters: after.mechanics.config.childcareWinters,
        beforeHash: hash(before), afterHash: hash(after),
        eventCount: after.events.length, stocks: after.stocks });
}
try {
    const page = await newPage();
    const delayed = await delayAsset(page, '**/game-assets/houses/manifest.json');
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await delayed.requested;
    await page.selectOption('#fjord-quality', 'low');
    const before = await exportCore(page);
    await hide(page);
    delayed.release();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    await page.waitForTimeout(1500);
    const after = await exportCore(page);
    assert.deepEqual(after, before, 'Hidden-before-ready must preserve every canonical tick, stock, RNG and event');
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    record('hidden-before-ready', before, after);
    await page.close();
    console.log('Hidden-before-ready passed.');
    const savedTwo = structuredClone(before);
    savedTwo.mechanics.config.childcareWinters = 2;
    let ongoing;
    for (const operation of ['import', 'pause', 'load']) {
        const initial = await newPage();
        const assets = await delayAsset(initial, '**/game-assets/houses/manifest.json');
        await initial.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await assets.requested;
        await initial.selectOption('#fjord-quality', 'low');
        const original = await exportCore(initial);
        let expected = original;
        if (operation === 'pause') {
            await initial.locator('#fjord-run').click();
            assert.equal(await initial.locator('#fjord-run').innerText(), 'Pause');
            await initial.locator('#fjord-run').click();
        } else if (operation === 'import') {
            await initial.locator('#fjord-import').setInputFiles({
                name: 'saved-two-care.json', mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(savedTwo)),
            });
            await initial.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
            expected = savedTwo;
        } else {
            await initial.evaluate(json => localStorage.setItem('pillagers.gameplay-lab.v1', json), JSON.stringify(savedTwo));
            await initial.locator('#fjord-load').click();
            await initial.locator('#fjord-notice').filter({ hasText: 'Shared campaign loaded, paused.' }).waitFor();
            expected = savedTwo;
        }
        assets.release();
        await initial.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
        await initial.waitForTimeout(1200);
        const observed = await exportCore(initial);
        assert.deepEqual(observed, expected, operation + '-before-ready must retain the explicitly paused campaign');
        assert.equal(await initial.locator('#fjord-run').innerText(), 'Start');
        record(operation + '-before-ready', expected, observed);
        console.log(operation + '-before-ready passed.');
        if (operation === 'load') { ongoing = initial; await assets.remove(); }
        else await initial.close();
    }
    for (const scenario of ['restart-hidden', 'new-hidden', 'new-paused']) {
        const assets = await delayAsset(ongoing, '**/ground-materials/world-v01/low/*-colour.webp');
        if (scenario.startsWith('new')) await ongoing.locator('#fjord-seed').fill('17');
        await ongoing.locator(scenario.startsWith('new') ? '#fjord-new' : '#fjord-restart').click();
        await assets.requested;
        const expected = await exportCore(ongoing);
        assert.equal(expected.time.tick, 0);
        assert.equal(expected.mechanics.config.childcareWinters, scenario.startsWith('new') ? 5 : 2);
        if (scenario.endsWith('hidden')) await hide(ongoing);
        else {
            await ongoing.locator('#fjord-run').click();
            assert.equal(await ongoing.locator('#fjord-run').innerText(), 'Pause');
            await ongoing.locator('#fjord-run').click();
        }
        assets.release();
        await ongoing.locator('#fjord-notice').filter({ hasText: scenario.startsWith('new') ? 'New campaign created.' : 'Campaign restarted.' }).waitFor({ timeout: 180000 });
        await ongoing.waitForTimeout(1200);
        const observed = await exportCore(ongoing);
        assert.deepEqual(observed, expected, scenario + ' must not advance while scene completion waits');
        assert.equal(await ongoing.locator('#fjord-run').innerText(), 'Start');
        await ongoing.evaluate(() => { window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
        await ongoing.waitForTimeout(1100);
        assert.deepEqual(await exportCore(ongoing), expected, 'Returning to the tab neither resumes nor catches up');
        record(scenario, expected, observed);
        await assets.remove();
        console.log(scenario + ' passed.');
    }
    await ongoing.close();
    const handoff = await newPage();
    const assets = await delayAsset(handoff, '**/game-assets/houses/manifest.json');
    await handoff.goto(origin + '/play', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await handoff.locator('button[data-action="run"]').filter({ hasText: 'Start' }).waitFor();
    await handoff.locator('a[data-settlement-view="fjord"]').click();
    await assets.requested;
    await handoff.selectOption('#fjord-quality', 'low');
    const transferred = await exportCore(handoff);
    assets.release();
    await handoff.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    await handoff.waitForTimeout(1200);
    assert.equal(await handoff.locator('#fjord-run').innerText(), 'Start');
    assert.deepEqual(await exportCore(handoff), transferred);
    record('paused-2D-to-3D-handoff', transferred, await exportCore(handoff));
    await handoff.close();
    assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await writeFile(output + '/startup-races.json', JSON.stringify({ observations, errors, visibility: 'Controlled document.hidden with real visibilitychange handler; actual HTTP asset requests held and released.' }, null, 2) + '\n');
    console.log('PASS: all eight delayed-loading and paused-handoff scenarios preserve canonical state.');
} finally {
    await browser.close();
}
