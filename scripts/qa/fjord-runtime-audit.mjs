import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
let origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5190';
const variants = process.env.QA_VARIANTS ? JSON.parse(process.env.QA_VARIANTS) : [{ label: 'current', origin }];
const group = process.env.QA_GROUP || 'baseline';
const scenarioFilter = process.env.QA_FILTER ? JSON.parse(process.env.QA_FILTER) : null;
const repeatCount = Number(process.env.QA_REPEATS || 3);
const warmupMs = Number(process.env.QA_WARMUP_MS || 5000);
const sampleMs = Number(process.env.QA_SAMPLE_MS || 20000);
const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [], runs = [], fixtures = new Map();
await mkdir(output + '/profiles', { recursive: true });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const results = { group, assetEnvironment: process.env.QA_ASSET_VARIANT || 'Declared by the captured resource manifest', sourceCommit: process.env.QA_SOURCE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    variants, sourceMode: 'Vite development modules, QA-only bridge; native profiling only in scenarios with profile=true',
    origin, warmupMs, sampleMs, browserVersion: browser.version(), startedAt: new Date().toISOString(),
    fixtures: [], runs, errors };
const write = () => writeFile(output + '/' + group + '.json', JSON.stringify(results, null, 2) + '\n');
async function fixture(name) {
    if (fixtures.has(name)) return fixtures.get(name);
    const input = await readFile((process.env.QA_FIXTURES || output + '/fixtures') + '/' + name + '.json', 'utf8');
    const data = JSON.parse(input);
    // Match the current view explicitly: never let the loader auto-start during preparation.
    data.target = 'fjord'; data.pace.running = false;
    const json = JSON.stringify(data);
    results.fixtures.push({ name, sha256: sha256(input), loadedSha256: sha256(json) });
    fixtures.set(name, { json, state: data.fjord.campaign });
    return fixtures.get(name);
}
let scenarios;
if (process.env.QA_SCENARIOS) {
    scenarios = JSON.parse(process.env.QA_SCENARIOS);
} else if (group === 'baseline' || group === 'previous') {
    scenarios = ['summer-32', 'developed-810'].flatMap(fixture => [false, true].flatMap(running =>
        [false, true].map(cameraPath => ({ fixture, running, cameraPath }))));
} else if (group === 'previous-boundary') {
    scenarios = [{ fixture: 'boundary-810', running: true, minutes: 3 }];
} else if (group === 'diagnostics') {
    scenarios = ['snapshot-cache', 'projection-cache', 'persistence-off', 'motion', 'animation', 'ticks', 'sync', 'labels', 'diagnostics', 'shadows',
        'water', 'nature', 'actors', 'terrain', 'water-hidden', 'wind'].map(ablation => ({ fixture: 'developed-810', running: true, ablation }));
    scenarios.push(...['rain-810', 'snow-811'].flatMap(fixture => [false, true].map(running => ({ fixture, running }))),
        ...[false, true].map(running => ({ fixture: 'summer-17', running })),
        ...['low', 'standard'].map(quality => ({ fixture: 'summer-32', running: true, quality })),
        ...[false, true].map(running => ({ fixture: 'developed-810', running, mobile: true })),
        ...[1, 3, 5].map(minutes => ({ fixture: 'boundary-810', running: true, minutes })),
        { fixture: 'crowd-25', running: false }, { fixture: 'crowd-25', running: true },
        { fixture: 'developed-810', running: true, far: true },
        { fixture: 'developed-810', running: true, selected: true },
        { fixture: 'developed-810', running: true, allPasses: true },
        ...['off', 'low', 'normal'].map(effects => ({ fixture: 'summer-32', running: true,
            effects, weather: 'rain' })),
        { fixture: 'crowd-25', running: true, weather: 'snow', effects: 'normal' },
        ...['off', 'low', 'normal'].map(effects => ({ fixture: 'summer-32', running: true, fire: true, effects })),
        { fixture: 'summer-32', running: false, weather: 'snow', effects: 'normal' });
} else if (group === 'overhead') {
    scenarios = [false, true].flatMap(instrument => [false, true].map(gpu =>
        ({ fixture: 'developed-810', running: true, instrument, gpu })));
} else if (group === 'soak') {
    scenarios = [{ fixture: 'developed-810', running: true, soak: true }];
} else if (group === 'profiles') {
    scenarios = [false, true].map(running => ({ fixture: 'developed-810', running, profile: true }));
    scenarios.push({ fixture: 'boundary-810', running: true, minutes: 3, profile: true },
        { fixture: 'developed-810', running: true, selected: true, profile: true },
        { fixture: 'snow-811', running: false, freezeAfterWarmup: true, effects: 'normal', profile: true },
        { fixture: 'summer-32', running: false, freezeAfterWarmup: true, fire: true, effects: 'normal', profile: true },
        { fixture: 'summer-32', running: true, quality: 'standard', coldQuality: 'standard', profile: false });
} else throw Error('Unknown QA_GROUP: ' + group);
if (scenarioFilter) {
    const filters = Array.isArray(scenarioFilter) ? scenarioFilter : [scenarioFilter];
    scenarios = scenarios.filter(scenario => filters.some(filter =>
        Object.entries(filter).every(([key, value]) => scenario[key] === value)));
}
try {
    for (let repeat = 1; repeat <= repeatCount; repeat++) {
        // Reverse alternate trials to reduce order/thermal bias.
        for (const scenario of repeat % 2 ? scenarios : [...scenarios].reverse()) {
            for (const variant of repeat % 2 ? variants : [...variants].reverse()) {
            origin = variant.origin;
            const loaded = await fixture(scenario.fixture);

            const page = await context.newPage(); await page.setViewportSize(scenario.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
            page.setDefaultTimeout(180000);
            page.on('pageerror', error => errors.push({ scenario, error: error.message }));
            page.on('console', message => {
                if (message.type() === 'error') errors.push({ scenario, console: true, error: message.text() });
            });
            await page.addInitScript(({ json, coldQuality }) => {
                sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                if (coldQuality) {
                    const observer = new MutationObserver(() => {
                        const control = document.querySelector('#fjord-quality');
                        if (control) { control.value = coldQuality; observer.disconnect(); }
                    });
                    observer.observe(document, { childList: true, subtree: true });
                }
            }, { json: loaded.json, coldQuality: scenario.coldQuality });
            const cdp = await context.newCDPSession(page);
            await cdp.send('Performance.enable');
            try {
                await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
                await page.waitForFunction(() => window.__fjordAudit && document.querySelector('#fjord-canvas')?.dataset.ready);
                if (process.env.QA_ASSET_VARIANT === 'owner-prepared-houses') {
                    const placeholders = await page.evaluate(() => window.__fjordAudit.references.layer.describe()
                        .filter(entity => entity.placeholder).map(entity => entity.key));
                    assert.deepEqual(placeholders, [], 'Prepared-asset confirmation must use real entity models');
                }
                await page.evaluate(scenario => {
                    const audit = window.__fjordAudit, refs = audit.references;
                    refs.setPlayback(false);
                    const quality = document.querySelector('#fjord-quality');
                    quality.value = scenario.quality || 'low'; quality.dispatchEvent(new Event('change'));
                    const effects = document.querySelector('#fjord-effects');
                    effects.value = scenario.effects || 'low'; effects.dispatchEvent(new Event('change'));
                    refs.session.setMinutesPerWinter(scenario.minutes || 3);
                    audit.flags = { [scenario.ablation]: true, manualClock: Boolean(scenario.commands) };
                    // Artificial reuse experiments, restricted to this isolated page. Never shipped save policy.
                    if (scenario.ablation === 'snapshot-cache' || scenario.ablation === 'projection-cache') {
                        const command = refs.session.command.bind(refs.session);
                        let cached;
                        refs.session.command = (...args) => { cached = undefined; return command(...args); };
                        const object = scenario.ablation === 'snapshot-cache' ? refs.session : refs.campaign;
                        const method = scenario.ablation === 'snapshot-cache' ? 'snapshot' : 'project';
                        const original = object[method].bind(object);
                        object[method] = () => cached ??= original();
                    }
                    if (scenario.ablation === 'persistence-off') {
                        const staleCheckpoint = refs.shared.persist();
                        refs.shared.persist = () => staleCheckpoint;
                    }
                    if (scenario.ablation === 'shadows') refs.renderer.shadowMap.enabled = false;
                    if (scenario.ablation === 'terrain') refs.world.terrain.visible = false;
                    if (scenario.ablation === 'water-hidden') refs.world.root.traverse(node => {
                        if (node.material?.isShaderMaterial) node.visible = false;
                    });
                    if (scenario.selected) { refs.shared.select({ kind: 'persona', id: 'founder-1' }); refs.refresh(); }
                    if (scenario.fire) {
                        refs.campfireEffect.setLit = () => {}; refs.campfireEffect.lit = true;
                    }
                    if (scenario.allPasses) {
                        const renderer = refs.renderer, original = renderer.render.bind(renderer);
                        renderer.info.autoReset = false;
                        const gl = renderer.getContext();
                        renderer.auditDraws = {};
                        for (const name of ['useProgram', 'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
                            const call = gl[name].bind(gl);
                            gl[name] = (...args) => {
                                renderer.auditDraws[name] = (renderer.auditDraws[name] || 0) + 1;
                                return call(...args);
                            };
                        }
                        const shadow = renderer.shadowMap.render.bind(renderer.shadowMap);
                        renderer.shadowMap.render = (...args) => {
                            const before = renderer.info.render.calls;
                            const result = shadow(...args);
                            renderer.auditDraws.shadowDrawCalls = renderer.info.render.calls - before;
                            return result;
                        };
                        renderer.render = (...args) => {
                            renderer.auditDraws = {};
                            renderer.info.reset();
                            return original(...args);
                        };
                    }
                    if (scenario.ablation === 'water') refs.world.setMotion({ water: false, wind: true });
                    if (scenario.ablation === 'wind') refs.world.setMotion({ water: true, wind: false });
                    if (scenario.ablation === 'nature') refs.world.root.traverse(node => {
                        if (node.isInstancedMesh) node.visible = false;
                    });
                    if (scenario.ablation === 'actors') refs.layer.root.traverse(node => {
                        if (node.isSkinnedMesh) node.visible = false;
                    });
                    if (scenario.far) {
                        const focus = audit.baseFocus.clone().add({ x: 200, y: 0, z: 0 }), offset = audit.basePosition.clone().sub(audit.baseFocus);
                        refs.controller.setView({ position: focus.clone().add(offset).toArray(), target: focus.toArray() });
                    }
                    if (scenario.weather) {
                        const effect = refs.precipitationEffect;
                        effect.setWeather = () => {};
                        effect.precipitation = scenario.weather === 'rain' ? { rain: 1, snow: 0 } : { rain: 0, snow: 1 };
                        // This is a VFX ablation; calendar, canonical weather and save are unchanged.
                    }
                    refs.setPlayback((scenario.running || scenario.freezeAfterWarmup) && !scenario.fixture.startsWith('boundary'));
                }, scenario);
                await page.waitForTimeout(warmupMs);
                if (scenario.freezeAfterWarmup) await page.evaluate(() => window.__fjordAudit.references.setPlayback(false));
                const before = await page.evaluate(() => window.__fjordAudit.inspect());
                const metricsBefore = await cdp.send('Performance.getMetrics');
                if (scenario.profile) {
                    await cdp.send('Profiler.enable');
                    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
                    await cdp.send('Profiler.start');
                    if (!scenario.cpuOnly) await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,gpu',
                        transferMode: 'ReturnAsStream', options: 'sampling-frequency=1000' });
                }
                await page.evaluate(options => { if (options.runningBoundary) window.__fjordAudit.references.setPlayback(true); window.__fjordAudit.start(options); }, {
                    runningBoundary: scenario.fixture.startsWith('boundary') && scenario.running,
                    instrument: scenario.instrument !== false, gpu: scenario.gpu !== false, cameraPath: scenario.cameraPath, userTiming: scenario.profile && !scenario.cpuOnly });
                const windows = [];
                const samples = scenario.soak ? 10 : 1;
                for (let window = 0; window < samples; window++) {
                    if (scenario.commands) {
                        // QA-only matched command schedule: no canonical ticks are skipped to claim a gain.
                        await page.evaluate(async ({ scenario, windowIndex }) => {
                            const audit = window.__fjordAudit;
                            for (let command = 1; command <= scenario.commands; command++) {
                                const remaining = audit.started + command * 500 - performance.now();
                                if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
                                const pattern = scenario.tickPattern;
                                const ticks = pattern ? pattern[(windowIndex * scenario.commands + command - 1) % pattern.length] : scenario.ticksPerCommand || 3;
                                await audit.references.advanceTicks(ticks);
                            }
                        }, { scenario, windowIndex: window });
                    } else await page.waitForTimeout(scenario.soak ? 30000 : sampleMs);
                    const sample = await page.evaluate(() => window.__fjordAudit.stop());
                    windows.push(sample);
                    if (scenario.soak && window < samples - 1) await page.evaluate(() => window.__fjordAudit.start({ continuing: true }));
                    if (scenario.soak) console.log(JSON.stringify({ progress: 'soak', window, p95: sample.frames.p95, heap: sample.heap?.used }));
                }
                const metricsAfter = await cdp.send('Performance.getMetrics');
                const after = await page.evaluate(() => {
                    const audit = window.__fjordAudit; audit.references.setPlayback(false); return audit.inspect();
                });
                after.effectiveWorld = await page.evaluate(() => window.__fjordAudit.references.world.describe());
                after.placeholders = await page.evaluate(() => window.__fjordAudit.references.layer.describe()
                    .filter(entity => entity.placeholder).map(entity => ({ key: entity.key, asset: entity.asset })));
                after.presentationDiagnostics = await page.locator('#fjord-diagnostics').textContent();
                if (scenario.allPasses) {
                    after.nativeDrawCounters = await page.evaluate(() => window.__fjordAudit.references.renderer.auditDraws);
                    after.uniqueRigInventory = await page.evaluate(() => {
                        const bones = new Set(), skeletons = new Set();
                        window.__fjordAudit.references.scene.traverse(node => {
                            if (node.isBone) bones.add(node.uuid);
                            if (node.isSkinnedMesh) skeletons.add(node.skeleton.uuid);
                        });
                        return { bones: bones.size, skeletons: skeletons.size };
                    });
                    after.geometryInventory = await page.evaluate(async () => {
                        const { Frustum, Matrix4 } = await import('/node_modules/three/build/three.module.js');
                        const refs = window.__fjordAudit.references;
                        const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(
                            refs.camera.projectionMatrix, refs.camera.matrixWorldInverse));
                        const entries = [];
                        window.__fjordAudit.references.scene.traverse(node => {
                            if (!node.isMesh) return;
                            const count = node.geometry.index?.count || node.geometry.attributes.position.count;
                            const triangles = count / 3 * (node.isInstancedMesh ? node.count : 1);
                            entries.push({ name: node.name, trianglesIncludingGroups: triangles,
                                instances: node.isInstancedMesh ? node.count : 1, skinned: Boolean(node.isSkinnedMesh),
                                groups: node.geometry.groups.length, visible: node.visible,
                                insideCameraFrustum: frustum.intersectsObject(node),
                                materials: (Array.isArray(node.material) ? node.material : [node.material]).map(m => m.name) });
                        });
                        return entries.sort((a, b) => b.trianglesIncludingGroups - a.trianglesIncludingGroups).slice(0, 25);
                    });
                }
                const absoluteTick = state => state.time.winter * 1000 + state.time.tick;
                const ticks = absoluteTick(after) - absoluteTick(loaded.state);
                const actual = await page.evaluate(() => window.__fjordAudit.references.session.saveJSON());
                assert.deepEqual(JSON.parse(actual), core.applyCommand(loaded.state, { type: 'AdvanceTicks', ticks }),
                    'Rendered campaign must equal identical headless canonical commands');
                const run = { scenario, repeat, variant: variant.label, sourceCommit: variant.sourceCommit || results.sourceCommit, before, after, actualTicksFromFixture: ticks,
                    canonicalReplayEqual: true, windows,
                    canonicalSha256: sha256(actual), canonicalSaveBytes: Buffer.byteLength(actual),
                    checkpointSha256: sha256(await page.evaluate(() => window.__fjordAudit.references.shared.persist())),
                    cdpMetrics: Object.fromEntries(metricsAfter.metrics.filter(m => /Duration|Count|HeapSize|Nodes|Documents/.test(m.name))
                        .map(m => [m.name, m.value - (metricsBefore.metrics.find(p => p.name === m.name)?.value || 0)])) };
                if (scenario.profile) {
                    const { profile } = await cdp.send('Profiler.stop');
                    const profileName = 'profiles/' + (process.env.QA_VARIANTS ? variant.label + '-r' + repeat + '-' + (scenario.minutes || 3) + '-' : '') + (scenario.fixture.startsWith('boundary') ? 'boundary-' : '') + (scenario.running ? (scenario.selected ? 'running-selected' : 'running') : (scenario.freezeAfterWarmup ? 'paused-frozen-' + scenario.fixture : 'paused'));
                    await writeFile(output + '/' + profileName + '.cpuprofile.gz', gzipSync(JSON.stringify(profile)));
                    const samples = new Map();
                    profile.samples.forEach((id, index) => samples.set(id, (samples.get(id) || 0) + profile.timeDeltas[index]));
                    run.cpuProfile = { path: profileName + '.cpuprofile.gz', durationMs: (profile.endTime - profile.startTime) / 1000,
                        topSelf: profile.nodes.map(node => ({ function: node.callFrame.functionName,
                            url: node.callFrame.url.replace(origin, ''), line: node.callFrame.lineNumber + 1,
                            ms: (samples.get(node.id) || 0) / 1000 })).sort((a, b) => b.ms - a.ms).slice(0, 45) };
                    if (!scenario.cpuOnly) {
                    const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
                    await cdp.send('Tracing.end');
                    const { stream } = await complete;
                    let trace = '';
                    while (true) {
                        const chunk = await cdp.send('IO.read', { handle: stream });
                        trace += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
                        if (chunk.eof) break;
                    }
                    await cdp.send('IO.close', { handle: stream });
                    await writeFile(output + '/' + profileName + '.trace.json.gz', gzipSync(trace));
                    const entries = JSON.parse(trace).traceEvents;
                    run.trace = { path: profileName + '.trace.json.gz', events: entries.length,
                        gc: entries.filter(e => e.ph === 'X' && /GC|Scavenge/.test(e.name)).map(e => ({ name: e.name, durationMs: e.dur / 1000 })) };
                    }
                }
                if (scenario.screenshot) {
                    const path = group + '-' + variant.label + '-r' + repeat + '-' + scenario.fixture +
                        (scenario.minutes ? '-m' + scenario.minutes : '') + '.png';
                    await page.screenshot({ path: output + '/' + path });
                    run.screenshot = path;
                }
                runs.push(run); await write();
                if (errors.length) throw Error('Browser error: ' + errors.at(-1).error);
                console.log(JSON.stringify({ group, run: runs.length, repeat, ...scenario,
                    p50: windows[0].frames.p50, p95: windows[0].frames.p95,
                    gpuMean: windows[0].gpu.mean, calls: after.renderer.render.calls,
                    ticks, maxCommand: windows[0].spans['session.command.inclusive']?.max }));
            } finally { await page.close(); }
            }
        }
    }
    if (errors.length) throw Error('Browser errors were recorded');
} catch (error) {
    results.failure = String(error); await write(); throw error;
} finally { await context.close(); await browser.close(); }
