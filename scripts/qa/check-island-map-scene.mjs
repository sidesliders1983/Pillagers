import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'artifacts/island-map';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', errors: [], runs: [] };
try {
    for (const [label, file] of [['32', 'docs/qa/rival-visibility/visited-review.json'],
        ['17', 'docs/qa/island-missions/sighted-review.json'], ['1983', 'docs/qa/island-missions/identified-review.json']]) {
        const save = JSON.parse(await readFile(file, 'utf8'));
        save.pace.running = false;
        save.presentation.quality = 'low';
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
        await context.addInitScript(save => {
            if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
                sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save));
        }, save);
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
        if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
        const snapshot = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
        const returnCameraHome = async () => {
            if (await page.locator('#fjord-island-map').isVisible()) await page.locator('[data-map-close]').click();
            if (await page.locator('#fjord-mobile-menu').isVisible()) await page.locator('#fjord-mobile-menu').click();
            await page.locator('[data-surface="settlement"]').first().click();
            await page.locator('[data-ui="camera-home"]').click();
        };
        const before = await snapshot();
        const run = { campaign: before.seed, terrain: save.fjord.island.seed, checks: [], measurements: [] };
        assert.equal(await page.locator('#fjord-island-map').isVisible(), false);
        await page.screenshot({ path: `${output}/desktop-${label}-closed.png` });
        if (label === '32') await page.locator('#expedition-mode [data-explore]').click();
        await page.locator('#fjord-map-toggle').click();
        await page.waitForFunction(() => document.querySelector('#fjord-island-map svg circle'));
        const home = page.locator('.fjord-map-home');
        const box = await home.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(700);
        assert.deepEqual(await snapshot(), before, 'A map point must not mutate paused Core, routes, resources or discovery');
        await returnCameraHome();
        await page.waitForTimeout(1000);
        const clearance = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.cameraClearance));
        const fire = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.campfire).transform);
        assert.ok(Math.hypot(clearance.focus[0] - fire.x, clearance.focus[2] - fire.z) < .5,
            'Home returns to the actual campfire nucleus');
        assert.ok(clearance.focus.every(Number.isFinite));
        assert.deepEqual(await snapshot(), before);
        run.checks.push('Map is one item in the existing bar; Settlement → View settlement returns the camera without extra icons or Core changes');
        await page.locator('#fjord-map-toggle').click();
        await page.screenshot({ path: `${output}/desktop-${label}-home.png` });
        const canvas = page.locator('#fjord-canvas');
        const sceneBox = await canvas.boundingBox();
        for (const zoom of [120, -180, 100]) {
            await page.mouse.move(sceneBox.x + sceneBox.width * .7, sceneBox.y + sceneBox.height * .4);
            await page.mouse.down({ button: 'right' });
            await page.mouse.move(sceneBox.x + sceneBox.width * .7 + 90, sceneBox.y + sceneBox.height * .4 + 20, { steps: 5 });
            await page.mouse.up({ button: 'right' });
            await page.mouse.wheel(0, zoom);
            await page.waitForTimeout(350);
            assert.ok(await page.locator('.fjord-map-view').getAttribute('points'));
        }
        assert.deepEqual(await snapshot(), before);
        run.checks.push('Three orbit/zoom changes retain camera footprint and leave Core unchanged');
        for (const quality of ['low', 'standard']) {
            if (quality === 'standard') {
                await page.locator('#fjord-menu > summary').click();
                await page.locator('#fjord-quality').selectOption('standard');
                await page.locator('#fjord-menu > summary').click();
                // The existing synchronous quality handler changes the scene, while environment
                // diagnostics refresh only on a later Core revision in a paused campaign.
                await page.waitForTimeout(1000);
            }
            for (const open of [false, true]) {
                if (await page.locator('#fjord-island-map').isVisible() !== open) await page.locator('#fjord-map-toggle').click();
                const samples = await page.evaluate(() => new Promise(resolve => {
                    const times = []; let previous = performance.now();
                    const frame = now => { times.push(now - previous); previous = now;
                        if (times.length === 120) resolve(times); else requestAnimationFrame(frame); };
                    requestAnimationFrame(frame);
                }));
                const diagnostics = await canvas.evaluate(canvas => ({ map: JSON.parse(canvas.dataset.islandMap), scene: JSON.parse(canvas.dataset.stability) }));
                const sorted = [...samples].sort((a, b) => a - b);
                run.measurements.push({ quality, open, samples, p50: sorted[60], p95: sorted[114], ...diagnostics });
            }
        }
        assert.equal(run.measurements.at(-1).map.baseBuilds, 1, 'Quality changes reuse the same geographic raster');
        if (label === '32') {
            for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
                await page.setViewportSize(viewport);
                await page.waitForFunction(() => document.querySelector('#fjord-play').classList.contains('fjord-mobile'));
                await page.locator('#fjord-map-toggle').click();
                assert.equal(await page.locator('#fjord-island-map').evaluate(dialog => dialog.matches(':modal')), true);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                await page.screenshot({ path: `${output}/mobile-${viewport.width}-open.png` });
                await page.locator('[data-map-close]').click();
                await page.screenshot({ path: `${output}/mobile-${viewport.width}-closed.png` });
            }
            run.checks.push('Phone portrait/landscape and tablet use a closable modal map and the existing navigation bar, without horizontal overflow');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 180000 });
            assert.deepEqual(await snapshot(), before);
            assert.equal(await page.locator('#fjord-island-map').isVisible(), false);
            run.checks.push('Reload preserves exact campaign and starts the map collapsed');
            await page.locator('#fjord-run').click();
            await page.locator('#fjord-map-toggle').click();
            await page.waitForTimeout(2500);
            const running = await snapshot();
            assert.ok(running.time.winter * 1000 + running.time.tick > before.time.winter * 1000 + before.time.tick,
                'Opening the map does not pause a running campaign');
            await page.locator('[data-map-close]').click();
            await page.locator('#fjord-run').click();
            run.checks.push('A running expedition continues canonical ticks while the map is open');
        }
        report.runs.push(run);
        console.log(`Map scene passed: campaign ${before.seed}, terrain ${run.terrain}`);
        await context.close();
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/scene.json', JSON.stringify(report, null, 2));
    await browser.close();
}
