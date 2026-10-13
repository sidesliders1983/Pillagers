import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { inspectMacroIsland } = loadTypeScript(new URL('../../src/world-generation/MacroIsland.ts', import.meta.url));
const { serializeWorld, parseWorld } = loadTypeScript(new URL('../../src/world-generation/WorldSave.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'scratch/macro-island';
await mkdir(output, { recursive: true });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const results = [];
for (const seed of [17, 91, 1983, 42, 18, 104, 211, 512, 819, 1337]) {
    const before = process.memoryUsage(), start = performance.now();
    const world = generateWorld({ seed, preset: 'island', conifers: 'ez-tree' });
    const generationMs = performance.now() - start, after = process.memoryUsage();
    const macro = inspectMacroIsland(world);
    const saved = serializeWorld(world);
    assert.equal(world.validation.accepted, true, JSON.stringify({ seed, reasons: world.validation.reasons }));
    assert.equal(macro.accepted, true, JSON.stringify({ seed, reasons: macro.reasons }));
    assert.equal(hash(generateWorld(world.config)), hash(world));
    assert.deepEqual(parseWorld(saved), world);
    // Every true intersection has two neighbors. Eight decimals preserve distinct
    // near-vertex crossings that coarser rounding would incorrectly merge.
    const ends = new Map();
    for (const { a, b } of world.coast) for (const p of [a, b]) {
        const key = p.x.toFixed(8) + ',' + p.z.toFixed(8);
        ends.set(key, (ends.get(key) || 0) + 1);
    }
    assert.ok([...ends.values()].every(degree => degree === 2), 'No broken coast seams');
    results.push({ seed, config: world.config, validation: world.validation,
        macro: { ...macro, candidates: macro.candidates.length,
            sitePair: macro.sitePair.map(({ cells, ...site }) => site) },
        geology: { model: world.geology.model,
            mainValleys: world.geology.valleys.filter(valley => valley.parentId === null).length,
            tributaries: world.geology.valleys.filter(valley => valley.parentId !== null).length },
        terrainSha256: hash(world.terrain), blueprintSha256: hash(world),
        replayIdentical: true, saveRoundTripIdentical: true, closedCoast: true,
        generationMs, heapUsedBefore: before.heapUsed, heapUsedAfter: after.heapUsed,
        heapDeltaBytes: after.heapUsed - before.heapUsed, rssBefore: before.rss, rssAfter: after.rss,
        serializedBytes: Buffer.byteLength(saved), samples: world.terrain.heights.length });
    console.log('Measured island seed', seed);
}
const rejected = generateWorld({ seed: 73, preset: 'island', relief: 1.5 });
assert.equal(rejected.validation.accepted, false);
await writeFile(output + '/batch.json', JSON.stringify({ date: '2026-10-13', results,
    rejectionFixture: { config: rejected.config, validation: rejected.validation },
    measurementLimits: 'Node before/after heap and RSS samples, not peak or GPU memory. Garbage collection can make deltas negative. Timings are development-machine observations, not a performance gate.' }, null, 2));
