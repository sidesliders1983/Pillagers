import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const load = file => loadTypeScript(new URL('../../src/' + file, import.meta.url));
const { SharedSettlement } = load('play/SharedSettlement.ts');
const { GameplaySession } = load('gameplay-lab/GameplaySession.ts');
const { FjordCampaign } = load('fjord-play/FjordCampaign.ts');
const { fjordFogPresentation } = load('config/FjordFog.ts');
const { fjordPresentation } = load('config/FjordPresentation.ts');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5196';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-fog-default';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(fjordPresentation.fogProfile, 'nordic');
await mkdir(output, { recursive: true });
const scenery = [];
for (const name of await readdir('Assets/Terrain')) {
    if (!name.endsWith('.glb')) continue;
    const expected = await stat('Assets/Terrain/' + name);
    const url = '/assets/Terrain/' + encodeURIComponent(name);
    const response = await fetch(origin + url, { method: 'HEAD' });
    assert.equal(response.status, 200, 'Build must contain real scenery files: ' + url);
    assert.equal(Number(response.headers.get('content-length')), expected.size, url);
    scenery.push({ url, bytes: expected.size });
}
assert.ok(scenery.some(item => item.url.endsWith('/faering-rowboat.glb')), 'The scenery kit must include the founding ship.');

const readFixture = async name => JSON.parse(await readFile(`docs/qa/integrated-playtest-180/${name}.json`, 'utf8'));
const summer = await readFixture('exploration-800');
const winter = await readFixture('snow-811');
const harsh = structuredClone(winter);
harsh.fjord.campaign.weather.regions['landing-region'].class = 'Harsh';
delete harsh.fjord.narrative;
const harshCampaign = new FjordCampaign(new GameplaySession(), 'island-pool-v1', JSON.stringify(harsh.fjord));
harsh.fjord = harshCampaign.exportData();
const originalReview = JSON.parse(await readFile('docs/qa/fjord-fog-191/results.json', 'utf8'));
const home = originalReview.cases.find(item => item.name === 'summer-home').samples[2].camera;
const cases = [
    { name: 'summer-discovery', fixture: summer, range: [160, 400] },
    { name: 'winter-normal-legacy', fixture: winter, range: [125, 400] },
    { name: 'winter-harsh-qa-preset', fixture: harsh, range: [45, 260] },
].filter(item => !process.env.QA_SCENES || process.env.QA_SCENES.split(',').includes(item.name));
for (const item of cases) {
    item.fixture.pace.running = false;
    item.fixture.presentation = { quality: 'low', effects: 'off',
        camera: { position: home.position, target: home.target } };
    for (const chapter of item.fixture.fjord.narrative.chapters) {
        chapter.read = true;
        chapter.notified = true;
    }
    const shared = SharedSettlement.restore(JSON.stringify(item.fixture), 'fjord');
    item.canonical = JSON.parse(shared.session.saveJSON());
    const projection = shared.fjord.readProjection();
    item.buildingIds = projection.entities.filter(entity => entity.kind === 'building' && entity.transform)
        .map(entity => entity.id).sort();
    item.expected = fjordFogPresentation('nordic', { width: shared.fjord.blueprint.config.width,
        winterWeight: projection.calendar.winterWeight, rainWeight: projection.precipitation.rain,
        weather: projection.weatherVisual.class });
    assert.deepEqual([item.expected.near, item.expected.far], item.range);
}

const report = { note: 'Normal production build, no QA transform, DPR 1 desktop Edge.',
    scenery, cases: [], errors: [] };
report.sourceHashes = Object.fromEntries(await Promise.all([
    'src/config/FjordPresentation.ts', 'src/config/FjordFog.ts', 'src/fjord-play/FjordPlay.ts',
    'src/core/WorldLighting.ts', 'src/fjord-play/DiscoveryFog.ts',
].map(async file => [file, digest(await readFile(file))])));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    for (const item of cases) {
        const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
        page.setDefaultTimeout(300000);
        page.on('pageerror', error => report.errors.push({ name: item.name, error: error.message }));
        await page.addInitScript(json => sessionStorage.setItem('pillagers.fjord-play.active.v1', json),
            JSON.stringify(item.fixture));
        console.log('OPEN', item.name);
        await page.goto(origin + '/fjord-play?debugDiscovery=1', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#fjord-canvas')?.dataset.ready === 'true' &&
            document.querySelector('#fjord-canvas')?.dataset.rendered);
        await page.evaluate(() => { document.querySelector('#clan-book-close')?.click(); document.activeElement?.blur(); });
        const diagnostics = await page.evaluate(() => {
            const canvas = document.querySelector('#fjord-canvas');
            return { bridgePresent: typeof window.__fjordAudit !== 'undefined',
                weather: JSON.parse(canvas.dataset.weather), discovery: JSON.parse(canvas.dataset.discovery),
                snow: JSON.parse(canvas.dataset.seasonMaterials) };
        });
        assert.equal(diagnostics.bridgePresent, false);
        assert.deepEqual([diagnostics.weather.observed.fogNear, diagnostics.weather.observed.fogFar], item.range);
        assert.equal(diagnostics.discovery.active, item.name === 'summer-discovery');
        if (item.name === 'summer-discovery') assert.ok(diagnostics.discovery.unknownCells > 0);
        if (item.name === 'winter-normal-legacy') {
            const reviewed = originalReview.cases.find(item => item.name === 'winter-retention').samples[2];
            // UUIDs identify objects within one renderer, not snow settings across application starts.
            const snowSettings = value => ({ groundColors: value.groundColors, foliageColors: value.foliageColors,
                snowAmounts: value.snowAmounts, materialCount: value.materials.length });
            assert.deepEqual(snowSettings(diagnostics.snow), snowSettings(reviewed.terrainSnow));
        }
        const samples = [];
        for (const quality of ['low', 'standard']) {
            await page.evaluate(quality => {
                const select = document.querySelector('#fjord-quality');
                select.value = quality;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                document.querySelector('#fjord-view-home').click();
            }, quality);
            await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
                .every(entity => !entity.placeholder));
            const rendered = await page.evaluate(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered));
            assert.deepEqual(rendered.filter(entity => entity.key.includes('island-rival')), []);
            const buildings = rendered.filter(entity => entity.kind === 'building');
            assert.deepEqual(buildings.map(entity => entity.id).sort(), item.buildingIds);
            if (item.name !== 'summer-discovery') assert.ok(buildings.length > 0);
            if (item.name === 'winter-normal-legacy')
                await page.evaluate(() => document.querySelector('#fjord-view-summit').click());
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const file = item.name + '-' + quality + '.jpg';
            await sharp(await page.locator('#fjord-canvas').screenshot())
                .jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(output + '/' + file);
            samples.push({ quality, file, models: rendered.length, buildingIds: buildings.map(entity => entity.id),
                placeholders: rendered.filter(entity => entity.placeholder) });
        }
        const downloadReady = page.waitForEvent('download');
        await page.evaluate(() => document.querySelector('#fjord-export-core').click());
        const downloaded = await downloadReady;
        const actual = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
        assert.deepEqual(actual, item.canonical, 'Pause, quality and camera controls must preserve canonical state.');
        report.cases.push({ name: item.name, expectedRange: item.range, diagnostics, samples,
            canonicalSha256: digest(JSON.stringify(actual)) });
        await page.close();
        console.log('PASS', item.name);
    }
    assert.deepEqual(report.errors, []);
    for (const [file, sha256] of Object.entries(report.sourceHashes))
        assert.equal(digest(await readFile(file)), sha256);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
