import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';
const { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } = createRequire(import.meta.url)('three');
const { HomeLighting } = loadTypeScript(new URL('../src/world/HomeLighting.ts', import.meta.url));
const { FjordEntities } = loadTypeScript(new URL('../src/fjord-play/FjordEntities.ts', import.meta.url));
const percentile = (samples, fraction) => samples[Math.floor((samples.length - 1) * fraction)];
const report = { version: 1, method: 'CPU-only paired warm uniform updates; no renderer or GPU execution',
    device: process.platform + ' ' + process.arch, frames: 15000, cases: [] };
for (const count of [5, 80]) {
    const geometry = new BoxGeometry(), texture = new Texture(), materials = [];
    const baseline = new FjordEntities({}), candidate = new FjordEntities({});
    for (let i = 0; i < count; i++) {
        const root = new Group(), material = new MeshStandardMaterial();
        materials.push(material); root.add(new Mesh(geometry, material));
        const homeLight = new HomeLighting(root, texture); homeLight.setInhabited(true);
        candidate.entries.set(String(i), { model: root, homeLight });
        baseline.entries.set(String(i), { model: new Group() });
    }
    const measure = layer => {
        const samples = [];
        for (let frame = 0; frame < 16000; frame++) {
            const darkness = .5 + .5 * Math.sin(frame * .003);
            const start = performance.now(); layer.setHomeDarkness(darkness);
            const duration = performance.now() - start;
            if (frame >= 1000) samples.push(duration);
        }
        samples.sort((a, b) => a - b);
        return { p50: percentile(samples, .5), p95: percentile(samples, .95), p99: percentile(samples, .99) };
    };
    const before = measure(baseline), after = measure(candidate);
    report.cases.push({ homes: count, quality: 'Same native path on Low and Standard', baselineMs: before,
        candidateMs: after, deltaMs: Object.fromEntries(Object.keys(after).map(key => [key, after[key] - before[key]])),
        extraLocalLights: 0, extraShadowSources: 0, extraMaterials: 0,
        sharedMasks: 3, estimatedRgbaMipBytes: 3 * 512 * 512 * 4 * 4 / 3,
        gpuTime: null, measuredDrawCalls: null,
        limitations: 'Material/map counts are code resource budgets. Real draws, GPU timing and iPhone/iPad frame percentiles require device capture.' });
    for (const entry of candidate.entries.values()) entry.homeLight.dispose();
    for (const material of materials) material.dispose();
    geometry.dispose(); texture.dispose();
}
await mkdir('docs/qa/warm-homes-256', { recursive: true });
await writeFile('docs/qa/warm-homes-256/cpu-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
