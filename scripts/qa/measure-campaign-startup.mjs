import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual, parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
    'baseline-origin': { type: 'string', default: 'http://127.0.0.1:5206' },
    'candidate-origin': { type: 'string', default: 'http://127.0.0.1:5207' },
    'baseline-commit': { type: 'string' },
    'candidate-commit': { type: 'string' },
    'allow-dirty-candidate': { type: 'boolean', default: false },
    chrome: { type: 'string' },
    fixture: { type: 'string' },
    output: { type: 'string', default: 'scratch/campaign-startup' },
    'skip-export': { type: 'boolean', default: false },
    'two-leg': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
} });

if (values.help) {
    console.log(`Usage: node scripts/qa/measure-campaign-startup.mjs [options]
  --baseline-origin URL       Built baseline (default http://127.0.0.1:5206)
  --candidate-origin URL      Built candidate (default http://127.0.0.1:5207)
  --baseline-commit SHA       Require this exact baseline source commit
  --candidate-commit SHA      Require this exact candidate source commit
  --fixture PATH              Ordinary paused campaign export; otherwise download
                              /qa/field-campaign.json from the baseline once
  --output PATH               Evidence directory (default scratch/campaign-startup)
  --chrome PATH               Browser executable; Windows defaults to installed
                              Chrome, other platforms to Playwright Chromium
  --two-leg                   Run A/B instead of the default bounded A/B/A
  --skip-export               Explicitly skip the candidate public Core export
  --allow-dirty-candidate     Record and permit a dirty candidate only
  --help                      Show usage without loading optional dependencies

Set PILLAGERS_PLAYWRIGHT_MODULE to an installed Playwright module directory, or
install 'playwright' in the project. This runner does not install dependencies.
Serve both immutable builds with serve-startup-build.mjs before starting.

Protocol: one browser launch, fresh contexts, HTTP cache cleared and disabled,
1366x768/DPR1, normal motion, low-quality default, settled entry animation, the
same paused save, and all 10 native residents. No CPU profiler or interception.
The candidate public export must match the input after the current public Core
Fjord compatibility commands. Raw differences and all request failures remain
in the report. There is no loading-time threshold or performance pass gate.
OS/graphics-driver caches are not reset; A/B/A is not order-isolated. Do not
claim physical-phone, network or total-load benefits from these timings alone.`);
    process.exit(0);
}

assert.ok(values['baseline-commit'], 'Pin the expected baseline commit.');
assert.ok(values['candidate-commit'], 'Pin the expected candidate commit.');
const output = resolve(values.output);
const baselineOrigin = new URL(values['baseline-origin']).origin;
const candidateOrigin = new URL(values['candidate-origin']).origin;
const chrome = values.chrome ?? (process.platform === 'win32'
    ? 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
    : undefined);
