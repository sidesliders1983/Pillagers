import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installThreeSpikeProbe } from './three-r187-probe.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const options = Object.fromEntries(process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
}));
const origin = options.origin || 'http://127.0.0.1:5207';
const arm = options.arm || 'B';
const fixture = options.fixture || 'settlement-expedition.json';
const seconds = Number(options.seconds || 60);
const warmup = Number(options.warmup || 15);
const output = path.resolve(options.output || `scratch/three-r187-323/pilot-${arm}`);
const sourceRoot = path.resolve(options.source || (arm === 'A' ? '../three-r187-spike-323-baseline' : '.'));
const sourceCommit = execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const fixtureDirectory = path.resolve('docs/qa/three-r187-323/fixtures');
const fixtureText = await readFile(path.join(fixtureDirectory, fixture), 'utf8');
const protocolText = await readFile('docs/qa/three-r187-323/protocol.json', 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');
await mkdir(output, { recursive: true });
const temporary = path.resolve('scratch/three-r187-323/tmp');
await mkdir(temporary, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = temporary;
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    executablePath: process.env.QA_CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    args: ['--enable-precise-memory-info'] });
const engineVersion = JSON.parse(await readFile(path.join(sourceRoot, 'node_modules/three/package.json'), 'utf8')).version;
const report = { schemaVersion: 1, arm, fixture, origin, sourceRoot, sourceCommit, engineVersion,
    sourceLockSHA256: sha256(await readFile(path.join(sourceRoot, 'pnpm-lock.yaml'))),
    compiledBuildInfo: JSON.parse(await readFile(path.join(sourceRoot, 'dist/build-info.json'), 'utf8')),
    startedUtc: new Date().toISOString(),
    fixtureSHA256: sha256(fixtureText), protocolSHA256: sha256(protocolText),
    settings: { viewport: [1440, 900], deviceScaleFactor: 1, warmupSeconds: warmup, sampleSeconds: seconds },
    browser: browser.version(), headless: true, thermalState: 'not measurable on this workstation',
    errors: [], console: [], diagnostics: [], lifecycle: [], status: 'running' };
