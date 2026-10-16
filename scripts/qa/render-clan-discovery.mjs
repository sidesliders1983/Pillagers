import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5193';
const output = 'artifacts/clan-discovery';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [], errors = [];
await mkdir(output, { recursive: true });
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => errors.push(error.message));
    for (const seed of (process.env.QA_DISCOVERY_SEEDS ? process.env.QA_DISCOVERY_SEEDS.split(',').map(Number) :
        [17, 42, 91, 1983, 1337, 18, 7, 73, 256, 65537])) {
        await page.goto(origin + '/docs/qa/clan-discovery/scene.html?seed=' + seed);
        await page.locator('#discovery-fixture[data-ready="true"]').waitFor();
        const initial = await page.evaluate(() => window.discoveryReview.inspect());
        const metrics = [];
        for (const quality of ['low', 'standard']) {
            await page.evaluate(q => window.discoveryReview.setQuality(q), quality);
            for (const enabled of [false, true]) {
                await page.evaluate(value => { window.discoveryReview.setFog(value); window.discoveryReview.setView('oblique'); }, enabled);
                metrics.push({ quality, fog: enabled, ...await page.evaluate(() => window.discoveryReview.measure()) });
            }
        }
        for (const quality of ['low', 'standard']) {
            const off = metrics.find(m => m.quality === quality && !m.fog);
            const on = metrics.find(m => m.quality === quality && m.fog);
            assert.equal(on.drawCalls - off.drawCalls, 1, 'Steady fog adds one native draw call');
        }
        for (const view of ['top', 'oblique']) for (const enabled of [false, true]) {
            await page.evaluate(({ view, enabled }) => {
                window.discoveryReview.setQuality('low');
                window.discoveryReview.setView(view);
                window.discoveryReview.setFog(enabled);
            }, { view, enabled });
            await page.waitForTimeout(200);
            await page.screenshot({ path: output + '/' + seed + '-' + view + (enabled ? '-fog' : '-clear') + '.jpg', quality: 85 });
        }
        await page.evaluate(() => { window.discoveryReview.setView('home'); window.discoveryReview.setAtmosphere(true); window.discoveryReview.setLighting('dusk'); });
        await page.waitForTimeout(100);
        await page.screenshot({ path: output + '/' + seed + '-dusk.jpg', quality: 85 });
        await page.evaluate(() => { window.discoveryReview.setAtmosphere(false); window.discoveryReview.setLighting('night'); });
        await page.screenshot({ path: output + '/' + seed + '-night.jpg', quality: 85 });
        assert.deepEqual((await page.evaluate(() => window.discoveryReview.inspect())).state, initial.state,
            'Camera, quality, day/night and atmospheric fog cannot alter discovery');
        assert.equal(initial.rivalVisible, false, 'Undiscovered rival fixture cannot be rendered or picked');
        results.push({ seed, initial: { ...initial, state: undefined }, metrics });
        console.log('Reviewed seed ' + seed);
    }
    assert.deepEqual(errors, []);
    const sourceHashes = {};
    for (const path of ['src/fjord-play/DiscoveryFog.ts', 'src/simulation/ClanDiscovery.ts'])
        sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    await writeFile(output + '/render-matrix.json', JSON.stringify({ measuredAt: new Date().toISOString(), sourceHashes,
        browser: await browser.version(), viewport: { width: 1024, height: 768 },
        workload: 'Undecorated native Three.js observer fixture; not full gameplay or physical mobile', errors, results }, null, 2));
} finally { await browser.close(); }
