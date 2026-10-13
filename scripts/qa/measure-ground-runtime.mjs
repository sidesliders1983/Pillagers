import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60000);
const report = { date: new Date().toISOString(), errors: [], runs: [], method:
    'Isolated from repository tests and other QA. Three alternating-order runs per mode/tier, 120 raw rAF intervals after 2 s settle; seed 18 steep inland wall, day, bare terrain, paused, no fog. Browser wall time, not exclusive CPU/GPU. Background OS activity remains uncontrolled.' };
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
try {
    await page.goto((process.env.QA_ORIGIN ?? 'http://127.0.0.1:5180') + '/environment-lab');
    await page.locator('#environment-canvas[data-ready=true]').waitFor();
    report.graphics = await page.locator('#environment-canvas').evaluate(canvas => {
        const gl = canvas.getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return extension ? { vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),
            renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) } : null;
    });
    await openEnvironmentSettings(page);
    await page.locator('#world-import').setInputFiles('scratch/environment-zoning/18.json');
    await page.waitForFunction(() => JSON.parse(document.querySelector('canvas').dataset.world ?? '{}').seed === 18 &&
        !document.querySelector('#world-generate').disabled);
    for (const id of ['nature', 'village', 'water', 'fog']) await page.locator('#environment-' + id).uncheck();
    await page.locator('#environment-pause').check();
    await page.selectOption('#environment-camera', 'ground-rock');
    for (const tier of ['standard', 'low']) {
        await openEnvironmentSettings(page);
        await page.selectOption('#environment-quality', tier);
        await page.waitForFunction(t => document.querySelector('canvas').dataset.groundTier === t &&
            !document.querySelector('#world-generate').disabled, tier);
        for (let run = 0; run < 3; run++) {
            const modes = run % 2 === 0 ? ['baseline', 'zoned'] : ['zoned', 'baseline'];
            for (const mode of modes) {
                await openEnvironmentSettings(page);
                await page.selectOption('#world-ground-blending', mode);
                await page.waitForFunction(m => JSON.parse(document.querySelector('canvas').dataset.ground).blending === m &&
                    !document.querySelector('#world-generate').disabled, mode);
                await page.locator('#environment-settings > summary').click();
                await page.waitForTimeout(2000);
                const frames = await page.evaluate(() => new Promise(resolve => {
                    const frames = []; let previous;
                    function frame(now) {
                        if (previous !== undefined) frames.push(now - previous);
                        previous = now;
                        if (frames.length >= 120) resolve(frames); else requestAnimationFrame(frame);
                    }
                    requestAnimationFrame(frame);
                }));
                const data = await page.locator('canvas').evaluate(canvas => ({
                    fixture: JSON.parse(canvas.dataset.fixture), ground: JSON.parse(canvas.dataset.ground),
                    metrics: JSON.parse(canvas.dataset.metrics),
                }));
                report.runs.push({ tier, mode, run, frames, ...data });
                console.log(tier, mode, run, data.metrics);
            }
        }
    }
    for (const run of report.runs) assert.deepEqual(run.fixture.camera, report.runs[0].fixture.camera);
    assert.deepEqual(report.errors, []);
} finally {
    await mkdir('scratch/ground-blending', { recursive: true });
    await writeFile('scratch/ground-blending/runtime.json', JSON.stringify(report, null, 2));
    await browser.close();
}