let context;
try {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(installThreeSpikeProbe);
    await context.addInitScript(text => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', text);
        localStorage.setItem('fjordside.entry-motion', 'off');
    }, fixtureText);
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push({ at: Date.now(), message: error.message }));
    page.on('console', message => {
        if (['warning', 'error'].includes(message.type()) && report.console.length < 256)
            report.console.push({ type: message.type(), text: message.text().slice(0, 1500) });
    });
    page.on('download', download => { void download.delete().catch(() => {}); });
    page.on('dialog', dialog => { void dialog.accept(); });
    const started = performance.now();
    await page.goto(origin + '/fjord-play?debugPerf=1&debugLifecycle=1', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-entry="continue"]').click();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    report.loadToReadyMs = performance.now() - started;
    report.loading = await page.locator('#fjord-canvas').getAttribute('data-load-diagnostics').then(JSON.parse);
    report.hardware = await page.evaluate(() => {
        const canvas = document.querySelector('#fjord-canvas');
        const gl = canvas.getContext('webgl2');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { userAgent: navigator.userAgent, platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory ?? null,
            viewport: [innerWidth, innerHeight], devicePixelRatio,
            vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
            webgl: gl.getParameter(gl.VERSION), visibility: document.visibilityState };
    });
    const diagnostics = () => page.evaluate(() => {
        document.querySelector('[data-perf-export]').click();
        return JSON.parse(document.querySelector('#performance-overlay textarea').value);
    });
    await page.waitForTimeout(warmup * 1000);
    await page.screenshot({ path: path.join(output, 'before.png') });
    report.before = await diagnostics();
    report.beforeScene = await page.locator('#fjord-canvas').evaluate(canvas => ({ ...canvas.dataset }));
    await page.evaluate(() => window.fjordSpikeProbe.start());
    if (options.running === 'true') {
        report.simulation = await page.evaluate(ticks => {
            const panel = document.querySelector('#fjord-diagnostics');
            const clock = () => {
                const match = panel.textContent.match(/Canonical time: Winter (\d+) · tick (\d+)\/(\d+)/);
                if (!match) throw new Error('Canonical clock diagnostics missing.');
                return { winter: Number(match[1]), tick: Number(match[2]), ticksPerWinter: Number(match[3]),
                    absolute: Number(match[1]) * Number(match[3]) + Number(match[2]) };
            };
            const start = clock(), target = start.absolute + ticks;
            window.fjordSpikeStop = undefined;
            const observer = new MutationObserver(() => {
                const end = clock();
                if (end.absolute < target) return;
                const exportButton = document.querySelector('[data-perf-export]');
                exportButton.click();
                const finalDiagnostic = JSON.parse(document.querySelector('#performance-overlay textarea').value);
                document.querySelector('#fjord-run').click();
                window.fjordSpikeProbe.stop();
                window.fjordSpikeStop = { start, end, target, finalDiagnostic };
                observer.disconnect();
            });
            observer.observe(panel, { childList: true });
            return { start, target, requestedTicks: ticks };
        }, Number(options.ticks || 1000));
        await page.locator('#fjord-run').click();
    }
    const sampleStarted = performance.now();
    let nextSample = 5000;
    while (performance.now() - sampleStarted < (options.running === 'true' ? 900000 : seconds * 1000)) {
        if (options.running === 'true' && await page.evaluate(() => !!window.fjordSpikeStop)) break;
        await page.waitForTimeout(options.running === 'true' ? 1000 : Math.max(0, Math.min(1000, seconds * 1000 - (performance.now() - sampleStarted))));
        const elapsed = performance.now() - sampleStarted;
        if (elapsed >= nextSample) {
            report.diagnostics.push({ atMs: elapsed, value: await diagnostics() });
            nextSample += 5000;
            await writeFile(path.join(output, 'progress.json'), JSON.stringify({ arm, fixture, elapsedMs: elapsed,
                sampleCount: report.diagnostics.length, errors: report.errors.length }));
            console.log(JSON.stringify({ arm, elapsedSeconds: Math.round(elapsed / 1000) }));
        }
    }
    if (options.running === 'true') {
        const stopped = await page.evaluate(() => window.fjordSpikeStop);
        assert.ok(stopped, 'Sustained run reached its canonical duration within the resource limit.');
        assert.equal(stopped.end.absolute, stopped.target, 'Both arms end after exactly the same canonical ticks.');
        report.simulation = { ...report.simulation, end: stopped.end };
        report.diagnostics.push({ atMs: performance.now() - sampleStarted, value: stopped.finalDiagnostic });
    } else await page.evaluate(() => window.fjordSpikeProbe.stop());
    report.raw = await page.evaluate(() => window.fjordSpikeProbe.snapshot());
    report.after = await diagnostics();
    report.afterScene = await page.locator('#fjord-canvas').evaluate(canvas => ({ ...canvas.dataset }));
    await page.screenshot({ path: path.join(output, 'after.png') });
    const intervals = report.raw.frames.map(frame => frame[1]).sort((a, b) => a - b);
    const percentile = p => intervals[Math.ceil(intervals.length * p) - 1] ?? null;
    report.summary = { frames: intervals.length, meanFPS: intervals.length / (report.raw.elapsedMs / 1000),
        frameP50Ms: percentile(.5), frameP95Ms: percentile(.95), frameP99Ms: percentile(.99),
        worstFrameMs: intervals.at(-1), longTasks: report.raw.longTasks.length,
        longTaskTotalMs: report.raw.longTasks.reduce((total, task) => total + task.duration, 0),
        droppedSamples: report.raw.dropped };
    assert.deepEqual(report.errors, [], 'No browser runtime exceptions.');
    assert.equal(report.raw.dropped, 0, 'Bounded observer retained every sample.');
    report.status = 'complete';
} catch (error) {
    report.status = 'technical-failure';
    report.failure = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.finishedUtc = new Date().toISOString();
    await writeFile(path.join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output, status: report.status, summary: report.summary, failure: report.failure?.message }));
    await browser.close();
}
