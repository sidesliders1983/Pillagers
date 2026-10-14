import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';
import { openFjordMenu, closeFjordMenu, openFjordCampaign, selectFjordPace } from './fjord-header-controls.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/seasonal-precipitation/palette-timing';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = { browser: 'Edge Chromium, 1180×820 touch emulation', physicalIPad: false, checks: [], errors: [] };
try {
    let state = core.createCampaign(32, { initialMaterials: 100 }, {}, { enabled: false });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => results.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') results.errors.push(message.text()); });
    await page.addInitScript(json => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        window.qaHidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.qaHidden });
    }, pausedCheckpoint(state));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5190') + '/fjord-play');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor({ timeout: 120000 });
    const read = () => canvas.evaluate(el => JSON.parse(el.dataset.precipitation || 'null'));
    const waitFor = (key, value) => page.waitForFunction(({ key, value }) =>
        JSON.parse(document.querySelector('#fjord-canvas').dataset.precipitation)[key] === value, { key, value });
    const pause = async () => {
        if (await page.locator('#fjord-run').innerText() === 'Pause') await page.locator('#fjord-run').tap();
        await page.waitForTimeout(650);
    };
    const run = async () => {
        if (await page.locator('#fjord-run').innerText() === 'Start') await page.locator('#fjord-run').tap();
    };
    const quality = async value => {
        await openFjordMenu(page);
        await page.getByLabel('Local effects', { exact: false }).selectOption(value);
        await closeFjordMenu(page);
        await waitFor('quality', value);
    };
    const exportCore = async () => {
        await openFjordCampaign(page);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
        const value = JSON.parse(await readFile(await download.path(), 'utf8'));
        await download.delete();
        await closeFjordMenu(page);
        return value;
    };
    const importCore = async value => {
        await openFjordCampaign(page);
        await page.locator('#fjord-import').setInputFiles({ name: 'season.json', mimeType: 'application/json',
            buffer: Buffer.from(core.serializeState(value)) });
        await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
        await closeFjordMenu(page);
    };
    const frameSample = async () => page.evaluate(async () => {
        const frames = [];
        let previous = performance.now();
        for (let i = 0; i < 40; i++) {
            const time = await new Promise(requestAnimationFrame);
            frames.push(time - previous);
            previous = time;
        }
        return { frameIntervalsMs: frames, diagnostics: JSON.parse(document.querySelector('#fjord-canvas').dataset.stability) };
    });
    const point = async navigate => canvas.evaluate((el, navigate) => {
        const fire = JSON.parse(el.dataset.campfire).transform;
        const { world: w, projection: m } = JSON.parse(el.dataset.camera), rect = el.getBoundingClientRect();
        const v = [fire.x - w[12], fire.y + (navigate ? 0 : .5) - w[13], fire.z - (navigate ? 5 : 0) - w[14]];
        const local = [w[0]*v[0]+w[1]*v[1]+w[2]*v[2], w[4]*v[0]+w[5]*v[1]+w[6]*v[2], w[8]*v[0]+w[9]*v[1]+w[10]*v[2], 1];
        const p = [0,1,2,3].map(row => m[row]*local[0]+m[row+4]*local[1]+m[row+8]*local[2]+m[row+12]);
        return { x: rect.left+(p[0]/p[3]+1)*rect.width/2, y: rect.top+(1-p[1]/p[3])*rect.height/2 };
    }, navigate);
    const collapse = page.getByRole('button', { name: 'Collapse management panel', exact: true });
    if (await collapse.isVisible()) await collapse.tap();
    const navigation = await point(true);
    await page.touchscreen.tap(navigation.x, navigation.y);
    await page.waitForTimeout(1200);
    await page.mouse.move(450, 450);
    await page.mouse.wheel(0, -5500);
    await page.waitForTimeout(1200);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(450);
    await page.keyboard.up('ArrowLeft');
    assert.equal((await read())?.targetSnow, 1, 'Winter projects snowfall even when economic weather is off');
    assert.deepEqual(await exportCore(), state);
    await run();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.precipitation).snow > 100);
    await page.waitForTimeout(3000);
    results.lowFrames = await frameSample();
    await pause();
    const paused = await read();
    assert.ok(paused.snow > 100 && paused.snow <= 300);
    assert.equal(paused.rain, 0);
    await page.waitForTimeout(500);
    assert.deepEqual(await read(), paused, 'Paused snowfall freezes');
    await page.screenshot({ path: output + '/winter-low.png' });
    results.checks.push({ check: 'snow, bounded Low and pause', passed: true, observed: paused });
    const saved = await exportCore();
    assert.deepEqual(saved, core.applyCommand(state, { type: 'AdvanceTicks', ticks: saved.time.tick }),
        'Snowfall consumes no canonical randomness or resources');
    const target = await point(false);
    await page.touchscreen.tap(target.x, target.y);
    assert.equal(await canvas.getAttribute('data-selected'), 'campfire:settlement-campfire', 'Particles cannot intercept touch picking');
    await quality('off');
    assert.equal((await read()).snow, 0);
    assert.equal((await read()).rain, 0);
    assert.equal((await read()).enabled, false);
    assert.deepEqual(await exportCore(), saved);
    await page.screenshot({ path: output + '/winter-off.png' });
    await quality('normal');
    await run();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.precipitation).snow > 300);
    results.normalFrames = await frameSample();
    await pause();
    assert.ok((await read()).snow <= 700);
    await page.screenshot({ path: output + '/winter-normal.png' });
    // Compare the shower around the camera focus, excluding water and the management panel.
    const foregroundPixels = async () => {
        const shot = sharp(await canvas.screenshot());
        const { width, height } = await shot.metadata();
        return shot.extract({ left: Math.floor(width * .08), top: Math.floor(height * .02),
            width: Math.floor(width * .6), height: Math.floor(height * .35) }).removeAlpha().raw().toBuffer();
    };
    const snowPixels = await foregroundPixels();
    await quality('off');
    const clearPixels = await foregroundPixels();
    let changedPixels = 0;
    for (let index = 0; index < snowPixels.length; index += 3) {
        if (Math.max(...[0, 1, 2].map(channel =>
            Math.abs(snowPixels[index + channel] - clearPixels[index + channel]))) > 12) changedPixels++;
    }
    results.snowVisiblePixels = changedPixels;
    assert.ok(changedPixels > 50, 'Visible flakes must change the rendered scene, not only the particle counter');
    await quality('normal');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await waitFor('reducedMotion', true);
    assert.equal((await read()).snow, 0);
    await run();
    await page.waitForTimeout(1000);
    assert.equal((await read()).snow, 0);
    await pause();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await quality('low');
    results.checks.push({ check: 'Off, Normal, reduced motion and touch selection', passed: true });

    const seasonal = [];
    const seasons = [
        [312, 'spring', true, false], [450, 'dry-spring', false, false],
        [625, 'summer', false, true], [875, 'autumn', true, true]
    ];
    for (const [tick, label, snowy, rainy] of seasons) {
        await importCore(core.applyCommand(state, { type: 'AdvanceTicks', ticks: tick }));
        await page.waitForTimeout(650);
        assert.equal((await read()).snow, 0, 'Import does not replay old weather particles');
        await run();
        await page.waitForTimeout(4500);
        await pause();
        const effect = await read();
        assert.equal(effect.snow > 0, snowy, 'falling snow in ' + label);
        assert.equal(effect.rain > 0, rainy, 'rain in ' + label);
        assert.ok(effect.snow <= 300 && effect.rain <= 250);
        const calendar = await canvas.evaluate(el => JSON.parse(el.dataset.calendar));
        assert.equal(effect.targetSnow, calendar.winterWeight, 'snow follows the visible environment palette');
        if (label === 'summer') assert.ok(effect.targetRain > .5 && effect.targetRain < .85);
        if (label === 'autumn') {
            assert.ok(effect.targetSnow > .5 && effect.targetSnow < .85);
            assert.ok(Math.abs(effect.targetSnow + effect.targetRain - 1) < 1e-9);
        }
        const exported = await exportCore();
        assert.deepEqual(exported, core.applyCommand(state, { type: 'AdvanceTicks', ticks: exported.time.tick }));
        await page.screenshot({ path: output + '/' + label + '.png' });
        seasonal.push({ label, effect, calendar, resources: (await frameSample()).diagnostics });
    }
    results.checks.push({ check: 'Summer rain, Autumn snow and Spring thaw follow the palette; imports preserve Core',
        passed: true, seasonal });

    // Cross the real quarter boundaries while running, before the label reaches the next season.
    await importCore(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 230 }));
    // Scene work is excluded from the game clock; choose the public fast pace for this long transition.
    await selectFjordPace(page, '1');
    await run();
    await page.waitForFunction(() => {
        const p = JSON.parse(document.querySelector('#fjord-canvas').dataset.precipitation);
        return p.targetSnow > 0 && p.targetSnow < 1;
    });
    results.springTransition = await read();
    try {
        await waitFor('snowWeight', 0);
    } catch (error) {
        console.error('Spring transition state', await read(),
            await canvas.evaluate(el => JSON.parse(el.dataset.calendar)));
        throw error;
    }
    assert.equal((await read()).snow, 0);
    await pause();
    await importCore(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 497 }));
    await run();
    await page.waitForFunction(() => {
        const el = document.querySelector('#fjord-canvas');
        const p = JSON.parse(el.dataset.precipitation);
        return JSON.parse(el.dataset.calendar).season === 'Summer' && p.rain > 0;
    });
    results.summerTransition = await read();
    await pause();
    await importCore(core.applyCommand(state, { type: 'AdvanceTicks', ticks: 747 }));
    await run();
    await page.waitForFunction(() => {
        const el = document.querySelector('#fjord-canvas');
        const p = JSON.parse(el.dataset.precipitation);
        return JSON.parse(el.dataset.calendar).season === 'Autumn' && p.snow > 0 && p.rain > 0;
    });
    results.autumnTransition = await read();
    await page.evaluate(() => { window.qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(700);
    const hidden = await read();
    await page.waitForTimeout(700);
    assert.deepEqual(await read(), hidden, 'Hidden tab freezes precipitation');
    await page.evaluate(() => { window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    results.checks.push({ check: 'Gradual live boundaries and hidden-tab pause', passed: true });
    assert.deepEqual(results.errors, []);
    results.passed = true;
    await writeFile(output + '/results.json', JSON.stringify(results, null, 2));
    console.log('Seasonal precipitation browser checks passed');
} finally { await browser.close(); }
