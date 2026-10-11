import { selectFjordQuality, toggleFjordCampaign } from './fjord-header-controls.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { core, createCrowdScenario, pausedCheckpoint } from './fjord-stability-scenario.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/fjord-mooring-sidebar';
const state = createCrowdScenario(10);
const errors = [];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
await mkdir(output, { recursive: true });
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
        pausedCheckpoint(state));
    await page.goto(process.env.QA_ORIGIN || 'http://127.0.0.1:5180/fjord-play');
    await selectFjordQuality(page, 'low');
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    await canvas.waitFor();
    const collapse = page.getByRole('button', { name: 'Collapse management panel', exact: true });
    assert.equal(await collapse.count(), 1, 'The empty selection exposes an accessible collapse button');
    assert.equal((await collapse.textContent()).trim(), '▲');
    const initialCorner = await collapse.boundingBox();
    const viewport = await canvas.boundingBox();
    const panel = page.locator('#fjord-management');
    await collapse.tap();
    assert.equal(await panel.isVisible(), false);
    const expand = page.getByRole('button', { name: 'Expand management panel', exact: true });
    assert.equal((await expand.textContent()).trim(), '▼');
    assert.equal(await expand.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(await expand.boundingBox(), initialCorner, 'The small menu button keeps its upper-right corner');
    assert.deepEqual(await canvas.boundingBox(), viewport, 'Collapse preserves the camera viewport');
    await page.screenshot({ path: output + '/collapsed.png' });
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => Number(document.querySelector('#fjord-canvas').dataset.motionTime) > .2);
    assert.equal(await panel.isVisible(), false, 'Clock refreshes preserve the collapsed menu');
    await page.locator('#fjord-run').click();
    const cameraBefore = await canvas.getAttribute('data-camera');
    const client = await context.newCDPSession(page);
    const dragX = viewport.x + viewport.width - 100, dragY = viewport.y + viewport.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: dragX, y: dragY }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: dragX - 70, y: dragY }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(650);
    assert.notEqual(await canvas.getAttribute('data-camera'), cameraBefore,
        'The scene accepts a touch drag in the area previously covered by management');
    assert.equal(await panel.isVisible(), false);
    await expand.tap();
    assert.equal(await panel.isVisible(), true);
    assert.equal(await page.locator('#fjord-management-toggle').getAttribute('aria-expanded'), 'true');
    await collapse.tap();
    const target = await canvas.evaluate(canvas => {
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world, m = camera.projection;
        const rect = canvas.getBoundingClientRect();
        return JSON.parse(canvas.dataset.rendered).filter(e => e.kind === 'persona').map(e => {
            const center = e.bounds.min.map((v, i) => (v + e.bounds.max[i]) / 2);
            const v = center.map((value, i) => value - w[12 + i]);
            const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2],
                w[4] * v[0] + w[5] * v[1] + w[6] * v[2],
                w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
            const p = [0, 1, 2, 3].map(row => m[row] * local[0] + m[row + 4] * local[1] +
                m[row + 8] * local[2] + m[row + 12]);
            return { key: e.key, x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
                y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
        }).find(p => p.x > rect.left + 50 && p.x < rect.right - 340 &&
            p.y > rect.top + 50 && p.y < rect.bottom - 50);
    });
    assert.ok(target, 'A real visible resident is available for touch selection');
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForFunction(key => document.querySelector('#fjord-canvas').dataset.selected === key, target.key);
    assert.equal(await panel.isVisible(), true, 'Selecting a resident automatically reopens management');
    assert.equal(await collapse.getAttribute('aria-expanded'), 'true');
    await collapse.tap();
    await page.touchscreen.tap(target.x, target.y);
    assert.equal(await panel.isVisible(), true, 'Tapping the current selection also reopens management');
    await page.screenshot({ path: output + '/selection-reopens.png' });
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await collapse.tap();
    await toggleFjordCampaign(page);
    const [download] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    assert.deepEqual(saved, JSON.parse(core.serializeState(core.applyCommand(state,
        { type: 'AdvanceTicks', ticks: saved.time.tick }))));
    const [fjordDownload] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export Fjord campaign', exact: true }).click()]);
    const envelope = JSON.parse(await readFile(await fjordDownload.path(), 'utf8'));
    await fjordDownload.delete();
    await toggleFjordCampaign(page);
    const ship = JSON.parse(await canvas.getAttribute('data-entities')).find(e => e.kind === 'longship');
    const anchor = envelope.layout.mooring;
    assert.equal(ship.transform.rotation, anchor.rotation, 'Both sourced hulls and the pier run along local Z');
    const lateralClearance = (ship.transform.x - anchor.x) * Math.cos(anchor.rotation) -
        (ship.transform.z - anchor.z) * Math.sin(anchor.rotation) - 2 - 3.48 / 2;
    assert.ok(lateralClearance >= .75, 'The actual 4m pier and 3.48m hull retain at least .75m clearance');
    const waterTarget = await canvas.evaluate((canvas, ship) => {
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world, m = camera.projection;
        const rect = canvas.getBoundingClientRect();
        const world = [ship.x + Math.cos(ship.rotation) * 5, 0,
            ship.z - Math.sin(ship.rotation) * 5];
        const v = world.map((value, i) => value - w[12 + i]);
        const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2],
            w[4] * v[0] + w[5] * v[1] + w[6] * v[2],
            w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
        const p = [0, 1, 2, 3].map(row => m[row] * local[0] + m[row + 4] * local[1] +
            m[row + 8] * local[2] + m[row + 12]);
        return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
            y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
    }, ship.transform);
    await page.mouse.click(waterTarget.x, waterTarget.y);
    await page.mouse.wheel(0, -3000);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: output + '/mooring.png' });
    assert.deepEqual(errors, []);
    await writeFile(output + '/result.json', JSON.stringify({ viewport, initialCorner, target,
        ship: ship.transform, sourceAnchor: anchor, lateralClearance, touchDragUnobstructed: true,
        clockPreservesCollapse: true, touchSelectionReopens: true, reselectionReopens: true,
        coreEqualToReplay: true, errors }, null, 2));
    console.log('Sidebar collapse, touch selection, clock refresh and Core replay passed.');
} finally {
    await browser.close();
}
