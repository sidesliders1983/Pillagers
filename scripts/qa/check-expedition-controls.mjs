import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await mkdir('artifacts/spatial-expeditions', { recursive: true });
const entry = resolve('artifacts/spatial-expeditions/controls-entry.ts');
await writeFile(entry, "export { ExpeditionPanel } from '../../src/fjord-play/ExpeditionPanel';\nexport { GameplaySession } from '../../src/gameplay-lab/GameplaySession';\nexport * as Core from '../../src/simulation/SimulationCore';\n");
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
} finally { await browser.close(); }
