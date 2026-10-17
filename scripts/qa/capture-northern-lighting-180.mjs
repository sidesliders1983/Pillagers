import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'artifacts/northern-lighting/captures';
const fixtures = (process.env.QA_FIXTURES ||
    'summer-32,summer-17,developed-810,rain-810,snow-811').split(',');
const tiers = (process.env.QA_TIERS || 'standard,low').split(',');
const benchmark = process.env.QA_BENCHMARK === '1';
const digest = value => createHash('sha256').update(value).digest('hex');
const parent = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const studyRef = '1b4ddba3d9ad2e52ad96f6bb8b021407a7c0da43';
const baselineHelper = execFileSync('git', ['show', studyRef + ':scripts/qa/fjord-lighting-study-browser.mjs']);
await mkdir('artifacts/northern-lighting', { recursive: true });
await writeFile('artifacts/northern-lighting/accepted-study.mjs', baselineHelper);
await mkdir(output, { recursive: true });
const sources = ['src/core/WorldLighting.ts', 'src/core/DirectionalShadowCoverage.ts',
    'src/config/FjordPresentation.ts', 'src/config/lightingConfig.ts', 'src/fjord-play/FjordPlay.ts',
    'scripts/qa/fjord-runtime-server.mjs', 'scripts/qa/fjord-golden-browser.mjs',
    'scripts/qa/capture-northern-lighting-180.mjs'];
const hashes = Object.fromEntries(await Promise.all(sources.map(async path =>
    [path, digest(await readFile(path))])));
const result = { version: 'northern-lighting-refinement-v1', captureParent: parent, sourceHashes: hashes,
    baseline: { sourceRef: 'eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c', studyRef,
        helperSha256: digest(baselineHelper), label: 'Selected Northern sun · 25°' },
    viewport: { width: 1440, height: 900 }, cases: [], errors: [], benchmark };
