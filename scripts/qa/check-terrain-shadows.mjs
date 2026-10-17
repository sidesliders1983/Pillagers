import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5194';
const output = process.env.QA_OUTPUT || 'artifacts/terrain-shadows';
const digest = value => createHash('sha256').update(value).digest('hex');
const cases = [
    { name: 'autumn-32', fixture: 'funded-800', advance: 250 },
    { name: 'summer-17', fixture: 'summer-17', advance: 0 },
    { name: 'snow-811', fixture: 'snow-811', advance: 0 },
];
const report = { viewport: { width: 1200, height: 850 }, cases: [], errors: [] };
const sourceFiles = ['src/core/WorldLighting.ts', 'src/world/BlueprintTerrain.ts',
    'scripts/qa/check-terrain-shadows.mjs'];
report.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, digest(await readFile(file))])));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const scenario of cases) {
        const fixtureText = await readFile(`docs/qa/integrated-playtest-180/${scenario.fixture}.json`, 'utf8');
        const fixture = JSON.parse(fixtureText);
        fixture.target = 'fjord';
        fixture.pace.running = false;
        const page = await browser.newPage({ viewport: report.viewport, deviceScaleFactor: 1 });
        page.setDefaultTimeout(300000);
        page.on('pageerror', error => report.errors.push({ scenario: scenario.name, error: error.message }));
        await page.addInitScript(json => {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
            const observer = new MutationObserver(() => {
                const effects = document.querySelector('#fjord-effects');
                if (effects) { effects.value = 'off'; observer.disconnect(); }
            });
            observer.observe(document, { childList: true, subtree: true });
        }, JSON.stringify(fixture));
        console.log('OPEN', scenario.name);
        await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => window.__fjordAudit?.golden &&
            document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
        if (scenario.advance) await page.evaluate(ticks => window.__fjordAudit.references.advanceTicks(ticks), scenario.advance);
        await page.addStyleTag({ content: '#fjord-selection-labels, #fjord-selection-leaders, #fjord-production-labels { visibility: hidden !important; }' });
        const initial = await page.evaluate(() => window.__fjordAudit.golden.capture());
        const entry = { name: scenario.name, fixtureSha256: digest(fixtureText),
            canonicalSha256: digest(initial.canonicalJSON), blueprintSha256: digest(initial.blueprintJSON),
            calendar: initial.calendar, samples: [] };
        report.cases.push(entry);
        if (!report.hardware) report.hardware = await page.evaluate(() => {
            const gl = window.__fjordAudit.references.renderer.getContext();
            const debug = gl.getExtension('WEBGL_debug_renderer_info');
            return { browser: navigator.userAgent,
                renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
        });
        const poses = [{ name: 'highlands', button: '#fjord-view-summit' }];
        if (scenario.name === 'autumn-32') poses.push(
            { name: 'valley', camera: { position: [140, 95, 180], target: [20, 15, 30] } },
            { name: 'settlement', button: '#fjord-view-home' });
        for (const quality of ['standard', 'low']) {
            await page.evaluate(value => {
                const select = document.querySelector('#fjord-quality');
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }, quality);
            for (const pose of poses) {
                if (pose.button) await page.evaluate(button => document.querySelector(button).click(), pose.button);
                await page.evaluate(camera => window.__fjordAudit.golden.capture(camera ? { camera } : {}), pose.camera);
                const pair = [];
                for (const variant of ['before', 'after']) {
                    await page.evaluate(casts => {
                        const { world, layer, lighting, renderer } = window.__fjordAudit.references;
                        const terrain = world.root.getObjectByName('Generated canonical terrain');
                        terrain.castShadow = casts;
                        // Rebuild, rather than expand, the fit so the baseline also retains its original depth range.
                        lighting.shadowCoverage = undefined;
                        lighting.includeWorldShadowBounds(world.root);
                        for (const entity of layer.describe()) lighting.includeEntityShadowBounds(entity.bounds);
                        renderer.shadowMap.needsUpdate = true;
                    }, variant === 'after');
                    const capture = await page.evaluate(() => window.__fjordAudit.golden.capture());
                    assert.equal(capture.canonicalJSON, initial.canonicalJSON);
                    assert.equal(capture.blueprintJSON, initial.blueprintJSON);
                    assert.deepEqual(capture.actors, initial.actors);
                    assert.equal(capture.quality, quality);
                    assert.equal(capture.lighting.shadowMaps.length, 1);
                    assert.deepEqual(capture.lighting.shadowMaps[0], quality === 'low' ? [1024, 1024] : [2048, 2048]);
                    const image = await page.locator('#fjord-canvas').screenshot();
                    const file = `${scenario.name}-${pose.name}-${quality}-${variant}.jpg`;
                    await sharp(image).jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + file);
                    const coverage = await page.evaluate(() => {
                        const { lighting } = window.__fjordAudit.references;
                        const camera = lighting.directional.shadow.camera;
                        return { ...lighting.inspectShadowCoverage(), near: camera.near, far: camera.far };
                    });
                    const record = { pose: pose.name, quality, variant, file, camera: capture.camera,
                        renderer: capture.renderer, lighting: capture.lighting, coverage };
                    entry.samples.push(record);
                    pair.push({ capture, pixels: await sharp(image).removeAlpha().raw().toBuffer(), record });
                    console.log('CAPTURE', scenario.name, pose.name, quality, variant, capture.renderer.callsIncludingShadows);
                }
                const [before, after] = pair;
                assert.deepEqual(after.capture.camera, before.capture.camera);
                assert.equal(after.capture.renderer.geometries, before.capture.renderer.geometries);
                assert.equal(after.capture.renderer.textures, before.capture.renderer.textures);
                const extraCalls = after.capture.renderer.callsIncludingShadows - before.capture.renderer.callsIncludingShadows;
                assert.equal(extraCalls, 1, 'The terrain joins the native shadow pass with one opaque depth draw.');
                // Drawing all coplanar material groups must produce the same pixels as the single base draw.
                await page.evaluate(() => {
                    const terrain = window.__fjordAudit.references.world.root.getObjectByName('Generated canonical terrain');
                    window.__fjordAudit.terrainShadowCallbacks = { before: terrain.onBeforeShadow, after: terrain.onAfterShadow };
                    terrain.onBeforeShadow = () => {};
                    terrain.onAfterShadow = () => {};
                });
                try {
                    const allLayers = await page.evaluate(() => window.__fjordAudit.golden.capture());
                    assert.ok(allLayers.renderer.trianglesIncludingShadows > after.capture.renderer.trianglesIncludingShadows);
                    const pixels = await sharp(await page.locator('#fjord-canvas').screenshot()).removeAlpha().raw().toBuffer();
                    assert.ok(pixels.equals(after.pixels), 'Removing duplicate coplanar shadow draws preserves every pixel.');
                } finally {
                    await page.evaluate(() => {
                        const terrain = window.__fjordAudit.references.world.root.getObjectByName('Generated canonical terrain');
                        const callbacks = window.__fjordAudit.terrainShadowCallbacks;
                        terrain.onBeforeShadow = callbacks.before;
                        terrain.onAfterShadow = callbacks.after;
                        delete window.__fjordAudit.terrainShadowCallbacks;
                    });
                }
                const oneLayer = await page.evaluate(() => window.__fjordAudit.golden.capture());
                assert.deepEqual(oneLayer.renderer, after.capture.renderer);
                let changed = 0;
                for (let index = 0; index < after.pixels.length; index += 3) {
                    const delta = Math.abs(after.pixels[index] - before.pixels[index]) +
                        Math.abs(after.pixels[index + 1] - before.pixels[index + 1]) +
                        Math.abs(after.pixels[index + 2] - before.pixels[index + 2]);
                    if (delta > 12) changed++;
                }
                after.record.changedPixels = changed;
                if (scenario.name === 'autumn-32' && pose.name === 'valley') {
                    assert.ok(changed > 1000, 'The canonical ridge must visibly occlude the valley.');
                    assert.ok(after.record.coverage.far - after.record.coverage.near < 1500,
                        'The flat ocean continuation must not expand caster depth to several kilometres.');
                }
                if (scenario.name === 'autumn-32' && pose.name === 'valley') {
                    after.record.timings = [];
                    // ABBA presentation samples, not isolated GPU or physical-mobile measurements.
                    for (const variant of ['before', 'after', 'after', 'before']) {
                        await page.evaluate(casts => {
                            const { world, renderer } = window.__fjordAudit.references;
                            world.root.getObjectByName('Generated canonical terrain').castShadow = casts;
                            renderer.shadowMap.needsUpdate = true;
                        }, variant === 'after');
                        const timing = await page.evaluate(async () => {
                            const intervals = [];
                            await new Promise(resolve => {
                                const start = performance.now();
                                let last;
                                function frame(time) {
                                    if (time - start > 500 && last) intervals.push(time - last);
                                    last = time;
                                    if (time - start >= 3500) resolve();
                                    else requestAnimationFrame(frame);
                                }
                                requestAnimationFrame(frame);
                            });
                            const sorted = [...intervals].sort((a, b) => a - b);
                            return { intervals, median: sorted[Math.floor(sorted.length * .5)],
                                p95: sorted[Math.floor(sorted.length * .95)] };
                        });
                        after.record.timings.push({ variant, ...timing });
                    }
                }
            }
        }
        await page.close();
    }
    assert.deepEqual(report.errors, []);
    for (const file of sourceFiles) assert.equal(digest(await readFile(file)), report.sourceHashes[file]);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
