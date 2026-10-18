import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
import { digest } from './exploration-replay.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const load = path => loadTypeScript(new URL('../../src/' + path, import.meta.url));
const core = load('simulation/SimulationCore.ts');
const { siteRoutes } = load('world-generation/SiteNavigation.ts');
const { discoveryAt, inspectClanDiscovery } = load('simulation/ClanDiscovery.ts');
const { createBlueprintSurface } = load('world-generation/TerrainQueries.ts');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5197';
const output = process.env.QA_OUTPUT || 'artifacts/exploration-151';
const frames = Number(process.env.QA_FRAMES || 120);
const repeats = Number(process.env.QA_REPEATS || 2);
const viewports = [{ width: 1200, height: 850, touch: false },
    { width: 1024, height: 768, touch: true }, { width: 390, height: 844, touch: true }];
const fixtures = Object.fromEntries(await Promise.all(['fresh', 'observed', 'returned'].map(async name =>
    [name, JSON.parse(await readFile(output + '/' + name + '.json', 'utf8'))])));
await mkdir(output + '/browser', { recursive: true });
const report = { status: 'RUNNING', physicalDevice: false, userAgent: null, journeys: [],
    profiles: [], errors: [], note: 'Native desktop Edge; touch viewports are emulation, not iPhone/iPad certification.' };

async function open(browser, fixture, viewport) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.touch, deviceScaleFactor: 1 });
    page.setDefaultTimeout(240000);
    page.on('pageerror', error => report.errors.push(error.message));
    const save = structuredClone(fixture);
    save.pace.running = false;
    save.presentation = { quality: 'low', effects: 'off', camera: {
        position: [0, 80, -80], target: [0, 0, 0] } };
    for (const chapter of save.fjord.narrative.chapters) { chapter.read = true; chapter.notified = true; }
    await page.addInitScript(data => {
        if (sessionStorage.getItem('qa151-loaded')) return;
        sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(data));
        sessionStorage.setItem('qa151-loaded', '1');
    }, save);
    await page.goto(origin + '/fjord-play?debugDiscovery=1', { waitUntil: 'domcontentloaded' });
    await ready(page);
    report.userAgent ??= await page.evaluate(() => navigator.userAgent);
    report.renderer ??= await page.evaluate(() => window.__fjordAudit.inspect().renderer);
    return page;
}

async function ready(page) {
    await page.waitForFunction(() => document.querySelector('.fjord-load-error') ||
        document.querySelector('#fjord-canvas')?.dataset.ready === 'true' && window.__fjordAudit,
    undefined, { timeout: 240000 });
    assert.equal(await page.locator('.fjord-load-error').count(), 0);
    await page.evaluate(async () => {
        document.querySelector('#clan-book-close')?.click();
        window.qa151 = await import('/scripts/qa/exploration-browser.mjs');
        window.__fjordAudit.references.setPlayback(false);
        await window.__fjordAudit.references.settle();
    });
    assert.equal(await page.getByRole('button', { name: 'Start simulation', exact: true }).count(), 1);
    page.setDefaultTimeout(20000);
}

const state = page => page.evaluate(() => JSON.parse(window.__fjordAudit.references.session.saveJSON()));
const click = (page, selector, touch) => touch ? page.locator(selector).tap() : page.locator(selector).click();
const settle = page => page.evaluate(() => window.__fjordAudit.references.settle());
const advance = async (page, ticks) => {
    await page.evaluate(ticks => window.__fjordAudit.references.advanceTicks(ticks), ticks);
    await settle(page);
};
const mission = state => Object.values(state.world.spatial?.missions ?? {})
    .find(item => item.status !== 'Returned');

