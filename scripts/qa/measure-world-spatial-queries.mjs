import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { loadTypeScript } from '../load-typescript.mjs';
const source = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { generateWorld } = source('world-generation/GenerateWorld');
const { parseWorld, serializeWorld } = source('world-generation/WorldSave');
const { createWorldSpatialQueries } = source('world-generation/WorldSpatialQueries');
const { blueprintMovement } = source('world/BlueprintMovement');
const output = process.env.QA_OUTPUT ?? 'scratch/world-spatial-queries';
await mkdir(output, { recursive: true });
const seeds = [17, 42, 91, 1983, 1337, 18, 7, 73, 256, 65537];
const report = { date: new Date().toISOString(), seeds, node: process.version,
    hardware: { cpu: os.cpus()[0].model, cores: os.cpus().length, memoryBytes: os.totalmem() }, results: [] };
const digest = value => createHash('sha256').update(value).digest('hex');
for (const seed of seeds) {
    let saved;
    try { saved = await readFile('scratch/environment-zoning/' + seed + '.json', 'utf8'); }
    catch {
        saved = serializeWorld(generateWorld({ seed, preset: 'island', generatorVersion: 'fjordside-island-v0.3e',
            conifers: 'ez-tree', environment: { version: 1 } }));
    }
    const world = parseWorld(saved), before = serializeWorld(world);
    global.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now(), query = createWorldSpatialQueries(world);
    const initializationMs = performance.now() - start;
    global.gc?.();
    const heapDeltaObservation = process.memoryUsage().heapUsed - heapBefore;
    const navigationStart = performance.now(), navigation = query.navigationReport();
    const navigationMs = performance.now() - navigationStart;
    assert.equal(navigation.accepted, world.validation.accepted);
    const movement = blueprintMovement(world), other = createWorldSpatialQueries(parseWorld(saved));
    const hash = createHash('sha256'), restoredHash = createHash('sha256');
    const counts = { sampled: 0, traversable: 0, available: 0, reserved: 0, zoneWaterMismatches: 0 };
    const sampledAt = performance.now();
    for (let index = 0; index < world.navigation.cells.length; index += 37) {
        const cell = query.cell(index), restored = other.cell(index);
        assert.equal(cell.movement.traversable, movement.walkable(cell.position.x, cell.position.z));
        assert.ok(Number.isFinite(cell.surface.slope) && cell.surface.slope >= 0);
        assert.equal(cell.zone.snowRetentionPotential, 0);
        counts.sampled++;
        counts.traversable += Number(cell.movement.traversable);
        counts.available += Number(cell.buildability.available);
        counts.reserved += Number(cell.reservations.length > 0);
        counts.zoneWaterMismatches += Number(cell.zoneWaterMismatch);
        hash.update(JSON.stringify(cell));
        restoredHash.update(JSON.stringify(restored));
    }
    const queryComparisonMs = performance.now() - sampledAt;
    const sampleHash = hash.digest('hex');
    assert.equal(restoredHash.digest('hex'), sampleHash);
    for (const b of world.settlement.buildings)
        assert.ok(query.sample(b.x, b.z).buildability.reasons.includes('player-foundation'));
    for (const b of world.rivalSite?.foundations ?? [])
        assert.ok(query.sample(b.x, b.z).buildability.reasons.includes('rival-foundation'));
    for (const path of world.settlement.accessPaths) for (const point of path)
        assert.ok(query.sample(point.x, point.z).buildability.reasons.includes('access-path'));
    for (const point of world.siteSelection?.connection ?? [])
        assert.ok(query.sample(point.x, point.z).buildability.reasons.includes('rival-connection'));
    // Shared coast vertices have zero elevation up to floating-point interpolation precision.
    for (let i = 0; i < world.coast.length; i += 31) {
        const p = world.coast[i].a;
        assert.ok(Math.abs(query.sample(p.x, p.z).surface.elevation) < 1e-9);
    }
    assert.equal(serializeWorld(world), before);
    const result = { seed, accepted: navigation.accepted, reasons: navigation.reasons,
        grid: query.grid, counts, initializationMs, navigationMs, queryComparisonMs,
        heapDeltaObservation, storage: query.storage, sampleHash, saveHash: digest(before),
        preservedSave: true, residentParity: true, reservedRoutes: true, coastAligned: true };
    report.results.push(result);
    await writeFile(output + '/batch.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ seed, ...counts, initializationMs, queryComparisonMs }));
}
