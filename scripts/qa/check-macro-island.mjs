import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openEnvironmentSettings } from './environment-settings.mjs';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { parseWorld, serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'scratch/macro-island';
const seeds = (process.env.QA_SEEDS || '17,91,1983,42,18,104,211,512,819,1337').split(',').map(Number);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = { date: '2026-10-13', browser: 'Edge Chromium', physicalIPad: false,
    seeds, errors: [], captures: [], checks: [], regeneration: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => evidence.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') evidence.errors.push(message.text()); });
    const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5191';
    await page.goto(origin + '/environment-lab');
    const canvas = page.locator('#environment-canvas[data-ready=true]');
    await canvas.waitFor();
    for (const view of ['island-overhead', 'island-oblique']) {
        assert.equal(await page.locator('#environment-camera option[value="' + view + '"]').evaluate(el => el.disabled), true);
    }
    const summary = async () => JSON.parse(await canvas.getAttribute('data-world') || 'null');
    const settings = async open => {
        const expanded = await page.locator('#environment-settings').evaluate(el => el.open);
        if (open !== expanded) await page.locator('#environment-settings > summary').click();
    };
    const changed = async action => {
        await settings(true);
        const previous = (await summary())?.generations || 0;
        await action();
        await page.waitForFunction(count => {
            const data = document.querySelector('canvas').dataset.world;
            return data && JSON.parse(data).generations > count;
        }, previous);
        await page.waitForFunction(() => !document.querySelector('#world-generate').disabled);
        await settings(false);
    };
    const exportWorld = async () => {
        await settings(true);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#world-export').click()]);
        const text = await readFile(await download.path(), 'utf8');
        await download.delete();
        await settings(false);
        return parseWorld(text);
    };
    const overlay = async value => {
        await settings(true);
        await page.selectOption('#world-overlay', value);
        await settings(false);
    };
    const capture = async file => {
        await page.waitForTimeout(850);
        await canvas.screenshot({ path: output + '/' + file });
        const world = await summary();
        if (/^(?:before-)?seed-\d+-oblique.png$/.test(file)) {
            const fixture = JSON.parse(await canvas.getAttribute('data-fixture'));
            const box = await canvas.boundingBox();
            const camera = new PerspectiveCamera(fixture.camera.fov, box.width / box.height, .1, 5000);
            camera.position.fromArray(fixture.camera.position);
            camera.lookAt(new Vector3().fromArray(fixture.camera.target));
            camera.zoom = fixture.camera.zoom;
            camera.updateProjectionMatrix();
            camera.updateMatrixWorld(true);
            const blueprint = generateWorld({ seed: world.seed, preset: 'island',
                generatorVersion: world.generatorVersion });
            const projected = blueprint.coast.map(({ a }) => new Vector3(a.x, blueprint.waterLevel, a.z).project(camera));
            assert.ok(projected.every(point => Math.abs(point.x) < .97 && Math.abs(point.y) < .97),
                file + ': the full coastline fits with a visible margin');
        }
        if (Array.isArray(world?.macro?.candidates)) world.macro.candidates = world.macro.candidates.length;
        evidence.captures.push({ file, viewport: page.viewportSize(), world,
            fixture: JSON.parse(await canvas.getAttribute('data-fixture')),
            metrics: JSON.parse(await canvas.getAttribute('data-metrics')) });
    };
    await openEnvironmentSettings(page);
    assert.equal(await page.locator('#world-preset option[value=island]').count(), 1);
    await page.locator('#environment-pause').check();
    await page.locator('#environment-fog').uncheck();
    await page.locator('#environment-nature').uncheck();
    await page.locator('#environment-village').uncheck();
    await page.selectOption('#environment-light', 'day');
    await page.selectOption('#world-preset', 'island');
    await settings(false);
    for (const seed of seeds) {
        await changed(async () => {
            await page.locator('#world-seed').fill(String(seed));
            await page.getByRole('button', { name: 'Generate World', exact: true }).click();
        });
        assert.equal((await summary()).validation.accepted, true);
        assert.equal((await summary()).macro.accepted, true);
        const separation = (await summary()).macro.terrainSeparation;
        assert.ok(separation.heightAboveSites >= 8 && separation.width >= 12);
        assert.ok(separation.connection.length > 2);
        assert.match(await page.locator('#world-generation-status').textContent(), /Terrain ridge:.*walking connection/);
        assert.match(await page.locator('#world-generation-status').textContent(), /2 natural lowland pockets/);
        assert.equal((await summary()).generatorVersion, 'fjordside-island-v0.3b-r2');
        await overlay('elevation');
        await page.selectOption('#environment-camera', 'island-overhead');
        await capture('seed-' + seed + '-overhead.png');
        await overlay('form');
        await page.selectOption('#environment-camera', 'island-oblique');
        await capture('seed-' + seed + '-oblique.png');
        await page.selectOption('#environment-camera', 'shore');
        await capture('seed-' + seed + '-shore.png');
        const original = generateWorld({ seed, preset: 'island', conifers: 'ez-tree',
            generatorVersion: 'fjordside-island-v0.3b' });
        await changed(() => page.locator('#world-import').setInputFiles({ name: 'comparison-before.json',
            mimeType: 'application/json', buffer: Buffer.from(serializeWorld(original)) }));
        await overlay('elevation');
        await page.selectOption('#environment-camera', 'island-overhead');
        await capture('before-seed-' + seed + '-overhead.png');
        await overlay('form');
        await page.selectOption('#environment-camera', 'island-oblique');
        await capture('before-seed-' + seed + '-oblique.png');
        console.log('Captured island before/after', seed);
    }
    if (!process.env.QA_CAPTURE_ONLY) {
    await changed(async () => {
        await page.locator('#world-seed').fill('17');
        await page.locator('#world-generate').click();
    });
    await overlay('macro');
    await page.selectOption('#environment-camera', 'island-overhead');
    await capture('seed-17-compartments.png');
    const first = await exportWorld();
    assert.deepEqual(first, generateWorld({ seed: 17, preset: 'island', conifers: 'ez-tree' }));
    for (const view of ['island-oblique', 'shore']) {
        await overlay('elevation');
        await page.selectOption('#environment-camera', view);
        await capture('seed-17-' + view + '-elevation.png');
        await overlay('none');
        await capture('seed-17-' + view + '-materials.png');
    }
    await settings(true);
    await page.locator('#environment-nature').check();
    await page.locator('#environment-village').check();
    await settings(false);
    await capture('seed-17-shore-scenery.png');
    await page.selectOption('#environment-light', 'night');
    await capture('seed-17-shore-night.png');
    await page.selectOption('#environment-light', 'day');
    await changed(() => page.selectOption('#environment-quality', 'low'));
    assert.deepEqual(await exportWorld(), first, 'Quality cannot regenerate saved geography');
    for (let i = 0; i < 3; i++) {
        await changed(() => page.locator('#world-import').setInputFiles({ name: 'island.json',
            mimeType: 'application/json', buffer: Buffer.from(serializeWorld(first)) }));
        assert.deepEqual(await exportWorld(), first);
        await page.waitForTimeout(700);
        evidence.regeneration.push(JSON.parse(await canvas.getAttribute('data-metrics')));
    }
    assert.ok(evidence.regeneration.every(value => value.geometries === evidence.regeneration[0].geometries &&
        value.textures === evidence.regeneration[0].textures), 'Repeated replacement retains stable resources');
    const firstIsland = generateWorld({ seed: 17, preset: 'island', conifers: 'ez-tree',
        generatorVersion: 'fjordside-island-v0.3b' });
    await changed(() => page.locator('#world-import').setInputFiles({ name: 'first-island.json',
        mimeType: 'application/json', buffer: Buffer.from(serializeWorld(firstIsland)) }));
    assert.deepEqual(await exportWorld(), firstIsland, 'The first island revision loads without new terrain');
    const old = parseWorld(await readFile('docs/qa/generated-sand-resolution/blueprint-17.json', 'utf8'));
    await changed(() => page.locator('#world-import').setInputFiles({ name: 'old.json',
        mimeType: 'application/json', buffer: Buffer.from(serializeWorld(old)) }));
    assert.deepEqual(await exportWorld(), old, 'Stored v0.1 blueprint is imported intact');
    const rejected = generateWorld({ seed: 73, preset: 'island', relief: 1.5,
        generatorVersion: 'fjordside-island-v0.3b' });
    await changed(() => page.locator('#world-import').setInputFiles({ name: 'rejected.json',
        mimeType: 'application/json', buffer: Buffer.from(serializeWorld(rejected)) }));
    assert.match(await page.locator('#world-generation-status').textContent(), /REJECTED/);
    assert.equal((await summary()).seed, 73);
    assert.equal((await summary()).referenceResidents, 0);
    await overlay('elevation');
    await page.selectOption('#environment-camera', 'island-overhead');
    await capture('rejected-73-overhead.png');
    await overlay('form');
    await page.selectOption('#environment-camera', 'island-oblique');
    await capture('rejected-73-oblique.png');
    await settings(true);
    await page.locator('#world-reference').click();
    await page.waitForFunction(() => !document.querySelector('canvas').dataset.world);
    assert.match(await page.locator('#world-generation-status').textContent(), /Reference Fjordside/);
    await page.locator('#world-preset').selectOption('island');
    await page.locator('#world-seed').fill('17');
    await changed(() => page.locator('#world-generate').click());
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.selectOption('#environment-camera', 'island-oblique');
    await capture('tablet-island.png');
    assert.ok(await canvas.isVisible());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.selectOption('#environment-camera', 'island-oblique');
    await capture('mobile-island.png');
    const intervals = await page.evaluate(async () => {
        const samples = [];
        let before = await new Promise(requestAnimationFrame);
        for (let i = 0; i < 40; i++) {
            const now = await new Promise(requestAnimationFrame);
            samples.push(now - before);
            before = now;
        }
        return samples;
    });
    evidence.mobileFrameIntervalsMs = intervals;
    evidence.checks.push(seeds.length + ' explicit seeds, macro/elevation/coast overlays, comparable cameras',
        'Physical ridge and traversable connection are reported for every seed',
        'Island camera controls disabled until a blueprint exists',
        'Export/import and repeated replacement preserve the full island',
        'Old v0.1 and first v0.3b island geography load intact; Reference fallback remains available',
        'Rejected macro configuration shows reasons and does not spawn reference residents',
        'Low quality, 1024px touch and 390px layouts render without changing geography');
    }
    evidence.captureOnly = !!process.env.QA_CAPTURE_ONLY;
    assert.deepEqual(evidence.errors, []);
    evidence.passed = true;
    await writeFile(output + '/browser.json', JSON.stringify(evidence, null, 2));
    console.log(evidence.captureOnly ? 'Macro island capture checks passed' : 'Macro island browser checks passed');
} finally { await browser.close(); }
