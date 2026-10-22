import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';
const { Group } = createRequire(import.meta.url)('three');
const { HomeGroundGlow } = loadTypeScript(new URL('../src/world/HomeGroundGlow.ts', import.meta.url));
const report = { version: 1, method: 'CPU-only terrain batch construction, cached sync and darkness uniform updates', cases: [] };
const measure = (count, callback) => {
    const values = [];
    for (let index = 0; index < count + 100; index++) {
        const start = performance.now(); callback(index);
        if (index >= 100) values.push(performance.now() - start);
    }
    values.sort((a, b) => a - b);
    return Object.fromEntries([['p50', .5], ['p95', .95], ['p99', .99]]
        .map(([name, fraction]) => [name, values[Math.floor((values.length - 1) * fraction)]]));
};
for (const count of [5, 80]) {
    const houses = Array.from({ length: count }, (_, index) => {
        const house = new Group(); house.position.set(index % 10 * 12, 0, Math.floor(index / 10) * 12);
        house.userData.homeLightWindows = [
            { position: [4, 2.5, 0], outward: [1, 0, 0] },
            { position: [-4, 2.5, 0], outward: [-1, 0, 0] },
        ];
        return house;
    });
    const glow = new HomeGroundGlow((x, z) => x * .001 + z * .002);
    glow.sync(houses);
    const before = measure(15000, () => {});
    const uniform = measure(15000, index => glow.setDarkness((index % 1000) / 1000));
    const cached = measure(1000, () => glow.sync(houses));
    const rebuild = measure(150, index => { houses[0].position.x = index * .001; glow.sync(houses); });
    glow.setDarkness(1);
    report.cases.push({ homes: count, baselineCallMs: before, uniformMs: uniform,
        deltaUniformMs: Object.fromEntries(Object.keys(uniform).map(key => [key, uniform[key] - before[key]])),
        cachedCoreSyncMs: cached, changedLayoutRebuildMs: rebuild, ...glow.inspect(),
        extraMaterials: 1, extraGeometries: 1, extraTextures: 0, extraLights: 0, extraShadowPasses: 0,
        quality: 'Identical Low/Standard path',
        gpuMs: null, physicalDeviceEvidence: false,
        limitations: 'No rendered pixels or GPU timing; 1 additional draw is the mesh budget, not a captured renderer counter.' });
    glow.dispose();
}
await mkdir('docs/qa/warm-homes-256', { recursive: true });
await writeFile('docs/qa/warm-homes-256/spill-cpu-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
