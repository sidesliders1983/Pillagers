import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = process.env.QA_OUTPUT || 'docs/qa/interactive-fjord-controls';
const mode = process.env.QA_CASE || 'all';
const browser = await chromium.launch({ headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [], errors = [];
assert.ok(['all', 'navigation', 'rotation', 'touch', 'housing'].includes(mode), 'Unknown QA case.');
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    const state = core.createCampaign(32, { initialMaterials: ['all', 'housing'].includes(mode) ? 5 : 100, foundingCoupleChanceBps: 0 }, {}, { enabled: false });
    await page.addInitScript(json => {
        const key = 'pillagers.fjord-play.active.v1';
        if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, json);
    }, core.serializeState(state));
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    page.setDefaultTimeout(120000);
    const pose = async () => JSON.parse(await canvas.getAttribute('data-camera')).world;
    const moved = (a, b) => Math.hypot(...[12, 13, 14].map(i => a[i] - b[i]));
    const orientationChange = (a, b) => Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(i => Math.abs(a[i] - b[i])));
    const rect = await canvas.boundingBox();
    const x = rect.x + 125, y = rect.y + rect.height * .7;
    if (mode === 'all' || mode === 'navigation') {
        const before = await pose();
        await page.mouse.click(x, y);
        await page.waitForTimeout(1000);
        assert.ok(moved(before, await pose()) > 1, 'Clicking empty ground must navigate the camera.');
        assert.equal(await canvas.getAttribute('data-selected'), '');
        checks.push('Single mouse click on empty ground navigates and deselects.');
    }
    if (mode === 'all' || mode === 'rotation') {
        const before = await pose();
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 90, y - 25, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(700);
        assert.ok(orientationChange(before, await pose()) > .05, 'A left-button drag must rotate, not pan.');
        checks.push('Mouse drag rotates without selecting.');
    }
    if (mode === 'all' || mode === 'touch') {
        const cdp = await context.newCDPSession(page);
        const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
        const beforeTap = await pose();
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(1000);
        assert.ok(moved(beforeTap, await pose()) > 1, 'A tap on empty ground must navigate.');
        const beforeDrag = await pose();
        await touch('touchStart', [{ x, y, id: 1 }]);
        await touch('touchMove', [{ x: x + 80, y: y - 20, id: 1 }]);
        await touch('touchEnd', []);
        await page.waitForTimeout(700);
        assert.ok(orientationChange(beforeDrag, await pose()) > .05, 'A single-finger drag must rotate.');
        const beforeSpread = await pose();
        await touch('touchStart', [{ x, y, id: 1 }, { x: x + 80, y, id: 2 }]);
        await touch('touchMove', [{ x: x - 40, y, id: 1 }, { x: x + 120, y, id: 2 }]);
        await touch('touchEnd', []);
        await page.waitForTimeout(700);
        const afterSpread = await pose();
        const outwardTravel = (a, b) => [12, 13, 14].reduce((sum, index, axis) => sum + (b[index] - a[index]) * a[8 + axis], 0);
        assert.ok(outwardTravel(beforeSpread, afterSpread) < -1, 'Spreading two fingers must zoom in.');
        await touch('touchStart', [{ x: x - 40, y, id: 1 }, { x: x + 120, y, id: 2 }]);
        await touch('touchMove', [{ x, y, id: 1 }, { x: x + 80, y, id: 2 }]);
        await touch('touchEnd', []);
        await page.waitForTimeout(700);
        assert.ok(outwardTravel(afterSpread, await pose()) > 1, 'Pinching two fingers must zoom out.');
        assert.equal(await canvas.getAttribute('data-selected'), '');
        checks.push('Touch tap navigates, one-finger drag rotates, spreading zooms in and pinching zooms out.');
    }
    if (mode === 'all' || mode === 'housing') {
        await page.getByText('Settlement identities', { exact: true }).click();
        await page.locator('#fjord-identities button[data-kind="household"][data-id="founder-1"]').click();
        await page.getByText('Settlement identities', { exact: true }).click();
        const build = page.getByRole('button', { name: 'Build house (10 Materials)', exact: true });
        assert.equal(await build.isDisabled(), true,
            'An unaffordable Build house command must be disabled instead of succeeding without building.');
        assert.match(await page.locator('#entity-panel').innerText(), /Insufficient Materials/);
        console.log('Unaffordable house is disabled with its reason.');
        let expected = core.createCampaign(32, { initialMaterials: 100, foundingCoupleChanceBps: 0 }, {}, { enabled: false });
        await page.locator('summary').filter({ hasText: /^Campaign$/ }).click();
        await page.locator('#fjord-import').setInputFiles({ name: 'buildable.json', mimeType: 'application/json',
            buffer: Buffer.from(core.serializeState(expected)) });
        await page.locator('#fjord-notice').filter({ hasText: 'Campaign imported, paused.' }).waitFor();
        await page.locator('summary').filter({ hasText: /^Campaign$/ }).click();
        await page.getByText('Settlement identities', { exact: true }).click();
        await page.locator('#fjord-identities button[data-kind="household"][data-id="founder-1"]').click();
        await page.getByText('Settlement identities', { exact: true }).click();
        await build.click();
        await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
            .some(entity => entity.key === 'building:house-1'));
        console.log('Affordable house is visible in 3D.');
        expected = core.applyCommand(expected, { type: 'BuildHouse', householdId: 'founder-1' });
        await page.locator('summary').filter({ hasText: /^Campaign$/ }).click();
        const [download] = await Promise.all([page.waitForEvent('download'),
            page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
        try {
            assert.deepEqual(JSON.parse(await readFile(await download.path(), 'utf8')), JSON.parse(core.serializeState(expected)));
        } finally { await download.delete(); }
        await Promise.all([
            page.waitForURL('**/play', { waitUntil: 'domcontentloaded' }),
            page.getByRole('link', { name: '2D Settlement', exact: true }).click({ noWaitAfter: true })
        ]);
        console.log('Switched to 2D.');
        await page.selectOption('#entity-picker', 'household:founder-2');
        await page.getByRole('button', { name: 'Build house (10 Materials)', exact: true }).click();
        expected = core.applyCommand(expected, { type: 'BuildHouse', householdId: 'founder-2' });
        await page.locator('#board-building-house-2').waitFor();
        await page.getByText('Settings', { exact: true }).click();
        await page.getByRole('button', { name: 'Save locally', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pillagers.gameplay-lab.v1'))),
            JSON.parse(core.serializeState(expected)));
        checks.push('Unaffordable construction is disabled with the Core reason; affordable construction builds in both views and debits the exact Materials.');
    }
    assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await writeFile(output + '/' + mode + '.json', JSON.stringify({ checks, browserErrors: errors }, null, 2));
    console.log(checks.join('\n'));
} finally {
    await browser.close();
}
