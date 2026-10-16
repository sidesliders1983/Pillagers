import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('artifacts/clan-discovery', { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/fjord-play?discovery=1&debugDiscovery=1', { waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#fjord-run').innerText() === 'Pause') await page.locator('#fjord-run').click();
    if (await page.getByRole('button', { name: 'Close founding chapter' }).count())
        await page.getByRole('button', { name: 'Close founding chapter' }).click();
    await page.locator('#fjord-management-toggle').click();
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    const before = await saved();
    assert.ok(before.fjord.campaign.discovery, 'Opted-in physical campaign stores founding knowledge in Core');
    const fog = JSON.parse(await page.locator('#fjord-canvas').getAttribute('data-discovery'));
    assert.ok(fog.active && fog.unknownCells > fog.exploredCells);
    assert.ok(fog.drawCalls <= 2, 'Fog uses bounded native material layers');
    assert.ok(fog.maskBytes <= 6000);
    await page.mouse.move(420, 450);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(610, 430, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(500);
    assert.deepEqual((await saved()).fjord.campaign.discovery, before.fjord.campaign.discovery,
        'Orbit and zoom do not discover terrain');
    await page.screenshot({ path: 'artifacts/clan-discovery/founding-tablet.png' });
    await page.mouse.wheel(0, 5500);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'artifacts/clan-discovery/high-zoom.png' });
    assert.deepEqual((await saved()).fjord.campaign.discovery, before.fjord.campaign.discovery);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await saved()).fjord.campaign.discovery, before.fjord.campaign.discovery,
        'Loading the global preview does not change saved knowledge');
    assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
    await page.setViewportSize({ width: 390, height: 844 });
    if (await page.locator('#fjord-management-toggle').getAttribute('aria-expanded') === 'true')
        await page.locator('#fjord-management-toggle').tap();
    await page.screenshot({ path: 'artifacts/clan-discovery/founding-phone.png' });
    const projection = await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas');
        return { rect: canvas.getBoundingClientRect().toJSON(),
            camera: JSON.parse(canvas.dataset.camera), rendered: JSON.parse(canvas.dataset.rendered) };
    });
    const viewMatrix = new Matrix4().fromArray(projection.camera.world).invert();
    const projectionMatrix = new Matrix4().fromArray(projection.camera.projection);
    const rect = projection.rect;
    const candidates = projection.rendered.filter(entity => entity.key.startsWith('persona:')).map(entity => {
        const min = entity.bounds.min, max = entity.bounds.max;
        const point = new Vector3().fromArray(min).add(new Vector3().fromArray(max))
            .multiplyScalar(.5).applyMatrix4(viewMatrix);
        const inFront = point.z < 0;
        point.applyMatrix4(projectionMatrix);
        return { key: entity.key, inFront, x: rect.left+(point.x+1)*rect.width/2,
            y: rect.top+(1-point.y)*rect.height/2 };
    });
    const tapTarget = candidates.filter(point => point.inFront && point.x > rect.left+20 &&
        point.x < rect.right-60 && point.y > rect.top+50 && point.y < rect.bottom-20)
        .sort((a,b) => Math.hypot(a.x-rect.left-rect.width/2,a.y-rect.top-rect.height/2) -
            Math.hypot(b.x-rect.left-rect.width/2,b.y-rect.top-rect.height/2))[0];
    await writeFile('artifacts/clan-discovery/touch-projection.json', JSON.stringify({projection, candidates}, null, 2));
    assert.ok(tapTarget, 'A visible own resident remains available for touch selection');
    await page.touchscreen.tap(tapTarget.x, tapTarget.y);
    assert.match(await page.locator('#fjord-canvas').getAttribute('data-selected'), /^persona:/);
    const runtime = [];
    for (const quality of ['low', 'standard']) {
        await page.getByLabel('Game menu', { exact: true }).tap();
        await page.locator('#fjord-quality').selectOption(quality);
        await page.getByLabel('Game menu', { exact: true }).tap();
        await page.waitForTimeout(500);
        runtime.push({ quality, viewport: { width: 390, height: 844 }, ...await page.evaluate(async () => {
            const intervals = []; let previous = performance.now();
            while (intervals.length < 60) {
                const now = await new Promise(requestAnimationFrame);
                intervals.push(now - previous); previous = now;
            }
            return { intervals, stability: JSON.parse(document.querySelector('#fjord-canvas').dataset.stability) };
        }) });
    }
    assert.deepEqual((await saved()).fjord.campaign.discovery, before.fjord.campaign.discovery,
        'Touch selection and both quality settings retain exact discovery');
    assert.deepEqual(errors, []);
    await writeFile('artifacts/clan-discovery/browser.json', JSON.stringify({ fog, errors, runtime, touchSelection: true,
        cameraDoesNotReveal: true, reloadExact: true, physicalMobile: false }, null, 2));
    console.log(JSON.stringify({ fog, errors, cameraDoesNotReveal: true, reloadExact: true }));
} finally { await browser.close(); }
