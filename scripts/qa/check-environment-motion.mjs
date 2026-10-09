import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'scratch/environment-motion';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const difference = async (a, b) => {
    const first = await sharp(a).removeAlpha().raw().toBuffer();
    const second = await sharp(b).removeAlpha().raw().toBuffer();
    let changed = 0, total = 0;
    for (let i = 0; i < first.length; i++) {
        const delta = Math.abs(first[i] - second[i]);
        if (delta > 3) changed++;
        total += delta;
    }
    return { changedChannelsAbove3: changed, meanChannelDelta: total / first.length };
};
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    await page.locator('#environment-village').uncheck();
    await page.locator('#environment-fog').uncheck();
    await page.locator('#environment-water').uncheck();
    await page.selectOption('#environment-camera', 'forest');
    await page.waitForTimeout(1500);
    const capturePair = async label => {
        const first = await canvas.screenshot();
        await page.waitForTimeout(2000);
        const second = await canvas.screenshot();
        await writeFile(output + '/' + label + '-t0.png', first);
        await writeFile(output + '/' + label + '-t2.png', second);
        return difference(first, second);
    };
    const movingTrees = await capturePair('trees-moving');
    assert.ok(movingTrees.changedChannelsAbove3 > 0,
        'The approved EZ-Tree crowns must visibly move while waves and wind are running');
    await page.locator('#environment-pause').check();
    await page.waitForTimeout(1000);
    const pausedTrees = await capturePair('trees-paused');
    assert.equal(pausedTrees.changedChannelsAbove3, 0, 'Pause freezes the visible tree effect');
    await page.locator('#environment-nature').uncheck();
    await page.locator('#environment-water').check();
    await page.selectOption('#environment-camera', 'water');
    await page.locator('#environment-pause').uncheck();
    await page.waitForTimeout(1500);
    const movingWater = await capturePair('water-moving');
    // Same isolated view measured 0.156 with the previously restrained controls.
    assert.ok(movingWater.meanChannelDelta > 0.4,
        'Water motion must be readable beyond the previously measured barely visible ripples');
    await page.locator('#environment-pause').check();
    await page.waitForTimeout(1000);
    const pausedWater = await capturePair('water-paused');
    assert.equal(pausedWater.changedChannelsAbove3, 0, 'Pause freezes the visible water effect');
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ movingTrees, pausedTrees, movingWater, pausedWater, errors }, null, 2));
    console.log('PASS: visible upstream pine wind and pause at the browser boundary.');
} finally {
    await browser.close();
}
