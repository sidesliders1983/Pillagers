import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT ??
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { LocalLoreAdapter } = loadTypeScript(new URL('../../src/lore/LocalLoreAdapter.ts', import.meta.url));
const output = 'docs/qa/local-lore';
const label = process.env.LORE_CANDIDATE;
if (!['A', 'B', 'C'].includes(label)) throw new Error('Set LORE_CANDIDATE=A, B or C.');
const manifest = JSON.parse(await readFile(output + '/manifest.json', 'utf8'));
const candidate = manifest.candidates[label];
const request = JSON.parse(gunzipSync(await readFile(output + '/corpus.json.gz')).toString('utf8')).corpus[0].requests[0];
const adapter = new LocalLoreAdapter(label === 'A' ? undefined : { endpoint: 'http://127.0.0.1:8085', model: candidate.file,
    identity: candidate.sha256 + ':' + manifest.runtime.commit, timeoutMs: manifest.deadlineMs });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
const runs = [];
const sample = () => page.evaluate(async () => {
    const intervals = [];
    await new Promise(resolve => {
        let last = 0;
        const start = performance.now();
        const frame = now => {
            if (last) intervals.push(now - last);
            last = now;
            if (now - start >= 15000) resolve();
            else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    });
    const sorted = [...intervals].sort((a, b) => a - b);
    return { intervals, frames: intervals.length, medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maximumMs: sorted.at(-1) };
});
try {
    await page.goto((process.env.QA_BASE_URL ?? 'http://127.0.0.1:5180') + '/fjord-play?seed=32');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor({ timeout: 120000 });
    if (await page.locator('#fjord-run').innerText() === 'Pause') await page.locator('#fjord-run').click();
    if (await page.locator('#clan-book-reader').isVisible()) await page.locator('#clan-book-close').click();
    await page.waitForTimeout(8000);
    const hardware = await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas');
        const gl = canvas.getContext('webgl2');
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
            userAgent: navigator.userAgent, quality: document.querySelector('#fjord-quality')?.value,
            environment: canvas.dataset.environment, camera: canvas.dataset.camera };
    });
    const time = await page.locator('#fjord-canvas').getAttribute('data-time');
    for (let repeat = 1; repeat <= 2; repeat++) {
        runs.push({ repeat, mode: 'model-idle', ...await sample() });
        const [frames, result] = await Promise.all([sample(), adapter.generate(request, [])]);
        runs.push({ repeat, mode: label === 'A' ? 'model-absent' : 'model-active', ...frames, result });
        await writeFile(output + '/concurrent-' + label + '.json', JSON.stringify({ candidate: label,
            generatedAt: new Date().toISOString(), hardware, viewport: { width: 1024, height: 768, dpr: 1 },
            protocol: 'Paused Fjord scene; fixed camera; 8s warmup; two paired 15s rAF windows; one opening request per active window. For B/C, model loaded during idle windows; A has no server loaded. Raw intervals retained. rAF is browser pacing, not GPU execution time.',
            time, timeAfter: await page.locator('#fjord-canvas').getAttribute('data-time'), runs, errors }, null, 2) + '\n');
        console.log(label + ' concurrency repeat ' + repeat + ': idle p95 ' + runs.at(-2).p95Ms + ', active p95 ' + frames.p95Ms);
    }
    await page.screenshot({ path: output + '/concurrent-' + label + '.png' });
} finally { await browser.close(); }
