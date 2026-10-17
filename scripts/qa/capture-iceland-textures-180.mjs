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
const root = 'docs/qa/iceland-textures-180';
const output = process.env.QA_OUTPUT || root;
const fixtures = (process.env.QA_FIXTURES || 'developed-810,summer-17,snow-811').split(',');
const tiers = (process.env.QA_TIERS || 'standard,low').split(',');
const digest = value => createHash('sha256').update(value).digest('hex');
const sourcePaths = ['src/world/WorldFactory.ts', 'src/world/WorldGroundMaterials.ts',
    'src/world/GroundBlending.ts', 'src/world/BlueprintTerrain.ts', 'src/world/SeasonTint.ts',
    'src/core/WorldLighting.ts', 'src/config/FjordPresentation.ts', 'src/config/GroundBlendConfig.ts',
    'scripts/qa/fjord-iceland-material-study-browser.mjs', 'scripts/qa/capture-iceland-textures-180.mjs',
    root + '/generation.json', root + '/delivery.json'];
const delivery = JSON.parse(await readFile(root + '/delivery.json', 'utf8'));
for (const asset of [...delivery.sourceAssets, ...delivery.delivery]) sourcePaths.push(root + '/' + asset.file);
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, digest(await readFile(path))])));
const result = { version: 'iceland-native-albedo-study-v1',
    captureParent: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    viewport: { width: 1440, height: 900 }, sourceHashes, cases: [], errors: [] };
await mkdir(output, { recursive: true });
const save = () => writeFile(output + '/observations.json', JSON.stringify(result, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function snapshot(page, camera) {
    const state = await page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), camera);
    const invariants = await page.evaluate(async () => {
        const { world, lighting, renderer } = window.__fjordAudit.references;
        const terrain = world.terrain;
        const hash = async array => {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            const value = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        };
        const geometry = {};
        for (const [name, attribute] of Object.entries(terrain.geometry.attributes)) geometry[name] = await hash(attribute.array);
        geometry.index = terrain.geometry.index ? await hash(terrain.geometry.index.array) : null;
        const light = lighting.directional;
        return { geometry, groups: terrain.geometry.groups,
            masks: await Promise.all(terrain.material.map(material => material.alphaMap ? hash(material.alphaMap.image.data) : null)),
            lighting: { sun: light.color.toArray(), position: light.position.toArray(), target: light.target.position.toArray(),
                intensity: light.intensity, ambient: lighting.ambient.intensity, sky: lighting.ambient.color.toArray(),
                ground: lighting.ambient.groundColor.toArray(), exposure: renderer.toneMappingExposure,
                size: light.shadow.mapSize.toArray(), radius: light.shadow.radius, bias: light.shadow.bias,
                normalBias: light.shadow.normalBias, projection: light.shadow.camera.projectionMatrix.toArray() } };
    });
    assert.deepEqual(state.placeholders, []);
    return { state, comparable: { canonical: digest(state.canonicalJSON), blueprint: digest(state.blueprintJSON),
        actors: digest(JSON.stringify(state.actors)), camera: state.camera, invariants } };
}

