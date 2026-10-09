import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'scratch/water-buoyancy';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const report = { errors, observations: [], performanceMeasured: false };
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5192') + '/water-lab');
    await page.locator('#water-canvas[data-ready=true]').waitFor();
    const stateAt = async time => page.evaluate(value => {
        window.__waterLab.setTime(value);
        return window.__waterLab.getStats();
    }, time);
    const start = await stateAt(0);
    assert.equal(start.floatingSample.visible, true);
    assert.equal(start.render.calls, 2);
    assert.equal(start.render.triangles, start.triangles + start.floatingSample.triangles);
    await page.screenshot({ path: output + '/sample-time-0.png' });
    const moved = await stateAt(1.5);
    assert.notDeepEqual(moved.floatingSample.position, start.floatingSample.position);
    assert.notDeepEqual(moved.floatingSample.quaternion, start.floatingSample.quaternion);
    await page.screenshot({ path: output + '/sample-time-1-5.png' });
    await page.waitForTimeout(250);
    assert.deepEqual((await page.evaluate(() => window.__waterLab.getStats())).floatingSample,
        moved.floatingSample, 'Pause must freeze the object and the water together.');
    for (const quality of ['low', 'medium', 'high']) {
        await page.selectOption('#water-quality', quality);
        const result = await stateAt(2.1);
        assert.ok(result.floatingSample.position.every(Number.isFinite));
        assert.ok(result.floatingSample.quaternion.every(Number.isFinite));
        assert.equal(result.render.calls, 2);
        report.observations.push(result);
    }
    await page.locator('#water-height').fill('0');
    const flat = await stateAt(3);
    assert.ok(Math.abs(flat.floatingSample.position[1] - 0.085) < 1e-8);
    assert.ok(flat.floatingSample.quaternion.slice(0, 3).every(value => Math.abs(value) < 1e-8));
    await page.locator('#water-height').fill('2');
    await stateAt(1.5);
    await page.screenshot({ path: output + '/sample-wave-height-2.png' });
    await page.locator('#water-float').uncheck();
    const hidden = await stateAt(1.5);
    assert.equal(hidden.render.calls, 1, 'Water-only mode must keep its original draw budget.');
    assert.equal(hidden.render.triangles, hidden.triangles);
    await page.locator('#water-float').check();
    await page.locator('#water-pause').click();
    const beforePlay = await page.evaluate(() => window.__waterLab.getStats());
    await page.waitForTimeout(300);
    const afterPlay = await page.evaluate(() => window.__waterLab.getStats());
    assert.notDeepEqual(beforePlay.floatingSample.position, afterPlay.floatingSample.position);
    await page.close();

    const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5192') + '/water-lab');
    await mobile.locator('#water-canvas[data-ready=true]').waitFor();
    assert.equal(await mobile.locator('.water-panel').evaluate(panel => panel.open), false);
    await mobile.evaluate(() => window.__waterLab.setTime(1.5));
    await mobile.screenshot({ path: output + '/sample-mobile.png' });
    await mobile.locator('.water-panel summary').click();
    await mobile.locator('#water-float').uncheck();
    assert.equal((await mobile.evaluate(() => window.__waterLab.getStats())).floatingSample.visible, false);
    await mobile.locator('#water-float').check();
    assert.deepEqual(errors, []);
    report.passed = true;
    console.log('PASS: heave and tilt, time scrub/pause, flat-water draft, all tiers, toggle and mobile controls.');
} catch (error) {
    report.passed = false;
    report.failure = String(error.stack || error);
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
    await browser.close();
}