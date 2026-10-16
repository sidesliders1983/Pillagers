import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { serializeWorld, parseWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const output = process.env.QA_OUTPUT || 'artifacts/terrain-shading/lab';
await mkdir(output, { recursive: true });
const world = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r3', conifers: 'ez-tree', environment: { version: 1 } });
const fixture = serializeWorld(world);
parseWorld(fixture);
console.log('Validated regular Lab island 18');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(180000);
const errors = [], captures = [];
page.on('pageerror', error => errors.push(error.message));
async function exported() {
    const downloading = page.waitForEvent('download');
    await page.locator('#world-export').click();
    return readFile(await (await downloading).path(), 'utf8');
}
async function shading(mode) {
    await page.locator('#world-terrain-shading').selectOption(mode);
    await page.waitForFunction(mode => {
        const canvas = document.querySelector('#environment-canvas');
        return canvas.dataset.terrainStudyPending !== 'true' &&
            JSON.parse(canvas.dataset.terrainShading || 'null')?.variant === mode;
    }, mode);
}
try {
    await page.goto(origin + '/environment-lab');
    await page.locator('#world-generate').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#world-terrain-shading').count(), 1);
    await page.locator('#environment-canvas[data-ready="true"]').waitFor();
    await page.locator('#environment-settings').evaluate(element => element.open = true);
    await page.locator('#environment-pause').check();
    await page.locator('#environment-fog').uncheck();
    await page.locator('#world-import').setInputFiles({ name: 'canonical-island-18.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
    await page.waitForFunction(() => {
        const canvas = document.querySelector('#environment-canvas');
        const status = document.querySelector('#world-generation-status').textContent;
        return canvas.dataset.world || /failed|stopped/i.test(status);
    });
    assert.ok(await page.locator('#environment-canvas').getAttribute('data-world'),
        await page.locator('#world-generation-status').innerText());
    await page.locator('#world-terrain-shading:not([disabled])').waitFor();
    await page.locator('#world-ground-blending').selectOption('zoned');
    await page.waitForFunction(() => !document.querySelector('#world-generate').disabled &&
        JSON.parse(document.querySelector('#environment-canvas').dataset.ground).blending === 'zoned');
    console.log('Imported Lab island and enabled approved zoned materials');
    await page.waitForFunction(() => document.querySelector('#environment-canvas').dataset.world);
    assert.equal(await page.locator('#world-terrain-shading').inputValue(), 'baseline');
    const initial = await exported();
    assert.deepEqual(JSON.parse(initial), JSON.parse(fixture));
    await page.locator('#environment-nature').uncheck();
    await page.locator('#environment-village').uncheck();
    const views = [
        { id: 'meadow-normal', camera: 'ground-rock-transition', overlay: 'form', light: 'day' },
        { id: 'meadow-textured', camera: 'ground-rock-transition', overlay: 'none', light: 'day' },
        { id: 'source-uv', camera: 'ground-rock-transition', overlay: 'source-grass', light: 'day' },
        { id: 'bedrock', camera: 'ground-rock', overlay: 'none', light: 'day' },
        { id: 'shoreline', camera: 'sand-shore', overlay: 'none', light: 'day' },
        { id: 'island-overhead', camera: 'island-overhead', overlay: 'none', light: 'day' },
        { id: 'soil', camera: 'ground-mud', overlay: 'none', light: 'day' },
        { id: 'low-sun', camera: 'ground-rock-transition', overlay: 'none', light: 'sun20-front' },
    ];
    for (const view of views) {
        await page.locator('#environment-settings').evaluate(element => element.open = true);
        await page.locator('#environment-camera').selectOption(view.camera);
        await page.locator('#environment-light').selectOption(view.light);
        await page.locator('#world-overlay').selectOption(view.overlay);
        await page.waitForFunction(() => document.querySelector('#environment-canvas').dataset.terrainStudyPending !== 'true');
        for (const mode of ['baseline', 'smooth']) {
            await shading(mode);
            const ground = JSON.parse(await page.locator('#environment-canvas').getAttribute('data-ground'));
            assert.ok(ground.flatShading.every(flag => flag === (mode === 'baseline')));
            await page.locator('#environment-settings').evaluate(element => element.open = false);
            await page.waitForTimeout(700);
            const path = view.id + '-' + mode + '.png';
            await page.locator('#environment-canvas').screenshot({ path: output + '/' + path });
            const camera = JSON.parse(await page.locator('#environment-canvas').getAttribute('data-fixture')).camera;
            captures.push({ ...view, mode, path, camera, ground });
            await page.locator('#environment-settings').evaluate(element => element.open = true);
        }
        assert.deepEqual(captures.at(-1).camera, captures.at(-2).camera, 'A/B camera poses are identical');
        console.log('Captured ' + view.id);
    }
    await page.locator('#world-overlay').selectOption('none');
    await shading('smooth');
    assert.equal(await exported(), initial, 'Rendering does not change the canonical exported world');
    await page.locator('#world-terrain-shading').selectOption('baseline');
    await page.locator('#world-terrain-shading').selectOption('smooth');
    await shading('baseline');
    for (const tier of ['low', 'standard']) {
        await page.locator('#environment-quality').selectOption(tier);
        await page.waitForFunction(tier => document.querySelector('#environment-canvas').dataset.groundTier === tier &&
            !document.querySelector('#world-generate').disabled, tier);
        await shading('smooth');
        assert.equal(await exported(), initial);
    }
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ origin, fixtureSha256: createHash('sha256').update(fixture).digest('hex'),
        seed: world.config.seed, generatorVersion: world.config.generatorVersion, identicalExports: true, captures, errors,
        note: 'Same regular Lab blueprint for all A/B captures; separate full-scene pairs use the real campaign island. Paused waves/wind, no vegetation/props in diagnostic captures. Edge desktop; physical mobile untested.' }, null, 2));
} catch (error) {
    await writeFile(output + '/failure.txt', await page.locator('body').innerText());
    await page.screenshot({ path: output + '/failure.png' });
    throw error;
} finally { await browser.close(); }
