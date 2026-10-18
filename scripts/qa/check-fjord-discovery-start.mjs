import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { inspectClanDiscovery, discoveryAt } = loadTypeScript(new URL('../../src/simulation/ClanDiscovery.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5196';
const output = process.env.QA_OUTPUT || 'artifacts/fjord-discovery-start';
const activeKey = 'pillagers.fjord-play.active.v1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const report = { status: 'RUNNING', origin, normalBuild: true, cases: [], errors: [] };
await mkdir(output, { recursive: true });

async function pauseOnArrival(page) {
    // Drive the real pause button before the first clock step. No game state is injected.
    await page.addInitScript(() => {
        const observer = new MutationObserver(() => {
            const canvas = document.querySelector('#fjord-canvas');
            const button = document.querySelector('#fjord-run');
            if (canvas?.dataset.ready === 'true' && button?.getAttribute('aria-label') === 'Pause simulation') {
                button.click();
                observer.disconnect();
            }
        });
        observer.observe(document, { subtree: true, childList: true, attributes: true,
            attributeFilter: ['data-ready', 'aria-label'] });
    });
}

async function ready(page) {
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    await page.getByRole('button', { name: 'Start simulation', exact: true }).waitFor();
    await page.evaluate(() => document.querySelector('#clan-book-close')?.click());
    assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
}

async function exportCore(page) {
    const pending = page.waitForEvent('download');
    await page.locator('#fjord-export-core').evaluate(button => button.click());
    return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}

async function noRivalLeak(page, state) {
    const view = await page.locator('#fjord-canvas').evaluate(canvas => ({
        rival: JSON.parse(canvas.dataset.rival), rendered: JSON.parse(canvas.dataset.rendered),
    }));
    assert.equal(view.rival.known, false);
    assert.deepEqual(view.rival.rendered, []);
    assert.ok(view.rendered.every(entity => !entity.placeholder && !entity.id.startsWith('island-rival')));
    const body = await page.locator('body').innerText();
    for (const person of Object.values(state.world.targetClans['island-rival'].personas)) {
        assert.ok(!body.includes(person.id));
        if (!Object.values(state.personas).some(own => own.name === person.name))
            assert.ok(!body.includes(person.name), 'The hidden rival must not leak names into the normal UI.');
    }
    return view;
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    // Exact reported entry: an empty browser opening /fjord-play without feature flags or QA saves.
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
    page.setDefaultTimeout(300000);
    page.on('pageerror', error => report.errors.push(error.message));
    await pauseOnArrival(page);
    await page.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const initial = await exportCore(page);
    assert.ok(initial.discovery, 'A fresh ordinary /fjord-play campaign must have fog of war.');
    assert.equal(initial.world.version, 2);
    assert.deepEqual(Object.keys(initial.world.targetClans), ['island-rival']);
    assert.ok(Object.keys(initial.world.targetClans['island-rival'].personas).length > 0);
    assert.deepEqual(initial.time, { winter: 800, tick: 500 });
    assert.equal(await page.locator('#fjord-exploration').isChecked(), true);
    const ownKnowledge = inspectClanDiscovery(initial.discovery, initial.clan.id);
    assert.ok(ownKnowledge.explored.split('').some(char => char !== 'f'), 'Unknown territory must remain.');
    await noRivalLeak(page, initial);
    await page.screenshot({ path: output + '/fresh-default-home.jpg', type: 'jpeg', quality: 88 });

    // Reopen the actual saved campaign. Use the real highlands control to travel to unknown land.
    const checkpoint = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), activeKey);
    const shared = SharedSettlement.restore(JSON.stringify(checkpoint), 'fjord');
    const terrain = shared.fjord.blueprint.terrain;
    const peak = terrain.heights.reduce((best, y, index) => y > best.y ? { y, index } : best,
        { y: -Infinity, index: 0 });
    const peakX = terrain.bounds.minX + peak.index % terrain.columns * terrain.spacing;
    const peakZ = terrain.bounds.minZ + Math.floor(peak.index / terrain.columns) * terrain.spacing;
    assert.equal(discoveryAt(ownKnowledge, peakX, peakZ), 'unknown');
    await page.goto(origin + '/fjord-play?debugDiscovery=1', { waitUntil: 'domcontentloaded' });
    await ready(page);
    const fog = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.discovery));
    assert.equal(fog.active, true);
    assert.ok(fog.unknownCells > 0 && fog.visibleCells > 0);
    assert.equal(fog.nativeMaterial, true);
    assert.equal(fog.drawCalls, 1);
    await noRivalLeak(page, initial);
    assert.deepEqual(await exportCore(page), initial, 'Reload and camera travel must preserve knowledge and the CPU clan.');
    for (const quality of ['low', 'standard']) {
        await page.locator('#fjord-quality').evaluate((select, value) => {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, quality);
        await page.locator('#fjord-view-home').evaluate(button => button.click());
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const cameraBefore = await page.locator('#fjord-canvas').getAttribute('data-camera');
        await page.locator('#fjord-view-summit').evaluate(button => button.click());
        await page.waitForFunction(before => document.querySelector('#fjord-canvas').dataset.camera !== before,
            cameraBefore);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await noRivalLeak(page, initial);
        assert.deepEqual(await exportCore(page), initial, 'Highlands and quality controls cannot discover the map.');
        await page.screenshot({ path: output + '/fresh-default-unknown-highlands-' + quality + '.jpg',
            type: 'jpeg', quality: 88 });
    }
    report.cases.push({ name: 'fresh-default-and-reload', coreSha256: hash(initial), fog,
        rivalPopulation: Object.keys(initial.world.targetClans['island-rival'].personas).length,
        hiddenRival: true, cameraAndQualityPreserveState: true });
    await page.close();
    console.log('PASS fresh /fjord-play: fog, one living hidden CPU clan, reload and camera isolation');

    if (process.env.QA_DEFAULT_ONLY !== '1') {
        const legacy = await browser.newPage({ viewport: { width: 1200, height: 850 } });
        legacy.setDefaultTimeout(300000);
        legacy.on('pageerror', error => report.errors.push(error.message));
        await pauseOnArrival(legacy);
        await legacy.goto(origin + '/fjord-play?discovery=0', { waitUntil: 'domcontentloaded' });
        await ready(legacy);
        const before = await exportCore(legacy);
        assert.equal(before.discovery, undefined);
        assert.equal(before.world.version, 1);
        assert.equal(await legacy.locator('#fjord-exploration').isChecked(), false);
        // A query must not reinterpret an existing campaign or replace its four old target clans.
        await legacy.goto(origin + '/fjord-play?discovery=1&debugDiscovery=1', { waitUntil: 'domcontentloaded' });
        await ready(legacy);
        assert.deepEqual(await exportCore(legacy), before);
        const fog = await legacy.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.discovery));
        assert.equal(fog.active, false);
        report.cases.push({ name: 'explicit-opt-out-and-legacy-reload', coreSha256: hash(before),
            legacyWorldPreserved: true, fog });
        await legacy.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
        await ready(legacy);
        assert.deepEqual(await exportCore(legacy), before);
        assert.equal(await legacy.locator('#fjord-exploration').isChecked(), true,
            'The next new island defaults to exploration even after loading a historical campaign.');
        await legacy.locator('#fjord-new').evaluate(button => button.click());
        await legacy.waitForFunction(() => document.querySelector('#fjord-notice')?.textContent === 'New campaign created.');
        await ready(legacy);
        const next = await exportCore(legacy);
        assert.ok(next.discovery);
        assert.equal(next.world.version, 2);
        assert.deepEqual(Object.keys(next.world.targetClans), ['island-rival']);
        await noRivalLeak(legacy, next);
        report.cases.push({ name: 'menu-new-island-after-legacy', coreSha256: hash(next),
            oneHiddenRival: true, discoveryEnabled: true });
        await legacy.close();
        console.log('PASS explicit opt-out, unchanged legacy reload, and default exploration through New campaign');
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error);
    throw error;
} finally {
    await writeFile(output + '/results.json', JSON.stringify(report, null, 2) + '\n');
    await browser.close();
}
