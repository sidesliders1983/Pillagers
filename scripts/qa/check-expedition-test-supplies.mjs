import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5180';
const output = 'artifacts/expedition-test-supplies';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', checks: [], errors: [] };
try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/exploration-navigation/review.html');
    await page.evaluate(async () => {
        const { GameplaySession } = await import('/src/gameplay-lab/GameplaySession.ts');
        const Core = await import('/src/simulation/SimulationCore.ts');
        const { ExpeditionPanel } = await import('/src/fjord-play/ExpeditionPanel.ts');
        const { MobileShell } = await import('/src/fjord-play/MobileShell.ts');
        document.querySelectorAll('style').forEach(style => style.remove());
        document.body.className = 'fjord-play';
        for (const path of ['/src/style.css', '/src/fjord-play/fjord-play.css',
            '/src/fjord-play/desktop-foundations.css', '/src/fjord-play/fjord-interface.css',
            '/src/fjord-play/mobile-horizon.css']) {
            const link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = path; document.head.append(link);
        }
        document.body.innerHTML = `<main id="fjord-play"><section class="fjord-stage">
            <canvas id="fjord-canvas"></canvas><section id="fjord-workspace" data-surface="expeditions">
            <section id="expedition-panel"></section></section></section><nav id="fjord-navigation">
            <button id="fjord-mobile-menu">Menu</button><div id="fjord-navigation-drawer"></div></nav></main>`;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = { waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null } };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500, cattleBirthChanceBps: 0 },
            { mortalityBands: [{ minAge: 0, chanceBps: 0 }], fertilityChanceBps: 0, partnershipChanceBps: 0 },
            { enabled: false }), world, 'test-supplies')));
        session.bindPhysicalWorld(world, 'test-supplies');
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1',
            memberIds: ['founder-1', 'founder-2', 'founder-3'] });
        const workspace = document.querySelector('#fjord-workspace');
        new MobileShell(document.querySelector('#fjord-play'));
        let panel;
        const command = command => { session.command(command); panel.committed(command); };
        panel = new ExpeditionPanel(document.querySelector('#expedition-panel'), session, command, () => {},
            ids => Object.fromEntries(ids.map(id => [id, { x: 16, z: 64 }])), {
                showMap: () => { workspace.hidden = true; }, showGroups: () => { workspace.hidden = false; },
                focus: () => {}, toggleClock: () => {},
            });
        panel.refresh();
        window.suppliesQA = { session, panel, command, Core, world };
    });
    const choice = page.locator('[data-test-food="group-1"]');
    assert.equal(await choice.count(), 1, 'Preparation must offer a test-only Food-per-resident choice');
    assert.equal(await choice.inputValue(), '2');
    assert.equal(await choice.getAttribute('max'), '10');
    const before = await page.evaluate(() => suppliesQA.session.saveJSON());
    await page.locator('[data-expedition-test-options] > summary').click();
    assert.ok((await choice.boundingBox()).height >= 44);
    await choice.fill('11');
    assert.equal(await page.locator('[data-start="group-1"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => suppliesQA.session.saveJSON()), before);
    await choice.fill('8');
    assert.equal(await page.locator('[data-expedition-test-options]').evaluate(details => details.open), true);
    assert.ok((await page.locator('.fjord-expedition-departure').innerText()).includes('24 Food'));
    await page.screenshot({ path: output + '/test-choice-ipad.png' });
    report.checks.push('The normal two-Food pack stays default; the test input allows 1–10 and rejects 11 without changing Core');
    await page.locator('[data-start="group-1"]').click();
    await page.locator('#expedition-start-dialog[open]').waitFor();
    const summary = await page.locator('#expedition-start-summary').innerText();
    assert.ok(summary.includes('24'));
    assert.ok(summary.includes('8 Food each'));
    assert.ok(summary.includes('Test pack'));
    await page.locator('#expedition-start-cancel').click();
    assert.equal(await page.evaluate(() => suppliesQA.session.saveJSON()), before, 'Cancelling the quote never spends');
    await page.locator('[data-start="group-1"]').click();
    await page.locator('#expedition-start-confirm').click();
    const purchased = await page.evaluate(() => suppliesQA.session.readSnapshot());
    assert.equal(purchased.stocks.food, 476);
    assert.equal(purchased.world.spatial.missions['explore-1'].provisions.foodPerMember, 8);
    assert.equal(purchased.world.spatial.missions['explore-1'].provisions.testCapacity, true);
    assert.equal(await page.evaluate(() => suppliesQA.session.running), false);
    report.checks.push('The dialog quotes 24 Food for three residents; cancel is free and confirm purchases exactly the chosen pack without unpausing');
    await page.evaluate(() => {
        suppliesQA.panel.chooseTarget({ x: 216, z: 64 });
        suppliesQA.command({ type: 'AdvanceTicks', ticks: 600 });
    });
    const continued = await page.evaluate(() => suppliesQA.Core.inspectSpatialExpeditions(
        suppliesQA.session.readSnapshot()).missions[0]);
    assert.equal(continued.status, 'Exploring');
    assert.equal(continued.supplies.activeTicksRemaining, 1400);
    const saved = await page.evaluate(() => suppliesQA.session.saveJSON());
    await page.evaluate(saved => {
        suppliesQA.session.loadJSON(saved);
        suppliesQA.session.bindPhysicalWorld(suppliesQA.world, 'test-supplies');
        suppliesQA.panel.refresh();
    }, saved);
    assert.equal(await page.evaluate(() => suppliesQA.session.saveJSON()), saved);
    await page.locator('#expedition-details').click();
    assert.ok((await page.locator('#expedition-mode').innerText()).includes('Test pack · 8 Food per resident'));
    report.checks.push('The custom pack keeps exploring beyond normal endurance, retains its exact remaining rations through save/load and stays visibly labelled as a test pack');
    await page.evaluate(() => {
        suppliesQA.command({ type: 'RecallExpedition', groupId: 'group-1' });
        suppliesQA.command({ type: 'AdvanceTicks', ticks: 100 });
        document.querySelector('#fjord-workspace').hidden = false;
        suppliesQA.panel.refresh();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => suppliesQA.panel.refresh());
    await choice.fill('10');
    assert.ok((await page.locator('.fjord-expedition-departure').innerText()).includes('30 Food'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: output + '/test-choice-phone.png' });
    report.checks.push('After real homecoming a new pack can be selected; the maximum quotes 30 Food for three residents without phone overflow');
    await context.close();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL'; report.failure = String(error.stack); throw error;
} finally {
    await writeFile(output + '/browser.json', JSON.stringify(report, null, 2));
    await browser.close();
}
