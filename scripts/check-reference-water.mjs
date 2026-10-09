import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5181';
const output = process.env.QA_OUTPUT || 'scratch/reference-water-qa';
const measure = process.argv.includes('--measure');
const software = process.argv.includes('--software');
const warmupMs = Number(process.env.QA_WARMUP_MS || 10000);
const sampleMs = Number(process.env.QA_SAMPLE_MS || 30000);
assert.ok(Number.isFinite(warmupMs) && warmupMs >= 0 && warmupMs <= 60000);
assert.ok(Number.isFinite(sampleMs) && sampleMs >= 1000 && sampleMs <= 60000);

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    channel: process.env.QA_BROWSER || 'msedge',
    headless: true,
    args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
const sourcePaths = [
    'src/water/ReferenceWater.ts', 'src/water/ReferenceWaterShaders.ts',
    'src/water/ReferenceWaterTexture.ts', 'src/water/ReferenceWaterWaves.ts',
    'src/water-lab/FloatingSample.ts', 'src/water-lab/WaterLab.ts',
    'src/water-lab/water-lab.css',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const errors = [], screenshots = [], timings = [], lifecycle = [];
const report = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTree: 'Current local files; commit alone does not identify uncommitted changes.',
    origin,
    sourceHashes,
    method: 'Canvas pixel checks, public lab controls, renderer counts and optional rAF intervals.',
    limitations: 'Phone-sized emulation is not a physical mobile GPU test. rAF intervals include display and host scheduling; renderer texture counts are not measured VRAM.',
    softwareRequested: software,
    screenshots, lifecycle, timings, errors,
};

function observeErrors(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
}
async function settle(page) {
    await page.evaluate(() => new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
}
async function scrubTime(page, seconds) {
    await page.locator('#water-time').evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, seconds);
}
async function stats(page) {
    return page.evaluate(() => window.__waterLab.getStats());
}
async function hardware(page) {
    return page.evaluate(() => {
        const gl = document.querySelector('#water-canvas').getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return {
            renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
            userAgent: navigator.userAgent,
            devicePixelRatio,
            hardwareConcurrency: navigator.hardwareConcurrency,
        };
    });
}
async function capture(page, name) {
    await settle(page);
    const overlayStyle = await page.addStyleTag({
        content: '.water-heading,.water-panel,.water-footer{visibility:hidden!important}',
    });
    const png = await page.locator('#water-canvas').screenshot();
    await overlayStyle.evaluate(element => element.remove());
    await writeFile(output + '/' + name + '.png', png);
    const decoded = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    screenshots.push({
        name, file: name + '.png',
        sha256: createHash('sha256').update(png).digest('hex'),
        width: decoded.info.width, height: decoded.info.height,
        stats: await stats(page),
    });
    return decoded;
}
function pixelDifference(first, second) {
    assert.equal(first.data.length, second.data.length, 'Compared captures need matching dimensions.');
    let total = 0, changed = 0;
    for (let index = 0; index < first.data.length; index++) {
        const delta = Math.abs(first.data[index] - second.data[index]);
        total += delta;
        if (delta > 2) changed++;
    }
    return { meanAbsoluteChannelDifference: total / first.data.length,
        changedChannelFraction: changed / first.data.length };
}
async function sampleTiming(page, quality, run) {
    await page.selectOption('#water-quality', quality);
    await page.evaluate(() => window.__waterLab.setPaused(false));
    await page.waitForTimeout(warmupMs);
    const intervals = await page.evaluate(duration => new Promise(resolve => {
        const values = [];
        let start, previous;
        function frame(time) {
            if (start === undefined) start = time;
            if (previous !== undefined) values.push(time - previous);
            previous = time;
            if (time - start < duration) requestAnimationFrame(frame);
            else resolve(values);
        }
        requestAnimationFrame(frame);
    }), sampleMs);
    const sorted = [...intervals].sort((left, right) => left - right);
    const quantile = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
    timings.push({ quality, run, warmupMs, sampleMs, intervals,
        medianFrameMs: quantile(0.5), p95FrameMs: quantile(0.95), stats: await stats(page) });
    if (run === 1 && quality === 'low') {
        await page.screenshot({ path: output + '/desktop-interface-warmed.png' });
        report.warmedInterface = 'desktop-interface-warmed.png';
    }
    console.log('Measured ' + quality + ' run ' + run + ': ' +
        quantile(0.5).toFixed(2) + ' ms median rAF.');
}
async function runMeasurements(page) {
    await page.selectOption('#water-view', 'reference');
    for (let run = 1; run <= 3; run++) {
        const qualities = run % 2 === 0 ? ['high', 'medium', 'low'] : ['low', 'medium', 'high'];
        for (const quality of qualities) {
            await sampleTiming(page, quality, run);
            await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
        }
    }
}

