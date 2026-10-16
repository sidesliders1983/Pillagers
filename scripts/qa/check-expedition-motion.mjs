import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await mkdir('artifacts/spatial-expeditions', { recursive: true });
const entry = resolve('artifacts/spatial-expeditions/motion-entry.ts');
await writeFile(entry, [
    "export { FjordEntities } from '../../src/fjord-play/FjordEntities';",
    "export { FjordModels } from '../../src/fjord-play/FjordModels';",
    "export { LivingWorldController } from '../../src/fjord-play/LivingWorldController';",
    "export { AssetManager } from '../../src/core/AssetManager';",
    "export * as Core from '../../src/simulation/SimulationCore';",
].join('\n'));
const bundle = await build({
    configFile: false, logLevel: 'silent',
    build: { write: false, minify: false,
        lib: { entry, name: 'ExpeditionMotion', formats: ['iife'] },
        outDir: 'artifacts/spatial-expeditions/motion-build' },
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/docs/qa/spatial-expeditions/review.html');
    await page.addScriptTag({ content: (Array.isArray(bundle) ? bundle[0] : bundle).output.find(f => f.type === 'chunk').code });
    const result = await page.evaluate(async () => {
        const { FjordEntities, FjordModels, LivingWorldController, AssetManager, Core } = ExpeditionMotion;
        const bounds = { minX: 0, maxX: 256, minZ: 0, maxZ: 128 };
        const world = { config: { seed: 32 }, placementPlan: [], waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 33, rows: 17, heights: Array(561).fill(0) },
            navigation: { bounds, spacing: 8, columns: 33, rows: 17, cells: Array(561).fill(true) },
            settlement: { bounds, center: { x: 16, z: 64 }, harbor: null } };
        const context = { world, worldId: 'motion-fixture' };
        let state = Core.initializePhysicalDiscovery(Core.createCampaign(32, { initialFood: 500 }), world, context.worldId);
        state = Core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
        state = Core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 216, z: 64 },
            origins: { 'founder-1': { x: 16, z: 64 } } }, context);
        const models = new FjordModels(new AssetManager()), layer = new FjordEntities(models);
        const motion = new LivingWorldController(world);
        const entity = () => ({ kind: 'persona', id: 'founder-1', label: state.personas['founder-1'].name,
            selectionKey: 'persona:founder-1', asset: 'human', dna: { ...state.personas['founder-1'].dna, age: 40 },
            transform: { x: 16, y: 0, z: 64, rotation: 0, scale: 1 },
            status: { living: true, expedition: 'explore-1', expeditionWalking: true, age: 40 } });
        try {
            layer.prepareExpeditions(state, world);
            await layer.sync([entity()]);
            for (let frame = 0; frame < 10; frame++) layer.advance(motion, .05, true);
            const batches = [];
            for (const ticks of [2, 3, 8]) {
                state = Core.applyCommand(state, { type: 'AdvanceTicks', ticks }, context);
                const canonical = Core.serializeState(state);
                layer.prepareExpeditions(state, world);
                await layer.sync([entity()]);
                const positions = [layer.describe()[0].position[0]];
                for (let frame = 0; frame < 10; frame++) {
                    layer.advance(motion, .05, true);
                    positions.push(layer.describe()[0].position[0]);
                }
                const paused = layer.describe()[0].position;
                layer.advance(motion, 10, false);
                batches.push({ ticks, positions, paused, afterPause: layer.describe()[0].position,
                    confirmedX: 16 + state.world.spatial.missions['explore-1'].travelled,
                    unchangedCore: canonical === Core.serializeState(state) });
            }
            const beforeRedirect = [...layer.describe()[0].position];
            state = Core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
            state = Core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: { x: 160, z: 96 } }, context);
            layer.prepareExpeditions(state, world);
            await layer.sync([entity()]);
            const afterRedirect = [...layer.describe()[0].position];
            state = Core.applyCommand(state, { type: 'AdvanceTicks', ticks: 7 }, context);
            layer.prepareExpeditions(state, world);
            await layer.sync([entity()]);
            layer.advance(motion, .5, true);
            const beforeRecall = [...layer.describe()[0].position];
            state = Core.applyCommand(state, { type: 'RecallExpedition', groupId: 'group-1' }, context);
            layer.prepareExpeditions(state, world);
            await layer.sync([entity()]);
            const afterRecall = [...layer.describe()[0].position];
            return { batches, beforeRedirect, afterRedirect, beforeRecall, afterRecall,
                actor: layer.describe()[0], diagnostics: models.diagnostics };
        } finally { layer.dispose(); models.dispose(); }
    });
    result.sourceHashes = {};
    for (const file of ['src/fjord-play/FjordEntities.ts','src/fjord-play/FjordPlay.ts'])
        result.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
    await writeFile('artifacts/spatial-expeditions/smooth-motion.json', JSON.stringify(result, null, 2));
    assert.equal(result.actor.placeholder, false, 'Use the real resident model');
    assert.equal(result.actor.motion.sourceClip, 'Running', 'Use the actual Meshy Run source');
    for (const batch of result.batches) {
        const steps = batch.positions.slice(1).map((position, i) => position - batch.positions[i]);
        assert.ok(steps.every(step => step > .1), 'A resident keeps moving throughout every 500 ms update interval');
        assert.ok(Math.max(...steps) - Math.min(...steps) < .001, 'Equal frame times produce equal travel steps');
        assert.ok(batch.positions.every(position => position <= batch.confirmedX + 1e-6), 'Never predict unconfirmed progress');
        assert.deepEqual(batch.paused, batch.afterPause, 'Pause freezes visual travel without catch-up');
        assert.equal(batch.unchangedCore, true);
    }
    assert.deepEqual(result.afterRedirect, result.beforeRedirect, 'Replacing a destination keeps the real body at its reached position');
    assert.deepEqual(result.afterRecall, result.beforeRecall, 'Recalling a redirected group does not teleport its real body');
    console.log('Real resident travel stays smooth across 500 ms batches; native Run, pause and Core authority verified.');
} finally { await browser.close(); }
