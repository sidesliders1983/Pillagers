import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'artifacts/island-map';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/rival-visibility/review.html');
    await page.evaluate(async () => {
        document.querySelectorAll('style').forEach(style => style.remove());
        const { IslandMap } = await import('/src/fjord-play/IslandMap.ts');
        const { PerspectiveCamera, Vector3 } = await import('/node_modules/three/build/three.module.js');
        for (const path of ['/src/style.css', '/src/fjord-play/fjord-play.css', '/src/fjord-play/fjord-interface.css',
            '/src/fjord-play/mobile-horizon.css']) {
            const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = path; document.head.append(link);
        }
        document.body.className = 'fjord-play';
        document.body.innerHTML = '<main id="fjord-play"><canvas id="scene"></canvas></main>';
        const bounds = { minX: -100, maxX: 300, minZ: -50, maxZ: 150 };
        const world = { terrain: { bounds, spacing: 100, columns: 5, rows: 3,
            heights: [0,0,0,0,0,0,3,8,2,0,0,0,0,0,0] }, waterLevel: 0 };
        const discovery = { version: 1, worldId: 'map-fixture', cellSize: 100,
            grid: { bounds, columns: 4, rows: 2 }, explored: '02', visible: '02' };
        const calls = [];
        const map = new IslandMap(document.querySelector('#fjord-play'), { focus: point => calls.push(point),
            home: () => calls.push('home') });
        map.setWorld(world, { x: 50, z: 0 }, discovery);
        const camera = new PerspectiveCamera(45, 1.6, .1, 2000);
        camera.position.set(80, 80, 40); camera.lookAt(50, 0, 0); camera.updateMatrixWorld();
        map.update(camera, new Vector3(50, 0, 0), performance.now());
        window.mapQA = { map, camera, calls, discovery };
    });
    await page.locator('#fjord-map-toggle').click();
    await page.evaluate(() => {
        mapQA.map.setExpeditions([{ groupId: 'group-1', groupName: 'Group 1', status: 'Traveling', target: { x: 200, z: 0 } },
            { groupId: 'group-2', groupName: 'Group 2', status: 'Returning', target: { x: 200, z: 0 } }]);
        mapQA.map.update(mapQA.camera, { x: 50, y: 0, z: 0, toArray: () => [50, 0, 0] }, performance.now() + 200);
    });
    assert.equal(await page.locator('.fjord-map-expedition').count(), 2);
    assert.equal(await page.locator('.fjord-map-image > svg .fjord-map-home').count(), 1,
        'Geographic marks belong above the raster, never inside a toolbar icon');
    assert.equal(await page.locator('.fjord-map-expedition[data-group="group-1"]').getAttribute('transform'), 'translate(750,250)');
    assert.equal(await page.locator('.fjord-map-expedition[data-group="group-2"]').getAttribute('transform'), 'translate(375,250)');
    const mapCanvas = page.locator('#fjord-map-canvas');
    assert.equal(await page.locator('#fjord-island-map').isVisible(), true);
    const box = await mapCanvas.boundingBox();
    await page.mouse.click(box.x + box.width * .375, box.y + box.height * .25);
    const chosen = await page.evaluate(() => mapQA.calls[0]);
    assert.ok(Math.abs(chosen.x - 50) < 2 && Math.abs(chosen.z) < 2, 'Pointer rounding stays within one displayed pixel');
    await page.mouse.click(box.x + box.width * .75, box.y + box.height * .25);
    assert.equal(await page.evaluate(() => mapQA.calls.length), 1);
    await page.locator('#fjord-map-home').click();
    assert.deepEqual(await page.evaluate(() => mapQA.calls.at(-1)), 'home');
    await page.locator('#fjord-map-toggle').click();
    assert.equal(await page.locator('#fjord-island-map').isVisible(), false);
    report.checks.push('The lower-left Map toggle starts closed, opens/closes; known points focus only, unknown points reject, Home is direct');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { document.querySelector('#fjord-play').classList.add('fjord-mobile'); document.dispatchEvent(new Event('fjord-layout-change')); });
    await page.locator('#fjord-map-toggle').click();
    assert.equal(await page.locator('#fjord-island-map').evaluate(dialog => dialog.matches(':modal')), true);
    assert.ok((await page.locator('#fjord-map-toggle').boundingBox()).height >= 44);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: output + '/phone-open.png' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#fjord-island-map').isVisible(), false);
    await page.locator('#fjord-map-home').click();
    assert.equal(await page.evaluate(() => mapQA.calls.at(-1)), 'home');
    report.checks.push('Phone Map is a deliberate modal sheet; Escape closes and direct Home remains available');
    await context.close();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/controls.json', JSON.stringify(report, null, 2));
    await browser.close();
}
