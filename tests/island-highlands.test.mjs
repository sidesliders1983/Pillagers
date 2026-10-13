import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './load-source.mjs';

const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createBlueprintSurface } = load('../src/world-generation/TerrainQueries.ts');
const percentile = (values, fraction) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];

test('the gentler island version lowers dominant highlands without moving the coast or coastal lowlands', () => {
    for (const seed of [18, 42, 1983]) {
        const previous = generateWorld({ seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3b-r2' });
        const next = generateWorld({ seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3b-r3' });
        assert.deepEqual(next.coast, previous.coast, 'the same coastline survives the highland refinement');
        const beforeSurface = createBlueprintSurface(previous), afterSurface = createBlueprintSurface(next);
        const beforeSlopes = [], afterSlopes = [];
        for (let i = 0; i < previous.terrain.heights.length; i++) {
            const before = previous.terrain.heights[i], after = next.terrain.heights[i];
            if (before <= previous.waterLevel + 6.2) assert.equal(after, before, 'sea, coastal shelves and lowlands stay exact');
            assert.ok(after <= before, 'weathering cannot add separate peaks');
            if (before > previous.waterLevel + 16) {
                const x = previous.terrain.bounds.minX + i % previous.terrain.columns * 2;
                const z = previous.terrain.bounds.minZ + Math.floor(i / previous.terrain.columns) * 2;
                beforeSlopes.push(beforeSurface.slopeAt(x, z));
                afterSlopes.push(afterSurface.slopeAt(x, z));
            }
        }
        const peak = world => world.terrain.heights.reduce((a, b) => Math.max(a, b), -Infinity) - world.waterLevel;
        assert.ok(peak(next) < peak(previous) * .75, 'central rock walls become visibly lower');
        assert.ok(peak(next) > 28, 'a legible continuous upland remains');
        assert.ok(percentile(afterSlopes, .9) < percentile(beforeSlopes, .9) * .8, 'highland transitions become gentler');
    }
});

test('gentler highlands retain buildable, connected, terrain-hidden settlements and versioned save/load', () => {
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const { inspectSiteVisibility } = load('../src/world-generation/SettlementVisibility.ts');
    const { footprintSamples } = load('../src/world-generation/PlanIslandSettlements.ts');
    const request = { seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3e-r2', environment: { version: 1 } };
    const world = generateWorld(request);
    assert.equal(world.validation.accepted, true, world.validation.reasons.join('; '));
    assert.equal(world.settlement.buildings.length, 6);
    assert.equal(world.rivalSite.foundations.length, 6);
    assert.ok(world.siteSelection.selected.centerDistance >= 160);
    assert.ok(world.siteSelection.selected.bufferDistance >= 40);
    assert.ok(world.siteSelection.selected.routeLength >= 240);
    const visibility = inspectSiteVisibility(world, world.siteSelection.viewpoints, footprintSamples(world.rivalSite.bounds), 8);
    assert.equal(visibility.hidden, true, 'actual final terrain blocks every sampled rival roof, without trees');
    assert.ok(visibility.rays.length > 100);
    for (const point of world.siteSelection.connection) {
        const nav = world.navigation;
        const index = Math.round(point.z - nav.bounds.minZ) * nav.columns + Math.round(point.x - nav.bounds.minX);
        assert.equal(nav.cells[index], true, 'the connection remains walkable');
    }
    assert.deepEqual(parseWorld(serializeWorld(world)), world);
    assert.deepEqual(generateWorld(world.config), world);
    const macro = generateWorld({ seed: 18, preset: 'island', generatorVersion: 'fjordside-island-v0.3b-r3' });
    assert.deepEqual(parseWorld(serializeWorld(macro)), macro);
});
