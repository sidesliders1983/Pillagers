import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5247';
const output = 'docs/qa/family-tree-287';
await mkdir(output, { recursive: true });
await mkdir('scratch/qa-287/raw-video', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];
const errors = [];
let video;
try {
    for (const [mode, viewport, touch] of [
        ['desktop', { width: 1440, height: 900 }, false],
        ['tablet-landscape', { width: 1024, height: 768 }, true],
        ['phone-landscape', { width: 844, height: 390 }, true],
    ]) {
        console.log('Checking ' + mode);
        const context = await browser.newContext({ viewport, hasTouch: touch,
            ...(mode === 'desktop' ? { recordVideo: { dir: 'scratch/qa-287/raw-video', size: viewport } } : {}) });
        const page = await context.newPage();
        page.setDefaultTimeout(120000);
        page.on('pageerror', error => errors.push(mode + ': ' + error.message));
        await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            const counted = new WeakSet();
            window.familyWebGLContexts = 0;
            HTMLCanvasElement.prototype.getContext = function (...args) {
                const result = original.apply(this, args);
                if (result && String(args[0]).startsWith('webgl') && !counted.has(this)) {
                    counted.add(this);
                    window.familyWebGLContexts++;
                }
                return result;
            };
        });
        await page.goto(origin + '/scripts/qa/family-tree-287.html?portraits');
        await page.locator('.family-generation').first().waitFor();
        await page.waitForFunction(() => document.querySelectorAll('.family-card-avatar img').length > 0);
        const before = await page.evaluate(() => window.familyQA.owner.session.saveJSON());
        assert.equal(await page.locator('[data-family-node]').count(), 57);
        assert.equal(await page.locator('.family-generation').count(), 3);
        assert.equal(await page.locator('[data-founder="true"][data-generation="0"]').count(), 10);
        assert.equal(await page.locator('[data-status="Deceased"]').count(), 4);
        assert.equal(await page.locator('.family-generation[data-newest]').getAttribute('data-generation'), '2');
        const typography = await page.locator('[data-family-node] strong').first().evaluate(element =>
            Number.parseFloat(getComputedStyle(element).fontSize));
        assert.ok(typography >= 14);
        const close = await page.locator('#clan-book-close').boundingBox();
        assert.ok(close.x >= 0 && close.y >= 0 && close.x + close.width <= viewport.width &&
            close.y + close.height <= viewport.height, 'Close stays inside simulated safe viewport');
        const contextCount = await page.evaluate(() => window.familyWebGLContexts);
        assert.equal(contextCount, 1, 'The complete tree borrows one production studio, never one context per card');
        await page.screenshot({ path: output + '/after-' + mode + '.png' });

        await page.locator('[data-family-node="founder-1"]').click();
        const profile = page.locator('.family-profile');
        if (await profile.getAttribute('open') === null) await profile.locator(':scope > summary').click();
        const childLink = profile.locator('[data-family-person]').first();
        const child = await childLink.getAttribute('data-family-person');
        await childLink.click();
        assert.equal(await page.locator('[data-family-node="' + child + '"]').getAttribute('aria-pressed'), 'true');
        const relations = await page.locator('#family-person-details').textContent();
        assert.match(relations, /Child of/);
        assert.ok(await page.locator('[data-personal-history]').count());
        await page.screenshot({ path: output + '/selected-' + mode + '.png' });
        // Collapse the optional details so a narrow landscape viewport keeps its diagram.
        if (await profile.getAttribute('open') !== null) await profile.locator(':scope > summary').click();
        const diagram = page.locator('.family-tree-diagram');
        await diagram.evaluate(element => { element.scrollLeft = 100; element.scrollTop = 160; });
        const scroll = await diagram.evaluate(element => [element.scrollLeft, element.scrollTop]);
        await page.evaluate(() => window.familyQA.reader.update());
        assert.deepEqual(await diagram.evaluate(element => [element.scrollLeft, element.scrollTop]), scroll);
        await page.locator('#clan-book-family-tab').focus();
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowRight');
        assert.deepEqual(await diagram.evaluate(element => [element.scrollLeft, element.scrollTop]), scroll);
        assert.equal(await page.locator('[data-family-node="' + child + '"]').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => window.familyQA.owner.session.saveJSON()), before);

        await page.locator('[data-family-reset]').click();
        const bounds = await diagram.boundingBox();
        if (touch) {
            const client = await context.newCDPSession(page);
            const x = bounds.x + bounds.width - 30, y = bounds.y + Math.min(100, bounds.height - 20);
            await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            for (let step = 1; step <= 8; step++) {
                await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 22, y }] });
                await page.waitForTimeout(20);
            }
            await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.waitForTimeout(250);
            assert.ok(await diagram.evaluate(element => element.scrollLeft) > 20, 'Native horizontal touch pan works');
            await client.detach();
        } else {
            const x = bounds.x + 305, y = bounds.y + 110;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, y - 90, { steps: 8 });
            await page.mouse.up();
            assert.ok(await diagram.evaluate(element => element.scrollTop) >= 80, 'Blank-space mouse dragging pans the diagram');
        }
        await page.locator('[data-family-newest]').click();
        assert.ok(await diagram.evaluate(element =>
            Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth))) < 2);
        const images = await page.locator('.family-card-avatar img').count();
        assert.ok(images <= 24);
        if (mode === 'desktop') {
            await page.locator('[data-family-reset]').click();
            // A short, explicit QA-only pan. No autoplay is added to the game.
            await page.waitForTimeout(500);
            await diagram.evaluate(element => new Promise(resolve => {
                const started = performance.now();
                const frame = now => {
                    const progress = Math.min(1, (now - started) / 3500);
                    element.scrollTop = 180 * (progress * progress * (3 - 2 * progress));
                    if (progress < 1) requestAnimationFrame(frame);
                    else resolve();
                };
                requestAnimationFrame(frame);
            }));
            await page.waitForTimeout(500);
            video = page.video();
        }
        checks.push({ mode, viewport, simulatedTouch: touch, records: 57, generations: 3,
            webglContexts: contextCount, visibleImages: images, nameFontPx: typography,
            checks: ['true founders at left', 'deceased retained', 'newest header', 'shared portraits',
                'relationship navigation', 'selection and scroll retained', 'keyboard tabs',
                touch ? 'native simulated touch pan' : 'mouse drag pan', 'reset/newest', 'reachable Close', 'Core unchanged'] });
        await context.close();
        if (mode === 'desktop') video = await video.path();
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/browser.json', JSON.stringify({ passed: true, browser: browser.version(),
        scope: 'Actual ClanBookReader, FjordInterface cache and ResidentPortraitStudio. UI-only QA harness with a real Core recording fixture. Viewports/touch are simulated; not physical iPhone/tablet or a full-world GPU benchmark.',
        checks, errors, rawVideo: video }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks, rawVideo: video }));
} finally {
    await browser.close();
}
