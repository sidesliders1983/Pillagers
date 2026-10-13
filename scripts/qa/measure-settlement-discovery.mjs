import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { parseWorld, serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const output = process.env.QA_OUTPUT ?? 'scratch/settlement-discovery';
const hash = world => createHash('sha256').update(serializeWorld(world)).digest('hex');
const report = { date: new Date().toISOString(), passed: false, results: [] };
await mkdir(output, { recursive: true });
for (const seed of [18, 42, 1983, 7, 256]) {
    const request = { seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r3',
        conifers: 'ez-tree', environment: { version: 1 } };
    const world = generateWorld(request);
    assert.equal(world.validation.accepted, true, seed + ': ' + world.validation.reasons.join('; '));
    const { selected, candidates, visibility, connection } = world.siteSelection;
    const player = candidates.find(c => c.id === selected.playerId);
    const rival = candidates.find(c => c.id === selected.rivalId);
    assert.notEqual(player.compartmentId, rival.compartmentId);
    assert.ok(selected.centerDistance >= 160 && selected.bufferDistance >= 40 && selected.routeLength >= 240);
    assert.ok([...player.foundations, ...rival.foundations].every(b => b.adjustment <= .6));
    assert.equal(selected.exposedRays, visibility.exposedRays);
    for (const p of connection) {
        const nav = world.navigation;
        const index = Math.round((p.z - nav.bounds.minZ) / nav.spacing) * nav.columns +
            Math.round((p.x - nav.bounds.minX) / nav.spacing);
        assert.equal(nav.cells[index], true);
    }
    const saved = serializeWorld(world);
    assert.equal(serializeWorld(parseWorld(saved)), saved);
    assert.equal(hash(generateWorld(world.config)), hash(world));
    report.results.push({ seed, config: world.config, selected,
        compartments: [player.compartmentId, rival.compartmentId],
        exposedRays: visibility.exposedRays, rays: visibility.rays.length,
        maximumFoundationAdjustment: Math.max(...player.foundations.map(b => b.adjustment)),
        blueprintHash: hash(world), deterministic: true, saveLoad: true, routeWalkable: true });
    await writeFile(output + '/' + seed + '.json', saved);
    console.log(JSON.stringify(report.results.at(-1)));
}
const legacy = generateWorld({ seed: 256, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r2',
    conifers: 'ez-tree', environment: { version: 1 } });
assert.equal(legacy.siteSelection.visibility.hidden, true);
assert.equal(hash(parseWorld(serializeWorld(legacy))), hash(legacy));
const historical = await readFile('scratch/island-highlands/256-after.json', 'utf8').catch(() => null);
if (historical) assert.equal(hash(JSON.parse(historical).blueprint), hash(legacy));
await writeFile(output + '/256-legacy.json', serializeWorld(legacy));
report.legacy = { config: legacy.config, blueprintHash: hash(legacy), saveLoad: true,
    previousFixturePreserved: historical ? true : null };
report.passed = true;
await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2) + '\n');