async function assertPrivacy(page, expected) {
    const exposed = await page.evaluate(() => ({
        rival: JSON.parse(document.querySelector('#fjord-canvas').dataset.rival),
        own: JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered),
        selection: window.__fjordAudit.references.shared.selection,
    }));
    const actual = await state(page);
    const body = await page.locator('body').innerText();
    const publicQueries = JSON.stringify({ world: core.inspectWorld(actual),
        expeditions: core.inspectSpatialExpeditions(actual) });
    for (const person of Object.values(actual.world.targetClans['island-rival'].personas)) {
        assert.ok(!body.includes(person.id), 'Rival identity must not leak into normal text.');
        assert.ok(!publicQueries.includes(person.id), 'Normal query output is clan-scoped.');
        if (!Object.values(actual.personas).some(own => own.name === person.name))
            assert.ok(!body.includes(person.name), 'Rival names must not leak through labels or inspectors.');
    }
    assert.ok(exposed.own.every(item => !item.id.startsWith('island-rival') && !item.placeholder));
    if (expected === 'observed') {
        assert.equal(exposed.rival.currentlyObserved, true);
        assert.ok(exposed.rival.rendered.some(item => item.kind === 'persona'));
        assert.ok(exposed.rival.rendered.every(item => !item.placeholder));
    } else {
        assert.equal(exposed.rival.currentlyObserved, false);
        assert.deepEqual(exposed.rival.rendered, []);
        assert.equal(exposed.rival.known, expected === 'mapped');
    }
    assert.equal(Number(await page.locator('#fjord-residents').innerText()),
        Object.values(actual.personas).filter(person => person.deathWinter === null).length);
    return exposed;
}

