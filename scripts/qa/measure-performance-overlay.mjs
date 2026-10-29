import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { loadDOMSource } from '../../tests/load-dom-source.mjs';

// Public DOM/Core contracts only. This measures instrumentation work in Node/jsdom,
// not a GPU, browser layout, physical frame cadence, or iPhone performance acceptance.
const output = resolve(process.argv[2] ?? 'scratch/performance-overlay/headless.json');
const dom = new JSDOM('<main></main>', { url: 'http://lan.invalid/fjord-play', pretendToBeVisual: true });
for (const name of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'AbortController'])
    globalThis[name] = name === 'window' ? dom.window : dom.window[name];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const { PlaytestPerformance } = loadDOMSource('../src/fjord-play/PlaytestPerformance.ts');
const { GameplaySession } = loadDOMSource('../src/gameplay-lab/GameplaySession.ts');
const sha = value => createHash('sha256').update(value).digest('hex');
const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], worstMs: sorted.at(-1) };
};
const fixtures = ['summer-32', 'developed-810'];
const fixtureHashes = {}, rows = [], expected = new Map();
try {
    for (const fixture of fixtures) {
        const file = `docs/qa/fjord-runtime-performance/fixtures/${fixture}.json`;
        const original = readFileSync(file);
        fixtureHashes[file] = sha(original);
        const text = JSON.stringify(JSON.parse(original).fjord.campaign);
        for (const mode of ['Running', 'Paused']) {
            for (const view of ['none', 'off', 'compact', 'details', 'details', 'compact', 'off', 'none']) {
                const session = new GameplaySession(1);
                session.loadJSON(text);
                session.setRunning(mode === 'Running');
                let now = 0, update, timers = 0, highTimers = 0;
                global.gc?.();
                const heapBefore = process.memoryUsage().heapUsed;
                const init = performance.now();
                const overlay = view === 'none' ? undefined : new PlaytestPerformance({ now: () => now,
                    storage: { getItem: () => null, setItem() {} }, schedule: callback => {
                        update = callback;
                        highTimers = Math.max(highTimers, ++timers);
                        return () => { update = undefined; timers--; };
                    } });
                const initMs = performance.now() - init;
                overlay?.configure(view);
                overlay?.setMode(mode);
                const input = session.readSnapshot();
                overlay?.context({ seed: input.seed, winter: input.time.winter, tick: input.time.tick,
                    pace: session.minutesPerWinter, quality: 'low', effects: 'low',
                    residents: Object.values(input.personas).filter(person => person.deathWinter === null).length });
                const hook = [], sampled = [];
                const ticks = () => {
                    const state = session.readSnapshot();
                    return state.time.winter * state.ticksPerWinter + state.time.tick;
                };
                for (let frame = 0; frame < 3600; frame++) {
                    // Synthetic timestamps only drive bounded aggregate windows. They are
                    // never exported as measured browser FPS or a real render workload.
                    now = frame * (1000 / 60);
                    if (frame % 30 === 0 && mode === 'Running') {
                        if (overlay) overlay.core(ticks, () => session.elapse(500));
                        else session.elapse(500);
                    }
                    const started = performance.now();
                    overlay?.frame(now, 0);
                    if (frame % 30 === 0) {
                        update?.();
                        sampled.push(performance.now() - started);
                    } else hook.push(performance.now() - started);
                }
                const reportBytes = overlay ? Buffer.byteLength(overlay.exportJSON()) : 0;
                assert.ok(reportBytes <= 128 * 1024);
                const coreHash = sha(session.saveJSON());
                const key = fixture + ':' + mode;
                if (!expected.has(key)) expected.set(key, coreHash);
                assert.equal(coreHash, expected.get(key), 'All arms retain exact real Core/RNG/history');
                overlay?.dispose();
                assert.equal(timers, 0);
                global.gc?.();
                rows.push({ fixture, mode, view, initMs, frameHook: stats(hook), sampledHookAndDOM: stats(sampled),
                    nodeHeapDeltaAfterDisposeBytes: process.memoryUsage().heapUsed - heapBefore,
                    highTimers, timersAfterDispose: timers, reportBytes, coreHash });
            }
        }
    }
    const files = [
        'src/fjord-play/PerformanceMeasurements.ts', 'src/fjord-play/PerformanceGpuTimer.ts',
        'src/fjord-play/PlaytestPerformance.ts', 'src/fjord-play/PerformanceRendererInfo.ts',
        'src/fjord-play/performance-overlay.css',
        'src/fjord-play/FjordEntry.ts', 'src/fjord-play/FjordHeader.ts', 'src/fjord-play/FjordPlay.ts',
        'src/fjord-play/FjordScene.ts', 'src/fjord-play/FjordModels.ts', 'src/fjord-play/FjordEntities.ts',
        'src/characters/CharacterPreparation.ts', 'src/characters/ResidentPortraitStudio.ts',
        'src/wildlife/WildlifeLayer.ts', 'scripts/qa/measure-performance-overlay.mjs',
    ];
    const report = { version: 1, base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        node: process.version, recordedUtc: new Date().toISOString(),
        environment: 'Node/jsdom; no browser, layout engine, WebGL or recorder controlled by this harness',
        sourceHashes: Object.fromEntries(files.map(file => [file, sha(readFileSync(file))])), fixtureHashes,
        protocol: { inputFramesPerArm: 3600, syntheticCadenceHz: 60, DOMUpdatesHz: 2,
            note: 'Synthetic cadence exercises aggregation only. Timing values measure real host JS work.',
            realGameFrameRegressionPercent: null, physicalDeviceAcceptance: 'not tested' }, rows };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output, arms: rows.length, exactCoreCohorts: expected.size,
        worstSampledHookP95Ms: Math.max(...rows.map(row => row.sampledHookAndDOM.p95Ms)),
        physicalDeviceAcceptance: 'not tested' }));
} finally { dom.window.close(); }
