import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
const { chromium } = createRequire(import.meta.url)('C:/Users/Devoteam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
await mkdir('artifacts/island-clans', { recursive: true });
const entry = resolve('artifacts/island-clans/models-entry.ts');
await writeFile(entry, [
    "export { RivalScene } from '../../src/fjord-play/RivalScene';",
    "export { FjordModels } from '../../src/fjord-play/FjordModels';",
    "export { AssetManager } from '../../src/core/AssetManager';",
    "export * as Core from '../../src/simulation/SimulationCore';",
    "export { inspectRivalSettlement } from '../../src/fjord-play/RivalSettlement';",
    "export { inspectClanDiscovery } from '../../src/simulation/ClanDiscovery';"
].join('\n'));
const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry, name: 'IslandClanModels', formats: ['iife'] }, outDir: 'artifacts/island-clans/models-build' } });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage();
    await page.goto((process.env.QA_ORIGIN || 'http://127.0.0.1:5180') + '/docs/qa/spatial-expeditions/review.html');
    await page.addScriptTag({ content: (Array.isArray(bundle) ? bundle[0] : bundle).output.find(file => file.type === 'chunk').code });
    const result = await page.evaluate(async () => {
        const { Core, RivalScene, FjordModels, AssetManager, inspectRivalSettlement, inspectClanDiscovery } = IslandClanModels;
        const bounds = { minX: 0, maxX: 512, minZ: 0, maxZ: 256 };
        const world = { config: { seed: 32 }, waterLevel: -1,
            terrain: { bounds, spacing: 8, columns: 65, rows: 33, heights: Array(2145).fill(0) },
            navigation: { bounds, spacing: 8, columns: 65, rows: 33, cells: Array(2145).fill(true) },
            placementPlan: [], settlement: { center: { x: 64, z: 128 }, harbor: null },
            rivalSite: { version: 1, candidateId: 'rival-models', center: { x: 352, z: 128 },
                bounds: { minX: 288, maxX: 416, minZ: 64, maxZ: 192 }, foundations: [], buildableArea: 16384 } };
        const context = { world, worldId: 'rival-models' };
        let state = Core.initializeIslandClans(Core.createCampaign(32), world, context.worldId);
        const assets = new AssetManager(); await assets.loadForSimulation();
        const models = new FjordModels(assets);
        let knowledge = inspectClanDiscovery(state.discovery, state.clan.id);
        const layer = new RivalScene(world, models, () => knowledge);
        const hidden = inspectRivalSettlement(state, world);
        await layer.sync(hidden, 0, []);
        const hiddenResources = models.inspectResources(), hiddenEntities = layer.describe();
        state = Core.applyCommand(state, { type: 'CreateExpeditionGroup', name: 'Group 1', memberIds: ['founder-1'] });
        state = Core.applyCommand(state, { type: 'StartExpedition', groupId: 'group-1' }, context);
        state = Core.applyCommand(state, { type: 'ExploreArea', groupId: 'group-1', target: world.rivalSite.center }, context);
        state = Core.applyCommand(state, { type: 'AdvanceTicks', ticks: 140 }, context);
        knowledge = inspectClanDiscovery(state.discovery, state.clan.id);
        const visible = inspectRivalSettlement(state, world), canonical = Core.serializeState(state);
        await layer.sync(visible, .5, []);
        const visibleEntities = layer.describe();
        const appearanceMatches = visibleEntities.filter(entity => entity.kind === 'persona').every(entity =>
            JSON.stringify(entity.appearance.weights) === JSON.stringify(visible.entities.find(source => source.kind === 'persona' && source.id === entity.id).visualProfile.weights));
        const positions = visibleEntities.map(entity => entity.position);
        for (let i = 0; i < 30; i++) layer.advance(.2, true);
        const moved = layer.describe().some((entity, i) => entity.position.some((value, axis) => Math.abs(value - positions[i][axis]) > .01));
        const paused = layer.describe().map(entity => entity.position);
        layer.advance(10, false);
        const pauseExact = JSON.stringify(paused) === JSON.stringify(layer.describe().map(entity => entity.position));
        await layer.sync(hidden, .5, []);
        const culledResources = models.inspectResources(), culledEntities = layer.describe();
        await layer.sync(visible, .5, []);
        const revealedAgain = layer.describe();
        const coreUntouched = Core.serializeState(state) === canonical;
        layer.dispose();
        const disposedResources = models.inspectResources();
        models.dispose(); assets.dispose();
        return { hiddenResources, hiddenEntities, visibleEntities, appearanceMatches, moved, pauseExact, culledResources,
            culledEntities, revealedAgain, coreUntouched, disposedResources };
    });
    assert.equal(result.hiddenResources.actors, 0);
    assert.deepEqual(result.hiddenEntities, []);
    assert.ok(result.visibleEntities.some(entity => entity.kind === 'persona'));
    assert.ok(result.visibleEntities.every(entity => !entity.placeholder), 'Use actual sourced models, not geometric stand-ins');
    assert.equal(result.appearanceMatches, true, 'The actual body shape survives stripping gameplay traits');
    assert.equal(result.moved, true);
    assert.equal(result.pauseExact, true);
    assert.equal(result.culledResources.actors, 0);
    assert.deepEqual(result.culledEntities, []);
    assert.deepEqual(result.revealedAgain.map(entity => entity.id), result.visibleEntities.map(entity => entity.id));
    assert.equal(result.coreUntouched, true);
    assert.equal(result.disposedResources.actors, 0);
    await writeFile('artifacts/island-clans/models.json', JSON.stringify(result, null, 2));
    console.log('Hidden rivals allocate no actors; sourced visible residents move, pause and cull without changing Core.');
} finally { await browser.close(); }