try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(90000);
    observeErrors(page);
    await page.goto(origin + '/water-lab');
    await page.locator('#water-canvas[data-ready=true]').waitFor();
    await page.locator('.water-panel').evaluate(panel => { panel.open = true; });
    await page.locator('#water-float').uncheck();
    await page.selectOption('#water-view', 'reference');
    report.hardware = await hardware(page);
    console.log('Water lab ready on ' + report.hardware.renderer + '.');
    await page.screenshot({ path: output + '/desktop-interface.png' });

    await scrubTime(page, 0);
    const frozenStart = await capture(page, 'reference-phase-0');
    if (process.argv.includes('--preview')) {
        assert.deepEqual(errors, [], 'No browser or shader errors.');
        report.previewOnly = true;
        report.passed = true;
        console.log('Preview captured; functional checks and timings not run.');
    } else if (process.argv.includes('--measure-only')) {
        await runMeasurements(page);
        assert.deepEqual(errors, [], 'No browser or shader errors.');
        report.measurementsOnly = true;
        report.passed = true;
        console.log('Timing diagnostic complete; functional checks not repeated.');
    } else {
        const firstStats = await stats(page);
        await page.waitForTimeout(300);
        const frozenEnd = await capture(page, 'reference-frozen');
        assert.equal((await stats(page)).elapsedSeconds, firstStats.elapsedSeconds, 'Pause freezes time.');
        const frozenDifference = pixelDifference(frozenStart, frozenEnd);
        assert.equal(frozenDifference.meanAbsoluteChannelDifference, 0, 'Paused pixels must be stable.');

        await scrubTime(page, 1.2);
        const moving = await capture(page, 'reference-phase-1-2');
        const motionDifference = pixelDifference(frozenStart, moving);
        assert.ok(motionDifference.changedChannelFraction > 0.002, 'Changing time visibly moves water.');
        report.motion = { frozenDifference, motionDifference };
        await page.locator('#water-pause').click();
        const beforeRunning = (await stats(page)).elapsedSeconds;
        await page.waitForTimeout(350);
        assert.ok((await stats(page)).elapsedSeconds > beforeRunning, 'Play resumes the shader clock.');
        await page.locator('#water-pause').click();

        for (const view of ['reference', 'close', 'grazing']) {
            await page.selectOption('#water-view', view);
            await scrubTime(page, 0);
            for (const quality of ['low', 'medium', 'high']) {
                await page.selectOption('#water-quality', quality);
                await capture(page, view + '-' + quality);
            }
        }
        for (let cycle = 0; cycle < 10; cycle++) {
            for (const quality of ['low', 'medium', 'high']) {
                await page.selectOption('#water-quality', quality);
                await settle(page);
                const current = await stats(page);
                assert.equal(current.drawCalls, 1, 'Water declares one surface draw.');
                assert.equal(current.render.calls, 1, 'Water-only lab renders exactly one draw.');
                assert.equal(current.render.triangles, current.triangles,
                    'Renderer triangles match the active water geometry.');
                lifecycle.push({ cycle, quality, stats: current });
            }
        }
        for (const quality of ['low', 'medium', 'high']) {
            const matching = lifecycle.filter(item => item.quality === quality);
            assert.equal(new Set(matching.map(item => JSON.stringify(item.stats.memory))).size, 1,
                quality + ' resource counts stay stable across quality changes.');
            assert.equal(new Set(matching.map(item => item.stats.render.triangles)).size, 1,
                quality + ' triangle counts stay stable across quality changes.');
        }
        report.lifecycleCountsStable = true;

        // Functional-only runs do not need a second active renderer while checking phone layout.
        if (!measure) await page.close();
        const mobile = await browser.newPage({
            viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
            isMobile: true, hasTouch: true,
        });
        mobile.setDefaultTimeout(90000);
        observeErrors(mobile);
        await mobile.goto(origin + '/water-lab');
        await mobile.locator('#water-canvas[data-ready=true]').waitFor();
        await mobile.locator('.water-panel').evaluate(panel => { panel.open = true; });
        await mobile.locator('#water-float').uncheck();
        await mobile.selectOption('#water-view', 'reference');
        await mobile.selectOption('#water-quality', 'low');
        await scrubTime(mobile, 0);
        await capture(mobile, 'mobile-low-portrait');
        await mobile.screenshot({ path: output + '/mobile-interface.png' });
        assert.equal((await stats(mobile)).pixelRatio, 1, 'Low quality caps high-DPR rendering.');
        const dimensions = await mobile.evaluate(() => ({
            viewport: innerWidth, document: document.documentElement.scrollWidth,
            canvas: document.querySelector('#water-canvas').getBoundingClientRect().toJSON(),
        }));
        assert.ok(dimensions.document <= dimensions.viewport + 1, 'Mobile has no horizontal overflow.');
        assert.ok(dimensions.canvas.width > 0 && dimensions.canvas.height > 0, 'Mobile canvas is visible.');
        await mobile.setViewportSize({ width: 844, height: 390 });
        await capture(mobile, 'mobile-low-landscape');
        await mobile.screenshot({ path: output + '/mobile-landscape-interface.png' });
        report.mobile = { emulated: true, hardware: await hardware(mobile),
            dimensions, stats: await stats(mobile) };
        await mobile.close();

        if (measure) await runMeasurements(page);
        assert.deepEqual(errors, [], 'No browser or shader errors.');
        report.passed = true;
        console.log('PASS: water motion/freeze, nine view/tier captures, ten quality cycles and mobile layout.');
    }
} catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
    await browser.close();
}
