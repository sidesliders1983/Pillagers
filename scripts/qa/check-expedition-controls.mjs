import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await mkdir('artifacts/spatial-expeditions', { recursive: true });
const entry = resolve('artifacts/spatial-expeditions/controls-entry.ts');
await writeFile(entry, "export { ExpeditionPanel } from '../../src/fjord-play/ExpeditionPanel';\nexport { GameplaySession } from '../../src/gameplay-lab/GameplaySession';\nexport * as Core from '../../src/simulation/SimulationCore';\nexport { FjordProduction } from '../../src/fjord-play/FjordProduction';\nexport { ProductionLabels } from '../../src/fjord-play/ProductionLabels';\nexport { PerspectiveCamera } from 'three';\n");
const bundle = await build({
    configFile: false, logLevel: 'silent', build: {
        write: false, minify: false,
        lib: { entry, name: 'ExpeditionControls', formats: ['iife'] }, outDir: 'artifacts/spatial-expeditions/controls-build'
    }
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.setContent('<section id="groups"></section>');
    await page.addScriptTag({ content: (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code });
    const result = await page.evaluate(() => {
        const { GameplaySession, ExpeditionPanel } = ExpeditionControls;
        const session = new GameplaySession();
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-2'] });
        const panel = new ExpeditionPanel(document.querySelector('#groups'), session,
            command => session.command(command), () => { }, () => ({ kind: 'persona', id: 'founder-1' }), () => ({}));
        panel.refresh();
        const picker = document.querySelector('#expedition-join');
        picker.focus();
        for (let i = 0; i < 3; i++) { session.command({ type: 'AdvanceTicks', ticks: 1 }); panel.refresh(); }
        return { focused: document.activeElement === picker, group: picker.value };
    });
    assert.equal(result.focused, true, 'The resident group picker remains focused through ordinary campaign ticks');
    assert.equal(result.group, 'group-1');
    console.log('Resident group picker retains focus through real session ticks.');
    const startFlow = await page.evaluate(() => {
        const { GameplaySession, ExpeditionPanel, Core } = ExpeditionControls;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = { waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null } };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500 }), world, 'controls-start-fixture')));
        session.bindPhysicalWorld(world, 'controls-start-fixture');
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1','founder-2','founder-3'] });
        let panel;
        panel = new ExpeditionPanel(document.querySelector('#groups'), session,
            command => { session.command(command); panel.committed(command.type === 'ExploreArea'); },
            () => {}, () => null, () => ({}));
        panel.refresh();
        const before = session.saveJSON();
        document.querySelector('[data-start]').click();
        const dialog = document.querySelector('#expedition-start-dialog');
        const prompt = document.querySelector('#expedition-start-summary').textContent, open = dialog.open;
        document.querySelector('#expedition-start-cancel').click();
        const cancelledUntouched = session.saveJSON() === before;
        document.querySelector('[data-start]').click();
        document.querySelector('#expedition-start-confirm').click();
        const outcome = { open, prompt, cancelledUntouched, stock: session.readSnapshot().stocks.food,
            phase: Core.inspectSpatialExpeditions(session.readSnapshot()).missions[0]?.status,
            mode: session.expeditionMode, running: session.running,
            exploreAvailable: !!document.querySelector('[data-explore]:not([disabled])') };
        document.querySelector('[data-cancel-expedition]').click();
        return { ...outcome, stockAfterCommittedCancel: session.readSnapshot().stocks.food,
            modeAfterCommittedCancel: session.expeditionMode };
    });
    assert.equal(startFlow.open, true);
    assert.equal(startFlow.prompt, 'This will cost 6 food (2 food per member). Are you sure?');
    assert.equal(startFlow.cancelledUntouched, true);
    assert.equal(startFlow.stock, 494);
    assert.equal(startFlow.phase, 'Prepared');
    assert.equal(startFlow.mode, true);
    assert.equal(startFlow.running, false);
    assert.equal(startFlow.exploreAvailable, true);
    assert.equal(startFlow.stockAfterCommittedCancel, 494, 'Cancelling after confirmation cannot refund Food');
    assert.equal(startFlow.modeAfterCommittedCancel, false);
    console.log('Start confirmation reserves a fixed pack, preserves pause and can be cancelled without mutation.');
    const targeting = await page.evaluate(() => {
        const { GameplaySession, ExpeditionPanel, Core } = ExpeditionControls;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = {
waterLevel: -1, terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null }
};
        world.navigation.cells[8 * 33 + 27] = false;
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500 }), world, 'controls-target-fixture')));
        session.bindPhysicalWorld(world, 'controls-target-fixture');
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
        session.command({ type: 'StartExpedition', groupId: 'group-1' });
        let marker;
        let panel;
        panel = new ExpeditionPanel(document.querySelector('#groups'), session,
            command => { session.command(command); panel.committed(command.type === 'ExploreArea'); },
            point => marker = point, () => null, () => ({ 'founder-1': { x: 16, z: 64 } }));
        panel.refresh();
        document.querySelector('[data-explore]').click();
        const before = session.saveJSON();
        panel.chooseTarget({ x: 300, z: 64 });
        const rejectedUntouched = session.saveJSON() === before, rejectedStillChoosing = panel.targeting;
        panel.chooseTarget({ x: 216, z: 64 });
        const status = document.querySelector('#expedition-status').textContent;
        const mission = session.readSnapshot().world.spatial?.missions['explore-1'];
        return { marker, status, rejectedUntouched, rejectedStillChoosing, autoSent: !!mission, confirmationControl: !!document.querySelector('#expedition-confirm'), target: mission?.target };
    });
    assert.equal(targeting.rejectedUntouched, true, 'A rejected tap does not charge provisions or create a mission');
    assert.equal(targeting.rejectedStillChoosing, true, 'A rejected tap lets the player choose another spot');
    assert.equal(targeting.autoSent, true, 'One destination tap immediately sends the group');
    assert.equal(targeting.confirmationControl, false, 'No redundant confirmation control');
    assert.deepEqual(targeting.marker, { x: 216, z: 56 }, 'The objective marker shows the actual accepted destination');

    assert.deepEqual(targeting.target, targeting.marker, 'Confirmation dispatches to the marked safe point');
    console.log('Adjusted destination, visible marker and confirmed Core journey agree.');
    const retask = await page.evaluate(() => {
        const { GameplaySession, ExpeditionPanel, Core } = ExpeditionControls;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = {
            waterLevel: -1, terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null }
        };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500 }), world, 'controls-retask-fixture')));
        session.bindPhysicalWorld(world, 'controls-retask-fixture');
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
        session.command({ type: 'StartExpedition', groupId: 'group-1' });
        session.command({ type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } });
        session.command({ type: 'AdvanceTicks', ticks: 20 });
        session.command({ type: 'RecallExpedition', groupId: 'group-1' });
        let panel;
        panel = new ExpeditionPanel(document.querySelector('#groups'), session,
            command => { session.command(command); panel.committed(command.type === 'ExploreArea'); },
            () => {}, () => null, () => { throw new Error('Away origins must come from Core'); });
        panel.refresh();
        const enabled = !document.querySelector('[data-explore]').disabled;
        const untouched = session.saveJSON();
        const ordinaryTap = panel.chooseTarget({ x: 160, z: 96 });
        const navigationUntouched = session.saveJSON() === untouched;
        document.querySelector('[data-explore]').click();
        const armed = panel.targeting;
        panel.chooseTarget({ x: 160, z: 96 });
        const mission = session.readSnapshot().world.spatial.missions['explore-1'];
        return { enabled, ordinaryTap, navigationUntouched, armed, consumed: !panel.targeting,
            phase: mission.status, target: mission.target, status: document.querySelector('#expedition-status').textContent };
    });
    assert.equal(retask.enabled, true, 'Explore Area remains available while returning with a paused clock');
    assert.equal(retask.ordinaryTap, false, 'Ordinary navigation taps cannot give group orders');
    assert.equal(retask.navigationUntouched, true);
    assert.equal(retask.armed, true);
    assert.equal(retask.consumed, true, 'Target mode consumes exactly one valid destination');
    assert.equal(retask.phase, 'Traveling');
    assert.deepEqual(retask.target, { x: 160, z: 96 });
    assert.match(retask.status, /paused|Start/i, 'A paused journey explains how to begin movement');
    console.log('Paused returning groups accept an explicit destination order.');


    const production = await page.evaluate(() => {
        const { GameplaySession, Core, FjordProduction, ProductionLabels, PerspectiveCamera } = ExpeditionControls;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = { waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { center: { x: 16, z: 64 }, harbor: null } };
        const session = new GameplaySession();
        session.loadJSON(Core.serializeState(Core.initializePhysicalDiscovery(Core.createCampaign(32,
            { initialFood: 500 }, { fertilityChanceBps: 0 }, { enabled: false }), world, 'production-fixture')));
        session.bindPhysicalWorld(world, 'production-fixture');
        for (const id of Object.keys(session.readSnapshot().personas))
            session.command({ type: 'AssignOccupation', personaId: id, occupation: 'fisher' });
        const cursor = new FjordProduction(session.readSnapshot().events);
        const root = document.createElement('div'); document.body.append(root);
        const labels = new ProductionLabels(root), camera = new PerspectiveCamera();
        session.command({ type: 'AdvanceTicks', ticks: 500 });
        const outputs = cursor.read(session.readSnapshot().events);
        labels.enqueue(outputs); labels.update(camera, 800, 600);
        const activeId = root.querySelector('[data-persona-id]').dataset.personaId;
        const pendingId = outputs.find(output => output.kind === 'persona' &&
            !root.querySelector('[data-persona-id="' + output.id + '"]')).id;
        session.command({ type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: [activeId, pendingId] });
        session.command({ type: 'StartExpedition', groupId: 'group-1' });
        const before = root.querySelector('[data-persona-id="' + activeId + '"]').textContent;
        session.command({ type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 } });
        const snapshot = session.readSnapshot();
        const away = Object.keys(snapshot.personas).filter(id => Core.personaAway(snapshot, id))
            .map(id => ({ kind: 'persona', id }));
        labels.suppress(away); labels.update(camera, 800, 600);
        return { before, activeId, pendingId, displayed: [...root.querySelectorAll('[data-persona-id]')]
            .map(element => element.dataset.personaId), pending: Number(root.dataset.pending),
            expectedPending: Math.max(0, outputs.length - 2 - 6),
            totals: JSON.parse(root.dataset.totals), outputs,
            workReasons: away.map(person => Core.inspectWork(snapshot, person.id).reason) };
    });
    assert.match(production.before, /^\+\d+ Food$/);
    assert.equal(production.displayed.includes(production.activeId), false, 'A home-work popup cannot follow a departing explorer');
    assert.equal(production.displayed.includes(production.pendingId), false, 'Queued home-work popups cannot appear after departure');
    assert.equal(production.pending, production.expectedPending);
    assert.deepEqual(production.totals, production.outputs, 'Hiding stale feedback preserves all factual production totals');
    assert.deepEqual(production.workReasons, ['expedition', 'expedition']);
    assert.ok(production.displayed.length > 0, 'Home residents still display production feedback');
    console.log('Departure clears active and queued home-production popups without losing recorded awards.');

} finally { await browser.close(); }
