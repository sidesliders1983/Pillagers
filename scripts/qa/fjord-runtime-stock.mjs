import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5192';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const result = { sourceCommit: process.env.QA_SOURCE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    mode: 'Unmodified production bundle; public controls only; GPU execution time UNKNOWN',
    assetEnvironment: process.env.QA_ASSET_VARIANT || 'Declared by the captured source/resource manifest',
    browserVersion: browser.version(), warmupMs: 5000, sampleMs: 20000, runs: [], errors: [] };
try {
    for (let repeat = 1; repeat <= Number(process.env.QA_REPEATS || 3); repeat++) {
        const fixtureNames = process.env.QA_FIXTURE_SET === 'prepared' ? ['developed-810'] : ['summer-32', 'developed-810'];
        const scenarios = process.env.QA_SCENARIOS ? JSON.parse(process.env.QA_SCENARIOS) : [
            ...fixtureNames.flatMap(fixture => [false, true].map(running => ({ fixture, running }))),
            { fixture: 'boundary-810', running: true, boundary: true },
        ];
        for (const scenario of repeat % 2 ? scenarios : scenarios.reverse()) {
            const page = await context.newPage();
            page.setDefaultTimeout(180000);
            page.on('pageerror', error => result.errors.push(error.message));
            const fixture = JSON.parse(await readFile((process.env.QA_FIXTURES || output + '/fixtures') + '/' + scenario.fixture + '.json', 'utf8'));
            fixture.target = 'fjord'; fixture.pace.running = false;
            await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json), JSON.stringify(fixture));
            try {
                await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
                await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
                if (process.env.QA_FIXTURE_SET === 'prepared') {
                    const placeholders = await page.evaluate(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
                        .filter(entity => entity.placeholder).map(entity => entity.key));
                    assert.deepEqual(placeholders, [], 'Prepared production confirmation must use real entity models');
                }
                assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined', 'Stock build must not contain the QA bridge');
                await page.evaluate(running => {
                    const quality = document.querySelector('#fjord-quality');
                    quality.value = 'low'; quality.dispatchEvent(new Event('change'));
                    if (running) document.querySelector('#fjord-run').click();
                }, scenario.running && !scenario.boundary);
                await page.waitForTimeout(5000);
                if (scenario.boundary) await page.locator('#fjord-run').click();
                const sample = await page.evaluate(() => new Promise(resolve => {
                    const bins = new Map(), tasks = [], start = performance.now();
                    let previous = 0, count = 0, total = 0, max = 0, over33 = 0, over50 = 0;
                    const observer = new PerformanceObserver(list => {
                        for (const task of list.getEntries()) tasks.push(task.duration);
                    });
                    observer.observe({ type: 'longtask', buffered: false });
                    function frame(time) {
                        if (previous) {
                            const interval = time - previous, bucket = Math.round(interval * 10);
                            bins.set(bucket, (bins.get(bucket) || 0) + 1);
                            count++; total += interval; max = Math.max(max, interval);
                            if (interval > 33.3) over33++; if (interval > 50) over50++;
                        }
                        previous = time;
                        if (time - start < 20000) return requestAnimationFrame(frame);
                        observer.disconnect();
                        const sorted = [...bins].sort((a, b) => a[0] - b[0]);
                        const quantile = fraction => {
                            let sum = 0;
                            for (const [bucket, size] of sorted) {
                                sum += size; if (sum >= Math.ceil(count * fraction)) return bucket / 10;
                            }
                        };
                        resolve({ durationMs: time - start, fps: count * 1000 / (time - start), count, mean: total / count,
                            p50: quantile(.5), p95: quantile(.95), p99: quantile(.99), max, over33, over50,
                            longTasks: { count: tasks.length, total: tasks.reduce((a, b) => a + b, 0), max: Math.max(0, ...tasks) },
                            visibility: document.visibilityState, canvas: { width: document.querySelector('canvas').width,
                                height: document.querySelector('canvas').height },
                            publicDiagnostics: { time: JSON.parse(document.querySelector('canvas').dataset.time),
                                stability: JSON.parse(document.querySelector('canvas').dataset.stability) } });
                    }
                    requestAnimationFrame(frame);
                }));
                await page.evaluate(() => { if (document.querySelector('#fjord-run').textContent === 'Pause') document.querySelector('#fjord-run').click(); });
                await page.waitForTimeout(500);
                if (process.env.QA_FIXTURE_SET === 'prepared' && repeat === 1 && !scenario.running)
                    await page.screenshot({ path: output + '/prepared-settlement.png' });
                await page.evaluate(() => { document.querySelector('#fjord-menu').open = true; document.querySelector('#fjord-campaign').open = true; });
                const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#fjord-export-core').click()]);
                const actual = JSON.parse(await readFile(await download.path(), 'utf8'));
                await download.delete();
                const ticks = (actual.time.winter - fixture.fjord.campaign.time.winter) * 1000 + actual.time.tick - fixture.fjord.campaign.time.tick;
                assert.deepEqual(actual, core.applyCommand(fixture.fjord.campaign, { type: 'AdvanceTicks', ticks }));
                const device = await page.evaluate(() => {
                    const gl = document.querySelector('#fjord-canvas').getContext('webgl2');
                    const extension = gl.getExtension('WEBGL_debug_renderer_info');
                    return { userAgent: navigator.userAgent, dpr: devicePixelRatio,
                        hardwareConcurrency: navigator.hardwareConcurrency,
                        placeholders: JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
                            .filter(entity => entity.placeholder).map(entity => ({ key: entity.key, asset: entity.asset })),
                        diagnostics: document.querySelector('#fjord-diagnostics').textContent,
                        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                        resources: [...new Set(performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname))]
                            .filter(path => /^\/(assets|game-assets|character-lab|appearance|universal-human|lighting|scenery|draco)\//.test(path)).sort() };
                });
                result.runs.push({ scenario, repeat, sample, device, canonicalReplayEqual: true, actualTicksFromFixture: ticks });
                await writeFile(output + '/stock-production.json', JSON.stringify(result, null, 2) + '\n');
                console.log(JSON.stringify({ stock: true, repeat, ...scenario, p95: sample.p95, longTasks: sample.longTasks.count }));
                if (result.errors.length) throw Error(result.errors.join('\n'));
            } finally { await page.close(); }
        }
    }
} catch (error) {
    result.failure = String(error); await writeFile(output + '/stock-production.json', JSON.stringify(result, null, 2) + '\n'); throw error;
} finally { await context.close(); await browser.close(); }
