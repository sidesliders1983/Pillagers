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
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5192';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-lighting-study-180';
const fixtures = (process.env.QA_FIXTURES ||
    'summer-32,summer-17,developed-810,rain-810,snow-811').split(',');
const tiers = (process.env.QA_TIERS || 'standard,low').split(',');
const hash = value => createHash('sha256').update(value).digest('hex');
const readSource = path => readFile(path);
const sourcePaths = ['src/core/WorldLighting.ts', 'src/core/Renderer.ts',
    'src/config/FjordPresentation.ts', 'src/world/BlueprintTerrain.ts',
    'scripts/qa/fjord-runtime-server.mjs', 'scripts/qa/fjord-golden-browser.mjs',
    'scripts/qa/fjord-lighting-study-browser.mjs', 'scripts/qa/capture-fjord-lighting-study-180.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
    [path, hash(await readSource(path))])));
const result = { version: 'fjord-lighting-study-180-v1',
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHashes, viewport: { width: 1440, height: 900 }, cases: [], errors: [],
    limitations: 'Frozen native 3D campaign captures. No animated CPU/GPU performance claim; no defaults promoted.' };
await mkdir(output, { recursive: true });
const save = () => writeFile(output + '/observations.json', JSON.stringify(result, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const fixtureName of fixtures) for (const quality of tiers) {
        assert.match(fixtureName, /^[a-z0-9-]+$/);
        assert.ok(['standard', 'low'].includes(quality));
        const input = await readFile(`docs/qa/fjord-runtime-performance/fixtures/${fixtureName}.json`, 'utf8');
        const fixture = JSON.parse(input);
        const expected = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        fixture.target = 'fjord';
        fixture.pace.running = false;
        const page = await browser.newPage({ viewport: result.viewport, deviceScaleFactor: 1 });
        page.setDefaultTimeout(240000);
        page.on('pageerror', error => result.errors.push({ fixtureName, quality, error: error.message }));
        page.on('console', message => {
            if (message.type() === 'error') result.errors.push({ fixtureName, quality, error: message.text() });
        });
        try {
            console.log('OPEN', fixtureName, quality);
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
            if (!result.hardware) result.hardware = await page.evaluate(() => {
                const gl = document.querySelector('#fjord-canvas').getContext('webgl2');
                const info = gl.getExtension('WEBGL_debug_renderer_info');
                return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'Unavailable',
                    vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : 'Unavailable',
                    userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency };
            });
            const before = await page.evaluate(() => window.__fjordAudit.golden.capture());
            assert.deepEqual(JSON.parse(before.canonicalJSON), expected);
            assert.deepEqual(before.placeholders, []);
            await page.evaluate(async () => {
                const module = await import('/scripts/qa/fjord-lighting-study-browser.mjs');
                window.lightingStudy = module.installLightingStudy(window.__fjordAudit);
            });
            const entry = { fixture: fixtureName, fixtureSha256: hash(input), quality,
                canonicalSha256: hash(before.canonicalJSON), blueprintSha256: hash(before.blueprintJSON),
                calendar: before.calendar, camera: before.camera, variants: [] };
            result.cases.push(entry);
            let baselinePixels, baselineCounts, baselineMaterials;
            for (const variant of ['current', 'form', 'north', 'current']) {
                await page.evaluate(value => window.lightingStudy.select(value), variant);
                const capture = await page.evaluate(() => window.__fjordAudit.golden.capture());
                const lighting = await page.evaluate(() => window.lightingStudy.inspect());
                assert.equal(hash(capture.canonicalJSON), entry.canonicalSha256);
                assert.equal(hash(capture.blueprintJSON), entry.blueprintSha256);
                assert.deepEqual(capture.actors, before.actors);
                assert.deepEqual(capture.camera, before.camera);
                assert.equal(capture.effects, 'off');
                assert.equal(lighting.shadowSources, 1);
                assert.equal(lighting.shadow.mapSize[0], quality === 'low' ? 1024 : 2048);
                const image = await page.locator('#fjord-canvas').screenshot();
                const pixels = await sharp(image).raw().toBuffer();
                const counts = { geometries: capture.renderer.geometries, textures: capture.renderer.textures };
                if (variant === 'current' && baselinePixels) {
                    assert.ok(pixels.equals(baselinePixels), 'Returning to baseline must restore identical pixels.');
                    entry.baselineRestoredExactly = true;
                    break;
                }
                if (!baselinePixels) {
                    baselinePixels = pixels;
                    baselineCounts = counts;
                    baselineMaterials = lighting.materials;
                }
                assert.deepEqual(counts, baselineCounts, 'No new geometry or textures.');
                assert.deepEqual(lighting.materials, baselineMaterials, 'Authored materials remain identical.');
                const name = `${fixtureName}-${quality}-${variant}.jpg`;
                await sharp(image).jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + name);
                entry.variants.push({ variant, image: name, pixelsSha256: hash(pixels),
                    renderer: capture.renderer, lighting });
                console.log('CAPTURE', fixtureName, quality, variant,
                    capture.renderer.callsIncludingShadows, 'calls');
                await save();
            }
            await save();
        } catch (error) {
            result.failure = { fixture: fixtureName, quality, error: String(error) };
            await page.screenshot({ path: output + '/failed.png', timeout: 5000 }).catch(() => {});
            throw error;
        } finally {
            await page.close();
        }
    }
    for (const [path, expected] of Object.entries(sourceHashes)) {
        assert.equal(hash(await readSource(path)), expected, 'Source changed during capture: ' + path);
    }
    assert.deepEqual(result.errors, []);
    result.status = 'PASS';
} catch (error) {
    result.status = 'FAIL';
    throw error;
} finally {
    await save();
    await browser.close();
}