async function saveTrace(page, label) {
    const capture = await page.evaluate(() => window.qa151Trace.finish());
    const world = capture.world;
    delete capture.world;
    capture.worldSha256 = digest(world);
    const tracePath = output + '/browser/' + label + '-trace.json';
    const worldPath = output + '/browser/' + label + '-world.json';
    await writeFile(tracePath, JSON.stringify(capture));
    await writeFile(worldPath, JSON.stringify(world));
    const result = JSON.parse(execFileSync(process.execPath,
        ['scripts/qa/replay-exploration-without-renderer.mjs', tracePath, worldPath],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
    return { ...result, traceFile: label + '-trace.json' };
}

async function campaignMenu(page, touch) {
    if (!await page.locator('#fjord-menu').evaluate(element => element.open))
        await click(page, '#fjord-menu > summary', touch);
    if (!await page.locator('#fjord-campaign').evaluate(element => element.open))
        await click(page, '#fjord-campaign > summary', touch);
}

async function journey(browser, viewport) {
    console.log('OPEN browser journey ' + viewport.width);
    const page = await open(browser, fixtures.fresh, viewport);
    try {
        report.userAgent ??= await page.evaluate(() => navigator.userAgent);
        await assertPrivacy(page, 'unknown');
        await page.evaluate(() => { window.qa151Trace = window.qa151.installCommandTrace(window.__fjordAudit); });
        const original = await state(page);
        const crewId = core.inspectWorld(original).eligible[0].id;
        await click(page, '[data-surface="expeditions"]', viewport.touch);
        await click(page, '#expedition-create', viewport.touch);
        await settle(page);
        await page.locator('[data-member-group="group-1"][data-member="' + crewId + '"]').check();
        await settle(page);
        await click(page, '[data-start="group-1"]', viewport.touch);
        await click(page, '#expedition-start-cancel', viewport.touch);
        assert.equal((await state(page)).stocks.food, original.stocks.food);
        await click(page, '[data-start="group-1"]', viewport.touch);
        await click(page, '#expedition-start-confirm', viewport.touch);
        await settle(page);
        const prepared = await state(page);
        assert.equal(prepared.stocks.food, original.stocks.food - 2);
        assert.equal(await page.locator('#fjord-next').isDisabled(), true);
        await page.locator('#fjord-next').evaluate(button => button.dispatchEvent(
            new MouseEvent('click', { bubbles: true })));
        await settle(page);
        assert.deepEqual(await state(page), prepared, 'Even a dispatched disabled click cannot skip expedition time.');

        const data = await page.evaluate(id => {
            const refs = window.__fjordAudit.references;
            return { world: refs.campaign.blueprint,
                actor: refs.layer.describe().find(item => item.id === id) };
        }, crewId);
        const route = siteRoutes(data.world.navigation,
            { x: data.actor.position[0], z: data.actor.position[2] })(data.world.rivalSite.center);
        const known = inspectClanDiscovery(prepared.discovery, prepared.clan.id);
        const firstUnknown = route.findIndex(point => discoveryAt(known, point.x, point.z) === 'unknown');
        assert.ok(firstUnknown > 0);
        const goal = route[Math.min(firstUnknown + 8, route.length - 1)];
        const height = createBlueprintSurface(data.world).surfaceHeightAt(goal.x, goal.z);
        await page.evaluate(async ({ goal, height }) => window.__fjordAudit.golden.capture({ camera: {
            position: [goal.x + 40, height + 85, goal.z - 80],
            target: [goal.x, height, goal.z] } }), { goal, height });
        const project = await page.locator('#fjord-canvas').evaluate(canvas => ({
            rect: canvas.getBoundingClientRect().toJSON(), camera: JSON.parse(canvas.dataset.camera) }));
        const clip = new Vector3(goal.x, height, goal.z)
            .applyMatrix4(new Matrix4().fromArray(project.camera.world).invert())
            .applyMatrix4(new Matrix4().fromArray(project.camera.projection));
        const x = project.rect.x + (clip.x + 1) * project.rect.width / 2;
        const y = project.rect.y + (1 - clip.y) * project.rect.height / 2;
        const place = () => viewport.touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
        await place();
        await page.locator('#expedition-send:not([disabled])').waitFor();
        assert.deepEqual(await state(page), prepared, 'A preview cannot spend food or reveal land.');
        await click(page, '#expedition-cancel', viewport.touch);
        assert.deepEqual(await state(page), prepared);
        await click(page, '#expedition-mode [data-explore="group-1"]', viewport.touch);
        await place();
        await click(page, '#expedition-send', viewport.touch);
        await settle(page);
        assert.equal(mission(await state(page)).status, 'Traveling');
        // Real foreground clock, then the public visibility boundary; no synthetic advance during this span.
        const departureTime = (await state(page)).time;
        await page.evaluate(() => {
            window.__fjordAudit.flags.manualClock = false;
            window.__fjordAudit.golden.frozen = false;
        });
        await click(page, '#fjord-run', viewport.touch);
        await page.waitForFunction(time => {
            const state = window.__fjordAudit.references.session.readSnapshot();
            return (state.time.winter - time.winter) * state.ticksPerWinter + state.time.tick - time.tick >= 4;
        }, departureTime);
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const suspended = await state(page);
        await page.waitForTimeout(700);
        assert.deepEqual(await state(page), suspended);
        await page.evaluate(() => {
            delete document.hidden; delete document.visibilityState;
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(700);
        assert.deepEqual(await state(page), suspended, 'Returning to the tab has no offline catch-up.');
        assert.equal(await page.getByRole('button', { name: 'Start simulation', exact: true }).count(), 1);
        await page.evaluate(() => {
            window.__fjordAudit.flags.manualClock = true;
            window.__fjordAudit.golden.frozen = true;
        });
        await advance(page, 12);
        const travelling = await state(page);
        assert.ok(mission(travelling).travelled > 0);
        const firstTrace = await saveTrace(page, 'journey-' + viewport.width + '-departure');

        await campaignMenu(page, viewport.touch);
        await click(page, '#fjord-save', viewport.touch);
        await advance(page, 8);
        await campaignMenu(page, viewport.touch);
        await click(page, '#fjord-load', viewport.touch);
        await page.waitForFunction(() => document.querySelector('#fjord-notice').textContent === 'Shared campaign loaded, paused.');
        assert.deepEqual(await state(page), travelling, 'Actual local save/load must restore the complete journey.');
        await page.reload();
        await ready(page);
        assert.deepEqual(await state(page), travelling, 'Reload never advances or rerolls the island.');
        await page.evaluate(() => { window.qa151Trace = window.qa151.installCommandTrace(window.__fjordAudit); });
        for (let ticks = 0; ticks < 400 && mission(await state(page))?.status === 'Traveling'; ticks += 4)
            await advance(page, 4);
        assert.equal(mission(await state(page)).status, 'Exploring');
        await click(page, '#expedition-mode [data-recall="group-1"]', viewport.touch);
        await settle(page);
        for (let ticks = 0; ticks < 400 && mission(await state(page)); ticks += 4)
            await advance(page, 4);
        const returned = await state(page);
        assert.equal(mission(returned), undefined);
        assert.equal(await page.locator('#fjord-next').isDisabled(), false);
        const secondTrace = await saveTrace(page, 'journey-' + viewport.width + '-return');
        await assertPrivacy(page, 'unknown');
        await page.screenshot({ path: output + '/browser/journey-' + viewport.width + '.jpg', type: 'jpeg', quality: 86 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false, 'The play UI cannot overflow horizontally.');
        report.journeys.push({ viewport, firstTrace, secondTrace, localSaveExact: true,
            reloadPaused: true, previewAndCancelExact: true, groupsReturned: true,
            actualClockReplayed: true, simulatedVisibilityPausesWithoutCatchup: true, overflow });
        console.log('PASS UI journey, storage and Core replay at ' + viewport.width);
    } catch (error) {
        await writeFile(output + '/browser/journey-' + viewport.width + '-failure.txt',
            String(error) + '\n' + await page.locator('body').innerText());
        await page.screenshot({ path: output + '/browser/journey-' + viewport.width + '-failure.jpg',
            type: 'jpeg', quality: 86 });
        throw error;
    } finally { await page.close(); }
}

async function profile(browser, label) {
    console.log('OPEN profile ' + label);
    const page = await open(browser, fixtures[label], viewports[0]);
    try {
        const data = await page.evaluate(() => window.__fjordAudit.references.campaign.blueprint);
        const center = data.rivalSite.center;
        const height = createBlueprintSurface(data).surfaceHeightAt(center.x, center.z);
        await page.evaluate(async ({ center, height }) => {
            const audit = window.__fjordAudit;
            window.qa151Draws = window.qa151.installDrawCounters(audit);
            await audit.golden.capture({ camera: { position: [center.x + 30, height + 38, center.z - 42],
                target: [center.x, height + 1, center.z] } });
        }, { center, height });
        const expected = label === 'fresh' ? 'unknown' : label === 'observed' ? 'observed' : 'mapped';
        const before = await state(page);
        await assertPrivacy(page, expected);
        for (const viewport of viewports) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            for (const quality of ['low', 'standard']) {
                await page.locator('#fjord-quality').evaluate((select, value) => {
                    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
                }, quality);
                await settle(page);
                await page.waitForTimeout(1000);
                const samples = [];
                for (let repeat = 0; repeat < repeats; repeat++) {
                    samples.push(await page.evaluate(async frames => {
                        const audit = window.__fjordAudit;
                        audit.start({ instrument: true, gpu: true });
                        for (let frame = 0; frame < frames; frame++) await new Promise(requestAnimationFrame);
                        return { runtime: audit.stop(), draws: window.qa151Draws(),
                            allocations: window.qa151.allocationSnapshot(audit) };
                    }, frames));
                }
                assert.deepEqual(await state(page), before, 'Rendering and viewport changes cannot tick or reveal.');
                await assertPrivacy(page, expected);
                for (const sample of samples) {
                    assert.ok(sample.draws.mainCalls > 0 && sample.draws.shadowCalls > 0);
                    assert.equal(sample.allocations.rivalPlaceholders, 0);
                    assert.equal(sample.allocations.fog.drawCalls, 1);
                    if (expected !== 'observed') assert.equal(sample.allocations.rivalEntities, 0);
                }
                await page.screenshot({ path: output + '/browser/' + label + '-' + viewport.width + '-' + quality + '.jpg',
                    type: 'jpeg', quality: 86 });
                report.profiles.push({ label, viewport: { width: viewport.width, height: viewport.height },
                    hasTouch: false, quality, frames, repeats, samples });
                console.log('PROFILE ' + label + ' / ' + viewport.width + ' / ' + quality + ': ' +
                    samples[0].runtime.frames.p50 + ' / ' + samples[0].runtime.frames.p95 + ' ms');
            }
        }
        const isolation = await page.evaluate(async () => {
            const { references: refs } = window.__fjordAudit;
            const before = refs.session.saveJSON();
            const ids = refs.rivalScene.describe().map(item => item.renderId).sort();
            const pose = { position: refs.camera.position.toArray(), target: refs.controller.focus.toArray() };
            refs.lighting.setFog(false);
            document.querySelector('#fjord-view-home').click();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            refs.controller.setView(pose);
            refs.lighting.setFog(true);
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            return { coreExact: before === refs.session.saveJSON(), ids,
                afterIds: refs.rivalScene.describe().map(item => item.renderId).sort() };
        });
        assert.equal(isolation.coreExact, true);
        assert.deepEqual(isolation.afterIds, isolation.ids, 'Camera/frustum travel cannot duplicate or respawn the rival.');
        const canvasBox = await page.locator('#fjord-canvas').boundingBox();
        await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
        await settle(page);
        assert.equal(await page.evaluate(() => window.__fjordAudit.references.shared.selection), null,
            'Rival/unknown picking cannot open player management.');
        await assertPrivacy(page, expected);
        assert.deepEqual(await state(page), before);
        report.profiles.at(-1).presentationIsolation = isolation;
        await page.evaluate(() => window.__fjordAudit.references.lighting.setMode('night'));
        await page.waitForTimeout(500);
        assert.deepEqual(await state(page), before);
        await assertPrivacy(page, expected);
        await page.screenshot({ path: output + '/browser/' + label + '-native-night-preview.jpg',
            type: 'jpeg', quality: 86 });
    } finally { await page.close(); }
}

async function seasons(browser) {
    console.log('OPEN physical-island seasonal checks');
    const page = await open(browser, fixtures.fresh, viewports[1]);
    report.seasons = [];
    try {
        await page.evaluate(() => {
            window.qa151Trace = window.qa151.installCommandTrace(window.__fjordAudit);
            document.querySelector('#fjord-view-home').click();
        });
        await settle(page);
        for (const [name, ticks] of [['Summer', 0], ['Autumn', 250], ['Winter', 250]]) {
            if (ticks) await advance(page, ticks);
            for (const quality of ['low', 'standard']) {
                await page.locator('#fjord-quality').evaluate((select, value) => {
                    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
                }, quality);
                await page.locator('#fjord-effects').evaluate(select => {
                    select.value = 'low'; select.dispatchEvent(new Event('change', { bubbles: true }));
                });
                await settle(page);
                const startedAt = (await state(page)).time;
                await page.evaluate(() => {
                    window.__fjordAudit.flags.manualClock = false;
                    window.__fjordAudit.golden.frozen = false;
                    window.__fjordAudit.references.setPlayback(true);
                });
                await page.waitForFunction(({ startedAt, name }) => {
                    const audit = window.__fjordAudit, state = audit.references.session.readSnapshot();
                    const ticks = (state.time.winter - startedAt.winter) * state.ticksPerWinter +
                        state.time.tick - startedAt.tick;
                    const particles = audit.references.precipitationEffect.inspect();
                    return ticks >= 4 && (name === 'Summer' || particles[name === 'Autumn' ? 'rain' : 'snow'] > 0);
                }, { startedAt, name });
                await page.evaluate(() => {
                    window.__fjordAudit.references.setPlayback(false);
                    window.__fjordAudit.flags.manualClock = true;
                    window.__fjordAudit.golden.frozen = true;
                });
                const canonical = await state(page);
                const details = await page.evaluate(() => {
                    const audit = window.__fjordAudit, canvas = document.querySelector('#fjord-canvas');
                    return { calendar: JSON.parse(canvas.dataset.calendar),
                        weather: JSON.parse(canvas.dataset.weather),
                        precipitation: audit.references.precipitationEffect.inspect(),
                        fog: audit.references.discoveryFog.inspect(),
                        materials: JSON.parse(canvas.dataset.seasonMaterials) };
                });
                assert.equal(details.calendar.season, name);
                assert.ok(details.fog.unknownCells > 0 && details.fog.visibleCells > 0);
                assert.equal(details.fog.drawCalls, 1);
                assert.equal(details.precipitation.enabled, true);
                if (name === 'Autumn') assert.ok(details.precipitation.targetRain > .9);
                if (name === 'Winter') assert.equal(details.precipitation.targetSnow, 1);
                await page.evaluate(() => window.__fjordAudit.references.lighting.setFog(false));
                await assertPrivacy(page, 'unknown');
                assert.deepEqual(await state(page), canonical);
                await page.evaluate(() => window.__fjordAudit.references.lighting.setFog(true));
                await page.screenshot({ path: output + '/browser/physical-' + name.toLowerCase() + '-' + quality + '.jpg',
                    type: 'jpeg', quality: 86 });
                report.seasons.push({ name, quality, coreSha256: digest(canonical), ...details });
            }
        }
        report.seasonalTrace = await saveTrace(page, 'physical-seasons');
        console.log('PASS actual physical summer, autumn rain and winter snow, with exact Core replay');
    } finally { await page.close(); }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    if (process.env.QA_PROFILES_ONLY !== '1' && process.env.QA_SEASONS_ONLY !== '1')
        for (const viewport of viewports.filter(item => !process.env.QA_WIDTH || item.width === Number(process.env.QA_WIDTH)))
            await journey(browser, viewport);
    if (process.env.QA_JOURNEYS_ONLY !== '1' && process.env.QA_SEASONS_ONLY !== '1')
        for (const label of ['fresh', 'observed', 'returned']) await profile(browser, label);
    if (process.env.QA_JOURNEYS_ONLY !== '1' && process.env.QA_PROFILES_ONLY !== '1') await seasons(browser);
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/browser-results' + (process.env.QA_JOURNEYS_ONLY === '1' ? '-journeys' :
        process.env.QA_PROFILES_ONLY === '1' ? '-profiles' :
        process.env.QA_SEASONS_ONLY === '1' ? '-seasons' : '') + '.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