const save = () => writeFile(output + '/observations.json', JSON.stringify(result, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const fixtureName of fixtures) for (const quality of tiers) {
        const input = await readFile(`docs/qa/fjord-runtime-performance/fixtures/${fixtureName}.json`, 'utf8');
        const fixture = JSON.parse(input);
        const expected = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        fixture.target = 'fjord';
        fixture.pace.running = false;
        const entry = { fixture: fixtureName, quality, fixtureSha256: digest(input), variants: [] };
        result.cases.push(entry);
        let reference;
        for (const variant of ['selected', 'refined']) {
            const origin = variant === 'selected'
                ? process.env.QA_BASELINE_ORIGIN || 'http://127.0.0.1:5194'
                : process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
            const page = await browser.newPage({ viewport: result.viewport, deviceScaleFactor: 1 });
            page.setDefaultTimeout(240000);
            page.on('pageerror', error => result.errors.push({ fixtureName, quality, variant, error: error.message }));
            page.on('console', message => {
                if (message.type() === 'error') result.errors.push({ fixtureName, quality, variant, error: message.text() });
            });
            try {
                console.log('OPEN', fixtureName, quality, variant);
                await page.addInitScript(({ json, quality }) => {
                    sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                    const observer = new MutationObserver(() => {
                        const tier = document.querySelector('#fjord-quality');
                        const effects = document.querySelector('#fjord-effects');
                        if (!tier || !effects) return;
                        tier.value = quality;
                        effects.value = 'off';
                        observer.disconnect();
                    });
                    observer.observe(document, { childList: true, subtree: true });
                }, { json: JSON.stringify(fixture), quality });
                await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 240000 });
                await page.waitForFunction(() => window.__fjordAudit?.golden &&
                    document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
                await page.addStyleTag({ content: `#fjord-management, #fjord-management-toggle,
                    #fjord-selection-leaders, #fjord-selection-labels, #fjord-production-labels {
                        visibility: hidden !important;
                    }` });
                if (variant === 'selected') await page.evaluate(async () => {
                    const module = await import('/artifacts/northern-lighting/accepted-study.mjs');
                    module.installLightingStudy(window.__fjordAudit).select('north');
                });
                const state = await page.evaluate(() => window.__fjordAudit.golden.capture());
                assert.deepEqual(JSON.parse(state.canonicalJSON), expected);
                assert.deepEqual(state.placeholders, []);
                const comparable = { canonical: digest(state.canonicalJSON), blueprint: digest(state.blueprintJSON),
                    actors: state.actors, camera: state.camera };
                if (reference) assert.deepEqual(comparable, reference, 'Only presentation may differ.');
                else reference = comparable;
                const inspection = await page.evaluate(() => {
                    const { lighting, renderer, scene, world } = window.__fjordAudit.references;
                    const light = lighting.directional, camera = light.shadow.camera;
                    const direction = light.position.clone().sub(light.target.position).normalize();
                    const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
                    const materials = new Set();
                    scene.traverse(node => { if (node.isMesh) [node.material].flat().forEach(material => materials.add(material)); });
                    return { sunIntensity: light.intensity, ambient: lighting.ambient.intensity,
                        skyFill: lighting.ambient.color.getHexString(), groundFill: lighting.ambient.groundColor.getHexString(),
                        sunColor: light.color.getHexString(), elevation: Math.asin(direction.y) * 180 / Math.PI,
                        azimuth: Math.atan2(direction.x, direction.z) * 180 / Math.PI,
                        exposure: renderer.toneMappingExposure, shadowSources: scene.children.filter(node => node.isLight && node.castShadow).length,
                        shadows: { size: light.shadow.mapSize.toArray(), radius: light.shadow.radius,
                            normalBias: light.shadow.normalBias, bias: light.shadow.bias,
                            left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom,
                            near: camera.near, far: camera.far }, coverage: lighting.inspectShadowCoverage?.() ?? null,
                        terrain: world.describe().terrainShading,
                        materials: [...materials].map(material => ({ name: material.name, type: material.type,
                            roughness: material.roughness, metalness: material.metalness,
                            map: !!material.map, normalMap: !!material.normalMap, vertexColors: material.vertexColors })),
                        hardware: { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'Unavailable',
                            browser: navigator.userAgent }, };
                });
                assert.ok(Math.abs(inspection.elevation - 25) < 1e-8);
                assert.equal(inspection.shadowSources, 1);
                assert.equal(inspection.shadows.size[0], quality === 'low' ? 1024 : 2048);
                if (variant === 'refined') {
                    assert.ok(inspection.coverage?.casterBounds, 'Require the final separate caster-depth implementation.');
                    assert.equal(inspection.shadows.radius, 1.5);
                }
                const image = await page.locator('#fjord-canvas').screenshot();
                const pixels = await sharp(image).raw().toBuffer();
                const name = `${fixtureName}-${quality}-${variant}.jpg`;
                await sharp(image).jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + name);
                const repeated = await page.evaluate(() => window.__fjordAudit.golden.capture());
                const repeatedPixels = await sharp(await page.locator('#fjord-canvas').screenshot()).raw().toBuffer();
                assert.ok(pixels.equals(repeatedPixels), 'Consecutive frozen renders must match.');
                assert.equal(digest(repeated.canonicalJSON), comparable.canonical);
                const record = { variant, image: name, rawPixelsSha256: digest(pixels),
                    canonicalSha256: comparable.canonical, blueprintSha256: comparable.blueprint,
                    actorsSha256: digest(JSON.stringify(state.actors)), camera: state.camera,
                    calendar: state.calendar, servedSource: state.servedSource,
                    renderer: state.renderer, lighting: inspection, repeatedPixelsMatch: true };
                entry.variants.push(record);
                if (entry.variants.length === 2) {
                    assert.deepEqual(record.lighting.materials, entry.variants[0].lighting.materials);
                    assert.equal(record.renderer.geometries, entry.variants[0].renderer.geometries);
                    assert.equal(record.renderer.textures, entry.variants[0].renderer.textures);
                }
                console.log('CAPTURE', name, state.renderer.callsIncludingShadows, 'calls',
                    'span', (inspection.shadows.right - inspection.shadows.left).toFixed(1));
                await save();
                if (['developed-810', 'snow-811'].includes(fixtureName) && !benchmark) {
                    record.details = [];
                    for (const subject of ['building', 'persona']) {
                        const pose = await page.evaluate(kind => {
                            const entity = window.__fjordAudit.references.layer.describe()
                                .filter(entity => entity.kind === kind && entity.bounds)
                                .sort((a, b) => a.key.localeCompare(b.key))[0];
                            if (!entity) return null;
                            const min = entity.bounds.min, max = entity.bounds.max;
                            const x = (min.x + max.x) / 2, z = (min.z + max.z) / 2;
                            const target = [x, min.y + (kind === 'persona' ? .8 : 1.5), z];
                            return { subject: entity.key, position: [x + (kind === 'persona' ? 5 : 13),
                                min.y + (kind === 'persona' ? 4 : 12), z - (kind === 'persona' ? 6 : 16)], target };
                        }, subject);
                        if (!pose) continue;
                        const close = await page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), pose);
                        assert.equal(digest(close.canonicalJSON), comparable.canonical);
                        assert.deepEqual(close.actors, state.actors);
                        const detailName = `${fixtureName}-${quality}-${variant}-${subject}.jpg`;
                        await sharp(await page.locator('#fjord-canvas').screenshot())
                            .jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + detailName);
                        record.details.push({ subject, entity: pose.subject, camera: close.camera,
                            image: detailName, renderer: close.renderer });
                    }
                    if (entry.variants.length === 2) {
                        assert.deepEqual(record.details.map(detail => detail.camera),
                            entry.variants[0].details.map(detail => detail.camera));
                    }
                    await save();
                }
                if (benchmark) {
                    record.timing = [];
                    for (let repeat = 1; repeat <= 3; repeat++) {
                        await page.evaluate(() => window.__fjordAudit.golden.capture());
                        const timing = await page.evaluate(async () => {
                            window.__fjordAudit.golden.frozen = false;
                            const frames = duration => new Promise(resolve => {
                                const start = performance.now(), intervals = [];
                                let last;
                                function frame(time) {
                                    if (last !== undefined) intervals.push(time - last);
                                    last = time;
                                    if (time - start >= duration) resolve(intervals);
                                    else requestAnimationFrame(frame);
                                }
                                requestAnimationFrame(frame);
                            });
                            await frames(10000);
                            const intervals = await frames(30000);
                            const sorted = [...intervals].sort((a, b) => a - b);
                            return { intervals, median: sorted[Math.floor((sorted.length - 1) * .5)],
                                p95: sorted[Math.floor((sorted.length - 1) * .95)],
                                coverage: window.__fjordAudit.references.lighting.inspectShadowCoverage?.() ?? null };
                        });
                        record.timing.push({ repeat, ...timing });
                        console.log('TIMING', fixtureName, quality, variant, repeat, timing.median, timing.p95);
                        await save();
                    }
                }
            } finally { await page.close(); }
        }
    }
    for (const [path, expected] of Object.entries(hashes)) assert.equal(digest(await readFile(path)), expected);
    assert.deepEqual(result.errors, []);
    result.status = 'PASS';
} catch (error) {
    result.status = 'FAIL';
    result.failure = String(error);
    throw error;
} finally {
    await save();
    await browser.close();
}
