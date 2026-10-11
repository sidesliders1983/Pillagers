import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Pause', 'Opening the Fjord starts the clock without pressing Start');
    console.log('Default clock is running.');
    await page.selectOption('#fjord-quality', 'low');
    const before = JSON.parse(await canvas.getAttribute('data-motion'));
    await page.waitForFunction(before => JSON.parse(document.querySelector('#fjord-canvas').dataset.motion).some(actor => {
        const previous = before.find(row => row.key === actor.key);
        return previous && Math.hypot(actor.x - previous.x, actor.z - previous.z) > .5;
    }), before, { timeout: 90000 });
    const after = JSON.parse(await canvas.getAttribute('data-motion'));
    await page.locator('#fjord-run').click();
    await page.waitForTimeout(1200);
    const paused = await canvas.getAttribute('data-motion');
    await page.waitForTimeout(1600);
    assert.equal(await canvas.getAttribute('data-motion'), paused, 'Pause freezes ambient motion');
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    console.log('Movement and Pause verified; reloading.');
    const checkpoints = { before, after, paused: JSON.parse(paused) };
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    assert.equal(await page.locator('#fjord-run').innerText(), 'Pause', 'Reopening the Fjord starts active time again');
    await page.locator('#fjord-run').click();
    assert.deepEqual(errors, []);
    await mkdir('docs/qa/living-fjord', { recursive: true });
    await writeFile('docs/qa/living-fjord/auto-start.json', JSON.stringify({ checks: ['Fresh default campaign starts automatically, residents/cattle move, Pause freezes motion, reload starts again.'], ...checkpoints, errors }, null, 2) + '\n');
    console.log('PASS: automatic clock, visible motion, Pause and reload.');
} finally {
    await browser.close();
}
