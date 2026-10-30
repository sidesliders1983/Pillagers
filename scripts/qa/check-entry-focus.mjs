import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = resolve(process.env.QA_OUTPUT || 'scratch/design-style/entry-focus/browser');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5197';
const baseline = process.env.QA_BASELINE === '1';
await mkdir(output + '/temporary', { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = output + '/temporary';
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
const result = { status: 'running', baseline, browser: browser.version(), physicalDevice: false, cases: [], errors: [] };
async function home(page) {
    await page.goto(origin + '/fjord-play', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'New game', exact: true }).waitFor();
    await page.mouse.move(0, 0);
}
async function snapshot(page, name) {
    await page.screenshot({ path: output + '/' + name + '.jpg', quality: 85 });
}
async function actionState(page) {
    return page.evaluate(() => ({
        active: document.activeElement.tagName,
        textSelection: getSelection()?.toString(),
        actions: [...document.querySelectorAll('[data-start-primary] button')].filter(node => node.checkVisibility()).map(node => ({
            name: node.getAttribute('aria-label'), focus: node.matches(':focus-visible'),
            border: getComputedStyle(node).borderColor,
        })),
    }));
}
try {
    for (const [name, width, height, touch] of [['desktop', 1440, 900, false], ['portrait-touch', 390, 844, true]]) {
        const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
        const page = await context.newPage();
        page.on('pageerror', error => result.errors.push(error.message));
        await home(page);
        const initial = await actionState(page);
        await snapshot(page, name + '-home');
        await page.getByRole('button', { name: 'New game', exact: true }).click();
        const title = await page.getByRole('heading', { name: 'New game', exact: true }).evaluate(node => ({
            readingFocus: node === document.activeElement, outline: getComputedStyle(node).outlineStyle,
            outlineWidth: getComputedStyle(node).outlineWidth,
        }));
        await snapshot(page, name + '-new');
        if (!baseline) {
            assert.equal(initial.active, 'BODY');
            assert.equal(initial.textSelection, '');
            assert.ok(initial.actions.every(action => !action.focus));
            assert.ok(initial.actions.every(action => action.border === 'rgb(120, 144, 152)'));
            assert.equal(title.readingFocus, true, 'Screen-reader context is retained');
            assert.equal(title.outline, 'none', 'Noninteractive heading has no selection outline');
        }
        result.cases.push({ name, initial, title });
        await context.close();
    }
    if (!baseline) {
        const page = await browser.newPage();
        page.on('pageerror', error => result.errors.push(error.message));
        await home(page);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'New game');
        assert.equal(await page.getByRole('button', { name: 'New game', exact: true }).evaluate(node => getComputedStyle(node).outlineColor), 'rgb(169, 237, 255)');
        await snapshot(page, 'keyboard-action');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.entry), 'new');
        assert.ok(await page.locator('[data-entry="new"]').evaluate(node => node.matches(':focus-visible')));
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'New game');
        await page.getByRole('button', { name: 'Load game', exact: true }).click();
        await page.locator('input[type="file"]').setInputFiles(resolve('docs/ux/player-menus-298/followup/campaign-before.json'));
        await page.getByRole('button', { name: 'Continue campaign', exact: true }).waitFor();
        await page.mouse.move(0, 0);
        const returning = await actionState(page);
        assert.equal(returning.active, 'BODY');
        assert.ok(returning.actions.every(action => action.border === 'rgb(120, 144, 152)'));
        assert.equal(await page.locator('canvas').count(), 0);
        await snapshot(page, 'returning-neutral');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Continue campaign');
        result.cases.push({ name: 'Keyboard navigation and returning entry', returning, keyboardFocusVisible: true, noWorld: true });
    }
    assert.deepEqual(result.errors, []);
    result.status = 'passed';
} catch (error) { result.status = 'failed'; result.failure = String(error); process.exitCode = 1; }
finally { await writeFile(output + '/result.json', JSON.stringify(result, null, 2) + '\n'); await browser.close(); console.log(JSON.stringify(result)); }
