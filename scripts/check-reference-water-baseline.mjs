import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5192';
const output = process.env.QA_OUTPUT || 'scratch/reference-water-baseline';
const sourcePaths = [
    'src/water/ReferenceWater.ts', 'src/water/ReferenceWaterShaders.ts',
    'src/water/ReferenceWaterTexture.ts', 'src/water/ReferenceWaterWaves.ts',
    'src/water-lab/WaterLab.ts', 'src/water-lab/FloatingSample.ts',
    'src/water-lab/water-lab.css',
];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
const errors = [], samples = [];
const report = {
    sourceHashes, viewport: [1200, 900], pixelRatio: 1, warmupMs: 3000, sampleMs: 5000,
    method: 'Two ordered matched runs: none/low/high, then high/low/none. None hides only the water mesh; UI, animation and water update remain active.',
    limitations: 'rAF includes display and host scheduling. Optional GPU queries cover the indexed water draw only, excluding browser composition, clear, UI and other frame work. This is a desktop diagnostic, not a phone test.',
    timerSpecification: 'https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/',
    errors, samples,
};
await mkdir(output, { recursive: true });
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
});
function summary(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted.length ? {
        count: sorted.length,
        medianMs: sorted[Math.floor((sorted.length - 1) * 0.5)],
        p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
        minMs: sorted[0], maxMs: sorted.at(-1),
    } : { count: 0 };
}
try {
    await page.goto(origin + '/water-lab');
    await page.locator('#water-canvas[data-ready=true]').waitFor({ timeout: 90000 });
    await page.locator('#water-float').uncheck();
    report.hardware = await page.evaluate(() => {
        const gl = document.querySelector('#water-canvas').getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const counterBits = extension ? gl.getQuery(extension.TIME_ELAPSED_EXT, extension.QUERY_COUNTER_BITS_EXT) : 0;
        const supported = Boolean(extension && counterBits > 0);
        const originalDraw = gl.drawElements;
        let recording = false, pending = [], gpuMs = [], skipped = 0, disjointCount = 0, discarded = 0;

        function poll() {
            if (!supported) return;
            const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
            if (disjoint) disjointCount++;
            const remaining = [];
            for (const query of pending) {
                const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
                if (available && !disjoint) gpuMs.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
                if (available || disjoint) {
                    if (disjoint) discarded++;
                    gl.deleteQuery(query);
                } else remaining.push(query);
            }
            pending = remaining;
        }
        if (supported) {
            gl.drawElements = function (...args) {
                if (!recording) return originalDraw.apply(gl, args);
                if (pending.length >= 8 || gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
                    skipped++;
                    return originalDraw.apply(gl, args);
                }
                const query = gl.createQuery();
                gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
                try {
                    return originalDraw.apply(gl, args);
                } finally {
                    gl.endQuery(extension.TIME_ELAPSED_EXT);
                    pending.push(query);
                }
            };
        }
        window.__waterGpuProbe = {
            start() {
                gpuMs = []; skipped = 0; disjointCount = 0; discarded = 0;
                if (supported) gl.getParameter(extension.GPU_DISJOINT_EXT);
                recording = true;
            },
            poll,
            async stop() {
                recording = false;
                for (let attempt = 0; pending.length && attempt < 30; attempt++) {
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    poll();
                }
                discarded += pending.length;
                for (const query of pending) gl.deleteQuery(query);
                pending = [];
                return { supported, counterBits, gpuMs, skipped, disjointCount, discarded };
            },
            restore() {
                recording = false;
                gl.drawElements = originalDraw;
                for (const query of pending) gl.deleteQuery(query);
                pending = [];
            },
        };
        return {
            renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
            vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
            userAgent: navigator.userAgent,
            timerExtension: Boolean(extension), timerSupported: supported, timerCounterBits: counterBits,
        };
    });
    console.log('Matched diagnostic ready; GPU timer support: ' + report.hardware.timerSupported);
    const orders = [['none', 'low', 'high'], ['high', 'low', 'none']];
    for (let order = 0; order < orders.length; order++) {
        for (const mode of orders[order]) {
            await page.evaluate(value => {
                const lab = window.__waterLab;
                lab.setView('reference');
                lab.setQuality(value === 'none' ? 'low' : value);
                lab.water.mesh.visible = value !== 'none';
                lab.setTime(0);
                lab.setPaused(false);
            }, mode);
            await page.waitForTimeout(3000);
            const sample = await page.evaluate(() => new Promise(resolve => {
                const intervals = [];
                let start, previous;
                window.__waterGpuProbe.start();
                async function frame(time) {
                    if (start === undefined) start = time;
                    if (previous !== undefined) intervals.push(time - previous);
                    previous = time;
                    window.__waterGpuProbe.poll();
                    if (time - start < 5000) requestAnimationFrame(frame);
                    else resolve({
                        durationMs: time - start, intervals,
                        gpu: await window.__waterGpuProbe.stop(),
                        stats: window.__waterLab.getStats(),
                    });
                }
                requestAnimationFrame(frame);
            }));
            assert.equal(sample.stats.pixelRatio, 1);
            assert.equal(sample.stats.render.calls, mode === 'none' ? 0 : 1);
            sample.rafSummary = summary(sample.intervals);
            sample.gpuSummary = summary(sample.gpu.gpuMs);
            samples.push({ order: order + 1, mode, ...sample });
            await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
            console.log(mode + ' order ' + (order + 1) + ': rAF median ' +
                sample.rafSummary.medianMs.toFixed(2) + 'ms, GPU samples ' + sample.gpuSummary.count);
        }
    }
    assert.deepEqual(errors, []);
    report.passed = true;
} catch (error) {
    report.passed = false;
    report.failure = error.stack || String(error);
    throw error;
} finally {
    try {
        await page.evaluate(() => {
            window.__waterGpuProbe?.restore();
            if (window.__waterLab) {
                window.__waterLab.water.mesh.visible = true;
                window.__waterLab.setQuality('medium');
            }
        });
    } finally {
        await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
        await browser.close();
    }
}
