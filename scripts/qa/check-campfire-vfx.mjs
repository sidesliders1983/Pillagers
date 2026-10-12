import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, pausedCheckpoint } from './fjord-stability-scenario.mjs';
import { openFjordMenu, closeFjordMenu, openFjordCampaign, selectFjordQuality } from './fjord-header-controls.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/campfire-vfx';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
    let state = core.createCampaign(32, { initialMaterials: 100 },
        { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0 }, { enabled: false });
    state = core.applyCommand(state, { type: 'BuildHouse', householdId: 'founder-1' });
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), pausedCheckpoint(state));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor({ timeout: 120000 });
    const panel = page.locator('#entity-panel');
    const readEffect = () => canvas.evaluate(el => JSON.parse(el.dataset.campfireEffect));
    const readSnow = () => canvas.evaluate(el => JSON.parse(el.dataset.structureSnow));
    const readCore = async () => {
        await openFjordCampaign(page);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
        const result = JSON.parse(await readFile(await download.path(), 'utf8'));
        await download.delete();
        await closeFjordMenu(page);
        return result;
    };
    const setQuality = async quality => {
        await openFjordMenu(page);
        await page.selectOption('#fjord-effects', quality);
        await closeFjordMenu(page);
        await page.waitForFunction(value => JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect).quality === value, quality);
    };
    const importCore = async next => {
        await openFjordCampaign(page);
        await page.locator('#fjord-import').setInputFiles({ name: 'campfire.json', mimeType: 'application/json',
            buffer: Buffer.from(core.serializeState(next)) });
        await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
        await closeFjordMenu(page);
    };
    const selectFire = async (navigate = false) => {
        const collapse = page.getByRole('button', { name: 'Collapse management panel', exact: true });
        if (await collapse.isVisible()) await collapse.tap();
        const point = await canvas.evaluate((el, navigate) => {
            const fire = JSON.parse(el.dataset.campfire).transform;
            const { world: w, projection: m } = JSON.parse(el.dataset.camera), rect = el.getBoundingClientRect();
            const v = [fire.x - w[12], fire.y + (navigate ? 0 : .5) - w[13], fire.z - (navigate ? 6 : 0) - w[14]];
            const local = [w[0]*v[0]+w[1]*v[1]+w[2]*v[2], w[4]*v[0]+w[5]*v[1]+w[6]*v[2], w[8]*v[0]+w[9]*v[1]+w[10]*v[2], 1];
            const p = [0,1,2,3].map(row => m[row]*local[0]+m[row+4]*local[1]+m[row+8]*local[2]+m[row+12]);
            return { x: rect.left+(p[0]/p[3]+1)*rect.width/2, y: rect.top+(1-p[1]/p[3])*rect.height/2 };
        }, navigate);
        await page.touchscreen.tap(point.x, point.y);
        if (navigate) { await page.waitForTimeout(1200); return point; }
        await panel.getByRole('heading', { name: 'Settlement campfire', exact: true }).waitFor();
        assert.equal(await canvas.getAttribute('data-selected'), 'campfire:settlement-campfire');
        return point;
    };
    await selectFire(true);
    const point = await selectFire();
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, -6000);
    await page.waitForTimeout(800);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(500);
    await page.screenshot({ path: output + '/winter-unlit.png' });
    await panel.getByRole('button', { name: 'Light campfire (1 Material)', exact: true }).tap();
    state = core.applyCommand(state, { type: 'SetCampfire', lit: true });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect).lit);
    assert.deepEqual(await readCore(), state, 'Lighting is one canonical command, with no presentation costs');
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => {
        const f = JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect);
        return f.heat > .05 && f.heat < .9 && f.particles > 0;
    });
    const transition = await readEffect();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect).heat === 1);
    await page.locator('#fjord-run').tap();
    await page.waitForTimeout(600);
    const paused = await readEffect();
    assert.ok(paused.particles > 0 && paused.particles <= 68);
    const snow = await readSnow();
    assert.equal(snow.find(e => e.key === 'settlement-campfire').amount, 0);
    assert.ok(snow.filter(e => e.key !== 'settlement-campfire').every(e => e.amount === .65));
    await page.waitForTimeout(1000);
    assert.deepEqual(await readEffect(), paused, 'Paused fire, snow fade and particles freeze');
    await page.screenshot({ path: output + '/winter-burning-low.png' });
    const canonical = await readCore();
    assert.deepEqual(canonical, core.applyCommand(state, { type: 'AdvanceTicks', ticks: canonical.time.tick }));
    await setQuality('off');
    assert.equal((await readEffect()).particles, 0);
    assert.equal((await readEffect()).heat, 1);
    assert.deepEqual(await readCore(), canonical);
    await setQuality('normal');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect).reducedMotion);
    assert.equal((await readEffect()).particles, 0);
    assert.equal((await readEffect()).visible, false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#fjord-run').tap();
    await page.waitForTimeout(5000);
    await page.locator('#fjord-run').tap();
    await page.waitForTimeout(600);
    await page.screenshot({ path: output + '/winter-burning-normal.png' });
    assert.ok((await readEffect()).particles <= 68);
    // Rendering observations in the same frozen scene/camera; individual RAF intervals retained.
    const performanceRuns = [];
    for (const quality of ['off', 'low', 'normal']) {
        await setQuality(quality);
        await page.locator('#fjord-run').tap();
        await page.waitForTimeout(3500);
        await page.locator('#fjord-run').tap();
        await page.waitForTimeout(700);
        const intervals = await page.evaluate(() => new Promise(resolve => {
            const intervals = []; let previous;
            const sample = now => {
                if (previous !== undefined) intervals.push(now - previous);
                previous = now;
                if (intervals.length < 90) requestAnimationFrame(sample); else resolve(intervals);
            };
            requestAnimationFrame(sample);
        }));
        performanceRuns.push({ quality, intervals, effect: await readEffect(),
            renderer: await canvas.evaluate(el => JSON.parse(el.dataset.stability)) });
    }
    // Actual hidden-tab behavior, without injecting visibility or a clock into the application.
    const other = await page.context().newPage();
    await page.locator('#fjord-run').tap();
    await other.bringToFront();
    await page.waitForTimeout(650);
    const hidden = await readEffect();
    const wasHidden = await page.evaluate(() => document.hidden);
    await page.waitForTimeout(1200);
    if (wasHidden) assert.deepEqual(await readEffect(), hidden);
    await page.bringToFront();
    await page.locator('#fjord-run').tap();
    await other.close();
    const save = await readCore();
    for (let i = 0; i < 2; i++) {
        await importCore(save);
        assert.deepEqual(await readCore(), save);
        assert.equal((await readEffect()).heat, 1);
        assert.equal((await readEffect()).systems, 3);
        await selectFire();
    }
    await selectFjordQuality(page, 'standard');
    await selectFjordQuality(page, 'low');
    assert.deepEqual(await readCore(), save, 'World quality changes preserve fuel and RNG');
    await panel.getByRole('button', { name: 'Extinguish campfire', exact: true }).tap();
    const extinguished = core.applyCommand(save, { type: 'SetCampfire', lit: false });
    assert.deepEqual(await readCore(), extinguished);
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.campfireEffect).heat === 0);
    await page.locator('#fjord-run').tap();
    assert.equal((await readEffect()).particles, 0);
    const cold = await readCore();
    assert.equal(cold.campfire.fuelTicks, save.campfire.fuelTicks, 'Extinguished time uses no fuel');
    await panel.getByRole('button', { name: 'Relight campfire', exact: true }).tap();
    const relit = await readCore();
    assert.equal(relit.stocks.materials, cold.stocks.materials);
    await page.locator('#fjord-next').tap();
    assert.deepEqual(await readCore(), core.applyCommand(relit, { type: 'AdvanceWinter' }));
    const empty = structuredClone(save);
    empty.campfire = { version: 1, lit: false, fuelTicks: 0 };
    empty.stocks.materials = 0;
    await importCore(empty);
    await selectFire();
    assert.equal(await panel.getByRole('button', { name: 'Light campfire (1 Material)', exact: true }).isDisabled(), true);
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ date: new Date().toISOString(),
        viewport: { width: 1180, height: 820 }, touchEmulation: true, physicalIPadTested: false,
        transition, paused, performanceRuns, otherStructuresRemainSnowy: true, hiddenTabObserved: wasHidden,
        tests: ['touch mesh selection and ring', 'canonical lighting cost', 'gradual local thaw', 'pause',
            'effects off/low/normal', 'reduced motion', 'save/load twice', 'world quality',
            'extinguish and bank fuel', 'relight', '+1 Year canonical equality', 'empty stock disabled'], errors }, null, 2));
    console.log('Campfire browser QA passed.');
} finally { await browser.close(); }
