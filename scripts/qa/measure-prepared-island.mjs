import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { loadBakedCampaignIsland } = load('fjord-play/BakedCampaignIsland');
const { createCampaignIsland, campaignIslandPlan, islandRecipe, adoptCampaignIsland } = load('fjord-play/CampaignIsland');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const seed = Number(process.argv.find(value => value.startsWith('--seed='))?.slice(7) ?? 2935851268);
const prepared = process.argv.includes('--prepared');
const httpDigest = process.argv.includes('--http-digest');
if (httpDigest) {
    const module = load('characters/AssetDigest');
    module.assetDigest = async bytes => module.sha256Bytes(new Uint8Array(bytes));
}
const timings = [];
let requestedBytes = 0, requests = 0;
const read = async url => {
    const bytes = await readFile('public' + url.split('?')[0]);
    requestedBytes += bytes.length;
    requests++;
    return new Response(bytes);
};
globalThis.gc?.();
const memoryBefore = process.memoryUsage();
const started = performance.now();
let result;
if (prepared) result = await loadBakedCampaignIsland(seed, undefined, event => {
    if (event.type === 'timing') timings.push(event);
}, read);
else {
    const world = createCampaignIsland(seed, undefined, sample => timings.push(sample));
    result = { world, plan: campaignIslandPlan(world) };
}
const preparationMs = performance.now() - started;
const cloneStarted = performance.now();
const clone = structuredClone(result);
const cloneMs = performance.now() - cloneStarted;
const adoptStarted = performance.now();
adoptCampaignIsland(seed, clone.world, clone.plan);
const adoptMs = performance.now() - adoptStarted;
const report = { platform: `Node ${process.version}, ${process.platform}/${process.arch}; CPU and disk-only harness`,
    seed, recipe: islandRecipe(seed), prepared, httpDigest, requestedBytes, requests,
    preparationMs, cloneMs, adoptMs, timings, canonicalSha256: digest(result),
    memoryBefore, memoryAfter: process.memoryUsage(),
    limits: 'No physical iPhone, actual network, cross-thread postMessage, GPU, input responsiveness or true peak memory. structuredClone is timed separately. Temporary inflated bytes/text are released in the worker; canonical arrays/save format stay unchanged.' };
const baselinePath = process.argv.slice(3).find(value => !value.startsWith('--'));
if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    assert.equal(report.canonicalSha256, baseline.canonicalSha256);
    assert.equal(seed, baseline.seed);
}
await mkdir('output/island-loading-259', { recursive: true });
await writeFile(`output/island-loading-259/prepared-island-${process.argv[2]}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ preparationMs, cloneMs, adoptMs, requestedBytes,
    canonicalSha256: report.canonicalSha256 }, null, 2));