try {
    for (const fixtureName of fixtures) for (const quality of tiers) {
        const input = await readFile(`docs/qa/fjord-runtime-performance/fixtures/${fixtureName}.json`, 'utf8');
        const fixture = JSON.parse(input);
        const expected = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        fixture.target = 'fjord';
        fixture.pace.running = false;
        const entry = { fixture: fixtureName, quality, fixtureSha256: digest(input), views: [] };
        result.cases.push(entry);
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
                    const tier = document.querySelector('#fjord-quality'), effects = document.querySelector('#fjord-effects');
                    if (!tier || !effects) return;
                    tier.value = quality;
                    effects.value = 'off';
                    observer.disconnect();
                });
                observer.observe(document, { childList: true, subtree: true });
            }, { json: JSON.stringify(fixture), quality });
            await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5196') + '/fjord-play',
                { waitUntil: 'domcontentloaded', timeout: 240000 });
            await page.waitForFunction(() => window.__fjordAudit?.golden &&
                document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
            await page.addStyleTag({ content: `#fjord-management, #fjord-management-toggle,
                #fjord-selection-leaders, #fjord-selection-labels, #fjord-production-labels { visibility: hidden !important; }` });
            const initial = await snapshot(page);
            assert.deepEqual(JSON.parse(initial.state.canonicalJSON), expected);
            const poses = [{ id: 'settlement', camera: initial.state.camera }];
            if (fixtureName === 'developed-810') {
                const details = await page.evaluate(async () => {
                    const { world, layer } = window.__fjordAudit.references;
                    const { createBlueprintSurface } = await import('/src/world-generation/TerrainQueries.ts');
                    const blueprint = world.blueprint, environment = blueprint.environment;
                    const surface = createBlueprintSurface(blueprint);
                    const building = layer.describe().filter(entity => entity.kind === 'building' && entity.bounds)
                        .sort((a, b) => a.key.localeCompare(b.key))[0];
                    const centre = { x: (building.bounds.min.x + building.bounds.max.x) / 2,
                        z: (building.bounds.min.z + building.bounds.max.z) / 2 };
                    const pose = (x, z) => {
                        const y = surface.surfaceHeightAt(x, z);
                        return { position: [x + 16, y + 17, z - 19], target: [x, y, z] };
                    };
                    const candidates = environment.primary.map((_, index) => ({
                        index, x: blueprint.terrain.bounds.minX + index % environment.columns * environment.spacing,
                        z: blueprint.terrain.bounds.minZ + Math.floor(index / environment.columns) * environment.spacing,
                    })).filter(point => surface.surfaceHeightAt(point.x, point.z) > blueprint.waterLevel + .15);
                    const find = field => candidates.map(point => ({ ...point,
                        score: environment.fields[field][point.index] - Math.hypot(point.x - centre.x, point.z - centre.z) / 10000,
                    })).sort((a, b) => b.score - a.score || a.index - b.index)[0];
                    return [{ id: 'yard', camera: pose(centre.x, centre.z) },
                        ...[['coast', 'sand'], ['rock', 'rockExposure']].map(([id, field]) => {
                            const point = find(field);
                            return { id, field, weight: environment.fields[field][point.index], camera: pose(point.x, point.z) };
                        })];
                });
                poses.push(...details);
            }
            await page.evaluate(async quality => {
                const { installIcelandMaterialStudy } = await import('/scripts/qa/fjord-iceland-material-study-browser.mjs');
                window.__icelandStudy = await installIcelandMaterialStudy(window.__fjordAudit, quality);
                window.__icelandStudy.select('iceland-albedo');
                await window.__fjordAudit.golden.capture();
                window.__icelandStudy.select('native');
                await window.__fjordAudit.golden.capture();
            }, quality);
            for (const pose of poses) {
                const view = { ...pose, variants: [] };
                entry.views.push(view);
                let reference, nativePixels;
                for (const variant of ['native', 'current-albedo', 'iceland-albedo', 'restored']) {
                    await page.evaluate(mode => window.__icelandStudy.select(mode === 'restored' ? 'native' : mode), variant);
                    const { state, comparable } = await snapshot(page, pose.camera);
                    if (reference) assert.deepEqual(comparable, reference, 'Materials must not alter the frozen world.');
                    else reference = comparable;
                    const image = await page.locator('#fjord-canvas').screenshot();
                    const pixels = await sharp(image).raw().toBuffer();
                    if (variant === 'native') nativePixels = pixels;
                    if (variant === 'restored') {
                        assert.ok(pixels.equals(nativePixels), 'Restoring native materials must restore the exact pixels.');
                        view.nativeRestoredPixelsMatch = true;
                        continue;
                    }
                    const file = `${fixtureName}-${quality}-${pose.id}-${variant}.jpg`;
                    await sharp(image).jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toFile(output + '/' + file);
                    const materialStudy = await page.evaluate(() => window.__icelandStudy.inspect());
                    assert.equal(materialStudy.addedColourSources, 4);
                    for (const map of materialStudy.maps) {
                        assert.equal(map.width, quality === 'standard' ? 1024 : 512);
                        assert.deepEqual(map.repeat, [.125, .125]);
                        if (variant !== 'native') assert.ok(!map.normalMap && !map.roughnessMap);
                    }
                    view.variants.push({ variant, image: file, jpegSha256: digest(await readFile(output + '/' + file)),
                        rawPixelsSha256: digest(pixels), ...comparable, calendar: state.calendar,
                        renderer: state.renderer, materialStudy });
                    console.log('CAPTURE', file, state.renderer.callsIncludingShadows, 'calls');
                    await save();
                }
                const [native, current, candidate] = view.variants;
                assert.deepEqual(candidate.renderer, current.renderer, 'Controlled albedo modes must retain rendering counts.');
                assert.equal(native.renderer.callsIncludingShadows, candidate.renderer.callsIncludingShadows);
                assert.equal(native.renderer.trianglesIncludingShadows, candidate.renderer.trianglesIncludingShadows);
            }
            await page.evaluate(() => window.__icelandStudy.dispose());
        } finally { await page.close(); }
    }
    for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(digest(await readFile(path)), expected);
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
