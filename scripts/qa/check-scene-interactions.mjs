import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5182';
const output = process.env.QA_OUTPUT || 'artifacts/scene-lifecycle/interactions';
const pixelRatioOverride = process.env.QA_PIXEL_RATIO === undefined ? null : Number(process.env.QA_PIXEL_RATIO);
assert.ok(pixelRatioOverride === null || Number.isFinite(pixelRatioOverride) && pixelRatioOverride >= .5 && pixelRatioOverride <= 2);
await mkdir(output, { recursive: true });
// Reuse the published, normally discovered mission fixture; obtain building funds
// through the real salvage command, without changing stocks or game rules.
const shared = SharedSettlement.restore(await readFile('docs/qa/island-missions/sighted-review.json', 'utf8'), 'fjord');
shared.command({ type: 'SalvageLongship', longshipId: 'founding-longship' });
const save = JSON.parse(shared.persist());
save.pace.running = false;
const center = shared.fjord.blueprint.rivalSite.center;
const height = createBlueprintSurface(shared.fjord.blueprint).surfaceHeightAt(center.x, center.z);
save.presentation = { quality: 'low', effects: 'low', camera: {
    position: [center.x + 24, height + 42, center.z - 48], target: [center.x, height, center.z] } };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', physicalDeviceTested: false, pixelRatioOverride, checks: [], errors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    await context.addInitScript(save => sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save)), save);
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/fjord-play');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    if (pixelRatioOverride === null) {
        assert.equal(await page.evaluate(() => typeof window.__fjordAudit), 'undefined');
    } else {
        // Explicit QA-only resolution trial; the ordinary production check above stays strict.
        await page.evaluate(ratio => window.__fjordAudit.references.renderer.setPixelRatio(ratio), pixelRatioOverride);
        assert.equal(await page.evaluate(() => window.__fjordAudit.references.renderer.getPixelRatio()), pixelRatioOverride);
    }
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign);
    const beforeMission = await saved();
    const camera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const rect = await page.locator('#fjord-canvas').boundingBox();
    const point = new Vector3(center.x, height + .7, center.z)
        .applyMatrix4(new Matrix4().fromArray(camera.world).invert())
        .applyMatrix4(new Matrix4().fromArray(camera.projection));
    await page.touchscreen.tap(rect.x + (point.x + 1) * rect.width / 2, rect.y + (1 - point.y) * rect.height / 2);
    await page.locator('#island-mission-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-island-type="Surveillance"]').isDisabled(), true);
    await page.locator('[data-island-type="Recon"]').click();
    await page.locator('#island-mission-dialog[open]').waitFor();
    assert.deepEqual(await saved(), beforeMission);
    await page.locator('[data-island-confirm]').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.world.spatial.missions).some(m => m.task?.type === 'Recon'));
    const departed = await saved();
    assert.equal(departed.stocks.food, beforeMission.stocks.food - 2);
    assert.equal(Object.values(departed.world.spatial.missions).filter(m => m.task?.type === 'Recon').length, 1);
    assert.equal(await page.locator('#fjord-next').isDisabled(), true);
    await page.screenshot({ path: output + '/touch-mission.png' });
    report.checks.push('Touch on discovered rival opens Recon; confirmation spends exactly once, keeps Surveillance private and disables year skipping');
    await page.locator('[data-expedition-toggle="group-1"]').click();
    assert.equal(await page.locator('#expedition-mode').isVisible(), false);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator('#fjord-map-toggle').click();
    assert.equal(await page.locator('#fjord-map-canvas').isVisible(), true);
    await page.locator('#fjord-map-toggle').click();
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="household"]').click();
    await page.locator('[data-ui="inspect"][data-kind="household"][data-id="founder-2"]').click();
    const beforeHouse = core.reconstructState(JSON.stringify(await saved()));
    const command = { type: 'BuildHouse', householdId: 'founder-2' };
    await page.locator('[data-ui="build"]').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1'))
        .fjord.campaign.buildings).some(b => b.kind === 'house'));
    const afterHouse = core.reconstructState(JSON.stringify(await saved()));
    assert.deepEqual(afterHouse, core.applyCommand(beforeHouse, command));
    await page.waitForFunction(() => JSON.parse(document.querySelector('#fjord-canvas').dataset.rendered)
        .some(entity => entity.key === 'building:house-1'));
    report.checks.push('Map toggle and ordinary paid tent-to-house action retain exact Core command/event/charge semantics and render the house');
    await page.locator('button[data-surface="settlement"]').click();
    await page.locator('[data-ui="directory"][data-kind="persona"]').click();
    await page.locator('#fjord-search').fill('Kau');
    await page.locator('#fjord-run').click();
    await page.locator('#fjord-search').focus();
    const runningCheckpoint = await page.evaluate(() => sessionStorage.getItem('pillagers.fjord-play.active.v1'));
    const runningStart = JSON.parse(runningCheckpoint).fjord.campaign;
    await page.waitForFunction(start => {
        const state = JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign;
        return state.time.winter !== start.winter || state.time.tick > start.tick + 1;
    }, runningStart.time);
    assert.equal(await page.locator('#fjord-search').inputValue(), 'Kau');
    assert.equal(await page.locator('#fjord-search').evaluate(node => document.activeElement === node), true);
    await page.locator('#fjord-run').click();
    const stopped = await saved();
    const elapsed = (stopped.time.winter - runningStart.time.winter) * stopped.ticksPerWinter +
        stopped.time.tick - runningStart.time.tick;
    const replay = SharedSettlement.restore(runningCheckpoint, 'fjord');
    replay.session.command({ type: 'AdvanceTicks', ticks: elapsed });
    assert.deepEqual(core.reconstructState(JSON.stringify(stopped)), replay.session.readSnapshot());
    await page.screenshot({ path: output + '/edited-directory.png' });
    report.checks.push('Running refresh preserves actual focused search edit and exact physical-mission tick replay');
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
        report.body = await page.locator('body').innerText().catch(() => 'Page unavailable');
        await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
    }
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
