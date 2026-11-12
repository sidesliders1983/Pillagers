import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const pin = String(process.env.QA_GO || '');
assert.match(pin, /^[a-f0-9]{40}$/, 'HOLD: exact final source pin required.');
const git = 'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe';
assert.equal(execFileSync(git, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pin);
assert.equal(execFileSync(git, ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const directory = fileURLToPath(new URL('./', import.meta.url));
const fixtures = JSON.parse(await readFile(join(directory, 'fixtures.json'), 'utf8'));
assert.equal(fixtures.status, 'passed');
assert.equal(fixtures.source.head, pin);
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5199';
const quoteOnly = process.env.QA_QUOTE_ONLY === '1';
const output = join(directory, 'native-' + pin.slice(0, 8) + '-' + Date.now());
await mkdir(join(output, 'tmp'), { recursive: true });
process.env.TEMP = process.env.TMP = join(output, 'tmp');
const report = { status: 'running', source: fixtures.source, origin,
    startedAt: new Date().toISOString(), chrome: null, scenarios: [], screenshots: [], errors: [],
    scope: quoteOnly ? 'UI corrective follow-up: quote/Back/dispatch/Recall on desktop and touch; prior full journeys are pinned to f1a67cff.' : 'Full Recon functional browser journeys',
    requestFailures: [], badResponses: [],
    limits: 'Native Chrome desktop and coarse-pointer touch emulation. Physical iPhone Safari acceptance remains pending. Synthetic Core fixtures prove full known-site coverage; production area circuit is labelled separately.' };
const browser = await chromium.launch({ headless: true, chromiumSandbox: true,
    args: ['--no-proxy-server', '--mute-audio'],
    executablePath: process.env.QA_CHROME || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' });
report.chrome = browser.version();
const key = 'pillagers.fjord-play.active.v1';
const base = fixtures.fixtures.find(item => item.name === 'ready-at-home');
let page, mode;
const pendingRequests = new Set();
const press = locator => mode.touch ? locator.tap() : locator.click();
const saved = () => page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), key);
const core = async () => (await saved()).fjord.campaign;
const active = value => Object.values(value.world.spatial?.missions || {}).at(-1);
async function shot(name) {
    const path = join(output, mode.name + '-' + name + '.jpg');
    await page.screenshot({ path, quality: 87 });
    report.screenshots.push(path);
}
async function pause() {
    if (await page.locator('#fjord-run').getAttribute('aria-label') === 'Pause simulation')
        await press(page.locator('#fjord-run'));
    assert.equal(await page.locator('#fjord-run').getAttribute('aria-label'), 'Start simulation');
}
async function ready() {
    const canvas = page.locator('#fjord-canvas[data-ready="true"]');
    const proceed = page.locator('[data-entry="continue"]');
    await canvas.or(proceed).first().waitFor({ timeout: 180000 });
    if (await proceed.isVisible()) await press(proceed);
    await canvas.waitFor({ timeout: 180000 });
    const chapter = page.locator('#clan-book-close');
    if (await chapter.isVisible()) await press(chapter);
    const explore = page.getByRole('button', { name: 'Explore on my own', exact: true });
    if (await explore.isVisible()) await press(explore);
    await pause();
    await page.waitForFunction(() => !!document.querySelector('#fjord-canvas')?.dataset.rendered);
}
async function importFixture(name) {
    const context = await browser.newContext({ viewport: mode.viewport, hasTouch: mode.touch,
        isMobile: mode.touch, acceptDownloads: true });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push({ mode: mode.name, message: error.message }));
    page.on('request', request => pendingRequests.add(request.url()));
    page.on('requestfinished', request => pendingRequests.delete(request.url()));
    page.on('requestfailed', request => { pendingRequests.delete(request.url()); report.requestFailures.push({ url: request.url(), failure: request.failure() }); });
    page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await press(page.getByRole('button', { name: 'Load game', exact: true }));
    await page.locator('#campaign-recovery input[type="file"]').setInputFiles(join(directory, name + '.shared.json'));
    await ready();
    return context;
}
async function knownPlaces() {
    if (await page.locator('#island-mission-panel').isVisible()) return;
    const places = page.getByRole('button', { name: 'Known places', exact: true });
    if (!await places.isVisible()) await press(page.locator('#fjord-navigation button[data-surface="expeditions"]'));
    await press(places);
    await page.locator('#island-mission-panel').waitFor();
}
async function focusPoint(point) {
    await press(page.locator('#fjord-map-toggle'));
    const map = page.locator('#fjord-map-canvas');
    const rect = await map.boundingBox();
    const bounds = fixtures.geography.bounds;
    const x = rect.x + (point.x - bounds.minX) / (bounds.maxX - bounds.minX) * rect.width;
    const y = rect.y + (point.z - bounds.minZ) / (bounds.maxZ - bounds.minZ) * rect.height;
    if (mode.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.locator('#fjord-island-map [data-map-status]').getByText('Camera moved. Expedition orders are unchanged.', { exact: true }).waitFor();
    await press(page.locator('#fjord-island-map [data-map-close]'));
    // Let the normal camera focus animation settle before projecting the actual terrain click.
    await page.waitForTimeout(1200);
}
async function groundScreen(point) {
    return page.locator('#fjord-canvas').evaluate((canvas, point) => {
        const camera = JSON.parse(canvas.dataset.camera), world = camera.world;
        const delta = [point.x - world[12], point.y - world[13], point.z - world[14]];
        const local = [0, 1, 2].map(i => world[i * 4] * delta[0] + world[i * 4 + 1] * delta[1] + world[i * 4 + 2] * delta[2]);
        local.push(1);
        const clip = [0, 1, 2, 3].map(row => camera.projection[row] * local[0] +
            camera.projection[row + 4] * local[1] + camera.projection[row + 8] * local[2] + camera.projection[row + 12]);
        const rect = canvas.getBoundingClientRect();
        return { x: rect.left + (clip[0] / clip[3] + 1) * rect.width / 2,
            y: rect.top + (1 - clip[1] / clip[3]) * rect.height / 2 };
    }, point);
}
async function chooseArea(target) {
    await focusPoint(target.position);
    await press(page.locator('#island-mission-panel [data-island-area]'));
    const targetInfo = fixtures.geography.points.find(point => point.x === target.position.x && point.z === target.position.z);
    const position = await groundScreen({ ...target.position, y: targetInfo.height });
    if (mode.touch) await page.touchscreen.tap(position.x, position.y); else await page.mouse.click(position.x, position.y);
}
async function quoteAndDispatch() {
    const context = await importFixture('ready-at-home');
    await knownPlaces();
    const before = await core();
    await press(page.locator('#island-mission-panel [data-island-type="Recon"]'));
    if (base.knownSiteResult?.error) {
        assert.match(await page.locator('#island-mission-panel').innerText(), /No safe observation route fits this mission/);
        await shot('known-site-refusal');
    } else {
        const summary = page.locator('#island-mission-summary');
        await summary.getByText(/Planned observation/).waitFor();
        assert.match(await summary.innerText(), /partial arc|circuit/);
        await shot('known-site-quote');
        await press(page.locator('#island-mission-dialog [data-island-cancel]'));
    }
    assert.deepEqual(await core(), before, 'Known-site quote/refusal does not spend or reveal intel');
    await chooseArea(base.full.target);
    const summary = page.locator('#island-mission-summary');
    await summary.getByText(/Planned observation/).waitFor();
    assert.match(await summary.innerText(), /circuit/);
    assert.equal((await page.locator('#island-mission-target [role="status"]').textContent()).trim(), '',
        'A valid new quote clears the previous safe-refusal message');
    assert.ok((await summary.innerText()).includes(base.full.quote.foodCost + ' Food'));
    await shot('mapped-area-circuit-quote');
    await press(page.locator('#island-mission-dialog [data-island-cancel]'));
    assert.deepEqual(await core(), before, 'Back preserves canonical state');
    await press(page.locator('#island-mission-target [data-island-stop]'));
    await knownPlaces();
    await chooseArea(base.full.target);
    await press(page.locator('#island-mission-dialog [data-island-confirm]'));
    const dispatched = await core(), mission = active(dispatched);
    assert.equal(mission.task.type, 'Recon');
    assert.equal(dispatched.stocks.food, before.stocks.food - base.full.quote.foodCost);
    assert.equal(Object.keys(dispatched.world.spatial.missions).length, Object.keys(before.world.spatial.missions).length + 1);
    assert.equal(mission.task.recon.reachedViewpoints, 0);
    await shot('paid-dispatch');
    // Immediate recall uses the real current origin; it must not invent a trip or refund.
    await knownPlaces();
    await press(page.locator('#island-mission-panel [data-island-return]'));
    const recalled = await core();
    assert.equal(recalled.stocks.food, dispatched.stocks.food);
    assert.equal(active(recalled).status, 'Returned');
    assert.equal(active(recalled).outcome, 'Cancelled');
    report.scenarios.push({ mode: mode.name, kind: 'real-file-import-known-quote-area-touch-target-back-one-dispatch-recall',
        foodBefore: before.stocks.food, foodAfter: dispatched.stocks.food, missionId: mission.id });
    await context.close();
}
async function reachedArc(name) {
    const context = await importFixture(name);
    const before = await core(), mission = active(before);
    assert.ok(mission.task.recon.reachedViewpoints >= 2);
    const focus = page.locator('#expedition-mode [data-expedition-action="focus"]');
    if (await focus.isVisible()) await press(focus);
    await knownPlaces();
    const copy = await page.locator('#island-mission-panel').innerText();
    assert.match(copy, /viewpoints reached/);
    await shot(name + '-reached');
    const observationIds = mission.task.recon.samples.map(sample => sample.sourceEventId);
    await press(page.locator('#island-mission-panel [data-island-return]'));
    assert.equal(active(await core()).status, 'Returning');
    await press(page.locator('#fjord-run'));
    await page.waitForFunction(key => Object.values(JSON.parse(sessionStorage.getItem(key))?.fjord.campaign.world.spatial.missions || {})
        .at(-1)?.status === 'Returned', key, { timeout: 180000, polling: 100 });
    await pause();
    const after = await core();
    assert.equal(active(after).task.recon.samples.length, observationIds.length);
    assert.deepEqual(active(after).task.recon.samples.map(sample => sample.sourceEventId), observationIds);
    assert.equal(active(after).task.result.discovery, null, 'Cancelled Recon does not publish partial knowledge');
    await knownPlaces();
    await shot(name + '-returned');
    const events = after.events.map(event => ({ id: event.id, type: event.type }));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
    await ready();
    assert.deepEqual((await core()).events.map(event => ({ id: event.id, type: event.type })), events);
    report.scenarios.push({ mode: mode.name, kind: name + '-real-reached-evidence-withdraw-return-reload',
        missionId: mission.id, observationIds, reached: mission.task.recon.reachedViewpoints,
        foodAtRecall: before.stocks.food, foodAtReturn: after.stocks.food });
    await context.close();
}
async function worldCapture(name) {
    const context = await importFixture(name);
    const before = await core();
    const close = page.locator('#fjord-workspace [data-ui="close-workspace"]');
    if (await close.isVisible()) await press(close);
    const focus = page.locator('#expedition-mode [data-expedition-action="focus"]');
    if (await focus.isVisible()) await press(focus);
    await page.waitForTimeout(1200);
    await shot(name + '-world');
    assert.deepEqual(await core(), before, 'Inspecting the actual group view is read-only');
    report.scenarios.push({ mode: mode.name, kind: name + '-unobstructed-world-read-only',
        missionId: active(before).id, reached: active(before).task.recon.reachedViewpoints });
    await context.close();
}
async function legacyCapture() {
    const context = await importFixture('legacy-direct-warning');
    const before = await core();
    const focus = page.locator('#expedition-mode [data-expedition-action="focus"]');
    if (await focus.isVisible()) await press(focus);
    await shot('legacy-direct-warning-preserved');
    assert.deepEqual(await core(), before);
    report.scenarios.push({ mode: mode.name, kind: 'preserved-historical-direct-visit-before-comparison',
        input: fixtures.input, semanticLimit: 'This is the saved historical route on current source, not an independently rerun old-build screenshot.' });
    await context.close();
}
try {
    mode = { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false };
    if (!quoteOnly) await legacyCapture();
    await quoteAndDispatch();
    if (!quoteOnly) {
        await reachedArc('area-circuit-mid');
        if (fixtures.fixtures.some(item => item.name === 'partial-arc-mid')) await reachedArc('partial-arc-mid');
    } else {
        await worldCapture('area-circuit-mid');
        if (fixtures.fixtures.some(item => item.name === 'partial-arc-mid')) await worldCapture('partial-arc-mid');
    }
    mode = { name: 'touch-landscape', viewport: { width: 844, height: 390 }, touch: true };
    await quoteAndDispatch();
    if (!quoteOnly) await reachedArc('area-circuit-mid');
    assert.deepEqual(report.errors, []);
    report.status = 'passed';
} catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1;
    if (page && !page.isClosed()) {
        report.pendingRequests = [...pendingRequests];
        report.document = await Promise.race([
            page.evaluate(() => ({ readyState: document.readyState, body: document.body?.innerText, url: location.href })),
            new Promise(resolve => setTimeout(() => resolve({ unavailable: 'Renderer did not answer within5s' }), 5000)),
        ]).catch(error => ({ unavailable: String(error) }));
        await shot('failure').catch(() => {});
    }
    console.error(report.failure);
} finally {
    report.finishedAt = new Date().toISOString();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
    console.log(JSON.stringify({ status: report.status, output, scenarios: report.scenarios.length, errors: report.errors }));
}
