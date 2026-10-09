import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5184';
const output = process.env.QA_OUTPUT || 'scratch/fjordside-water-review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(180000);
const errors = [], shots = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const ready = async () => {
    await page.locator('canvas[data-ready=true]').waitFor();
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
const state = async () => JSON.parse(await page.locator('canvas').getAttribute('data-fixture'));
const scrub = async time => {
    await page.fill('#fjordside-effects-time', String(time));
    await page.click('#fjordside-effects-scrub');
    await page.waitForFunction(time => {
        const value = document.querySelector('canvas').dataset.fixture;
        return value && JSON.parse(value).time === time;
    }, time);
};
const capture = async id => {
    await page.click('#debug-close');
    await page.waitForTimeout(700);
    const fixture = await state();
    const metrics = JSON.parse(await page.locator('canvas').getAttribute('data-metrics'));
    await sharp(await page.locator('canvas').screenshot()).webp({ quality: 88 }).toFile(output + '/' + id + '.webp');
    shots.push({ id, file: id + '.webp', fixture, metrics });
    await page.locator('#world-dev > summary').click();
    await page.click('#debug-toggle');
};
try {
    await page.goto(origin + '/?worldDev=1&world=reference');
    await ready();
    for (const mode of ['reference', 17, 91]) {
        if (mode !== 'reference') {
            await page.selectOption('#fjordside-quality', 'standard');
            await page.fill('#fjordside-seed', String(mode));
            await Promise.all([page.waitForEvent('framenavigated'), page.click('#fjordside-generate')]);
            await ready();
        }
        await scrub(2.5);
        for (const quality of ['standard', 'low']) {
            const before = await state();
            await page.selectOption('#fjordside-quality', quality);
            await page.waitForTimeout(900);
            const after = await state();
            assert.equal(after.time, before.time, 'Quality does not reset the clock');
            assert.equal(after.world.seed, before.world.seed);
            assert.equal(after.world.water.quality, quality === 'low' ? 'low' : 'medium');
            assert.equal(after.world.water.boat.time, after.world.water.time);
            await page.click('#lighting-day');
            await page.selectOption('#fjordside-camera', 'boat');
            await scrub(0);
            const first = (await state()).world.water.boat;
            await capture(mode + '-' + quality + '-day-boat-t0');
            await scrub(2.5);
            const second = (await state()).world.water.boat;
            assert.notDeepEqual(first.position, second.position, 'Visible boat heave');
            assert.notDeepEqual(first.quaternion, second.quaternion, 'Visible pitch and roll');
            assert.equal(first.position[0], second.position[0]);
            assert.equal(first.position[2], second.position[2]);
            await capture(mode + '-' + quality + '-day-boat-t2');
            await scrub(8.1);
            await capture(mode + '-' + quality + '-day-boat-t8');
            await scrub(2.5);
            assert.deepEqual((await state()).world.water.boat, second, 'Deterministic scrub');
            await page.waitForTimeout(1200);
            assert.deepEqual((await state()).world.water.boat, second, 'Paused boat pose');
            for (const view of ['grazing', 'shore', 'overlook']) {
                await page.selectOption('#fjordside-camera', view);
                await capture(mode + '-' + quality + '-day-' + view);
            }
            await page.click('#lighting-night');
            await page.selectOption('#fjordside-camera', 'boat');
            await capture(mode + '-' + quality + '-night-boat');
        }
        // Resume water and boat on the same clock after the paused review.
        const held = (await state()).world.water;
        await page.click('#fjordside-pause');
        await page.waitForTimeout(1400);
        const resumed = (await state()).world.water;
        assert.ok(resumed.time > held.time && resumed.time < held.time + 2);
        assert.equal(resumed.time, resumed.boat.time);
        await scrub(2.5);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption('#fjordside-camera', 'boat');
    await capture('mobile-portrait');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 844, height: 390 });
    await capture('mobile-landscape');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ shots, errors, viewport: [1400, 900] }, null, 2));
    console.log('PASS: real boat/water in both worlds and tiers; pause, resume, scrub, quality and mobile resize.');
} finally {
    await browser.close();
}
