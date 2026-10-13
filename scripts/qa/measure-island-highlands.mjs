import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const load = file => loadTypeScript(new URL('../../src/world-generation/' + file + '.ts', import.meta.url));
const { generateWorld } = load('GenerateWorld');
const { parseWorld, serializeWorld } = load('WorldSave');
const { createBlueprintSurface } = load('TerrainQueries');
const { inspectMacroIsland } = load('MacroIsland');
const { inspectSiteVisibility } = load('SettlementVisibility');
const { footprintSamples } = load('PlanIslandSettlements');
const output = process.env.QA_OUTPUT ?? 'scratch/island-highlands';
const seeds = [18, 42, 1983, 7, 256];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quantile = (values, q) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
const report = { date: new Date().toISOString(), seeds, results: [] };
await mkdir(output, { recursive: true });
for (const seed of seeds) {
    let previous;
    for (const mode of ['before', 'after']) {
        const request = { seed, preset: 'island', generatorVersion: mode === 'before' ?
            'fjordside-island-v0.3e' : 'fjordside-island-v0.3e-r2', conifers: 'ez-tree', environment: { version: 1 } };
        const start = performance.now();
        const world = generateWorld(request);
        const generationMs = performance.now() - start;
        const save = serializeWorld(world);
        assert.equal(serializeWorld(parseWorld(save)), save);
        let previousFixturePreserved = null;
        if (mode === 'before') {
            previous = world;
            const saved = await readFile('scratch/environment-zoning/' + seed + '.json', 'utf8').catch(() => null);
            if (saved && JSON.stringify(JSON.parse(saved).blueprint.config) === JSON.stringify(world.config)) {
                assert.equal(save, saved, 'pre-change saved fixture regenerated exactly');
                previousFixturePreserved = true;
            }
        } else {
            assert.deepEqual(world.coast, previous.coast);
            assert.equal(hash(generateWorld(world.config)), hash(world));
        }
        const surface = createBlueprintSurface(world);
        const highlandSlopes = world.terrain.heights.flatMap((height, i) => previous.terrain.heights[i] > world.waterLevel + 16 ?
            [surface.slopeAt(world.terrain.bounds.minX + i % world.terrain.columns * 2,
                world.terrain.bounds.minZ + Math.floor(i / world.terrain.columns) * 2)] : []);
        const macro = inspectMacroIsland(world);
        const sight = world.rivalSite ? inspectSiteVisibility(world, world.siteSelection.viewpoints,
            footprintSamples(world.rivalSite.bounds), world.config.siteRules.rivalRoofHeight) : null;
        if (world.validation.accepted) {
            assert.equal(sight.hidden, true);
            assert.ok(macro.terrainSeparation.heightAboveSites >= 8);
            for (const p of world.siteSelection.connection) {
                const nav = world.navigation;
                const index = Math.round(p.z - nav.bounds.minZ) * nav.columns + Math.round(p.x - nav.bounds.minX);
                assert.equal(nav.cells[index], true);
            }
        }
        const row = { seed, mode, config: world.config, generationMs,
            peakAboveSea: world.terrain.heights.reduce((a, b) => Math.max(a, b), -Infinity) - world.waterLevel,
            landP90: quantile(world.terrain.heights.filter(h => h > world.waterLevel), .9) - world.waterLevel,
            highlandSlopeP90: quantile(highlandSlopes, .9), blueprintHash: hash(world),
            previousFixturePreserved, deterministic: mode === 'after', saveLoad: true,
            accepted: world.validation.accepted, reasons: world.validation.reasons,
            macroAccepted: macro.accepted, macroReasons: macro.reasons,
            terrainSeparation: macro.terrainSeparation && { width: macro.terrainSeparation.width,
                heightAboveSites: macro.terrainSeparation.heightAboveSites },
            selected: world.siteSelection.selected,
            visibility: sight && { hidden: sight.hidden, rays: sight.rays.length, exposedRays: sight.exposedRays },
            maximumFoundationAdjustment: Math.max(0, ...world.siteSelection.candidates.flatMap(c =>
                c.foundations.map(f => f.adjustment))) };
        report.results.push(row);
        await writeFile(output + '/' + seed + '-' + mode + '.json', save);
        await writeFile(output + '/measurements.json', JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ seed, mode, peak: row.peakAboveSea, slope: row.highlandSlopeP90,
            accepted: row.accepted, reasons: row.reasons, selected: row.selected, oldSave: previousFixturePreserved }));
    }
}
