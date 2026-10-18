import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'artifacts/exploration-navigation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
const watchdog = setTimeout(() => browser.close(), 300000);
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/island-missions/review.html');
    await page.evaluate(async () => {
        const { GameplaySession } = await import('/src/gameplay-lab/GameplaySession.ts');
        const Core = await import('/src/simulation/SimulationCore.ts');
        const { ExpeditionPanel } = await import('/src/fjord-play/ExpeditionPanel.ts');
        const { MobileShell } = await import('/src/fjord-play/MobileShell.ts');
        const { icon } = await import('/src/fjord-play/FjordIcons.ts');
        document.querySelectorAll('style').forEach(style => style.remove());
        document.body.className = 'fjord-play';
        for (const path of ['/src/style.css', '/src/fjord-play/fjord-play.css',
            '/src/fjord-play/desktop-foundations.css', '/src/fjord-play/fjord-interface.css',
            '/src/fjord-play/mobile-horizon.css']) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = path; document.head.append(link);
        }
        document.body.innerHTML = `<main id="fjord-play"><section class="fjord-stage">
            <canvas id="fjord-canvas" width="1024" height="650"></canvas>
            <section id="fjord-workspace" data-surface="expeditions" hidden><section id="expedition-panel"></section></section>
            </section><nav id="fjord-navigation"><button id="fjord-mobile-menu">Menu</button>
            <div id="fjord-navigation-drawer"></div><button data-surface="expeditions">${icon('route')}</button></nav></main>`;
        const bounds = { minX: 0, maxX: 1024, minZ: 0, maxZ: 128 };
        const world = { waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 129, rows: 17, heights: Array(2193).fill(0) },
            navigation: { bounds, spacing: 8, columns: 129, rows: 17, cells: Array(2193).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null } };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500, cattleBirthChanceBps: 0 },
            { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
            { enabled: false }), world, 'navigation-review')));
        session.bindPhysicalWorld(world, 'navigation-review');
        for (const [name, memberIds] of [['Group 1', ['founder-1']], ['Group 2', ['founder-2']]])
            session.command({ type: 'CreateExpeditionGroup', name, memberIds });
        const workspace = document.querySelector('#fjord-workspace');
        const shell = new MobileShell(document.querySelector('#fjord-play'));
        let panel;
        const command = command => { session.command(command); panel.committed(command); };
        panel = new ExpeditionPanel(document.querySelector('#expedition-panel'), session, command, () => {},
            ids => Object.fromEntries(ids.map(id => [id, { x: 16, z: 64 }])), {
                showMap: () => { workspace.hidden = true; },
                showGroups: () => { workspace.hidden = false; }, focus: () => {}, toggleClock: () => {},
            });
        command({ type: 'StartExpedition', groupId: 'group-1' });
        window.explorationQA = { panel, session, command, Core, shell };
    });
    const before = await page.evaluate(() => explorationQA.session.saveJSON());
    await page.evaluate(() => explorationQA.panel.chooseTarget({ x: 904, z: 64 }));
    assert.equal(await page.evaluate(() => explorationQA.Core.inspectSpatialExpeditions(
        explorationQA.session.readSnapshot()).missions[0].status), 'Traveling',
    'One valid ground tap must start travel without a second confirmation');
    assert.equal(await page.locator('#expedition-send').count(), 0);
    report.checks.push('A valid destination dispatches immediately using the already purchased pack');
    assert.notEqual(await page.evaluate(() => explorationQA.session.saveJSON()), before);
    const travelling = await page.evaluate(() => explorationQA.session.saveJSON());
    const toggle = page.locator('[data-expedition-toggle="group-1"]');
    assert.equal(await toggle.count(), 1, 'An active group has a numbered shortcut above Expeditions');
    assert.ok((await toggle.boundingBox()).height >= 44);
    await toggle.click();
    assert.equal(await page.locator('#expedition-mode').isVisible(), false);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => explorationQA.panel.refresh());
    assert.equal(await page.locator('#expedition-mode').isVisible(), false, 'Refresh keeps the panel hidden');
    assert.equal(await page.evaluate(() => explorationQA.session.saveJSON()), travelling);
    await toggle.click();
    assert.equal(await page.locator('#expedition-mode').isVisible(), true);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    report.checks.push('The numbered group shortcut hides/reopens the toolbar without changing the campaign');
    const shortcutBox = await toggle.boundingBox();
    const expeditionBox = await page.locator('#fjord-navigation > [data-surface="expeditions"]').boundingBox();
    assert.ok(shortcutBox.y + shortcutBox.height <= expeditionBox.y, 'Shortcut is above the Expeditions button');
    const panelBox = await page.locator('#expedition-mode').boundingBox();
    assert.ok(panelBox.y + panelBox.height <= shortcutBox.y || panelBox.x + panelBox.width <= shortcutBox.x ||
        shortcutBox.x + shortcutBox.width <= panelBox.x, 'The group shortcut must not overlap the open panel');
    await page.locator('#expedition-details').click();
    const initialMeter = await page.locator('meter[aria-label="Exploration supplies"]').getAttribute('value');
    assert.equal(initialMeter, '498', 'The two-tick safety reserve is separate from exploration time');
    await page.evaluate(() => {
        explorationQA.command({ type: 'AdvanceTicks', ticks: 20 });
        explorationQA.panel.refresh();
    });
    assert.equal(await page.locator('meter[aria-label="Exploration supplies"]').getAttribute('value'), '458');
    const onRoute = await page.evaluate(() => explorationQA.session.saveJSON());
    await page.locator('#expedition-mode [data-explore]').click();
    await page.evaluate(() => explorationQA.panel.chooseTarget({ x: 9999, z: 64 }));
    assert.equal(await page.evaluate(() => explorationQA.session.saveJSON()), onRoute,
        'An invalid destination does not change the current journey or supplies');
    assert.equal(await page.evaluate(() => explorationQA.panel.targeting), true);
    await page.evaluate(() => explorationQA.panel.chooseTarget({ x: 160, z: 64 }));
    assert.equal(await page.evaluate(() => explorationQA.panel.targeting), false);
    assert.equal(await page.evaluate(() => explorationQA.Core.inspectSpatialExpeditions(
        explorationQA.session.readSnapshot()).missions[0].target.x), 160);
    assert.equal(await page.evaluate(() => explorationQA.session.readSnapshot().stocks.food), 498);
    report.checks.push('Redirects apply in one tap; invalid taps are atomic; no second Food charge or confirmation');
    await page.locator('#expedition-mode [data-explore]').click();
    await page.evaluate(() => {
        explorationQA.panel.chooseTarget({ x: 904, z: 64 });
        explorationQA.command({ type: 'AdvanceTicks', ticks: 280 });
    });
    assert.equal(await page.locator('meter[aria-label="Exploration supplies"]').getAttribute('value'), '0');
    assert.ok((await page.locator('#expedition-mode').innerText()).includes('Returning home — supplies needed'));
    assert.ok(!(await page.locator('#expedition-mode').innerText()).includes('return included'));
    report.checks.push('Automatic supply return is explicit while paused and shows zero exploration allowance');
    await page.screenshot({ path: output + '/ipad-returning.png' });
    await page.evaluate(() => explorationQA.command({ type: 'StartExpedition', groupId: 'group-2' }));
    assert.equal(await page.locator('[data-expedition-toggle]').count(), 2);
    await page.locator('[data-expedition-toggle="group-1"]').click();
    assert.equal(await page.locator('#expedition-mode').getAttribute('data-group'), 'group-1');
    await page.locator('[data-expedition-toggle="group-1"]').click();
    assert.equal(await page.locator('#expedition-mode').isVisible(), false);
    await page.locator('[data-expedition-toggle="group-2"]').click();
    assert.equal(await page.locator('#expedition-mode').getAttribute('data-group'), 'group-2');
    assert.equal(await page.locator('#expedition-mode').isVisible(), true);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => explorationQA.panel.refresh());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `No horizontal overflow at ${viewport.width}px`);
    }
    report.checks.push('Multiple groups retain independent visibility controls across phone, tablet and desktop layouts');
    await context.close();
    console.log('Focused browser controls passed. Opening the real saved 3D scene.');
    const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
    const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
    const owner = SharedSettlement.restore(await readFile('docs/qa/island-missions/sighted-review.json', 'utf8'), 'fjord');
    const group = Object.values(owner.session.readSnapshot().world.groups)[0];
    owner.session.command({ type: 'StartExpedition', groupId: group.id });
    const save = JSON.parse(owner.persist());
    save.pace.running = false;
    const center = owner.fjord.blueprint.settlement.center;
    const surface = createBlueprintSurface(owner.fjord.blueprint);
    const height = surface.surfaceHeightAt(center.x, center.z);
    save.presentation.camera = { position: [center.x + 42, height + 58, center.z + 56],
        target: [center.x, height, center.z] };
    const sceneContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    await sceneContext.addInitScript(save => {
        if (!sessionStorage.getItem('pillagers.fjord-play.active.v1'))
            sessionStorage.setItem('pillagers.fjord-play.active.v1', JSON.stringify(save));
    }, save);
    const scene = await sceneContext.newPage();
    scene.setDefaultTimeout(90000);
    scene.on('pageerror', error => report.errors.push(error.message));
    await scene.goto(origin + '/fjord-play', { waitUntil: 'domcontentloaded' });
    await scene.locator('#fjord-canvas[data-ready="true"]').waitFor();
    if (await scene.locator('#clan-book-close').isVisible()) await scene.locator('#clan-book-close').click();
    console.log('Real saved scene ready.');
    const sceneToggle = scene.locator(`[data-expedition-toggle="${group.id}"]`);
    const sceneSaved = () => scene.evaluate(() => JSON.parse(sessionStorage.getItem('pillagers.fjord-play.active.v1')));
    const sceneBefore = (await sceneSaved()).fjord.campaign;
    await scene.screenshot({ path: output + '/scene-ipad-open.png' });
    await sceneToggle.click();
    assert.equal(await scene.locator('#expedition-mode').isVisible(), false);
    await scene.screenshot({ path: output + '/scene-ipad-hidden.png' });
    assert.deepEqual((await sceneSaved()).fjord.campaign, sceneBefore);
    await sceneToggle.click();
    await scene.locator('#expedition-mode [data-explore]').click();
    const canvas = scene.locator('#fjord-canvas');
    const data = await canvas.evaluate(canvas => ({ camera: JSON.parse(canvas.dataset.camera),
        actors: JSON.parse(canvas.dataset.rendered) }));
    const origins = Object.fromEntries(group.memberIds.map(id => {
        const actor = data.actors.find(actor => actor.kind === 'persona' && actor.id === id);
        return [id, { x: actor.position[0], z: actor.position[2] }];
    }));
    const rect = await canvas.boundingBox();
    const panelRect = await scene.locator('#expedition-mode').boundingBox();
    let destination;
    for (const [dx, dz] of [[20, 0], [-20, 0], [0, 20], [0, -20], [30, 30], [-30, -30]]) {
        try {
            const offer = owner.session.exploreOffer(group.id, { x: center.x + dx, z: center.z + dz }, origins);
            const point = new Vector3(offer.target.x, surface.surfaceHeightAt(offer.target.x, offer.target.z), offer.target.z)
                .applyMatrix4(new Matrix4().fromArray(data.camera.world).invert())
                .applyMatrix4(new Matrix4().fromArray(data.camera.projection));
            const x = rect.x + (point.x + 1) * rect.width / 2;
            const y = rect.y + (1 - point.y) * rect.height / 2;
            if (x > 50 && x < 970 && y > 100 && y < panelRect.y - 10) { destination = { x, y }; break; }
        } catch { /* Try the next candidate through the public route offer. */ }
    }
    assert.ok(destination, 'A feasible destination must be visible outside the toolbar');
    await scene.touchscreen.tap(destination.x, destination.y);
    await scene.waitForFunction(groupId => Object.values(JSON.parse(sessionStorage.getItem(
        'pillagers.fjord-play.active.v1')).fjord.campaign.world.spatial.missions)
        .some(mission => mission.groupId === groupId && mission.status === 'Traveling'), group.id);
    assert.equal((await sceneSaved()).fjord.campaign.stocks.food, sceneBefore.stocks.food);
    assert.equal(await scene.locator('#expedition-send').count(), 0);
    await scene.screenshot({ path: output + '/scene-ipad-travelling.png' });
    report.checks.push('Real /fjord-play: iPad toolbar hides/restores and one terrain tap dispatches without another confirmation or charge');
    const beforeReload = (await sceneSaved()).fjord.campaign;
    console.log('Reloading the actual dispatched exploration.');
    await scene.reload({ waitUntil: 'domcontentloaded' });
    await scene.locator('#fjord-canvas[data-ready="true"]').waitFor();
    assert.deepEqual((await sceneSaved()).fjord.campaign, beforeReload);
    assert.equal(await sceneToggle.isVisible(), true);
    report.checks.push('Reloading an active real 3D exploration restores the exact paused campaign and group shortcut');
    await sceneContext.close();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    clearTimeout(watchdog);
    await writeFile(output + '/browser.json', JSON.stringify(report, null, 2));
    await browser.close();
}
