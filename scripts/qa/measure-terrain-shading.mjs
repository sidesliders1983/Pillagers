import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5194';
const output = process.env.QA_OUTPUT || 'artifacts/terrain-shading/full-scene';
const repeats = Number(process.env.QA_REPEATS || 3);
const sampleMs = Number(process.env.QA_SAMPLE_MS || 10000);
const warmupMs = Number(process.env.QA_WARMUP_MS || 3000);
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await mkdir(output, { recursive: true });
const results = { sourceCommit, origin, repeats, sampleMs, warmupMs, startedAt: new Date().toISOString(),
    method: 'Real developed campaign, frozen Core and presentation clock, same starting camera and fixed orbit, alternating A/B order. QA-only CPU/GPU bridge. Distributions retain bounded histograms, not individual frame samples. Mobile is viewport emulation, not physical iPhone performance.',
    memoryMethod: 'Estimated geometry attribute/index bytes plus RGBA8 texture images with 4/3 mip allowance and 4-byte shadow texels. Approximation of referenced resources, not measured VRAM; excludes driver/program/framebuffer overhead.',
    runs: [], captures: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--enable-precise-memory-info'] });
results.browserVersion = browser.version();
if (process.env.QA_RESUME === '1') {
    const previous = JSON.parse(await readFile(output + '/results.json', 'utf8'));
    for (const key of ['sourceCommit', 'origin', 'repeats', 'sampleMs', 'warmupMs'])
        assert.equal(previous[key], results[key], 'Resume inputs must be identical: ' + key);
    assert.equal(previous.failure, undefined);
    assert.deepEqual(previous.errors, []);
    results.runs.push(...previous.runs);
    results.captures.push(...previous.captures);
    results.startedAt = previous.startedAt;
}
const fixtures = new Map();
async function fixture(name) {
    if (fixtures.has(name)) return fixtures.get(name);
    const raw = await readFile('docs/qa/fjord-runtime-performance/fixtures/' + name + '.json', 'utf8');
    const data = JSON.parse(raw);
    data.target = 'fjord';
    data.pace.running = false;
    const row = { json: JSON.stringify(data), sha256: hash(raw), time: data.fjord.campaign.time };
    fixtures.set(name, row);
    return row;
}
async function open(name, quality, mobile, mode) {
    const loaded = await fixture(name);
    console.log('Loading', name, quality, mobile ? '390px' : 'desktop', mode);
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } :
        { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    page.on('pageerror', error => results.errors.push({ name, quality, mobile, mode, error: error.message }));
    await page.addInitScript(({ json, quality }) => {
        sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
        const observer = new MutationObserver(() => {
            const select = document.querySelector('#fjord-quality');
            if (select) { select.value = quality; observer.disconnect(); }
        });
        observer.observe(document, { childList: true, subtree: true });
        window.__terrainLoad = { longTasks: [] };
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) window.__terrainLoad.longTasks.push(entry.duration);
        }).observe({ type: 'longtask', buffered: true });
    }, { json: loaded.json, quality });
    await page.goto(origin + '/fjord-play?terrain-study=' + mode, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__fjordAudit && document.querySelector('#fjord-canvas')?.dataset.ready);
    const prepared = await page.evaluate(async () => {
        const audit = window.__fjordAudit, refs = audit.references;
        refs.setPlayback(false);
        audit.flags.manualClock = true;
        const center = refs.world.describe().site;
        const surfaceY = refs.campaign.blueprint.settlement.elevation;
        refs.controller.setView({ position: [center.x + 38, surfaceY + 26, center.z + 45],
            target: [center.x, surfaceY + 1, center.z] });
        audit.basePosition = refs.camera.position.clone();
        audit.baseFocus = refs.controller.focus.clone();
        refs.world.setMotion({ water: true, wind: true });
        refs.world.update(0, refs.lighting, refs.camera);
        refs.world.setMotion({ water: false, wind: false });
        const toggle = document.querySelector('#fjord-management-toggle');
        if (toggle?.getAttribute('aria-expanded') === 'true') toggle.click();
        const close = document.querySelector('#clan-book-close');
        if (close && close.getClientRects().length) close.click();
        const readyMs = performance.now();
        const digestBytes = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', value)))
            .map(n => n.toString(16).padStart(2, '0')).join('');
        const digest = value => digestBytes(new TextEncoder().encode(value));
        const geometry = refs.world.terrain.geometry;
        const arrays = Object.fromEntries(await Promise.all(['position', 'uv', 'uv1', 'uv2', 'uv3', 'color'].map(async key => {
            const array = geometry.getAttribute(key).array;
            return [key, await digestBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))];
        })));
        const indices = geometry.index.array;
        arrays.index = await digestBytes(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength));
        const normalMaps = (Array.isArray(refs.world.terrain.material) ? refs.world.terrain.material :
            [refs.world.terrain.material]).map(material => Boolean(material.normalMap));
        return { readyMs, loadingLongTasks: window.__terrainLoad.longTasks,
            core: await digest(JSON.stringify(refs.session.snapshot())),
            world: await digest(refs.world.exportSave()), geometry: await digest(JSON.stringify(arrays)),
            geometryHashMethod: 'SHA-256 per raw attribute/index byte buffer',
            description: refs.world.describe(), normalMaps, inspection: audit.inspect(),
            placeholders: refs.layer.describe().filter(entity => entity.placeholder).map(entity => entity.key) };
    });
    assert.deepEqual(prepared.inspection.time, loaded.time, 'The pinned campaign was restored');
    assert.deepEqual(prepared.placeholders, [], 'Use the real pinned houses, cattle and residents');
    assert.equal(prepared.description.groundTier, quality, 'Ground maps use the requested initial tier');
    assert.equal(prepared.description.terrainShading.variant, mode);
    assert.ok(prepared.normalMaps.every(flag => flag === (quality === 'standard')));
    return { page, context, prepared, fixtureSha256: loaded.sha256 };
}
async function memoryAndState(page) {
    return page.evaluate(async () => {
        const audit = window.__fjordAudit, refs = audit.references;
        const geometries = new Set(), textures = new Set(), materials = new Set();
        let geometryBytes = 0, textureBytes = 0, shadowBytes = 0;
        refs.scene.traverse(node => {
            if (node.geometry && !geometries.has(node.geometry)) {
                const geometry = node.geometry;
                geometries.add(geometry);
                for (const attribute of Object.values(geometry.attributes)) geometryBytes += attribute.array.byteLength;
                geometryBytes += geometry.index?.array.byteLength || 0;
            }
            for (const material of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) {
                materials.add(material);
                for (const value of Object.values(material)) {
                    if (!value?.isTexture || textures.has(value)) continue;
                    textures.add(value);
                    const image = value.image;
                    textureBytes += (image?.width || 0) * (image?.height || 0) * 4 * (value.generateMipmaps ? 4 / 3 : 1);
                }
            }
            if (node.isLight && node.castShadow) shadowBytes += node.shadow.mapSize.x * node.shadow.mapSize.y * 4;
        });
        const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(value)))).map(n => n.toString(16).padStart(2, '0')).join('');
        return { core: await digest(JSON.stringify(refs.session.snapshot())),
            world: await digest(refs.world.exportSave()), inspection: audit.inspect(),
            memory: { geometries: geometries.size, materials: materials.size, textures: textures.size,
                geometryBytes, rgba8TextureEstimateBytes: Math.round(textureBytes), shadowEstimateBytes: shadowBytes,
                totalEstimateBytes: Math.round(geometryBytes + textureBytes + shadowBytes) } };
    });
}
async function persist() {
    await writeFile(output + '/results.json', JSON.stringify(results, null, 2) + '\n');
}
try {
    if (process.env.QA_GALLERY !== '0') {
        for (const name of ['summer-32', 'developed-810', 'snow-811']) {
            for (const mode of ['baseline', 'smooth']) {
                if (results.captures.some(row => row.name === name && row.mode === mode)) continue;
                const { page, context, prepared, fixtureSha256 } = await open(name, 'standard', false, mode);
                await page.waitForTimeout(warmupMs);
                const path = name + '-' + mode + '.png';
                await page.locator('#fjord-canvas').screenshot({ path: output + '/' + path });
                const after = await memoryAndState(page);
                assert.equal(after.core, prepared.core);
                assert.equal(after.world, prepared.world);
                results.captures.push({ name, mode, path, fixtureSha256, prepared, after });
                await persist();
                console.log('Captured real scene', name, mode);
                await context.close();
            }
            const a = results.captures.at(-2), b = results.captures.at(-1);
            for (const key of ['core', 'world', 'geometry']) assert.equal(a.prepared[key], b.prepared[key], key);
            assert.deepEqual(a.prepared.inspection.camera, b.prepared.inspection.camera);
        }
    }
    if (process.env.QA_TIMING !== '0') {
        for (const mobile of [false, true]) {
            for (const quality of ['low', 'standard']) {
                for (let repeat = 1; repeat <= repeats; repeat++) {
                    const pair = [];
                    for (const mode of repeat % 2 ? ['baseline', 'smooth'] : ['smooth', 'baseline']) {
                        const previous = results.runs.find(row => row.mobile === mobile && row.quality === quality && row.repeat === repeat && row.mode === mode);
                        if (previous) { pair.push(previous); continue; }
                        const { page, context, prepared, fixtureSha256 } = await open('developed-810', quality, mobile, mode);
                        await page.waitForTimeout(warmupMs);
                        await page.evaluate(() => window.__fjordAudit.start({ instrument: true, gpu: true, cameraPath: true }));
                        await page.waitForTimeout(sampleMs);
                        const measured = await page.evaluate(() => window.__fjordAudit.stop());
                        const after = await memoryAndState(page);
                        assert.equal(after.core, prepared.core);
                        assert.equal(after.world, prepared.world);
                        const row = { mobile, quality, repeat, mode, fixtureSha256, prepared, measured, after };
                        results.runs.push(row);
                        pair.push(row);
                        await persist();
                        console.log('Measured', mobile ? '390px' : 'desktop', quality, repeat, mode,
                            measured.frames.p50, measured.frames.p95, 'GPU', measured.gpu.p50);
                        await context.close();
                    }
                    for (const key of ['core', 'world', 'geometry']) assert.equal(pair[0].prepared[key], pair[1].prepared[key], key);
                    assert.deepEqual(pair[0].prepared.inspection.camera, pair[1].prepared.inspection.camera);
                    assert.equal(pair[0].after.memory.geometryBytes, pair[1].after.memory.geometryBytes);
                    assert.equal(pair[0].after.memory.materials, pair[1].after.memory.materials);
                    assert.equal(pair[0].after.memory.textures, pair[1].after.memory.textures);
                }
            }
        }
    }
    assert.deepEqual(results.errors, []);
} catch (error) {
    results.failure = String(error.stack || error);
    throw error;
} finally {
    await persist();
    await browser.close();
}
