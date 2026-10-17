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
const summitStudy = process.env.QA_STUDY === 'summit';
const rockRoot = 'docs/qa/iceland-rock-snow-180';
const root = summitStudy ? 'docs/qa/iceland-summit-snow-180' : rockRoot;
const output = process.env.QA_OUTPUT || root;
const fixtures = (process.env.QA_FIXTURES || 'developed-810,snow-811,summer-17').split(',');
const tiers = (process.env.QA_TIERS || 'standard,low').split(',');
const hash = value => createHash('sha256').update(value).digest('hex');
const delivery = JSON.parse(await readFile(rockRoot + '/delivery.json', 'utf8'));
const sourceFiles = ['src/world/SeasonTint.ts', 'src/world/GroundBlending.ts', 'src/world/BlueprintTerrain.ts',
    'src/core/WorldLighting.ts', 'src/config/FjordPresentation.ts', 'src/fjord-play/CampaignIsland.ts',
    'scripts/qa/fjord-rock-snow-study-browser.mjs', 'scripts/qa/capture-rock-snow-180.mjs',
    'scripts/qa/prepare-rock-surface-180.mjs', rockRoot + '/delivery.json', delivery.sourceFile,
    ...(summitStudy ? ['scripts/qa/fjord-summit-snow-study-browser.mjs', 'src/fjord-play/DiscoveryFog.ts'] : []),
    ...delivery.delivery.map(map => rockRoot + '/' + map.file)];
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(file))])));
const evidence = { version: summitStudy ? 'permanent-summit-native-v1' : 'rock-snow-native-v1',
    parent: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    viewport: { width: 1440, height: 900 }, sourceHashes,
    presentation: { discoveryOverlayHiddenForSummitInspection: summitStudy }, cases: [], errors: [] };
await mkdir(output, { recursive: true });
const save = () => writeFile(output + '/observations.json', JSON.stringify(evidence, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function captureState(page, camera) {
    const state = await page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), camera);
    const terrain = await page.evaluate(async () => {
        const { world, scene } = window.__fjordAudit.references;
        const mesh = world.terrain;
        const hash = async array => {
            const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
        };
        return { discoveryOverlayVisible: scene.getObjectByName('Clan discovery fog')?.visible ?? null,
            attributes: Object.fromEntries(await Promise.all(Object.entries(mesh.geometry.attributes)
            .map(async ([name, attribute]) => [name, await hash(attribute.array)]))),
            index: await hash(mesh.geometry.index.array), groups: mesh.geometry.groups,
            masks: await Promise.all(mesh.material.map(material => material.alphaMap ? hash(material.alphaMap.image.data) : null)) };
    });
    assert.deepEqual(state.placeholders, []);
    return { state, comparable: { canonical: hash(state.canonicalJSON), blueprint: hash(state.blueprintJSON),
        actors: hash(JSON.stringify(state.actors)), camera: state.camera, lighting: state.lighting, terrain } };
}

