import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { load } from '../../tests/load-source.mjs';

const { DiscoveryFog } = load('../src/fjord-play/DiscoveryFog.ts');
const world = { waterLevel: -1, terrain: {
    bounds: { minX: 0, maxX: 800, minZ: 0, maxZ: 800 },
    columns: 201, rows: 201, spacing: 4, heights: Array(201 * 201).fill(0),
} };
const encode = bytes => Buffer.from(bytes).toString('hex');
const results = [];
for (const exploredFraction of [.2, .9]) {
    const explored = new Uint8Array(1250);
    for (let cell = 0; cell < 10000 * exploredFraction; cell++) explored[cell >> 3] |= 1 << (cell & 7);
    const visible = new Uint8Array(1250);
    const index = 1050;
    visible[index >> 3] |= 1 << (index & 7);
    const first = { version: 1, worldId: 'fog-benchmark', cellSize: 8,
        grid: { bounds: world.terrain.bounds, columns: 100, rows: 100 },
        explored: encode(explored), visible: '00'.repeat(1250) };
    const next = { ...first, visible: encode(visible) };
    const start = performance.now();
    const fog = new DiscoveryFog(world, first);
    const constructionMs = performance.now() - start;
    const unchanged = performance.now();
    for (let update = 0; update < 1000; update++) fog.setKnowledge({ ...first });
    const unchanged1000Ms = performance.now() - unchanged;
    const changes = [];
    for (let update = 0; update < 8; update++) {
        fog.update(1);
        const before = performance.now();
        fog.setKnowledge(update % 2 ? first : next);
        changes.push(performance.now() - before);
    }
    fog.update(1);
    changes.sort((a, b) => a - b);
    results.push({ exploredFraction, constructionMs, unchanged1000Ms,
        changedMedianMs: (changes[3] + changes[4]) / 2,
        changedMaximumMs: changes.at(-1), inspect: fog.inspect() });
    fog.dispose();
}
const report = { label: process.argv[2] ?? 'current', results };
await mkdir('output/discovery-fog', { recursive: true });
await writeFile('output/discovery-fog/' + report.label + '.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
