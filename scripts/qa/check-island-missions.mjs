import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { SharedSettlement, inspectSettlementSave } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5196';
const output = 'artifacts/island-missions';
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(output + '/sighted.json', 'utf8'));
const owner = SharedSettlement.restore(JSON.stringify(fixture), 'fjord');
const world = owner.fjord.blueprint, center = world.rivalSite.center;
const y = createBlueprintSurface(world).surfaceHeightAt(center.x, center.z);
fixture.pace.running = false;
fixture.presentation = { quality: 'low', effects: 'low', camera: {
    position: [center.x + 24, y + 42, center.z - 48], target: [center.x, y, center.z] } };
const report = { origin, physicalDeviceTested: false, errors: [], checks: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    await context.addInitScript(save => {
        const next = sessionStorage.getItem('island-mission-qa-next');
        if (next) {
            sessionStorage.setItem('pillagers.fjord-play.active.v1', next);
            sessionStorage.removeItem('island-mission-qa-next');
        } else if (!sessionStorage.getItem('island-mission-qa')) {
            localStorage.clear(); sessionStorage.clear();
            sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save));
            sessionStorage.setItem('island-mission-qa', 'true');
        }
    }, fixture);
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/fjord-play?debugDiscovery=1');
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    const saved = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    const before = (await saved()).fjord.campaign;
    const body = await page.locator('body').innerText();
    assert.equal(body.includes(before.world.targetClans['island-rival'].clan.name), false);
    const ownNames = new Set(Object.values(before.personas).map(person => person.name));
    for (const person of Object.values(before.world.targetClans['island-rival'].personas))
        if (!ownNames.has(person.name)) assert.equal(body.includes(person.name), false);
    report.performance = await page.evaluate(async () => {
        const frames = [];
        let previous = await new Promise(requestAnimationFrame);
        for (let i = 0; i < 120; i++) {
            const now = await new Promise(requestAnimationFrame);
            frames.push(now - previous); previous = now;
        }
        const ordered = [...frames].sort((a, b) => a - b);
        return { viewport: { width: innerWidth, height: innerHeight }, quality: 'low', frames,
            medianMs: ordered[60], p95Ms: ordered[114],
            scene: JSON.parse(document.querySelector('#fjord-canvas').dataset.stability || '{}') };
    });
    const camera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const rect = await page.locator('#fjord-canvas').boundingBox();
    const point = new Vector3(center.x, y + .7, center.z).applyMatrix4(new Matrix4().fromArray(camera.world).invert())
        .applyMatrix4(new Matrix4().fromArray(camera.projection));
    await page.touchscreen.tap(rect.x + (point.x + 1) * rect.width / 2, rect.y + (1 - point.y) * rect.height / 2);
    await page.locator('#island-mission-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-island-type="Surveillance"]').isDisabled(), true);
    assert.equal(await page.locator('[data-island-type="Pillage"]').isDisabled(), true);
    assert.ok((await page.locator('#island-mission-panel').innerText()).includes('Unidentified settlement'));
    await page.screenshot({ path: output + '/sighted-tablet.png' });
    report.checks.push('Touch on known 3D site opens contextual missions; walking alone cannot enable Surveillance or Pillage');
    await page.locator('[data-island-area]').click();
    const targetBox = await page.locator('#island-mission-target').boundingBox();
    const navigationBox = await page.locator('#fjord-navigation').boundingBox();
    assert.ok(targetBox.height <= 220 && targetBox.y + targetBox.height <= navigationBox.y,
        'Compact targeting prompt leaves navigation unobstructed');
    const actors = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.rendered));
    const actor = actors.find(actor => actor.kind === 'persona' && actor.id === 'founder-1');
    const origins = { 'founder-1': { x: actor.position[0], z: actor.position[2] } };
    let area;
    for (const [dx, dz] of [[0, 0], [-8, 0], [0, -8], [8, 0], [0, 8], [-16, 0], [0, -16]]) {
        const candidate = { x: center.x + dx, z: center.z + dz };
        try { owner.session.islandMissionOffer('group-1', { kind: 'area', position: candidate }, 'Recon', [], origins); area = candidate; break; }
        catch { /* A rejected destination is not a valid confirmation test case. */ }
    }
    assert.ok(area, 'Choose a genuinely feasible mapped-area objective');
    const areaCamera = await page.locator('#fjord-canvas').evaluate(canvas => JSON.parse(canvas.dataset.camera));
    const areaRect = await page.locator('#fjord-canvas').boundingBox();
    const areaPoint = new Vector3(area.x, createBlueprintSurface(world).surfaceHeightAt(area.x, area.z), area.z)
        .applyMatrix4(new Matrix4().fromArray(areaCamera.world).invert()).applyMatrix4(new Matrix4().fromArray(areaCamera.projection));
    await page.touchscreen.tap(areaRect.x + (areaPoint.x + 1) * areaRect.width / 2, areaRect.y + (1 - areaPoint.y) * areaRect.height / 2);
    await page.screenshot({ path: output + '/area-preview.png' });
    await page.locator('#island-mission-dialog').waitFor({ state: 'visible', timeout: 5000 });
    assert.deepEqual((await saved()).fjord.campaign, before, 'Area selection only opens a review');
    await page.locator('[data-island-cancel]').click();
    await page.locator('[data-island-stop]').click();
    await page.locator('button[data-surface="expeditions"]').click();
    report.checks.push('Mapped-area targeting opens an accessible confirmation over the 3D map; cancellation preserves state');
    await page.locator('[data-island-type="Recon"]').click();
    await page.locator('#island-mission-dialog[open]').waitFor();
    for (const selector of ['[data-island-confirm]', '[data-island-cancel]'])
        assert.ok((await page.locator(selector).boundingBox()).height >= 44, 'Modal buttons retain touch target size');
    assert.ok((await page.locator('#island-mission-summary').innerText()).includes('2 Food'));
    assert.deepEqual((await saved()).fjord.campaign, before, 'Review does not spend or advance');
    await page.locator('[data-island-cancel]').click();
    assert.deepEqual((await saved()).fjord.campaign, before, 'Cancel confirmation is free');
    await page.locator('[data-island-type="Recon"]').click();
    await page.locator('[data-island-confirm]').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions).some(m => m.task?.type === 'Recon'));
    const departed = (await saved()).fjord.campaign;
    assert.equal(departed.stocks.food, before.stocks.food - 2);
    assert.equal((await saved()).pace.running, false);
    assert.equal(await page.locator('#fjord-next').isDisabled(), true);
    assert.equal(await page.locator('#expedition-mode [data-explore]').count(), 0, 'Separate missions cannot be retargeted as Explore');
    await page.screenshot({ path: output + '/recon-departed-tablet.png' });
    report.checks.push('Recon confirmation spends once, preserves pause and disables +1 Year; separate mission has return control');
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions).some(m => m.task && m.travelled > 8));
    await page.locator('#fjord-run').click();
    const paused = (await saved()).fjord.campaign;
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await saved()).fjord.campaign, paused, 'Reload retains exact mission state and paused clock');
    report.checks.push('Real running clock advances physical travel; reload restores exact mission/clock without regeneration');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#fjord-mobile-menu').click();
    await page.locator('button[data-surface="expeditions"]').click();
    await page.screenshot({ path: output + '/recon-phone.png' });
    assert.ok(await page.locator('#island-mission-panel').isVisible());
    report.checks.push('390px mobile drawer retains accessible mission controls');
    // A published save generated through real Core commands supplies an identified target.
    const identified = JSON.parse(await readFile(output + '/identified-1983.json', 'utf8'));
    identified.pace.running = false;
    identified.presentation = structuredClone(fixture.presentation);
    inspectSettlementSave(JSON.stringify(identified));
    await page.evaluate(save => sessionStorage.setItem('island-mission-qa-next', JSON.stringify(save)), identified);
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-mobile-menu').click();
    await page.locator('button[data-surface="expeditions"]').click();
    assert.equal(await page.locator('[data-island-type="Surveillance"]').isEnabled(), true);
    assert.equal(await page.locator('[data-island-type="Pillage"]').isEnabled(), true);
    assert.equal(await page.locator('[data-island-cargo-options]').evaluate(element => element.open), false,
        'Advanced cargo choices stay collapsed on mobile');
    await page.locator('[data-island-type="Pillage"]').click();
    await page.locator('#island-mission-dialog[open]').waitFor();
    await page.screenshot({ path: output + '/pillage-confirm-phone.png' });
    const beforePillage = (await saved()).fjord.campaign;
    await page.locator('[data-island-confirm]').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions).some(m => m.task?.type === 'Pillage'));
    const launched = await saved();
    assert.equal(launched.fjord.campaign.stocks.food, beforePillage.stocks.food - 5);
    const advanced = SharedSettlement.restore(JSON.stringify(launched), 'fjord');
    const task = Object.values(launched.fjord.campaign.world.spatial.missions).find(m => m.task?.type === 'Pillage');
    advanced.session.command({ type: 'AdvanceTicks', ticks: task.task.duration - 1 });
    const nearHome = JSON.parse(advanced.persist());
    nearHome.pace.running = false;
    await page.evaluate(save => sessionStorage.setItem('island-mission-qa-next', JSON.stringify(save)), nearHome);
    await page.reload();
    await page.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await page.locator('#clan-book-close').isVisible()) await page.locator('#clan-book-close').click();
    await page.locator('#fjord-run').click();
    await page.waitForFunction(() => Object.values(JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions).some(m => m.task?.type === 'Pillage' && m.status === 'Returned'));
    await page.locator('#fjord-run').click();
    await page.locator('#fjord-mobile-menu').click();
    await page.locator('button[data-surface="expeditions"]').click();
    assert.ok(await page.locator('[aria-label="Mission report"]').isVisible());
    await page.locator('[data-island-report-details] > summary').click();
    await page.locator('#fjord-run').click();
    await page.waitForTimeout(1500);
    await page.locator('#fjord-run').click();
    assert.equal(await page.locator('[data-island-report-details]').evaluate(element => element.open), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No phone horizontal overflow');
    await page.screenshot({ path: output + '/pillage-report-phone.png' });
    report.checks.push('Identified clan enables Surveillance/Pillage; Pillage confirmation spends 5 Food; actual final movement tick publishes the homecoming report');
    report.checks.push('Mobile UI uses collapsed cargo options, persistent expanded report details, 44px modal controls and no horizontal overflow');
    await context.close();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = String(error.stack); throw error; }
finally { await writeFile(output + '/browser.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ status: report.status, checks: report.checks, medianMs: report.performance?.medianMs,
    p95Ms: report.performance?.p95Ms }));