try {
    for (const fixtureName of fixtures) for (const quality of tiers) {
        const input = await readFile(`docs/qa/fjord-runtime-performance/fixtures/${fixtureName}.json`, 'utf8');
        const fixture = JSON.parse(input);
        const expected = core.reconstructState(JSON.stringify(fixture.fjord.campaign));
        fixture.target = 'fjord';
        fixture.pace.running = false;
        const entry = { fixture: fixtureName, quality, fixtureSha256: hash(input), views: [] };
        evidence.cases.push(entry);
        const page = await browser.newPage({ viewport: evidence.viewport, deviceScaleFactor: 1 });
        page.setDefaultTimeout(240000);
        page.on('pageerror', error => evidence.errors.push({ fixtureName, quality, error: error.message }));
        page.on('console', message => {
            if (message.type() === 'error') evidence.errors.push({ fixtureName, quality, error: message.text() });
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
            await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5197') + '/fjord-play',
                { waitUntil: 'domcontentloaded', timeout: 240000 });
            await page.waitForFunction(() => window.__fjordAudit?.golden &&
                document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
            await page.addStyleTag({ content: '#fjord-management, #fjord-management-toggle, #fjord-selection-leaders, #fjord-selection-labels, #fjord-production-labels { visibility:hidden!important }' });
            if (summitStudy) await page.evaluate(() => {
                const fog = window.__fjordAudit.references.scene.getObjectByName('Clan discovery fog');
                if (fog) fog.visible = false;
            });
            const initial = await captureState(page);
            assert.deepEqual(JSON.parse(initial.state.canonicalJSON), expected);
            const subjects = await page.evaluate(async summitStudy => {
                const { world } = window.__fjordAudit.references;
                const blueprint = world.blueprint, zones = blueprint.environment, terrain = blueprint.terrain;
                const { createBlueprintSurface, terrainGradientAt } = await import('/src/world-generation/TerrainQueries.ts');
                const surface = createBlueprintSurface(blueprint);
                const center = blueprint.settlement.center;
                if (summitStudy) {
                    const peak = terrain.heights.reduce((best, y, index) => y > best.y ? { y, index } : best,
                        { y: -Infinity, index: 0 });
                    const x = terrain.bounds.minX + peak.index % terrain.columns * terrain.spacing;
                    const z = terrain.bounds.minZ + Math.floor(peak.index / terrain.columns) * terrain.spacing;
                    return [{ id: 'summit', subject: { x, y: peak.y, z },
                        camera: { position: [x + 70, peak.y + 58, z - 80], target: [x, peak.y - 3, z] } }];
                }
                const points = zones.fields.rockExposure.map((rock, index) => {
                    const x = terrain.bounds.minX + index % zones.columns * zones.spacing;
                    const z = terrain.bounds.minZ + Math.floor(index / zones.columns) * zones.spacing;
                    const gradient = terrainGradientAt(blueprint, x, z);
                    return { x, z, y: surface.surfaceHeightAt(x, z), rock, gradient,
                        slope: Math.hypot(gradient.x, gradient.z), distance: Math.hypot(x - center.x, z - center.z) };
                }).filter(point => point.rock > .9 && point.y > 5 && point.slope > .8 && point.distance > 25)
                    .sort((a, b) => a.distance - b.distance || b.y - a.y);
                if (!points.length) throw Error('The saved world has no suitable exposed-rock camera subject');
                const point = points[0], length = Math.hypot(point.gradient.x, point.gradient.z);
                const dx = -point.gradient.x / length, dz = -point.gradient.z / length;
                const view = (id, distance, elevation) => ({ id, subject: point,
                    camera: { target: [point.x, point.y, point.z],
                        position: [point.x + dx * distance, point.y + elevation, point.z + dz * distance] } });
                return [view('cliff', 40, 15), view('surface', 15, 7)];
            }, summitStudy);
            const poses = summitStudy ? subjects : [{ id: 'settlement', camera: initial.state.camera }, ...subjects];
            await page.evaluate(async ({ quality, summitStudy }) => {
                const installer = summitStudy
                    ? (await import('/scripts/qa/fjord-summit-snow-study-browser.mjs')).installSummitSnowStudy
                    : (await import('/scripts/qa/fjord-rock-snow-study-browser.mjs')).installRockSnowStudy;
                window.__rockSnowStudy = await installer(window.__fjordAudit, quality);
                for (const mode of ['candidate', 'current']) {
                    window.__rockSnowStudy.select(mode);
                    await window.__fjordAudit.golden.capture();
                }
            }, { quality, summitStudy });
            for (const pose of poses) {
                const view = { ...pose, variants: [] };
                entry.views.push(view);
                let reference, originalPixels;
                for (const variant of ['current', 'candidate', 'restored']) {
                    await page.evaluate(mode => window.__rockSnowStudy.select(mode === 'restored' ? 'current' : mode), variant);
                    const { state, comparable } = await captureState(page, pose.camera);
                    if (reference) assert.deepEqual(comparable, reference, 'Only rock material presentation may change');
                    else reference = comparable;
                    const image = await page.locator('#fjord-canvas').screenshot();
                    const pixels = await sharp(image).raw().toBuffer();
                    if (variant === 'current') originalPixels = pixels;
                    if (variant === 'restored') {
                        assert.ok(pixels.equals(originalPixels), 'Restoring the prior texture candidate must restore exact pixels');
                        view.restoredPixelsMatch = true;
                        continue;
                    }
                    const file = `${fixtureName}-${quality}-${pose.id}-${variant}.jpg`;
                    const jpg = await sharp(image).jpeg({ quality: 91, chromaSubsampling: '4:4:4' }).toBuffer();
                    await writeFile(output + '/' + file, jpg);
                    const materials = await page.evaluate(() => window.__rockSnowStudy.inspect());
                    view.variants.push({ variant, image: file, jpegSha256: hash(jpg), rawPixelsSha256: hash(pixels),
                        ...comparable, calendar: state.calendar, renderer: state.renderer, materials });
                    console.log('CAPTURE', file, state.renderer.callsIncludingShadows, 'calls');
                    await save();
                }
                assert.deepEqual(view.variants[0].renderer, view.variants[1].renderer);
            }
            await page.evaluate(() => window.__rockSnowStudy.dispose());
        } finally { await page.close(); }
    }
    for (const [file, expected] of Object.entries(sourceHashes)) assert.equal(hash(await readFile(file)), expected);
    assert.deepEqual(evidence.errors, []);
    evidence.status = 'PASS';
} catch (error) {
    evidence.status = 'FAIL';
    evidence.failure = String(error);
    throw error;
} finally {
    await save();
    await browser.close();
}
