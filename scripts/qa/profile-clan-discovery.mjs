import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { discoverySettlementGeneratorVersion } = loadTypeScript(new URL('../../src/world-generation/SettlementSites.ts', import.meta.url));
const api = loadTypeScript(new URL('../../src/simulation/ClanDiscovery.ts', import.meta.url));
const { geographyIdentity } = loadTypeScript(new URL('../../src/fjord-play/FjordProjection.ts', import.meta.url));
const seeds = [17, 42, 91, 1983, 1337, 18, 7, 73, 256, 65537];
const output = 'artifacts/clan-discovery';
await mkdir(output, { recursive: true });
const results = [];
for (const seed of seeds) {
    const world = generateWorld({ seed, preset: 'island', generatorVersion: discoverySettlementGeneratorVersion,
        conifers: 'ez-tree', environment: { version: 1 } });
    const worldId = geographyIdentity(world);
    const observers = [{ id: 'settlement', kind: 'settlement', ...world.settlement.center }];
    if (world.settlement.harbor) observers.push({ id: 'landing', kind: 'landing', ...world.settlement.harbor });
    const start = performance.now();
    const state = api.createClanDiscovery(world, worldId, 'player', observers, 800500);
    const observationMs = performance.now() - start;
    assert.deepEqual(api.createClanDiscovery(world, worldId, 'player', observers, 800500), state);
    const view = api.inspectClanDiscovery(state, 'player');
    let exploredCells = 0;
    for (let row = 0; row < view.grid.rows; row++) for (let col = 0; col < view.grid.columns; col++)
        if (api.discoveryAt(view, view.grid.bounds.minX + (col + .5) * view.cellSize,
            view.grid.bounds.minZ + (row + .5) * view.cellSize) !== 'unknown') exploredCells++;
    const variants = [];
    for (const cellSize of [4, 8, 16]) {
        const started = performance.now();
        const candidate = api.createClanDiscovery(world, worldId, 'player', observers, 800500,
            { ...api.prototypeDiscoveryPolicy, cellSize });
        variants.push({ cellSize, milliseconds: performance.now() - started,
            savedBytes: Buffer.byteLength(JSON.stringify(candidate)),
            rawMaskBytes: (candidate.clans.player.explored.length + candidate.clans.player.visible.length) / 2 });
    }
    const result = { seed, accepted: world.validation.accepted, reasons: world.validation.reasons,
        observationMs, savedBytes: Buffer.byteLength(JSON.stringify(state)), exploredCells,
        totalCells: view.grid.columns * view.grid.rows,
        rivalVisibility: world.rivalSite ? api.discoveryAt(view, world.rivalSite.center.x, world.rivalSite.center.z) : null,
        variants };
    results.push(result);
    await writeFile(output + '/world-' + seed + '.json', JSON.stringify({ seed, terrain: world.terrain,
        waterLevel: world.waterLevel, settlement: world.settlement, rival: world.rivalSite?.center,
        view, state, observers, route: world.siteSelection?.connection ?? [] }));
    console.log(JSON.stringify(result));
}
await writeFile(output + '/matrix.json', JSON.stringify({ measuredAt: new Date().toISOString(),
    node: process.version, policy: api.prototypeDiscoveryPolicy, results }, null, 2));
