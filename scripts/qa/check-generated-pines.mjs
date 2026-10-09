import { openEnvironmentSettings } from './environment-settings.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { parseWorld, serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const { reviewSeeds } = loadTypeScript(new URL('../../src/world-generation/ReviewSeeds.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'scratch/generated-pines';
await mkdir(output, { recursive: true });
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const batch = reviewSeeds.map(config => {
    const world = generateWorld({ ...config, conifers: 'ez-tree' });
    assert.equal(world.validation.accepted, true, JSON.stringify({ config, validation: world.validation }));
    assert.deepEqual(world, generateWorld({ ...config, conifers: 'ez-tree' }));
    assert.deepEqual(world.terrain, generateWorld(config).terrain);
    return { config: world.config, validation: world.validation,
        trees: world.placementPlan.filter(p => p.assetId.includes('conifer')).length,
        terrainSha256: hash(world.terrain), placementSha256: hash(world.placementPlan) };
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1640, height: 1400 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(90000);
const errors = [], captures = [], regeneration = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
try {
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5181') + '/environment-lab');
    const canvas = page.locator('canvas[data-ready=true]');
    await canvas.waitFor();
    await openEnvironmentSettings(page);
    const conifers = page.getByRole('combobox', { name: 'Conifers', exact: true });
    const generate = page.getByRole('button', { name: 'Generate World', exact: true });
    const state = async () => JSON.parse(await canvas.getAttribute('data-world') || 'null');
    const changed = async action => {
        const previous = (await state())?.generations || 0;
        await action();
        await page.waitForFunction(count => {
            const data = document.querySelector('canvas').dataset.world;
            return data && JSON.parse(data).generations > count;
        }, previous);
        assert.equal(await conifers.isEnabled(), true, 'Generated worlds must retain the approved tree choice');
    };
    const exportWorld = async () => {
        const downloaded = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Export world', exact: true }).click();
        const download = await downloaded;
        const text = await readFile(await download.path(), 'utf8');
        return { text, world: parseWorld(text) };
    };
    await page.locator('#environment-pause').check();
    await page.locator('#environment-fog').uncheck();
    await page.addStyleTag({ content: '.environment-lab main{max-width:none;width:1536px;padding:0}' +
        '.environment-lab canvas{width:1536px!important;height:1024px!important;min-height:0!important}' });
    await page.selectOption('#environment-light', 'sun20-front');
    await page.locator('#environment-fill').fill('1');
    await page.locator('#environment-fill').dispatchEvent('change');
    assert.equal(await conifers.inputValue(), 'ez-tree');
    await page.getByRole('spinbutton', { name: 'World seed', exact: true }).fill('17');
    await changed(() => generate.click());
    assert.equal(await conifers.inputValue(), 'ez-tree', 'Generation honors the current tree source');
    assert.equal((await state()).conifers, 'ez-tree');
    const first = await exportWorld();
    assert.deepEqual(first.world, generateWorld({ seed: 17, conifers: 'ez-tree' }));
    for (const seed of [17, 91]) {
        if (seed !== 17) {
            await page.locator('#world-seed').fill(String(seed));
            await changed(() => generate.click());
        }
        for (const source of ['ez-tree', 'kaykit']) {
            if (await conifers.inputValue() !== source) await changed(() => conifers.selectOption(source));
            assert.equal((await state()).conifers, source);
            const exported = await exportWorld();
            assert.deepEqual(exported.world, generateWorld({ seed, conifers: source }));
            assert.deepEqual(exported.world.terrain, generateWorld({ seed }).terrain);
            for (const view of ['village', 'landscape']) {
                await page.selectOption('#environment-camera', view);
                await page.waitForTimeout(1200);
                const file = 'seed-' + seed + '-' + source + '-' + view + '.png';
                const bytes = await canvas.screenshot();
                await writeFile(output + '/' + file, bytes);
                captures.push({ file, sha256: createHash('sha256').update(bytes).digest('hex'),
                    world: await state(), fixture: JSON.parse(await canvas.getAttribute('data-fixture')),
                    metrics: JSON.parse(await canvas.getAttribute('data-metrics')) });
            }
        }
    }
    await changed(() => page.locator('#world-import').setInputFiles({ name: 'ez-tree.json',
        mimeType: 'application/json', buffer: Buffer.from(first.text) }));
    assert.equal(await conifers.inputValue(), 'ez-tree', 'Import restores the stored source');
    await changed(() => page.selectOption('#environment-quality', 'low'));
    assert.deepEqual((await exportWorld()).world, first.world, 'Quality preserves the full saved blueprint');
    await changed(() => page.selectOption('#environment-quality', 'standard'));
    for (let i = 0; i < 3; i++) {
        await changed(() => conifers.selectOption('kaykit'));
        await changed(() => conifers.selectOption('ez-tree'));
        await page.waitForTimeout(1500);
        const metrics = JSON.parse(await canvas.getAttribute('data-metrics'));
        regeneration.push({ geometries: metrics.geometries, textures: metrics.textures, calls: metrics.calls });
    }
    assert.deepEqual(regeneration[1], regeneration[0]);
    assert.deepEqual(regeneration[2], regeneration[0], 'Repeated source changes retain settled resource counts');
    const oldWorld = generateWorld({ seed: 17 });
    await changed(() => page.locator('#world-import').setInputFiles({ name: 'old-world.json',
        mimeType: 'application/json', buffer: Buffer.from(serializeWorld(oldWorld)) }));
    assert.equal(await conifers.inputValue(), 'kaykit', 'Source-free v0.1 saves retain KayKit');
    assert.deepEqual((await exportWorld()).world, oldWorld);
    await page.getByRole('button', { name: 'Reference Fjordside', exact: true }).click();
    assert.equal(await conifers.isEnabled(), true);
    assert.equal(await conifers.inputValue(), 'ez-tree', 'Reference fallback restores its previous source');
    assert.equal(await canvas.getAttribute('data-world'), null);
    assert.deepEqual(errors, []);
    await writeFile(output + '/results.json', JSON.stringify({ batch, captures, regeneration, errors,
        browser: 'Native headless Edge', format: 'Renderer snapshots, no individual frame-time samples',
        checks: ['selected source', 'two seeds / both sources', 'geography unchanged', 'source footprints',
            'full save/load', 'old-save source', 'quality preservation', 'regeneration', 'reference fallback'] }, null, 2) + '\n');
    await writeFile(output + '/review.html', '<!doctype html><html lang="en"><meta charset="utf-8">' +
        '<title>Generated conifer choices</title><style>body{background:#17252b;color:#eee;font:16px system-ui;margin:24px}' +
        'main{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%}figure{margin:0}' +
        '@media(max-width:800px){main{grid-template-columns:1fr}}</style><h1>Generated conifer choices</h1>' +
        '<p>Same terrain, camera, scale and light. Nature is replanned using each source crown footprint.' +
        ' EZ-Tree Large retains three varied role heights. See results.json for metadata.</p><main>' +
        [...captures].sort((a, b) => a.world.seed-b.world.seed ||
            a.fixture.camera.position[1]-b.fixture.camera.position[1] ||
            a.world.conifers.localeCompare(b.world.conifers)).map(c => '<figure><img src="' + c.file + '"><figcaption>' + c.file + '</figcaption></figure>').join('') +
        '</main></html>');
    console.log('PASS: ten EZ-Tree seeds; enabled tree choice; source-faithful export/import; quality; repeated changes; fallback.');
} finally {
    await browser.close();
}
