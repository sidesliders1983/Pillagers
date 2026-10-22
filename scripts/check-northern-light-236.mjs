import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';

const { Scene, Vector3 } = createRequire(import.meta.url)('three');
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { northernReviewFixture, northernReviewPhases } = load('./qa/northern-light-236-fixtures.ts');
const { projectFjordCalendar } = load('../src/fjord-play/FjordCalendar.ts');
const output = new URL('../output/northern-light-236/', import.meta.url);
await mkdir(new URL('fixtures/', output), { recursive: true });
const report = { version: 1, runtime: process.version, platform: process.platform,
    measurement: 'CPU-only WorldLighting.update with a mock renderer; no WebGL/GPU or device claim',
    samples: [], visualEvidence: 'Pending real browser captures and physical device acceptance' };

function measure(calendar, weather, northern) {
    const scene = new Scene(), renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] },
        new Vector3(), new Vector3(), 'low', fjordPresentation.lighting);
    const resources = [...scene.children], shadow = lighting.directional.shadow;
    const update = () => lighting.update(0, calendar.visualProgress);
    try {
        lighting.setSeason(calendar.visualProgress, weather, northern ? calendar.progress : undefined);
        for (let index = 0; index < 200; index++) update();
        const rounds = [];
        for (let round = 0; round < 5; round++) {
            const start = performance.now();
            for (let index = 0; index < 3000; index++) update();
            rounds.push((performance.now() - start) / 3000);
        }
        if (scene.children.some((object, index) => resources[index] !== object) ||
            lighting.directional.shadow !== shadow) throw new Error('Annual lighting replaced owned resources.');
        return { medianCpuMs: rounds.sort((a, b) => a - b)[2],
            shadowSources: scene.children.filter(object => object.isLight && object.castShadow).length,
            shadowMapSize: shadow.mapSize.toArray(), light: lighting.seasonalLightState ?? null };
    } finally { lighting.dispose(); }
}

for (const seed of [32, 33]) for (const phase of northernReviewPhases) {
    const shared = northernReviewFixture(seed, phase.progress, 'low', false);
    const save = shared.persist(), state = shared.session.readSnapshot();
    const calendar = projectFjordCalendar(state.time, state.ticksPerWinter);
    const view = shared.fjord.readProjection(), weather = view.weatherVisual.lighting;
    const name = `seed-${seed}-phase-${String(phase.progress).replace('.', '-')}.json`;
    await writeFile(new URL('fixtures/' + name, output), save);
    const baseline = measure(calendar, weather, false), candidate = measure(calendar, weather, true);
    report.samples.push({ seed, island: shared.fjord.blueprint.config.seed, phase: phase.name,
        calendar, weatherClass: view.weatherVisual.class, path: 'fixtures/' + name,
        saveSha256: createHash('sha256').update(save).digest('hex'),
        baseline, candidate, incrementalCpuMs: candidate.medianCpuMs - baseline.medianCpuMs });
}
await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
const deltas = report.samples.map(sample => sample.incrementalCpuMs).sort((a, b) => a - b);
console.log(JSON.stringify({ samples: report.samples.length, islands: [...new Set(report.samples.map(s => s.island))],
    medianIncrementalCpuMs: deltas[Math.floor(deltas.length / 2)], maximumIncrementalCpuMs: deltas.at(-1),
    output: output.pathname, limitation: report.measurement }, null, 2));
