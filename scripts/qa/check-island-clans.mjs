import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Vector3, Matrix4 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const Core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5194';
await mkdir('artifacts/island-clans', { recursive: true });
const hidden = JSON.parse(await readFile('artifacts/island-clans/hidden.json', 'utf8'));
const observed = JSON.parse(await readFile('artifacts/island-clans/observed.json', 'utf8'));
const shared = SharedSettlement.restore(JSON.stringify(hidden), 'fjord');
const world = shared.fjord.blueprint, center = world.rivalSite.center;
const y = createBlueprintSurface(world).surfaceHeightAt(center.x, center.z);
const camera = { position: [center.x + 26, y + 36, center.z - 40], target: [center.x, y + 1, center.z] };
for (const fixture of [hidden, observed]) {
    fixture.pace.running = false;
    fixture.presentation = { quality: 'low', effects: 'low', camera };
}
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checkpoints = [], samples = [];
try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(fixture => {
        const next = sessionStorage.getItem('island-clans-qa-next');
        if (next) {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', next);
            sessionStorage.removeItem('island-clans-qa-next');
        } else if (!sessionStorage.getItem('island-clans-qa')) {
            localStorage.clear();
            sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(fixture));
            sessionStorage.setItem('island-clans-qa', 'true');
        }
    }, hidden);
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    const scene = () => page.locator('#fjord-canvas').evaluate(canvas => ({
        rival: JSON.parse(canvas.dataset.rival), player: JSON.parse(canvas.dataset.rendered),
        stats: JSON.parse(canvas.dataset.stability || '{}'), camera: JSON.parse(canvas.dataset.camera)
    }));
    const ready = async () => {
        await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
        assert.equal(await page.locator('#fjord-run').innerText(), 'Start');
        await page.waitForTimeout(300);
        const close = page.locator('#clan-book-close');
        if (await close.isVisible()) await close.click();
    };
    const noPrivateUI = async fixture => {
        const text = await page.locator('body').innerText();
        const target = fixture.fjord.campaign.world.targetClans['island-rival'];
        for (const person of Object.values(target.personas)) {
            assert.ok(!text.includes(person.id), 'No rival ID in normal UI');
            if (person.name && !Object.values(fixture.fjord.campaign.personas).some(own => own.name === person.name)) assert.ok(!text.includes(person.name), 'No rival name in normal UI');
        }
        assert.equal(Number(await page.locator('#fjord-food').innerText()), fixture.fjord.campaign.stocks.food);
        assert.equal(Number(await page.locator('#fjord-materials').innerText()), fixture.fjord.campaign.stocks.materials);
    };
    const captureSamples = async (label, expectedCore) => {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const quality of ['low', 'standard']) {
            await page.getByLabel('Game menu', { exact: true }).click();
            await page.locator('#fjord-quality').selectOption(quality);
            await page.locator('#fjord-menu').evaluate(element => element.open = false);
            await page.waitForTimeout(1200);
            const sample = await page.evaluate(async () => {
                const frametimes = [];
                await new Promise(resolve => {
                    let previous;
                    const step = now => {
                        if (previous !== undefined) frametimes.push(now - previous);
                        previous = now;
                        if (frametimes.length < 120) requestAnimationFrame(step); else resolve();
                    };
                    requestAnimationFrame(step);
                });
                const gl = document.querySelector('#fjord-canvas').getContext('webgl2');
                const debug = gl?.getExtension('WEBGL_debug_renderer_info');
                const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null;
                return { frametimes, renderer, stats: JSON.parse(document.querySelector('#fjord-canvas').dataset.stability),
                    rival: JSON.parse(document.querySelector('#fjord-canvas').dataset.rival) };
            });
            const sorted = sample.frametimes.slice().sort((a, b) => a - b);
            samples.push({ label, viewport, quality, medianMs: sorted[60], p95Ms: sorted[114], ...sample });
            assert.deepEqual((await saved()).fjord.campaign, expectedCore, 'Quality, camera and paused rendering never tick Core');
            await page.screenshot({ path: 'artifacts/island-clans/' + label + '-' + viewport.width + '-' + quality + '.png' });
            console.log(label + ' / ' + viewport.width + ' / ' + quality + ': median ' + sorted[60].toFixed(1) + ' ms');
        }
    }
    };
    await page.goto(origin + '/fjord-play?discovery=1&debugDiscovery=1');
    await ready();
    const initial = await saved(), unknown = await scene();
    assert.deepEqual(initial.fjord.campaign, hidden.fjord.campaign);
    assert.equal(unknown.rival.known, false);
    assert.deepEqual(unknown.rival.rendered, []);
    await noPrivateUI(initial);
    await page.screenshot({ path: 'artifacts/island-clans/unknown-desktop.png' });
    checkpoints.push({ label: 'Hidden rival; persisted camera at reserved valley', rival: unknown.rival, stats: unknown.stats });
    console.log('Hidden camera, UI and canonical state passed.');
    await captureSamples('hidden', initial.fjord.campaign);
    await page.evaluate(fixture => sessionStorage.setItem('island-clans-qa-next', JSON.stringify(fixture)), observed);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await ready();
    const visible = await scene();
    assert.equal(visible.rival.currentlyObserved, true);
    assert.ok(visible.rival.rendered.some(entity => entity.kind === 'persona'));
    assert.ok(visible.rival.rendered.every(entity => !entity.placeholder));
    assert.equal(visible.player.some(entity => entity.id.startsWith('island-rival')), false);
    await noPrivateUI(await saved());
    await page.locator('#fjord-management-toggle').click();
    await page.screenshot({ path: 'artifacts/island-clans/observed-desktop.png' });
    checkpoints.push({ label: 'Real scout observation; sourced actors only', rival: visible.rival, stats: visible.stats });
    console.log('Observed scene and player-only UI passed.');
    const resident = visible.rival.rendered.find(entity => entity.kind === 'persona');
    const clip = new Vector3(...resident.position).applyMatrix4(new Matrix4().fromArray(visible.camera.world).invert())
        .applyMatrix4(new Matrix4().fromArray(visible.camera.projection));
    const box = await page.locator('#fjord-canvas').boundingBox();
    const x = box.x + (clip.x + 1) * box.width / 2, z = box.y + (1 - clip.y) * box.height / 2;
    assert.ok(x >= box.x && x <= box.x + box.width && z >= box.y && z <= box.y + box.height, 'Observed actor is on screen');
    await page.touchscreen.tap(x, z);
    assert.equal((await saved()).fjord.selection, null, 'Observed rival cannot open player management');
    const before = (await saved()).fjord.campaign;
    await page.locator('#fjord-run').tap();
    await page.waitForFunction(time => {
        const state = JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign;
        return state.time.winter * state.ticksPerWinter + state.time.tick >= time + 8;
    }, before.time.winter * before.ticksPerWinter + before.time.tick);
    await page.locator('#fjord-run').tap();
    const after = (await saved()).fjord.campaign;
    const ticks = (after.time.winter - before.time.winter) * before.ticksPerWinter + after.time.tick - before.time.tick;
    const expected = Core.applyCommand(before.world.targetClans['island-rival'], { type: 'AdvanceTicks', ticks });
    assert.deepEqual(after.world.targetClans['island-rival'], expected);
    console.log('Actual browser clock advances the CPU exactly once: ' + ticks + ' ticks.');
    await captureSamples('observed', after);
    // Actual import flow must cull the formerly observed community without touching its state.
    await page.getByLabel('Game menu', { exact: true }).click();
    await page.locator('#fjord-import').setInputFiles({ name: 'hidden.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hidden.fjord)) });
    await page.waitForFunction(() => document.body.innerText.includes('Campaign imported, paused.'));
    await page.waitForFunction(() => !JSON.parse(document.querySelector('#fjord-canvas').dataset.rival).known);
    assert.deepEqual((await saved()).fjord.campaign, hidden.fjord.campaign);
    assert.deepEqual((await scene()).rival.rendered, []);
    await noPrivateUI(await saved());
    assert.deepEqual(errors, []);
    const sourceHashes = {};
    for (const path of ['src/fjord-play/FjordPlay.ts', 'src/fjord-play/RivalScene.ts', 'src/fjord-play/RivalSettlement.ts',
        'src/fjord-play/FjordCampaign.ts', 'src/simulation/SimulationCore.ts'])
        sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    await writeFile('artifacts/island-clans/browser.json', JSON.stringify({ sourceHashes, physicalDevice: false,
        viewportOnlyEmulation: true, userAgent: await page.evaluate(() => navigator.userAgent), errors, checkpoints,
        cpuTicks: ticks, cpuReplayExact: true, touchSelectDoesNotManageRival: true, importCullsExactly: true, samples }, null, 2));
    console.log('Production UI, touch isolation, clock, Low/Standard samples and import culling passed.');
} catch (error) {
    console.error('Page errors:', errors);
    for (const page of browser.contexts().flatMap(context => context.pages())) {
        console.error((await page.locator('body').innerText()).slice(0, 2400));
        await page.screenshot({ path: 'artifacts/island-clans/browser-failure.png' });
    }
    throw error;
} finally { await browser.close(); }
