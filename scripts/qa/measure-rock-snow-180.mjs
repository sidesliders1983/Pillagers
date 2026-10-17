import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const summitStudy = process.env.QA_STUDY === 'summit';
const root = summitStudy ? 'docs/qa/iceland-summit-snow-180' : 'docs/qa/iceland-rock-snow-180';
const observationsBytes = await readFile(root + '/observations.json');
const observations = JSON.parse(observationsBytes);
assert.equal(observations.status, 'PASS');
const fixtureName = summitStudy ? 'developed-810' : 'snow-811';
const fixture = JSON.parse(await readFile(`docs/qa/fjord-runtime-performance/fixtures/${fixtureName}.json`, 'utf8'));
fixture.target = 'fjord';
fixture.pace.running = false;
const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
const result = { version: summitStudy ? 'summit-snow-cadence-v1' : 'rock-snow-cadence-v1', fixture: fixtureName,
    observationsSha256: createHash('sha256').update(observationsBytes).digest('hex'),
    method: 'Animated rAF cadence, paused simulation; three alternating pairs, each 3s warm-up and 8s sample',
    regressionBudget: .05, timings: [], errors: [] };
const save = () => writeFile(root + '/performance.json', JSON.stringify(result, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const quality of (process.env.QA_TIERS || 'standard,low').split(',')) {
        const entry = { quality, samples: [] };
        result.timings.push(entry);
        const page = await browser.newPage({ viewport: observations.viewport, deviceScaleFactor: 1 });
        page.setDefaultTimeout(240000);
        page.on('pageerror', error => result.errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
        try {
            await page.addInitScript(({ json, quality }) => {
                sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                const observer = new MutationObserver(() => {
                    const tier = document.querySelector('#fjord-quality'), effects = document.querySelector('#fjord-effects');
                    if (!tier || !effects) return;
                    tier.value = quality;
                    effects.value = 'off';
                    observer.disconnect();
                });
                observer.observe(document, { childList: true, subtree: true });
            }, { json: JSON.stringify(fixture), quality });
            console.log('TIMING OPEN', quality);
            await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5197') + '/fjord-play',
                { waitUntil: 'domcontentloaded', timeout: 240000 });
            await page.waitForFunction(() => window.__fjordAudit?.golden && document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
            await page.addStyleTag({ content: '#fjord-management, #fjord-management-toggle, #fjord-selection-leaders, #fjord-selection-labels, #fjord-production-labels { visibility:hidden!important }' });
            const camera = observations.cases.find(entry => entry.fixture === fixtureName && entry.quality === quality)
                .views.find(view => view.id === (summitStudy ? 'summit' : 'cliff')).variants[0].camera;
            await page.evaluate(async ({ quality, summitStudy }) => {
                if (summitStudy) {
                    const overlay = window.__fjordAudit.references.scene.getObjectByName('Clan discovery fog');
                    if (overlay) overlay.visible = false;
                }
                const installer = summitStudy
                    ? (await import('/scripts/qa/fjord-summit-snow-study-browser.mjs')).installSummitSnowStudy
                    : (await import('/scripts/qa/fjord-rock-snow-study-browser.mjs')).installRockSnowStudy;
                window.__rockSnowStudy = await installer(window.__fjordAudit, quality);
            }, { quality, summitStudy });
            let invariant;
            for (let round = 1; round <= 3; round++) {
                for (const mode of round % 2 ? ['current', 'candidate'] : ['candidate', 'current']) {
                    await page.evaluate(mode => window.__rockSnowStudy.select(mode), mode);
                    const state = await page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), camera);
                    const compare = { state: state.canonicalJSON, blueprint: state.blueprintJSON,
                        camera: state.camera, actors: state.actors, lighting: state.lighting };
                    if (invariant) assert.deepEqual(compare, invariant);
                    else invariant = compare;
                    const timing = await page.evaluate(async () => {
                        const refs = window.__fjordAudit.references;
                        window.__fjordAudit.golden.frozen = false;
                        const frames = duration => new Promise(resolve => {
                            let previous;
                            const intervals = [], start = performance.now();
                            const frame = time => {
                                if (previous !== undefined) intervals.push(time - previous);
                                previous = time;
                                if (time - start >= duration) resolve(intervals);
                                else requestAnimationFrame(frame);
                            };
                            requestAnimationFrame(frame);
                        });
                        await frames(3000);
                        const intervals = await frames(8000);
                        window.__fjordAudit.golden.frozen = true;
                        const gl = refs.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
                        return { intervals, width: refs.renderer.domElement.width, height: refs.renderer.domElement.height,
                            hardware: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'Unavailable',
                            browser: navigator.userAgent };
                    });
                    assert.equal(timing.width, state.renderer.width);
                    assert.equal(timing.height, state.renderer.height);
                    entry.samples.push({ round, mode, ...timing,
                        median: quantile(timing.intervals, .5), p95: quantile(timing.intervals, .95) });
                    console.log('TIMING', quality, round, mode, entry.samples.at(-1).median, entry.samples.at(-1).p95);
                    await save();
                }
            }
            entry.summary = {};
            for (const mode of ['current', 'candidate']) {
                const values = entry.samples.filter(sample => sample.mode === mode).flatMap(sample => sample.intervals);
                entry.summary[mode] = { frames: values.length, median: quantile(values, .5), p95: quantile(values, .95) };
            }
            entry.regression = Object.fromEntries(['median', 'p95'].map(metric =>
                [metric, entry.summary.candidate[metric] / entry.summary.current[metric] - 1]));
            entry.withinBudget = Object.values(entry.regression).every(value => value <= result.regressionBudget);
        } finally { await page.close(); }
    }
    assert.deepEqual(result.errors, []);
    result.status = result.timings.every(entry => entry.withinBudget) ? 'PASS' : 'REVIEW';
} catch (error) {
    result.status = 'FAIL';
    result.failure = String(error);
    throw error;
} finally {
    await save();
    await browser.close();
}
console.log('Cadence measurement:', result.status);
