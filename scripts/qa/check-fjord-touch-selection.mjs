import { selectFjordQuality, toggleFjordCampaign } from './fjord-header-controls.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { core, createCrowdScenario, pausedCheckpoint } from './fjord-stability-scenario.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-touch-selection';
const state = createCrowdScenario(10);
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const observations = [], errors = [];
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
    await page.waitForTimeout(650);
    const screenTargets = () => canvas.evaluate(canvas => {
        const camera = JSON.parse(canvas.dataset.camera), w = camera.world, m = camera.projection;
        const rect = canvas.getBoundingClientRect();
        const point = position => {
            const v = [position[0] - w[12], position[1] - w[13], position[2] - w[14]];
            const local = [w[0] * v[0] + w[1] * v[1] + w[2] * v[2],
                w[4] * v[0] + w[5] * v[1] + w[6] * v[2],
                w[8] * v[0] + w[9] * v[1] + w[10] * v[2], 1];
            const p = [0, 1, 2, 3].map(row => m[row] * local[0] + m[row + 4] * local[1] +
                m[row + 8] * local[2] + m[row + 12]);
            return { x: rect.left + (p[0] / p[3] + 1) * rect.width / 2,
                y: rect.top + (1 - p[1] / p[3]) * rect.height / 2 };
        };
        return JSON.parse(canvas.dataset.rendered).filter(e => e.kind === 'persona' || e.kind === 'cattle').map(e => {
            const b = e.bounds, center = b.min.map((v, i) => (v + b.max[i]) / 2);
            return { key: e.key, kind: e.kind, ...point(center) };
        });
    });
    const targets = await screenTargets();
    // Choose a genuine near miss, clear of another resident or animal.
    const aside = await page.locator('.fjord-stage aside').boundingBox();
    const probes = targets.filter(target => target.kind === 'persona').flatMap(target => [-18, 18].map(dx => ({ ...target, dx,
        tapX: target.x + dx, tapY: target.y }))).filter(probe =>
            probe.tapX < aside.x - 24 && targets.every(other => other.key === probe.key ||
                Math.hypot(probe.tapX - other.x, probe.tapY - other.y) > 23));
    assert.ok(probes.length >= 2, 'The visible seeded scene provides isolated finger-sized targets');
    for (const probe of probes.slice(0, 3)) {
        await page.touchscreen.tap(probe.tapX, probe.tapY);
        await page.waitForTimeout(100);
        const actual = await canvas.getAttribute('data-selected');
        observations.push({ ...probe, actual });
        await writeFile(output + '/observations.json', JSON.stringify(observations, null, 2));
        assert.equal(actual, probe.key,
            'A tap 18 CSS pixels beside a small resident must select it rather than navigate');
        assert.equal(await page.locator('#fjord-selection-labels .selected').count(), 1);
    }
    const beforeMotion = JSON.parse(await canvas.getAttribute('data-motion'));
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.motion)
        .some(actor => actor.kind === 'persona' && actor.state === 'Walk'));
    const walking = JSON.parse(await canvas.getAttribute('data-motion'))
        .filter(actor => actor.kind === 'persona' && actor.state === 'Walk').map(actor => actor.key);
    const liveTargets = await screenTargets();
    const liveProbe = liveTargets.filter(target => walking.includes(target.key)).flatMap(target =>
        [-16, 16].map(dx => ({ ...target, tapX: target.x + dx, tapY: target.y }))).find(probe =>
            probe.tapX < aside.x - 24 && liveTargets.every(other => other.key === probe.key ||
                Math.hypot(probe.tapX - other.x, probe.tapY - other.y) > 23));
    assert.ok(liveProbe);
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { id: 1, x: liveProbe.tapX, y: liveProbe.tapY, radiusX: 16, radiusY: 16 }] });
    await page.waitForTimeout(250);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
        { id: 1, x: liveProbe.tapX + 3, y: liveProbe.tapY + 2, radiusX: 16, radiusY: 16 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await canvas.getAttribute('data-selected'), liveProbe.key,
        'A normal held finger tap with small drift selects while the clock continues');
    await page.waitForTimeout(650);
    const afterMotion = JSON.parse(await canvas.getAttribute('data-motion'));
    assert.ok(afterMotion.some(actor => {
        const old = beforeMotion.find(candidate => candidate.key === actor.key);
        return old && Math.hypot(actor.x - old.x, actor.z - old.z) > .3;
    }));
    const selected = await canvas.getAttribute('data-selected');
    const rect = await canvas.boundingBox();
    const cameraBefore = await canvas.getAttribute('data-camera');
    const x = rect.x + 150, y = rect.y + rect.height - 100;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + 70, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(650);
    assert.equal(await canvas.getAttribute('data-selected'), selected, 'Drag rotates without reselecting');
    assert.notEqual(await canvas.getAttribute('data-camera'), cameraBefore);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
        { id: 1, x, y }, { id: 2, x: x + 80, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [
        { id: 1, x: x - 30, y }, { id: 2, x: x + 110, y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(650);
    assert.equal(await canvas.getAttribute('data-selected'), selected, 'Pinch/spread never turns into selection');
    await page.locator('#fjord-run').click();
    await toggleFjordCampaign(page);
    const [download] = await Promise.all([page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export canonical JSON', exact: true }).click()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    await download.delete();
    assert.equal(saved.time.winter, state.time.winter);
    assert.deepEqual(saved, JSON.parse(core.serializeState(core.applyCommand(state,
        { type: 'AdvanceTicks', ticks: saved.time.tick }))));
    await toggleFjordCampaign(page);
    observations.push({ liveProbe, heldTouchMs: 250, touchDrift: [3, 2], moving: true,
        dragPreservesSelection: true, pinchPreservesSelection: true, coreEqualToReplay: true });
    assert.deepEqual(errors, []);
    await page.screenshot({ path: output + '/touch-selection.png' });
    await writeFile(output + '/result.json', JSON.stringify({ observations, errors, coreEqualToReplay: true }, null, 2));
    console.log('Finger-sized near taps select real canonical residents.');
} finally { await browser.close(); }