const schedule = [
    { name: 'baseline-first', role: 'baseline', origin: baselineOrigin,
        commit: values['baseline-commit'] },
    { name: 'candidate', role: 'candidate', origin: candidateOrigin,
        commit: values['candidate-commit'] },
    ...(!values['two-leg'] ? [{ name: 'baseline-repeat', role: 'baseline',
        origin: baselineOrigin, commit: values['baseline-commit'] }] : []),
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const compatibilityCommands = [
    { type: 'UseSeasonalWeatherProduction' },
    { type: 'UseCulturalOccasions' },
];

// Optional dependencies are resolved only after --help and argument validation.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PILLAGERS_PLAYWRIGHT_MODULE ?? 'playwright');
const { loadTypeScript } = await import('../load-typescript.mjs');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const fixtureBytes = values.fixture ? await readFile(values.fixture) : await downloadFixture();
const fixtureCore = campaignFromBytes(fixtureBytes);
const normalizedFixtureCore = compatibilityCommands.reduce(
    (state, command) => core.applyCommand(state, command), fixtureCore,
);
const report = {
    schemaVersion: 1,
    kind: 'Matched campaign startup observations',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    fixture: { sha256: sha256(fixtureBytes), bytes: fixtureBytes.length,
        facts: invariantFacts(fixtureCore) },
    protocol: {
        viewport: [1366, 768], deviceScaleFactor: 1, reducedMotion: 'no-preference',
        httpCache: 'cleared and disabled with CDP in each fresh context',
        browserLaunches: 1, cpuProfiler: false, interception: false,
        expectedNativeResidents: 10, order: schedule.map(leg => leg.name),
        chromeExecutable: chrome ?? 'bundled Playwright Chromium',
        coreCompatibilityCommands: compatibilityCommands,
        candidatePublicExport: values['skip-export'] ? 'explicitly skipped' : 'required',
    },
    limits: [
        `${schedule.length} fixed-order observations; OS/graphics-driver caches and background activity are not reset.`,
        'Source playable/first-frame marks are authoritative; DOM observers can be delayed by long tasks.',
        'Window resource/long-task totals include entry and import, not all worker/GPU/decode work. Nested spans overlap.',
        'No physical-phone or remote-network claim. The actual WebGL renderer is recorded for every leg.',
        'No performance threshold is asserted. Software fallbacks and unfavorable results must remain in the evidence.',
    ],
    runs: [],
};
let browser;
await mkdir(output, { recursive: true });

async function downloadFixture() {
    const response = await fetch(baselineOrigin + '/qa/field-campaign.json');
    assert.equal(response.status, 200, 'The baseline must serve the ordinary QA save.');
    return Buffer.from(await response.arrayBuffer());
}

function campaignFromBytes(bytes) {
    const bridge = JSON.parse(bytes);
    assert.ok([1, 2].includes(bridge.bridgeVersion), 'Use an ordinary player campaign export.');
    return typeof bridge.campaign === 'string' ? JSON.parse(bridge.campaign) : bridge.campaign;
}

function invariantFacts(state) {
    return {
        time: state.time, rngState: state.rngState, stocks: state.stocks,
        specialistStocks: state.specialistStocks, stored: state.smithery.stored,
        assignments: state.smithery.assignments, targets: state.smithery.targets,
    };
}

function differences(input, exported, path = '') {
    if (isDeepStrictEqual(input, exported)) return [];
    if (input && exported && typeof input === 'object' && typeof exported === 'object') {
        return [...new Set([...Object.keys(input), ...Object.keys(exported)])].flatMap(key =>
            differences(input[key], exported[key], `${path}/${key}`));
    }
    return [{ path, inputPresent: input !== undefined, exportedPresent: exported !== undefined,
        input, exported }];
}

// This function runs in the page. It reads public DOM datasets without patching game code.
function installSensor() {
    performance.setResourceTimingBufferSize(2500);
    const result = window.__matchedLoad = {
        resources: [], longTasks: [], progress: [], milestones: {}, timeOrigin: performance.timeOrigin,
    };
    for (const type of ['resource', 'longtask']) {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
        const observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (type === 'resource' && !/^(blob|data):/.test(entry.name)
                    && result.resources.length < 2500) result.resources.push(entry.toJSON());
                if (type === 'longtask' && result.longTasks.length < 1500) {
                    result.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
                }
            }
        });
        observer.observe({ type, buffered: true });
    }
    document.addEventListener('click', event => {
        const button = event.target.closest?.('button');
        if (button && /^Continue campaign/.test(button.textContent.trim())) {
            result.continueAt = performance.now();
        }
    }, true);
    let signature = '';
    setInterval(() => {
        if (!result.continueAt) return;
        const now = performance.now();
        const canvas = document.querySelector('#fjord-canvas');
        const overlay = document.querySelector('#island-loading');
        const next = JSON.stringify([
            document.querySelector('#island-loading-status')?.textContent,
            overlay?.dataset.percent, canvas?.dataset.ready,
        ]);
        if (signature !== next) {
            result.progress.push({ at: now, value: JSON.parse(next) });
            signature = next;
        }
        if (canvas?.dataset.ready === 'true' && !overlay && !result.milestones.interactiveAt) {
            result.milestones.interactiveAt = now;
        }
        try {
            const actors = JSON.parse(canvas?.dataset.rendered ?? '[]')
                .filter(actor => actor.kind === 'persona' && !actor.placeholder);
            if (actors.length && !result.milestones.firstNativeAt) result.milestones.firstNativeAt = now;
            if (actors.length === 10 && !result.milestones.allTenNativeAt) {
                result.milestones.allTenNativeAt = now;
            }
        } catch {
            // A dataset may be absent while the public scene is still being constructed.
        }
    }, 500);
}

