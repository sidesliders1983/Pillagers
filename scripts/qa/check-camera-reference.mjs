import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-fixpass/reference';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(180000);
    const errors = [], poses = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/?world=reference&worldDev=1');
    await page.locator('#world[data-ready="true"]').waitFor();
    await page.locator('#world-dev > summary').click();
    await page.locator('#debug-toggle').click();
    await page.locator('#fjordside-pause').click();
    for (const name of ['tent-interior', 'grazing', 'village', 'shore', 'overlook']) {
        const option = page.locator('#fjordside-camera option[value="' + name + '"]');
        if (await option.isDisabled()) continue;
        await page.selectOption('#fjordside-camera', name);
        await page.waitForTimeout(700);
        const value = await page.locator('#world').evaluate(async element => {
            const { surfaceHeightAt } = await import('/src/world/Terrain.ts');
            const saved = JSON.parse(element.dataset.fixture), eye = saved.camera.position, target = saved.camera.target;
            const distance = Math.hypot(eye[0] - target[0], eye[2] - target[2]);
            let boomClearance = Infinity;
            for (let i = 0; i <= 1000; i++) {
                const t = i / 1000;
                if (t * distance < 3) continue;
                const x = target[0] + (eye[0] - target[0]) * t, z = target[2] + (eye[2] - target[2]) * t;
                boomClearance = Math.min(boomClearance, target[1] + (eye[1] - target[1]) * t - Math.max(0, surfaceHeightAt(x, z)));
            }
            return { camera: saved.camera, endpointClearance: eye[1] - Math.max(0, surfaceHeightAt(eye[0], eye[2])),
                boomClearance: Number.isFinite(boomClearance) ? boomClearance : null, tent: saved.world.tent };
        });
        assert.ok(value.camera.position.every(Number.isFinite));
        assert.ok(value.endpointClearance >= (name === 'grazing' || name === 'tent-interior' ? .2 : 2) - 1e-7);
        if (value.boomClearance !== null) assert.ok(value.boomClearance >= .35 - 1e-7);
        if (name === 'tent-interior') assert.ok(Math.abs(value.camera.position[1] - value.tent.y - .6) < 1e-6);
        poses.push({ name, ...value });
    }
    await page.locator('#debug-close').click();
    await page.screenshot({ path: output + '/overlook.png' });
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ poses, errors, passed: true }, null, 2));
    console.log('Reference-world native terrain and authored low review poses passed.');
} finally { await browser.close(); }
