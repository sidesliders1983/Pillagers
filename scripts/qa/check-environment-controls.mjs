import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5181';
const output = process.env.QA_OUTPUT || 'scratch/environment-controls';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const observations = [];
try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        page.setDefaultTimeout(120000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/environment-lab');
        await page.locator('body.environment-lab').waitFor();
        const settings = page.getByText('Settings', { exact: true });
        assert.equal(await settings.count(), 1, 'Advanced settings can be collapsed');
        await page.locator('canvas[data-ready=true]').waitFor();
        assert.equal(await page.locator('#world-seed').isVisible(), false,
            'Advanced controls start collapsed');
        for (const id of ['camera', 'light', 'quality', 'pause']) {
            assert.equal(await page.locator('#environment-' + id).isVisible(), true);
        }
        const box = await page.locator('canvas').boundingBox();
        const visibleHeight = Math.max(0, Math.min(viewport.height, box.y + box.height) - box.y);
        assert.ok(visibleHeight >= viewport.height * .5,
            'At least half the initial viewport shows the environment');
        await page.screenshot({ path: output + '/' + viewport.width + '-collapsed.png' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Controls do not create horizontal page overflow');
        await page.locator('#environment-pause').check();
        await page.locator('canvas').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => document.querySelector('canvas').dataset.fixture);
        const cameraBefore = JSON.parse(await page.locator('canvas').getAttribute('data-fixture')).camera;
        const scrollBeforeZoom = await page.evaluate(() => scrollY);
        const zoomBox = await page.locator('canvas').boundingBox();
        await page.mouse.move(zoomBox.x + zoomBox.width / 2,
            Math.min(viewport.height - 20, zoomBox.y + zoomBox.height / 2));
        await page.mouse.wheel(0, -240);
        await page.waitForFunction(before => {
            const current = JSON.parse(document.querySelector('canvas').dataset.fixture).camera;
            return JSON.stringify(current.position) !== JSON.stringify(before.position);
        }, cameraBefore);
        assert.equal(await page.evaluate(() => scrollY), scrollBeforeZoom,
            'Orbit zoom consumes wheel input without scrolling the page');

        await settings.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#world-seed').isVisible(), true);
        await page.fill('#world-seed', '91');
        await settings.click();
        assert.equal(await page.locator('#world-seed').isVisible(), false);
        await settings.click();
        assert.equal(await page.locator('#world-seed').inputValue(), '91');
        await settings.scrollIntoViewIfNeeded();
        await page.mouse.move(5, 5);
        await page.mouse.wheel(0, 600);
        await page.waitForTimeout(500);
        assert.ok(await page.evaluate(() => scrollY) > 0,
            'The page scrolls outside the orbit canvas when controls are expanded');
        await page.screenshot({ path: output + '/' + viewport.width + '-expanded.png' });
        assert.deepEqual(errors, []);
        observations.push({ viewport, visibleHeight, canvas: box, keyboardToggle: true,
            selectionPreserved: true, pageScroll: true, canvasZoom: true, horizontalOverflow: false, errors });
        await page.close();
    }
    await writeFile(output + '/results.json', JSON.stringify(observations, null, 2) + '\n');
    console.log('PASS: compact initial preview, keyboard collapse/expand, preserved settings, canvas zoom and page scroll at laptop/mobile sizes.');
} finally {
    await browser.close();
}
