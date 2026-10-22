import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { generateWorld, takeNaturalIslandTerrain } = load('world-generation/GenerateWorld');
const { islandRecipe, prepareCampaignIsland, campaignIslandPlan } = load('fjord-play/CampaignIsland');
const seed = 3055065912, recipe = islandRecipe(seed);
const retained = process.argv.includes('--reuse-natural');
const timings = [];
const observe = sample => timings.push(sample);
globalThis.gc?.();
const memoryBefore = process.memoryUsage();
const started = performance.now();
const source = generateWorld({ seed: recipe.seed, preset: 'island', generatorVersion: recipe.generatorVersion,
    conifers: 'ez-tree', environment: { version: 1 } }, observe, { retainNaturalIslandTerrain: retained });
const sourcePreparedMs = performance.now() - started;
const world = prepareCampaignIsland(source, recipe.version, observe);
const elapsedMs = performance.now() - started;
assert.equal(takeNaturalIslandTerrain(source), undefined, 'The natural handoff must be consumed, not retained as another world cache');
const memoryAfter = process.memoryUsage();
const plan = campaignIslandPlan(world);
const json = JSON.stringify({ world, plan });
const report = {
    platform: `Node ${process.version}, ${process.platform}/${process.arch}; synchronous worker-core CPU harness`,
    seed, recipe, retained, sourcePreparedMs, elapsedMs, timings,
    canonicalSha256: createHash('sha256').update(json).digest('hex'),
    canonicalJsonBytes: Buffer.byteLength(json), naturalHeightSamples: source.terrain.heights.length,
    memoryBefore, memoryAfter,
    sourceSha256: Object.fromEntries(['src/world-generation/GenerateWorld.ts', 'src/fjord-play/CampaignIsland.ts'].map(path =>
        [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
    limits: 'No browser/download/worker structured-clone timing, first frame, input responsiveness or true peak memory. No extra asset or terrain copy is introduced by the single-use handoff.',
};
const baselinePath = process.argv.slice(3).find(value => !value.startsWith('--'));
if (baselinePath) {
    const before = JSON.parse(readFileSync(baselinePath, 'utf8'));
    assert.equal(report.canonicalSha256, before.canonicalSha256, 'Complete canonical world and campaign plan must remain byte-equivalent');
    assert.equal(report.canonicalJsonBytes, before.canonicalJsonBytes);
}
mkdirSync('output/island-loading-259', { recursive: true });
writeFileSync(`output/island-loading-259/geography-${process.argv[2] ?? 'current'}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ elapsedMs, sourcePreparedMs, canonicalSha256: report.canonicalSha256,
    naturalTerrain: timings.find(sample => sample.stage === 'campaign-natural-terrain') }, null, 2));
