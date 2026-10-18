import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5195';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-fog';
const digest = value => createHash('sha256').update(value).digest('hex');
const load = file => loadTypeScript(new URL('../../src/' + file, import.meta.url));
const { GameplaySession } = load('gameplay-lab/GameplaySession.ts');
const { FjordCampaign } = load('fjord-play/FjordCampaign.ts');
const { createBlueprintSurface } = load('world-generation/TerrainQueries.ts');
const { inspectSettlementSave } = load('play/SharedSettlement.ts');
const sourceFiles = ['src/config/FjordFog.ts', 'src/config/FjordPresentation.ts',
    'src/core/WorldLighting.ts', 'src/fjord-play/DiscoveryFog.ts', 'src/fjord-play/FjordPlay.ts',
    'scripts/qa/fjord-fog-study.mjs', 'scripts/qa/fjord-runtime-server.mjs', 'scripts/qa/check-fjord-fog.mjs'];
const report = { version: 1, cases: [], performance: [], errors: [],
    physicalIPhoneTested: false, note: 'Native desktop Edge at fixed CSS viewports and DPR 1.' };
report.sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file =>
    [file, digest(await readFile(file))])));
await mkdir(output, { recursive: true });
const readFixture = async file => JSON.parse(await readFile(file, 'utf8'));
const start = await readFixture('docs/qa/integrated-playtest-180/exploration-800.json');

// Generate a mapped save through ordinary Core commands, never by editing discovery bits.
const session = new GameplaySession();
const campaign = new FjordCampaign(session, 'island-pool-v1', JSON.stringify(start.fjord));
session.command({ type: 'StartExpedition', groupId: 'group-1' });
session.command({ type: 'ExploreArea', groupId: 'group-1', target: { x: 106, z: 94 } });
const mission = () => Object.values(session.readSnapshot().world.spatial.missions).at(-1);
let steps = 0;
while (mission().status !== 'Exploring' && steps++ < 250)
    session.command({ type: 'AdvanceTicks', ticks: 1 });
assert.equal(mission().status, 'Exploring');
session.command({ type: 'RecallExpedition', groupId: 'group-1' });
while (mission().status !== 'Returned' && steps++ < 500)
    session.command({ type: 'AdvanceTicks', ticks: 1 });
assert.equal(mission().status, 'Returned');
const mapped = structuredClone(start);
mapped.fjord = campaign.exportData();
await writeFile(output + '/mapped-fixture.json', JSON.stringify(mapped));
report.mappedPreparation = { commands: ['StartExpedition', 'ExploreArea(106,94)', 'AdvanceTicks',
    'RecallExpedition', 'AdvanceTicks'], ticksAdvanced: steps, fixtureSha256: digest(JSON.stringify(mapped)) };
const winter = structuredClone(start);
const winterSession = new GameplaySession();
const winterCampaign = new FjordCampaign(winterSession, 'island-pool-v1', JSON.stringify(start.fjord));
winterSession.command({ type: 'AdvanceTicks', ticks: 500 });
winter.fjord = winterCampaign.exportData();
await writeFile(output + '/winter-fixture.json', JSON.stringify(winter));
const legacySnow = await readFixture('docs/qa/integrated-playtest-180/snow-811.json');
const storm = structuredClone(legacySnow);
// An explicit QA weather preset; discovery bits and production weather rules are never edited.
storm.fjord.campaign.weather.regions['landing-region'].class = 'Severe';
// Rebuild the fixture's book through the normal adapter; a changed weather preset must not
// carry the original book's canonical identity. Production import validation stays strict.
delete storm.fjord.narrative;
const stormCampaign = new FjordCampaign(new GameplaySession(), 'island-pool-v1', JSON.stringify(storm.fjord));
storm.fjord = stormCampaign.exportData();
const surface = createBlueprintSurface(campaign.blueprint);
const height = (x, z) => Math.max(campaign.blueprint.waterLevel, surface.surfaceHeightAt(x, z));
const view = (target, offset) => ({ target: [target[0], height(...target) + 1, target[1]],
    position: [target[0] + offset[0], height(...target) + offset[1], target[1] + offset[2]] });
