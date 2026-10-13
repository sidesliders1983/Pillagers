import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/qa/fjord-island';
const checkpoint = JSON.parse(await readFile('scratch/fjord-island-touch.json', 'utf8'));
checkpoint.target = 'fjord';
checkpoint.pace.running = false;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.setDefaultTimeout(20000);
page.on('pageerror', error => errors.push(error.message));
try {
    await page.addInitScript(value => sessionStorage.setItem('pillagers.fjord-play.active.v1', value), JSON.stringify(checkpoint));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/fjord-play', { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#fjord-canvas');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').tap();
    const rendered = JSON.parse(await canvas.getAttribute('data-rendered'));
    assert.equal(rendered.filter(e => e.kind === 'building').length, 10);
    assert.ok(rendered.every(e => !e.placeholder), 'Real source assets must load.');
    await page.getByRole('button', { name: 'Collapse management panel', exact: true }).tap();
    const rect = await canvas.boundingBox();
    const pose = async () => JSON.parse(await canvas.getAttribute('data-camera')).world;
    const before = await pose();
    const cdp = await context.newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    const x = rect.x + rect.width * .5, y = rect.y + rect.height * .65;
    await touch('touchStart', [{ x, y, id: 1 }]);
    await touch('touchMove', [{ x: x + 70, y: y - 10, id: 1 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(800);
    const rotated = await pose();
    assert.ok(Math.max(...[0, 1, 2, 4, 5, 6, 8, 9, 10].map(i => Math.abs(before[i] - rotated[i]))) > .05);
    const outward = (a, b) => [12, 13, 14].reduce((sum, index, axis) => sum + (b[index] - a[index]) * a[8 + axis], 0);
    await touch('touchStart', [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }]);
    await touch('touchMove', [{ x: x - 80, y, id: 1 }, { x: x + 80, y, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(800);
    const closer = await pose();
    assert.ok(outward(rotated, closer) < -1, 'Spread zooms in.');
    await touch('touchStart', [{ x: x - 80, y, id: 1 }, { x: x + 80, y, id: 2 }]);
    await touch('touchMove', [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(800);
    assert.ok(outward(closer, await pose()) > 1, 'Pinch zooms out.');
    assert.equal(await canvas.getAttribute('data-selected'), '');
    const camera = JSON.parse(await canvas.getAttribute('data-camera'));
    const view = new Matrix4().fromArray(camera.world).invert();
    const projection = new Matrix4().fromArray(camera.projection);
    const residents = rendered.filter(e => e.kind === 'persona').map(e => {
        const center = e.bounds.min.map((v, i) => (v + e.bounds.max[i]) / 2);
        const p = new Vector3(...center).applyMatrix4(view).applyMatrix4(projection);
        return { key: e.key, x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
    }).filter(p => p.x > rect.x + 50 && p.x < rect.x + rect.width - 340 && p.y > rect.y + 50 && p.y < rect.y + rect.height - 50);
    assert.ok(residents.length, 'A visible resident is available for actual touch picking.');
    const target = residents[0];
    await page.touchscreen.tap(target.x, target.y);
    await page.waitForFunction(key => document.querySelector('#fjord-canvas').dataset.selected === key, target.key);
    assert.equal(await page.locator('#fjord-management').isVisible(), true);
    await page.screenshot({ path: output + '/tablet.jpg', type: 'jpeg', quality: 86 });
    await page.locator('#fjord-menu > summary').tap();
    await page.locator('#fjord-campaign > summary').tap();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export').tap()]);
    const saved = JSON.parse(await readFile(await download.path(), 'utf8'));
    assert.deepEqual(saved.campaign, checkpoint.fjord.campaign, 'Presentation gestures do not change canonical state.');
    assert.deepEqual(saved.layout, checkpoint.fjord.layout);
    assert.deepEqual(errors, []);
    await writeFile(output + '/touch.json', JSON.stringify({ viewport: { width: 1024, height: 768 },
        device: 'Edge touch emulation; not physical iPad Safari', island: saved.island, homes: 10,
        target, rotation: true, spreadZoomIn: true, pinchZoomOut: true, selection: true,
        canonicalUnchanged: true, errors }, null, 2));
    console.log('Tablet touch rotation, zoom, resident selection and unchanged Core passed.');
} finally {
    await browser.close();
}
