import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ||
    'C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:5195';
const output = process.env.QA_OUTPUT || 'artifacts/expedition-target-preview';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { status: 'RUNNING', errors: [] };
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/docs/qa/island-missions/review.html');
    // This checks the actual panel and Core authority without the full 3D cold-start path.
    const result = await page.evaluate(async () => {
        const { GameplaySession } = await import('/src/gameplay-lab/GameplaySession.ts');
        const Core = await import('/src/simulation/SimulationCore.ts');
        const { ExpeditionPanel } = await import('/src/fjord-play/ExpeditionPanel.ts');
        document.body.innerHTML = `<main id="fjord-play"><section class="fjord-stage">
            <canvas></canvas><section id="fjord-workspace" data-surface="expeditions" hidden>
            <div id="expedition-panel"></div></section></section><nav id="fjord-navigation"></nav></main>`;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const heights = [], cells = [];
        for (let z = 0; z < 17; z++) {
            for (let x = 0; x < 33; x++) {
                const water = x >= 20 && x <= 22;
                heights.push(water ? -4 : 0);
                cells.push(!water);
            }
        }
        const world = {
            waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells },
            settlement: { center: { x: 16, z: 64 }, harbor: null },
        };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(
            Core.createCampaign(32, { initialFood: 500 }), world, 'target-preview-fixture')));
        let exclusions = [];
        session.bindPhysicalWorld(world, 'target-preview-fixture', () => exclusions);
        session.command({ type: 'CreateExpeditionGroup', name: 'Coastal scouts', memberIds: ['founder-1'] });
        let panel, marker, orders = 0;
        const command = command => {
            orders++;
            session.command(command);
            panel.committed(command);
        };
        panel = new ExpeditionPanel(document.querySelector('#expedition-panel'), session, command,
            (point, valid) => { marker = { point, valid }; },
            () => ({ 'founder-1': { x: 16, z: 64 } }), {
                showMap: () => { document.querySelector('#fjord-workspace').hidden = true; },
                showGroups: () => {}, focus: () => {}, toggleClock: () => {},
            });
        command({ type: 'StartExpedition', groupId: 'group-1' });
        const before = session.saveJSON(), count = orders;
        const valid = panel.previewTarget({ x: 80, z: 64 }), validMarker = { ...marker };
        const water = panel.previewTarget({ x: 168, z: 64 }), waterMarker = { ...marker };
        const unreachable = panel.previewTarget({ x: 224, z: 64 }), unreachableMarker = { ...marker };
        const hover = {
            valid, water, unreachable, validMarker, waterMarker, unreachableMarker,
            untouched: before === session.saveJSON(), orders: orders - count,
            hidden: document.querySelector('#expedition-mode').hidden,
            extraMenu: !!document.querySelector('#expedition-targeting'),
        };
        panel.chooseTarget({ x: 80, z: 64 });
        const successHidden = document.querySelector('#expedition-mode').hidden;
        document.querySelector('[data-expedition-toggle]').click();
        document.querySelector('#expedition-mode [data-explore]').click();
        const travelling = session.saveJSON();
        panel.chooseTarget({ x: 168, z: 64 });
        const rejected = {
            untouched: travelling === session.saveJSON(),
            open: !document.querySelector('#expedition-mode').hidden,
            reason: document.querySelector('#expedition-mode').textContent,
            choosing: panel.targeting,
        };
        document.querySelector('[data-expedition-toggle]').click();
        const collapsedAgain = document.querySelector('#expedition-mode').hidden && panel.targeting;
        const newGreen = panel.previewTarget({ x: 96, z: 64 });
        // A previously green offer cannot bypass a changed route exclusion on click.
        exclusions = [{ minX: 0, maxX: 256, minZ: 0, maxZ: 128 }];
        const beforeStale = session.saveJSON();
        panel.chooseTarget({ x: 96, z: 64 });
        const stale = {
            newGreen, untouched: beforeStale === session.saveJSON(), valid: marker.valid,
            open: !document.querySelector('#expedition-mode').hidden,
        };
        window.targetQA = { session, panel, before: session.saveJSON() };
        return { hover, rejected, collapsedAgain, stale, successHidden };
    });
    assert.equal(result.successHidden, true);
    assert.equal(result.hover.valid, true);
    assert.equal(result.hover.water, false);
    assert.equal(result.hover.unreachable, false);
    assert.equal(result.hover.validMarker.valid, true);
    assert.equal(result.hover.waterMarker.valid, false);
    assert.equal(result.hover.unreachableMarker.valid, false);
    assert.equal(result.hover.untouched, true);
    assert.equal(result.hover.orders, 0);
    assert.equal(result.hover.hidden, true);
    assert.equal(result.hover.extraMenu, false);
    assert.equal(result.rejected.untouched, true);
    assert.equal(result.rejected.open, true);
    assert.equal(result.rejected.choosing, true);
    assert.match(result.rejected.reason, /water/i);
    assert.equal(result.collapsedAgain, true);
    assert.equal(result.stale.newGreen, true);
    assert.equal(result.stale.untouched, true);
    assert.equal(result.stale.valid, false);
    assert.equal(result.stale.open, true);
    await page.keyboard.press('Escape');
    const cancelled = await page.evaluate(() => ({
        same: targetQA.before === targetQA.session.saveJSON(), choosing: targetQA.panel.targeting,
        open: !document.querySelector('#expedition-mode').hidden,
        text: document.querySelector('#expedition-mode').textContent,
    }));
    assert.equal(cancelled.same, true);
    assert.equal(cancelled.choosing, false);
    assert.equal(cancelled.open, true);
    assert.match(cancelled.text, /cancelled/i);
    assert.deepEqual(report.errors, []);
    Object.assign(report, { status: 'PASS', result, cancelled });
    console.log('Destination preview browser contracts pass: read-only hover, fresh click validation, ring-only selection and cancellation.');
} catch (error) {
    report.status = 'FAIL';
    report.failure = String(error.stack);
    throw error;
} finally {
    await mkdir(output, { recursive: true });
    await writeFile(output + '/checks.json', JSON.stringify(report, null, 2));
    await browser.close();
}
