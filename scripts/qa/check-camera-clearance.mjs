import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-fixpass/camera';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = { browser: 'Edge Chromium', physicalDevice: false, poses: [], checks: [], errors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => results.errors.push(error.message));
    page.setDefaultTimeout(180000);
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/docs/qa/fjord-fixpass/camera-review.html',
        { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#camera-canvas');
    await page.locator('#camera-canvas[data-ready="true"]').waitFor();
    const read = () => page.evaluate(() => window.cameraQA.sample());
    const safe = value => {
        assert.ok(value.eye.every(Number.isFinite));
        assert.ok(value.endpointClearance >= 2 - 1e-7, 'Eye is above canonical terrain/sea.');
        assert.ok(value.independentlySampledBoom >= .35 - 1e-6, 'The independently sampled boom is clear.');
        assert.ok(value.samples <= 512);
        return value;
    };
    for (const [id, name] of [['ridge', 'Intervening ridge'], ['cliff', 'Steep endpoint'], ['coast', 'Coast']]) {
        await page.getByRole('button', { name, exact: true }).click();
        await page.waitForTimeout(100);
        const value = safe(await read());
        results.poses.push({ id, ...value });
        if (id !== 'coast') assert.ok(value.lift > 1, 'The fixture must actually need a correction.');
        await page.getByRole('button', { name: 'Show uncorrected reference', exact: true }).click();
        await page.screenshot({ path: output + '/' + id + '-before.png' });
        await page.getByRole('button', { name: 'Show corrected camera', exact: true }).click();
        await page.screenshot({ path: output + '/' + id + '-after.png' });
    }
    const rect = await canvas.boundingBox(), x = rect.x + rect.width * .5, y = rect.y + rect.height * .5;
    const beforeMouse = await read();
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 12; i++) {
        await page.mouse.move(x + i * 44, y - i * 2);
        await page.waitForTimeout(20);
        safe(await read());
    }
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -1800);
    await page.waitForTimeout(700);
    safe(await read());
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
        await page.mouse.move(x - i * 80, y + i * 8);
        await page.waitForTimeout(20);
        safe(await read());
    }
    await page.mouse.up();
    await page.keyboard.down('w');
    await page.keyboard.down('q');
    await page.waitForTimeout(700);
    await page.keyboard.up('w');
    await page.keyboard.up('q');
    const afterMouse = safe(await read());
    assert.notEqual(afterMouse.requestedYaw, beforeMouse.requestedYaw);
    assert.notEqual(afterMouse.requestedZoom, beforeMouse.requestedZoom);
    results.checks.push('Real desktop right-drag orbit, left-drag pan, wheel zoom and WASD/Q stay terrain-clear.');

    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.getByRole('button', { name: 'Intervening ridge', exact: true }).click();
        const box = await canvas.boundingBox(), cx = box.x + box.width * .5, cy = box.y + box.height * .5;
        const before = await read();
        await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
        await touch('touchMove', [{ x: cx + 100, y: cy - 30, id: 1 }]);
        await touch('touchEnd', []);
        await page.waitForTimeout(500);
        assert.notEqual(safe(await read()).requestedYaw, before.requestedYaw);
        const zoomBefore = (await read()).requestedZoom;
        for (let i = 0; i < 3; i++) {
            await touch('touchStart', [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }]);
            await touch('touchMove', [{ x: cx - 65, y: cy, id: 1 }, { x: cx + 65, y: cy, id: 2 }]);
            await touch('touchMove', [{ x: cx - 38, y: cy, id: 1 }, { x: cx + 38, y: cy, id: 2 }]);
            await touch('touchEnd', []);
            await page.waitForTimeout(200);
            safe(await read());
        }
        assert.notEqual((await read()).requestedZoom, zoomBefore);
        await page.getByRole('button', { name: 'Home', exact: true }).click();
        await page.waitForTimeout(1000);
        results.poses.push({ id: 'touch-home-' + viewport.width, ...safe(await read()) });
        await page.screenshot({ path: output + '/touch-' + viewport.width + '.png' });
    }
    results.checks.push('1024px tablet and 390px phone touch orbit, repeated pinch/spread reversals and Home are safe.');
    await page.selectOption('#seed', '33');
    await page.locator('#camera-canvas[data-ready="true"]').waitFor();
    const replaced = safe(await read());
    assert.equal(replaced.seed, 7);
    results.poses.push({ id: 'replacement-island', ...replaced });
    results.checks.push('Changing from island 18 to island 7 rebinds the canonical terrain and clears old correction state.');
    const timings = await page.evaluate(async () => {
        for (let i = 0; i < 120; i++) await new Promise(requestAnimationFrame);
        return window.cameraQA.timings;
    });
    const values = timings.map(value => value.milliseconds).sort((a, b) => a - b);
    results.performance = { updates: values.length, medianMs: values[Math.floor(values.length / 2)],
        p95Ms: values[Math.floor(values.length * .95)], maxMs: values.at(-1),
        maximumQueries: Math.max(...timings.map(value => value.samples)),
        conservativeUpdates: timings.filter(value => value.conservative).length };
    assert.deepEqual(results.errors, []);
    results.passed = true;
    await writeFile(output + '/results.json', JSON.stringify(results, null, 2));
    console.log('Canonical terrain camera browser checks passed', results.performance);
} finally { await browser.close(); }
