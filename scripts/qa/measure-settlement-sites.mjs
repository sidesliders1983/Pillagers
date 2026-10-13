import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { parseWorld, serializeWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const { createCampaign } = loadTypeScript(new URL('../../src/simulation/Landing.ts', import.meta.url));
const { createBlueprintSurface } = loadTypeScript(new URL('../../src/world-generation/TerrainQueries.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'scratch/settlement-sites-refinement';
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seeds = [17, 42, 91, 1983, 1337, 18, 104, 211, 512, 819];
const results = [];
for (const seed of seeds) {
    const start = performance.now();
    const request = { seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e', conifers: 'ez-tree' };
    const world = generateWorld(request);
    const generationMs = performance.now() - start;
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    assert.equal(hash(generateWorld(request)), hash(world));
    const selection = world.siteSelection;
    if (world.validation.accepted) {
        assert.ok(world.rivalSite);
        assert.equal(selection.visibility.exposedRays, 0);
        const surface = createBlueprintSurface(world);
        for (const p of selection.connection) {
            assert.ok(surface.surfaceHeightAt(p.x, p.z) >= world.waterLevel + .2);
            assert.ok(surface.slopeAt(p.x, p.z) <= .55);
        }
    } else {
        assert.equal(selection.selected, null);
        assert.ok(world.validation.reasons.length > 0);
    }
    const failures = {};
    for (const pair of selection.pairs) for (const reason of pair.reasons) {
        failures[reason] = (failures[reason] || 0) + 1;
    }
    const founding = createCampaign(seed);
    const result = { seed,
        foundingDay: { residents: Object.keys(founding.personas).length,
            households: Object.keys(founding.households).length,
            tents: Object.values(founding.residences).filter(r => r.kind === 'tent').length,
            permanentBuildings: Object.keys(founding.buildings).length,
            cattle: Object.keys(founding.landing.cattle).length }, accepted: world.validation.accepted, generationMs,
        blueprintHash: hash(world), deterministic: true, saveLoad: true,
        config: world.config, reasons: world.validation.reasons,
        compartments: selection.compartments,
        candidates: selection.candidates, selected: selection.selected,
        searchCost: { layoutAttempts: selection.candidates.reduce((n, c) => n + c.fitSearch.attempts, 0),
            placementNodes: selection.candidates.reduce((n, c) => n + c.fitSearch.nodes, 0),
            partialCapacity: selection.candidates.reduce((counts, c) => {
                counts[c.fitSearch.maximumPlaced] = (counts[c.fitSearch.maximumPlaced] || 0) + 1;
                return counts;
            }, {}) },
        pairCount: selection.pairs.length, failures,
        visibility: { viewpointCount: selection.viewpoints.length,
            rayCount: selection.visibility.rays.length, exposedRays: selection.visibility.exposedRays },
        harborBerth: selection.harborBerth };
    results.push(result);
    console.log(JSON.stringify({ seed, accepted: result.accepted, fits: result.candidates.filter(c => c.foundations.length).length,
        selected: result.selected, failures, generationMs }));
    await writeFile(output + '/batch.json', JSON.stringify({ date: new Date().toISOString(), seeds, results }, null, 2));
}
