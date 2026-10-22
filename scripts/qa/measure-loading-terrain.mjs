import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { MeshStandardMaterial } = createRequire(import.meta.url)('three');
const { SharedSettlement } = load('play/SharedSettlement');
const { newFjordScenario } = load('fjord-play/FjordScenario');
const { fjordGroundWeights } = load('fjord-play/FjordGround');
const { createBlueprintTerrainAsync, updateBlueprintWearAsync, disposeBlueprintTerrain } = load('world/BlueprintTerrain');
const seed = 3055065912;
const shared = new SharedSettlement(newFjordScenario(seed), undefined, true, 'island-pool-v3');
const world = shared.fjord.blueprint;
const view = shared.fjord.readProjection();
const ground = { plots: [...view.ground.plots, ...view.rival.ground.plots],
    paths: [...view.ground.paths, ...view.rival.ground.paths] };
const grass = [...view.entities, ...view.rival.entities].filter(entity => entity.kind === 'household' && entity.plot).map(entity => entity.plot);
const weights = fjordGroundWeights(world, ground, grass);
const prepared = process.argv.includes('--prepared-wear');
const sources = new Map(['Ground037', 'Ground054', 'grass_path_2', 'mossy_rock'].map(name =>
    [name, new MeshStandardMaterial({ name })]));
let yields = 0, observedMaxBatchMs = 0, previous = performance.now();
const yieldControl = async () => {
    observedMaxBatchMs = Math.max(observedMaxBatchMs, performance.now() - previous);
    yields++;
    await setImmediate();
    previous = performance.now();
};
globalThis.gc?.();
const memoryBefore = process.memoryUsage();
previous = performance.now();
const started = previous;
const mesh = await createBlueprintTerrainAsync(world, sources, 'none',
    prepared ? weights : weights.map(() => 0), 'zoned', false, yieldControl);
const terrainMs = performance.now() - started;
const wearStarted = performance.now();
if (!prepared) await updateBlueprintWearAsync(mesh, weights, yieldControl);
const elapsedMs = performance.now() - started;
const wearMs = performance.now() - wearStarted;
observedMaxBatchMs = Math.max(observedMaxBatchMs, performance.now() - previous);
const memoryAfter = process.memoryUsage();
const hash = createHash('sha256');
const bytes = array => hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
    hash.update(name); bytes(attribute.array);
}
bytes(mesh.geometry.index.array.subarray(0, mesh.geometry.drawRange.count));
hash.update(JSON.stringify([mesh.geometry.groups, mesh.geometry.drawRange]));
for (const material of mesh.material) {
    hash.update(material.name);
    if (material.alphaMap) bytes(material.alphaMap.image.data);
}
const result = {
    platform: `Node ${process.version}, ${process.platform}/${process.arch}; actual terrain CPU builder, placeholder source materials`,
    seed, prepared, terrainMs, wearMs, elapsedMs, yields, observedMaxBatchMs,
    drawnSurfaceSha256: hash.digest('hex'), memoryBefore, memoryAfter,
    resources: { vertices: mesh.geometry.attributes.position.count, groups: mesh.geometry.groups.length,
        drawnIndices: mesh.geometry.drawRange.count, alphaMasks: mesh.material.filter(material => material.alphaMap).length },
    limits: 'Matched CPU buffers/material alpha, not rendered source pixels, network/image decode, browser yield timers, input responsiveness, first-frame time or GPU/process peak memory.',
};
disposeBlueprintTerrain(mesh);
for (const material of sources.values()) material.dispose();
const baselinePath = process.argv.slice(3).find(value => !value.startsWith('--'));
if (baselinePath) {
    const before = JSON.parse(readFileSync(baselinePath, 'utf8'));
    assert.equal(result.drawnSurfaceSha256, before.drawnSurfaceSha256, 'Drawn terrain attributes/indices, groups and alpha masks must stay exact');
    assert.deepEqual(result.resources, before.resources);
}
mkdirSync('output/island-loading-259', { recursive: true });
writeFileSync(`output/island-loading-259/terrain-${process.argv[2] ?? 'current'}.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