const desktop = { width: 1200, height: 850 };
const phone = { width: 390, height: 844 };
const tablet = { width: 1024, height: 768 };
const home = view([70, 146], [28, 31, -32]);
const slope = view([85, 110], [55, 38, 65]);
const fjord = view([40, 85], [115, 70, 100]);
const scenarios = [
    { name: 'summer-home', fixture: start, viewport: desktop, camera: home, profile: true,
        caption: 'Summer 800 · current home view · visible settlement and coastline' },
    { name: 'summer-slope-phone', fixture: start, viewport: phone, camera: slope, profile: true,
        caption: '390 CSS pixels · neighboring slope · desktop Edge, not physical Safari' },
    { name: 'summer-fjord', fixture: start, viewport: desktop, camera: fjord,
        caption: 'Higher RTS orbit · visible coast meets unknown ridgeline' },
    { name: 'unknown-ridge', fixture: start, viewport: desktop, summit: true,
        caption: 'Unknown mountain · atmospheric-only is a QA diagnostic, not a playable reveal' },
    { name: 'island-top', fixture: start, viewport: desktop,
        camera: { position: [0, 650, .01], target: [0, 0, 0] },
        caption: 'Top-down island · unknown remains intentionally opaque' },
    { name: 'summer-dusk', fixture: start, viewport: desktop, camera: fjord, lightMode: 'dusk',
        caption: 'Native day/night preview at phase .18 · canonical time unchanged' },
    { name: 'summer-night', fixture: start, viewport: desktop, camera: fjord, lightMode: 'night',
        caption: 'Native night preview at phase 0 · canonical time unchanged' },
    { name: 'mapped-tablet', fixture: mapped, viewport: tablet, camera: slope,
        caption: 'Returned scouts · confirmed mapped ground next to currently observed home' },
    { name: 'winter-discovery', fixture: winter, viewport: desktop, camera: fjord,
        caption: 'Winter 801 · canonical discovery remains active · seasonal snow unchanged' },
    { name: 'winter-retention', fixture: legacySnow,
        viewport: desktop, summit: true, legacy: true,
        caption: 'Legacy save without discovery · permanent white snow patch remains intact' },
    { name: 'autumn-rain', fixture: await readFixture('docs/qa/fjord-runtime-performance/fixtures/rain-810.json'),
        viewport: desktop, camera: fjord, legacy: true,
        caption: 'Legacy rainy autumn atmosphere · particles off to isolate the two fog layers' },
    { name: 'snow-storm', fixture: storm, viewport: desktop, camera: fjord, legacy: true,
        caption: 'Severe winter QA weather preset · native weather lighting · snow materials retained' },
].filter(scenario => !process.env.QA_SCENES || process.env.QA_SCENES.split(',').includes(scenario.name));
for (const fixture of new Set(scenarios.map(scenario => scenario.fixture)))
    inspectSettlementSave(JSON.stringify(fixture));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let page;
