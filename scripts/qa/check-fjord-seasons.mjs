import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, createCrowdScenario, pausedCheckpoint } from './fjord-stability-scenario.mjs';
import { loadTypeScript } from '../load-typescript.mjs';
import { openFjordMenu, closeFjordMenu, openFjordCampaign, selectFjordQuality, advanceFjordYear } from './fjord-header-controls.mjs';

const { defaultWeatherConfig, weatherClasses } = loadTypeScript(new URL('../../src/simulation/Weather.ts', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-season-thaw';
const errors = [], matrix = [], layouts = [], resources = [], checks = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });
const seasons = ['Winter', 'Spring', 'Summer', 'Autumn'];
const sky = [0xcbd9e4, 0xcbded4, 0xbad7e3, 0xd6c4b4];
const fixture = (kind = null, tick = 0) => {
    const weather = kind ? { enabled: true, profiles: Object.fromEntries(weatherClasses.map(name =>
        [name, { ...defaultWeatherConfig.profiles[name], probabilityBps: name === kind ? 10000 : 0 }])) } : { enabled: false };
    return core.applyCommand(core.createCampaign(17, { initialFood: 10000, initialMaterials: 1000 },
        { fertilityChanceBps: 0, mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, weather),
    { type: 'AdvanceTicks', ticks: tick });
};
async function openPage(state, viewport) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        window.qaHidden = false;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.qaHidden });
    }, pausedCheckpoint(state));
    await page.goto(origin + '/fjord-play');
    await selectFjordQuality(page, 'low');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.waitForFunction(() => !!document.querySelector('#fjord-canvas').dataset.camera);
    return page;
}
async function importState(page, state) {
    await openFjordCampaign(page);
    await page.locator('#fjord-import').setInputFiles({ name: 'season.json', mimeType: 'application/json',
        buffer: Buffer.from(core.serializeState(state)) });
    await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
    await closeFjordMenu(page);
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
}
async function exportCore(page) {
    await openFjordCampaign(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
    const state = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    await closeFjordMenu(page);
    return state;
}
async function readVisual(page) {
    return page.locator('#fjord-canvas').evaluate(canvas => ({
        time: JSON.parse(canvas.dataset.time), calendar: JSON.parse(canvas.dataset.calendar),
        weather: JSON.parse(canvas.dataset.weather), materials: JSON.parse(canvas.dataset.seasonMaterials),
        camera: JSON.parse(canvas.dataset.camera), rendered: JSON.parse(canvas.dataset.rendered),
        stability: canvas.dataset.stability ? JSON.parse(canvas.dataset.stability) : null
    }));
}
async function headerBounds(page) {
    return page.evaluate(() => {
        const box = selector => {
            const r = document.querySelector(selector).getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        return { date: box('.fjord-date'), season: box('#fjord-season'), year: box('#fjord-year'),
            kpis: box('.fjord-kpis'), controls: box('.fjord-time-controls'), canvas: box('#fjord-canvas'),
            viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            pacingParent: document.querySelector('#fjord-pacing').parentElement.id };
    });
}
function verifyBounds(b) {
    assert.ok(b.scrollWidth <= b.viewport, 'No horizontal page overflow');
    for (const region of [b.date, b.kpis, b.controls]) {
        assert.ok(region.x >= 0 && region.x + region.width <= b.viewport, 'Header regions stay inside viewport');
    }
    assert.ok(b.date.x + b.date.width <= b.controls.x, 'Date and controls never overlap');
    assert.ok(b.canvas.height >= 150, 'World remains usable below the compact header');
}
try {
    const page = await openPage(fixture(), { width: 1280, height: 800 });
    const baselines = [];
    for (const kind of [null, ...weatherClasses]) {
        let firstBounds;
        for (const [index, season] of seasons.entries()) {
            const state = fixture(kind, [0, 375, 500, 750][index]);
            await importState(page, state);
            const visual = await readVisual(page);
            assert.equal(await page.locator('#fjord-season').innerText(), season);
            assert.equal(await page.locator('#fjord-year').innerText(), '800');
            assert.equal(visual.weather.class, kind);
            assert.equal(visual.calendar.progress, [0, .375, .5, .75][index]);
            assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(state)), 'Presentation leaves the complete Core unchanged');
            assert.ok(visual.materials.groundColors.length > 1, 'Generated regional ground layers reuse seasonal tint');
            assert.ok(visual.materials.foliageColors.length > 0, 'Existing foliage receives seasonal tint');
            assert.ok(visual.materials.snowAmounts.every(amount => amount === (index === 0 ? .65 : 0)), 'Snow follows existing seasonal Winter weight');
            if (!kind) {
                assert.equal(visual.weather.observed.sky, sky[index]);
                baselines.push(visual);
                await page.screenshot({ path: output + '/' + season.toLowerCase() + '.png' });
            } else if (index === 1 || index === 2 || kind === 'Normal') {
                assert.equal(visual.weather.observed.sky, sky[index], 'Annual weather does not keep Spring/Summer wintery');
            } else if (index === 0) {
                assert.notEqual(visual.weather.observed.sky, sky[0], 'Winter composes the annual weather lighting');
            }
            const bounds = await headerBounds(page);
            verifyBounds(bounds);
            if (index) assert.deepEqual([bounds.date, bounds.year, bounds.kpis, bounds.controls],
                [firstBounds.date, firstBounds.year, firstBounds.kpis, firstBounds.controls], 'Season label cannot move header regions');
            firstBounds = bounds;
            matrix.push({ weather: kind ?? 'Off', season, observed: visual.weather.observed,
                groundColors: visual.materials.groundColors, snow: visual.materials.snowAmounts[0] });
            console.log('PASS matrix: ' + (kind ?? 'Off') + ' / ' + season);
        }
    }
    for (let i = 1; i < 4; i++) {
        assert.notDeepEqual(baselines[i].materials.groundColors, baselines[i - 1].materials.groundColors);
        assert.notDeepEqual(baselines[i].materials.foliageColors, baselines[i - 1].materials.foliageColors);
    }
    for (const tick of [125, 249, 250, 251, 312, 374]) {
        const state = fixture(null, tick);
        await importState(page, state);
        const visual = await readVisual(page);
        assert.equal(visual.calendar.season, tick < 250 ? 'Winter' : 'Spring');
        assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(state)));
        const snow = visual.materials.snowAmounts[0];
        if (tick <= 250) {
            assert.equal(snow, .65, 'Winter remains white through the Spring boundary');
            assert.deepEqual(visual.materials.groundColors, baselines[0].materials.groundColors);
            assert.deepEqual(visual.materials.foliageColors, baselines[0].materials.foliageColors);
            assert.equal(visual.weather.observed.sky, sky[0]);
        } else {
            assert.ok(snow > 0 && snow < .65, 'Spring thaw is gradual');
        }
        matrix.push({ tick, season: visual.calendar.season, snow, observed: visual.weather.observed });
        if (tick === 250 || tick === 312)
            await page.screenshot({ path: output + '/spring-' + tick + '.png' });
    }
    checks.push('Winter ground, foliage, sky and snow stay unchanged through tick 250; thaw starts after Spring begins and Core export stays identical');
    for (let repetition = 0; repetition < 3; repetition++) {
        await importState(page, fixture(null, 0));
        await page.waitForTimeout(650);
        const winter = await readVisual(page);
        assert.deepEqual(winter.materials.groundColors, baselines[0].materials.groundColors, 'Reload restores untarnished seasonal ground colours');
        assert.deepEqual(winter.materials.foliageColors, baselines[0].materials.foliageColors, 'No cumulative tint after repeated world rebuilds');
        resources.push({ repetition, geometries: winter.stability.geometries, textures: winter.stability.textures });
        await selectFjordQuality(page, 'standard');
        await selectFjordQuality(page, 'low');
        const switched = await readVisual(page);
        assert.deepEqual(switched.materials.materials, winter.materials.materials, 'Quality switches retain seasonal materials');
        assert.deepEqual(switched.materials.snowAmounts, winter.materials.snowAmounts);
    }
    assert.ok(Math.max(...resources.map(r => r.geometries)) - Math.min(...resources.map(r => r.geometries)) <= 2, 'Repeated same-world import has bounded geometry count');
    assert.ok(Math.max(...resources.map(r => r.textures)) - Math.min(...resources.map(r => r.textures)) <= 2, 'Repeated same-world import has bounded texture count');
    checks.push('Repeated world rebuilds restore original seasonal colours; quality changes retain materials; renderer resource counts stay bounded');
    const partial = fixture('Harsh', 430);
    await importState(page, partial);
    await openFjordCampaign(page);
    await page.locator('#fjord-save').click();
    await closeFjordMenu(page);
    await advanceFjordYear(page);
    await page.waitForFunction(() => document.querySelector('#fjord-year').textContent === '801');
    assert.deepEqual((await readVisual(page)).time, { winter: 801, tick: 430, ticksPerWinter: 1000 });
    assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(core.applyCommand(partial, { type: 'AdvanceWinter' }))));
    await openFjordCampaign(page);
    await page.locator('#fjord-load').click();
    await page.locator('#fjord-notice').filter({ hasText: 'Shared campaign loaded, paused.' }).waitFor();
    await closeFjordMenu(page);
    assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(partial)));
    assert.equal(await page.locator('#fjord-season').innerText(), 'Spring');
    assert.doesNotMatch(await page.locator('#fjord-header').innerText(), /tick|430\/1000/i);
    assert.match(await page.locator('#fjord-diagnostics').textContent(), /tick 430\/1000/);
    checks.push('Partial-year import/local load and +1 Year preserve 430 ticks, Spring and exact Core replay');
    await openFjordMenu(page);
    await page.locator('a[data-settlement-view="board"]').click();
    await page.waitForURL('**/play');
    await page.locator('a[data-settlement-view="fjord"]').click();
    await page.waitForURL('**/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.equal(await page.locator('#fjord-season').innerText(), 'Spring');
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(partial)));
    checks.push('Paused 3D → 2D → 3D handoff restores the exact canonical season');

    await importState(page, fixture(null, 249));
    const before = await readVisual(page);
    await page.selectOption('#fjord-cycle', '1');
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => document.querySelector('#fjord-season').textContent === 'Spring');
    await openFjordCampaign(page);
    await page.locator('#fjord-seed').fill('123');
    const menuTick = (await readVisual(page)).time.tick;
    await page.waitForFunction(tick => JSON.parse(document.querySelector('#fjord-canvas').dataset.time).tick > tick, menuTick);
    assert.equal(await page.locator('#fjord-menu').evaluate(menu => menu.open), true);
    assert.equal(await page.locator('#fjord-seed').inputValue(), '123', 'Tick refresh retains menu edits');
    await page.locator('#fjord-run').click();
    const after = await readVisual(page);
    assert.deepEqual(after.materials.materials, before.materials.materials, 'Quarter transition allocates no seasonal materials');
    assert.deepEqual(after.rendered.map(e => [e.key, e.asset]), before.rendered.map(e => [e.key, e.asset]), 'Quarter transition rebuilds no agents/assets');
    assert.deepEqual(await exportCore(page), JSON.parse(core.serializeState(core.applyCommand(fixture(null, 249),
        { type: 'AdvanceTicks', ticks: after.time.tick - 249 }))));
    await page.waitForTimeout(600);
    assert.deepEqual((await readVisual(page)).calendar, after.calendar, 'Pause freezes presentation time');
    checks.push('Real running clock crosses Winter → Spring without rebuilding materials or agents; menu edits survive refresh; pause freezes season');
    await importState(page, fixture(null, 999));
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => document.querySelector('#fjord-year').textContent === '801');
    await page.locator('#fjord-run').click();
    assert.equal(await page.locator('#fjord-season').innerText(), 'Winter');
    checks.push('Real clock wraps Autumn 800 → Winter 801 and continues running');
    await openFjordMenu(page);
    await page.selectOption('#fjord-cycle', '3');
    const frozen = await readVisual(page);
    await page.locator('#fjord-menu > summary').focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const keyedCamera = (await readVisual(page)).camera;
    for (const key of ['world', 'projection'])
        assert.ok(keyedCamera[key].every((value, index) => Math.abs(value - frozen.camera[key][index]) < 1e-10),
            'Header keys do not navigate camera (matrix roundoff only)');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fjord-menu').evaluate(menu => menu.open), false);
    checks.push('Menu keyboard input stays out of world navigation; Escape returns focus');
    await page.locator('#fjord-run').click();
    await page.evaluate(() => { window.qaHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await exportCore(page);
    await page.waitForTimeout(750);
    assert.deepEqual(await exportCore(page), hidden, 'Hidden tab contributes no ticks or season drift');
    await page.evaluate(() => { window.qaHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    checks.push('Controlled hidden-tab guard freezes Core and seasons with no catch-up');
    await page.close();

    for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 },
        { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1600, height: 900 }]) {
        let crowd = createCrowdScenario(25);
        crowd.stocks = { food: 123456789, materials: 987654321 };
        crowd = core.reconstructState(core.serializeState(crowd));
        const device = await openPage(crowd, viewport);
        let expectedBounds;
        for (const [index, season] of seasons.entries()) {
            if (index) await importState(device, core.applyCommand(crowd, { type: 'AdvanceTicks', ticks: index * 250 }));
            const bounds = await headerBounds(device);
            verifyBounds(bounds);
            assert.equal(await device.locator('#fjord-season').innerText(), season);
            if (expectedBounds) assert.deepEqual([bounds.date, bounds.year, bounds.kpis, bounds.controls],
                [expectedBounds.date, expectedBounds.year, expectedBounds.kpis, expectedBounds.controls]);
            expectedBounds = bounds;
            layouts.push({ viewport, season, bounds });
        }
        assert.equal(expectedBounds.pacingParent, viewport.width <= 600 ? 'fjord-menu-pacing-slot' : 'fjord-pacing-slot');
        await openFjordMenu(device);
        await openFjordCampaign(device);
        await device.locator('#fjord-import').scrollIntoViewIfNeeded();
        const menuBox = await device.locator('.fjord-settings').boundingBox();
        assert.ok(menuBox.y + menuBox.height <= viewport.height, 'Menu fits and scrolls inside device');
        await device.selectOption('#fjord-cycle', '5');
        assert.equal(await device.locator('#fjord-cycle').inputValue(), '5');
        await closeFjordMenu(device);
        const targets = await device.locator('#fjord-run, #fjord-menu > summary').evaluateAll(nodes =>
            nodes.map(node => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
        assert.ok(targets.every(target => target.w >= 44 && target.h >= 44));
        await device.screenshot({ path: output + '/hud-' + viewport.width + '.png' });
        await device.close();
        console.log('PASS layout: ' + viewport.width + ' × ' + viewport.height);
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/observations.json', JSON.stringify({ matrix, layouts, resources, checks, errors,
        scope: 'Real Edge/WebGL, controlled canonical fixtures and touch viewports. Physical Safari/iPad and device screen sleep are not tested.' }, null, 2) + '\n');
    console.log('PASS: 20 weather/season combinations, stable five-viewport HUD, save/load/handoff and unchanged Core replay.');
} finally {
    await browser.close();
}
