import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5181';
const output = process.env.QA_OUTPUT || 'scratch/environment-fallback-water';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const samples = [];
const errors = [];
try {
    await mkdir(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/environment-lab');
    const canvas = page.locator('#environment-canvas');
    await page.locator('canvas[data-ready=true]').waitFor();
    await openEnvironmentSettings(page);
    await page.locator('#environment-pause').check();
    await page.locator('#environment-quality').selectOption('legacy');
    await page.locator('#environment-camera').selectOption('water');
    // Isolate the visible water so darkened terrain or sky cannot conceal this regression.
    for (const id of ['ground', 'nature', 'village', 'fog']) {
        await page.locator('#environment-' + id).uncheck();
    }
    const capture = async preset => {
        await page.locator('#environment-light').selectOption(preset);
        await page.waitForFunction(preset => {
            const fixture = JSON.parse(document.querySelector('#environment-canvas').dataset.fixture || '{}');
            return fixture.lightSettings?.preset === preset;
        }, preset);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // Element capture scrolls the canvas into view, including with Settings expanded.
        const fullImage = await canvas.screenshot();
        const { width, height } = await sharp(fullImage).metadata();
        const image = await sharp(fullImage).extract({
            left: 0, top: Math.floor(height * .65),
            width, height: Math.floor(height * .3),
        }).png().toBuffer();
        const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let luminance = 0;
        for (let index = 0; index < data.length; index += 3) {
            luminance += .2126 * data[index] + .7152 * data[index + 1] + .0722 * data[index + 2];
        }
        const sample = { preset, luminance: luminance / (data.length / 3),
            fixture: JSON.parse(await canvas.getAttribute('data-fixture')) };
        samples.push(sample);
        await writeFile(output + '/' + preset + '.png', image);
        return { sample, pixels: data };
    };
    const day = await capture('day');
    const night = await capture('night');
    assert.ok(night.sample.luminance < day.sample.luminance * .65,
        `Fallback water must visibly darken at Night: day=${day.sample.luminance}, night=${night.sample.luminance}`);
    for (const preset of ['sun10', 'sun20', 'sun30', 'sun20-front']) {
        const low = await capture(preset);
        assert.ok(low.sample.luminance < day.sample.luminance * .8,
            'Fallback water must follow the reduced low-sun sky fill: ' + preset);
        assert.equal(low.sample.fixture.time, day.sample.fixture.time);
    }
    const returnedDay = await capture('day');
    assert.deepEqual(returnedDay.pixels, day.pixels,
        'Returning to Day restores the same paused water image');
    assert.equal(night.sample.fixture.time, day.sample.fixture.time);
    assert.deepEqual(errors, []);
    console.log('PASS: actual fallback water follows Night/Low sun and returns to the same paused Day image.');
} finally {
    await writeFile(output + '/results.json', JSON.stringify({ origin, samples, errors }, null, 2) + '\n');
    await browser.close();
}