let previousFixture;
async function configure(variant, scenario, quality = 'standard') {
    await page.evaluate(({ variant, lightMode, quality }) => {
        const select = document.querySelector('#fjord-quality');
        select.value = quality;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        window.__fjordAudit.fogStudy.configure({ variant, lightMode: lightMode || 'season' });
    }, { variant, lightMode: scenario.lightMode, quality });
    return page.evaluate(camera => window.__fjordAudit.golden.capture({ camera }), scenario.camera);
}
async function inspect() {
    return page.evaluate(() => {
        const audit = window.__fjordAudit;
        const { discoveryFog, campaign, layer } = audit.references;
        let alphaHash = 2166136261;
        for (const mesh of discoveryFog?.root.children || []) {
            for (const byte of mesh.material.alphaMap.image.data)
                alphaHash = Math.imul(alphaHash ^ byte, 16777619) >>> 0;
        }
        return { ...audit.fogStudy.inspect(), alphaHash,
            rivalProjection: campaign.readProjection().rival,
            foreignEntityKeys: layer.describe().filter(entity => entity.key.includes('island-rival')).map(e => e.key),
            storage: Object.keys(sessionStorage).sort(),
            bookVisible: !document.querySelector('#clan-book')?.hidden };
    });
}
try {
    for (const scenario of scenarios) {
        if (previousFixture !== scenario.fixture) {
            await page?.close();
            page = await browser.newPage({ viewport: scenario.viewport, deviceScaleFactor: 1 });
            page.setDefaultTimeout(300000);
            page.on('pageerror', error => report.errors.push({ scenario: scenario.name, error: error.message }));
            const fixture = structuredClone(scenario.fixture);
            fixture.pace.running = false;
            for (const chapter of fixture.fjord.narrative.chapters) {
                chapter.notified = true;
                chapter.read = true;
            }
            await page.addInitScript(({ json, effects }) => {
                sessionStorage.setItem('pillagers.fjord-play.active.v1', json);
                const observer = new MutationObserver(() => {
                    const field = document.querySelector('#fjord-effects');
                    if (field) { field.value = effects; observer.disconnect(); }
                });
                observer.observe(document, { childList: true, subtree: true });
            }, { json: JSON.stringify(fixture), effects: scenario.effects || 'off' });
            console.log('OPEN', scenario.name);
            await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.__fjordAudit?.fogStudy &&
                document.querySelector('#fjord-canvas')?.dataset.ready === 'true');
            await page.evaluate(() => {
                document.querySelector('#clan-book-close')?.click();
                document.activeElement?.blur();
                window.__fjordAudit.flags.diagnostics = true;
            });
            previousFixture = scenario.fixture;
        }
        await page.setViewportSize(scenario.viewport);
        if (scenario.summit) await page.evaluate(() => document.querySelector('#fjord-view-summit').click());
        const pair = [];
        for (const variant of ['current', 'atmospheric-only', 'candidate']) {
            const capture = await configure(variant, scenario);
            const info = await inspect();
            assert.deepEqual(capture.placeholders, []);
            assert.deepEqual(info.rivals, []);
            assert.deepEqual(info.foreignEntityKeys, []);
            if (scenario.legacy) assert.equal(info.discovery, null);
            else assert.ok(info.discovery.unknownCells > 0);
            const file = scenario.name + '-' + variant + '.jpg';
            await sharp(await page.locator('#fjord-canvas').screenshot())
                .jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toFile(output + '/' + file);
            const sample = { variant, file, camera: capture.camera, renderer: capture.renderer,
                lighting: capture.lighting, ...info };
            pair.push({ capture, sample });
            console.log('CAPTURE', scenario.name, variant, capture.renderer.callsIncludingShadows);
        }
        const baseline = pair[0];
        for (const { capture, sample } of pair.slice(1)) {
            assert.equal(capture.canonicalJSON, baseline.capture.canonicalJSON);
            assert.equal(capture.blueprintJSON, baseline.capture.blueprintJSON);
            assert.deepEqual(capture.actors, baseline.capture.actors);
            assert.deepEqual(capture.camera, baseline.capture.camera);
            assert.deepEqual(sample.terrainSnow, baseline.sample.terrainSnow);
            assert.deepEqual(sample.structureSnow, baseline.sample.structureSnow);
            assert.equal(sample.alphaHash, baseline.sample.alphaHash);
            assert.equal(capture.renderer.geometries, baseline.capture.renderer.geometries);
            assert.equal(capture.renderer.textures, baseline.capture.renderer.textures);
            assert.deepEqual(sample.storage, baseline.sample.storage);
        }
        if (scenario.name === 'mapped-tablet')
            assert.ok(baseline.sample.discovery.exploredCells > baseline.sample.discovery.visibleCells);
        report.cases.push({ name: scenario.name, caption: scenario.caption, viewport: scenario.viewport,
            fixtureSha256: digest(JSON.stringify(scenario.fixture)),
            canonicalSha256: digest(baseline.capture.canonicalJSON),
            blueprintSha256: digest(baseline.capture.blueprintJSON),
            calendar: baseline.capture.calendar, samples: pair.map(item => item.sample) });

        if (!report.hardware) report.hardware = await page.evaluate(() => window.__fjordAudit.inspect().renderer);
        if (scenario.profile && process.env.QA_PROFILE !== '0') {
            for (const quality of ['low', 'standard']) {
                // Warm both native material variants before the ABBA measurement.
                for (const variant of ['current', 'candidate']) await configure(variant, scenario, quality);
                for (const variant of ['current', 'candidate', 'candidate', 'current']) {
                    await configure(variant, scenario, quality);
                    const sample = await page.evaluate(async () => {
                        const audit = window.__fjordAudit;
                        await new Promise(resolve => {
                            let count = 0;
                            const warm = () => ++count >= 8 ? resolve() : requestAnimationFrame(warm);
                            requestAnimationFrame(warm);
                        });
                        audit.start({ instrument: true, gpu: true });
                        await new Promise(resolve => {
                            let count = 0;
                            const frame = () => ++count >= 120 ? resolve() : requestAnimationFrame(frame);
                            requestAnimationFrame(frame);
                        });
                        return { ...audit.stop(), ...audit.fogStudy.inspect() };
                    });
                    report.performance.push({ scenario: scenario.name, quality, variant, ...sample });
                    console.log('PROFILE', scenario.name, quality, variant, sample.frames.p50, sample.frames.p95);
                }
            }
        }
        await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
    }
    assert.deepEqual(report.errors, []);
    for (const file of sourceFiles) assert.equal(digest(await readFile(file)), report.sourceHashes[file]);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    if (page && !page.isClosed()) {
        report.failedPage = await page.evaluate(() => ({ title: document.title,
            body: document.body.innerText.slice(0, 2000),
            canvas: { ...document.querySelector('#fjord-canvas')?.dataset } })).catch(() => null);
        await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
    }
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