function readObservation() {
    const canvas = document.querySelector('#fjord-canvas');
    const parse = value => {
        try { return JSON.parse(value ?? 'null'); } catch { return null; }
    };
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
        ...window.__matchedLoad,
        loadDiagnostics: parse(canvas?.dataset.loadDiagnostics),
        loading: parse(canvas?.dataset.loading), actors: parse(canvas?.dataset.rendered),
        camera: parse(canvas?.dataset.camera), time: parse(canvas?.dataset.time),
        modelTextures: canvas?.dataset.modelTextures,
        terrainStyle: parse(canvas?.dataset.terrainStyle),
        webgl: {
            vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
            renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        },
        ui: {
            navigation: document.querySelector('#fjord-navigation')?.textContent.replace(/\s+/g, ' ').trim(),
            clock: document.querySelector('#fjord-run')?.textContent.trim(),
            quality: document.querySelector('#fjord-quality')?.value,
            effects: document.querySelector('#fjord-effects')?.value,
        },
        visibleText: document.body.innerText,
    };
}

async function activate(locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: 45000 });
}

async function settledEntry(page) {
    const ready = await page.waitForFunction(() => {
        if (document.querySelector('.entry-motion-layer[data-ready="true"]')) {
            return 'animated backdrop ready';
        }
        const text = document.querySelector('[data-motion-status]')?.textContent ?? '';
        return /Still background selected|Animation unavailable|Desktop only/.test(text) ? text : false;
    }, undefined, { polling: 100, timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    return ready.jsonValue();
}

async function exportPublicCampaign(page, name) {
    const menu = page.locator('#fjord-menu');
    if (!await menu.evaluate(element => element.open)) {
        await activate(page.locator('#fjord-menu > summary'));
    }
    const section = page.locator('#fjord-menu details[data-menu-section]')
        .filter({ has: page.locator('#fjord-export') });
    assert.equal(await section.count(), 1);
    if (!await section.evaluate(element => element.open)) {
        await activate(section.locator(':scope > summary'));
    }
    const pending = page.waitForEvent('download');
    await activate(page.locator('#fjord-export'));
    const download = await pending;
    assert.equal(await download.failure(), null);
    const path = join(output, name + '-campaign.json');
    await download.saveAs(path);
    const bytes = await readFile(path);
    return { path, sha256: sha256(bytes), core: campaignFromBytes(bytes) };
}

function summarize(observation) {
    return {
        sourcePlayableMs: observation.loadDiagnostics.playableMs,
        sourceFirstFrameMs: observation.loadDiagnostics.firstFrameMs,
        observedInteractiveMs: observation.milestones.interactiveAt - observation.continueAt,
        allTenNativeMs: observation.milestones.allTenNativeAt - observation.continueAt,
        stages: observation.loadDiagnostics.timeline,
        transferBytes: observation.resources.reduce((sum, entry) => sum + entry.transferSize, 0),
        resources: observation.resources.length, longTaskCount: observation.longTasks.length,
        longTaskTotalMs: observation.longTasks.reduce((sum, entry) => sum + entry.duration, 0),
        actualRenderer: observation.webgl.renderer,
        softwareRenderer: /SwiftShader|SwANGLE|llvmpipe|software|WARP/i
            .test(observation.webgl.renderer ?? ''),
    };
}

async function saveReport() {
    await writeFile(join(output, 'matched-loading.json'), JSON.stringify(report, null, 2) + '\n');
}

async function measureLeg(leg) {
    const run = {
        ...leg, expectedCommit: leg.commit, startedAt: new Date().toISOString(),
        requests: [], responses: [], failedRequests: [], httpErrors: [], consoleErrors: [], pageErrors: [],
    };
    report.runs.push(run);
    const buildResponse = await fetch(leg.origin + '/build-info.json');
    assert.equal(buildResponse.status, 200, 'The built server must expose build-info.json.');
    run.build = await buildResponse.json();
    assert.equal(run.build.source.commit, leg.commit);
    if (leg.role === 'baseline' || !values['allow-dirty-candidate']) {
        assert.equal(run.build.source.dirty, false);
    }
    const context = await browser.newContext({
        viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1,
        reducedMotion: 'no-preference', acceptDownloads: true,
    });
    await context.addInitScript(installSensor);
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    let closing = false;
    page.on('request', request => run.requests.push({ url: request.url(), at: Date.now() }));
    page.on('response', response => {
        if (response.status() >= 400) run.httpErrors.push({ url: response.url(), status: response.status() });
    });
    page.on('console', message => {
        if (message.type() === 'error') run.consoleErrors.push(message.text());
    });
    page.on('pageerror', error => run.pageErrors.push(String(error)));
    page.on('requestfailed', request => run.failedRequests.push({
        url: request.url(), reason: request.failure()?.errorText,
        at: new Date().toISOString(), duringOwnedCleanup: closing,
    }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    cdp.on('Network.responseReceived', event => run.responses.push({
        url: event.response.url, status: event.response.status,
        fromDiskCache: event.response.fromDiskCache ?? false, protocol: event.response.protocol,
    }));
    try {
        console.log('START ' + leg.name + ' ' + run.startedAt);
        await page.goto(leg.origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        run.initialEntry = await settledEntry(page);
        await activate(page.getByRole('button', { name: /^Load game/ }));
        await page.locator('input[type="file"]:visible').setInputFiles({
            name: 'field-campaign.json', mimeType: 'application/json', buffer: fixtureBytes,
        });
        const start = page.getByRole('button', { name: /^Continue campaign/ });
        await start.waitFor({ state: 'visible' });
        run.beforeContinueEntry = await settledEntry(page);
        run.beforeContinueMetrics = (await cdp.send('Performance.getMetrics')).metrics;
        await activate(start);
        await page.waitForFunction(() => {
            if (/Campaign not opened|Graphics interrupted/.test(document.body.textContent)) return 'failed';
            const value = window.__matchedLoad;
            return value?.milestones.interactiveAt && value?.milestones.allTenNativeAt ? 'ready' : false;
        }, undefined, { polling: 500, timeout: 360000 });
        run.observation = await page.evaluate(readObservation);
        const observation = run.observation;
        assert.ok(observation.milestones.interactiveAt && observation.milestones.allTenNativeAt,
            'Both actual readiness marks are required.');
        assert.equal(observation.loadDiagnostics.outcome, 'playable');
        assert.equal(observation.ui.quality, 'low');
        assert.match(observation.ui.clock, /Paused/);
        run.afterReadyMetrics = (await cdp.send('Performance.getMetrics')).metrics;
        run.summary = summarize(observation);
        console.log('READY ' + leg.name + ' ' + JSON.stringify({ ...run.summary, stages: undefined }));
        if (!values['skip-export'] && leg.role === 'candidate') {
            const saved = await exportPublicCampaign(page, leg.name);
            run.exportedCore = saved.core;
            run.publicExport = {
                path: saved.path, sha256: saved.sha256, facts: invariantFacts(saved.core),
                matchesInputFacts: isDeepStrictEqual(invariantFacts(saved.core), invariantFacts(fixtureCore)),
                rawInputExact: isDeepStrictEqual(saved.core, fixtureCore),
                rawInputDifferences: differences(fixtureCore, saved.core),
                compatibilityCommands,
                normalizedInputExact: isDeepStrictEqual(saved.core, normalizedFixtureCore),
                normalizedInputDifferences: differences(normalizedFixtureCore, saved.core),
            };
            assert.equal(run.publicExport.matchesInputFacts, true, 'Loading must preserve Core facts.');
            assert.deepEqual(saved.core, normalizedFixtureCore,
                'Public export must exactly match input after the existing Fjord compatibility commands.');
        }
        await page.screenshot({ path: join(output, leg.name + '-ready.png') });
        assert.deepEqual(run.pageErrors, []);
        assert.deepEqual(run.consoleErrors, []);
        assert.deepEqual(run.httpErrors, []);
    } catch (error) {
        run.failure = { message: String(error), stack: error.stack };
        process.exitCode = 1;
        run.partial = await page.evaluate(readObservation).catch(() => null);
        await page.screenshot({ path: join(output, leg.name + '-failure.png') }).catch(() => {});
    } finally {
        closing = true;
        await context.close().catch(() => {});
        run.finishedAt = new Date().toISOString();
        await saveReport();
    }
}

function compareObservations(baseline, candidate) {
    if (!baseline?.observation || !candidate?.observation) return { observationsAvailable: false };
    const equipment = run => run.observation.actors
        .filter(actor => actor.kind === 'persona' && !actor.placeholder)
        .map(actor => ({ id: actor.id, clothing: actor.clothing, equipment: actor.equipment }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const camera = run => [
        ...(run.observation.camera?.world ?? []), ...(run.observation.camera?.projection ?? []),
    ];
    const baselineCamera = camera(baseline);
    const candidateCamera = camera(candidate);
    const sameShape = baselineCamera.length > 0 && baselineCamera.length === candidateCamera.length;
    return {
        observationsAvailable: true,
        nativeAppearance: isDeepStrictEqual(equipment(baseline), equipment(candidate)),
        cameraMatrices: sameShape && isDeepStrictEqual(baselineCamera, candidateCamera),
        maximumCameraElementDelta: sameShape ? Math.max(0, ...baselineCamera.map((value, index) =>
            Math.abs(value - candidateCamera[index]))) : null,
        ui: isDeepStrictEqual(baseline.observation.ui, candidate.observation.ui),
    };
}

try {
    browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--mute-audio'] });
    report.browserVersion = browser.version();
    const browserCDP = await browser.newBrowserCDPSession();
    report.systemInfo = await browserCDP.send('SystemInfo.getInfo');
    const command = await browserCDP.send('Browser.getBrowserCommandLine')
        .catch(error => ({ unsupported: String(error) }));
    report.launchFlags = command.arguments?.map(argument => argument.startsWith('--user-data-dir=')
        ? '--user-data-dir=<owned-temporary-profile>' : argument) ?? command;
    report.systemGpuScope = /SwiftShader|SwANGLE|llvmpipe|software|WARP/i
        .test(JSON.stringify(report.systemInfo.gpu.devices))
        ? 'software reported' : 'physical device reported; confirm each actual WebGL renderer';
    for (const leg of schedule) await measureLeg(leg);
    const [baseline, candidate, repeat] = report.runs;
    report.parity = {
        ...compareObservations(baseline, candidate),
        candidateExportMatchesInputFacts: candidate?.publicExport?.matchesInputFacts ?? null,
        candidateCompleteCoreMatchesInput: candidate?.publicExport?.rawInputExact ?? null,
        candidateCompleteCoreMatchesNormalizedInput: candidate?.publicExport?.normalizedInputExact ?? null,
    };
    if (repeat) {
        report.baselineRepeat = {
            sourcePlayableMs: repeat.summary?.sourcePlayableMs,
            ...compareObservations(baseline, repeat),
        };
    }
    report.status = report.runs.some(run => run.failure) ? 'FAILED' : 'OBSERVED';
} catch (error) {
    report.status = 'FAILED';
    report.failure = { message: String(error), stack: error.stack };
    process.exitCode = 1;
    console.error(error);
} finally {
    await browser?.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    await saveReport();
    console.log('DONE ' + report.status + ' ' + output);
}
