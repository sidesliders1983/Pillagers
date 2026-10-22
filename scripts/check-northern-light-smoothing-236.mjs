import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';

const { Scene, Vector3, Group, Mesh, BoxGeometry, MeshStandardMaterial, PerspectiveCamera } =
    createRequire(import.meta.url)('three');
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { projectFjordCalendar } = load('../src/fjord-play/FjordCalendar.ts');
const { projectFjordWeather } = load('../src/fjord-play/FjordWeather.ts');
const weather = projectFjordWeather('Normal').lighting;

function measure(quality, lowCamera, smooth, fps) {
    const scene = new Scene(), renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] },
        new Vector3(), new Vector3(), quality, fjordPresentation.lighting);
    const root = new Group(), geometry = new BoxGeometry(500, 50, 500), material = new MeshStandardMaterial();
    const receiver = new Mesh(geometry, material);
    receiver.receiveShadow = true;
    receiver.castShadow = true;
    root.add(receiver);
    lighting.includeWorldShadowBounds(root);
    const camera = new PerspectiveCamera(45, 1.5, .1, 600);
    camera.position.set(28, lowCamera ? 25 : 31, lowCamera ? -42 : -32);
    camera.lookAt(0, 0, 0);
    const shadow = lighting.directional.shadow, resources = [...scene.children];
    let maximumPassMs = 0;
    const round = () => {
        lighting.setSeason(0, weather, 0);
        const startPasses = lighting.inspectShadowCoverage().passes;
        const started = performance.now();
        for (let frame = 0; frame < fps * 60; frame++) {
            if (frame % (fps / 2) === 0) {
                // One real-time minute per year, with the game's 500 ms committed clock batches.
                const progress = Math.floor(frame / fps * 1000 / 60) / 1000;
                const calendar = projectFjordCalendar({ winter: 800, tick: progress * 1000 }, 1000);
                lighting.setSeason(calendar.visualProgress, weather, progress, smooth ? .5 : 0);
            }
            lighting.update(frame / fps, 0, 1 / fps, true);
            lighting.updateShadowView(camera);
        }
        const cpuMsPerFrame = (performance.now() - started) / (fps * 60);
        const coverage = lighting.inspectShadowCoverage();
        maximumPassMs = Math.max(maximumPassMs, coverage.maximumMs);
        return { cpuMsPerFrame, coveragePasses: coverage.passes - startPasses };
    };
    try {
        round(); // JIT warm-up, excluded from reported round times.
        const rounds = Array.from({ length: 5 }, round).sort((a, b) => a.cpuMsPerFrame - b.cpuMsPerFrame);
        if (shadow !== lighting.directional.shadow || scene.children.some((node, i) => node !== resources[i]))
            throw new Error('Lighting or shadow ownership changed during interpolation.');
        return { ...rounds[2], rounds, maximumPassMs, shadowSources: 1, mapSize: shadow.mapSize.toArray() };
    } finally {
        lighting.dispose(); geometry.dispose(); material.dispose();
    }
}

const report = {
    version: 1, runtime: process.version, platform: process.platform,
    measurement: 'CPU-only native WorldLighting updates plus actual shadow receiver-crop math; mock renderer, no GPU draws',
    fixture: '500 x 50 x 500 receiver/caster bounds, static normal/low camera, 60-second annual cycle, 500 ms clock batches',
    limitation: 'Not a real browser/device frame-time, GPU allocation, thermal or visual smoothness guarantee',
    samples: [],
};
for (const fps of [30, 60]) for (const quality of ['low', 'standard']) for (const lowCamera of [false, true]) {
    const stepped = measure(quality, lowCamera, false, fps);
    const interpolated = measure(quality, lowCamera, true, fps);
    report.samples.push({ fps, quality, lowCamera, stepped, interpolated,
        incrementalCpuMs: interpolated.cpuMsPerFrame - stepped.cpuMsPerFrame });
}
const output = new URL('../output/northern-light-236/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('smoothing-cpu-report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, samples: report.samples.map(({ fps, quality, lowCamera,
    stepped, interpolated, incrementalCpuMs }) => ({ fps, quality, lowCamera,
    steppedMs: stepped.cpuMsPerFrame, interpolatedMs: interpolated.cpuMsPerFrame, incrementalCpuMs,
    steppedCoveragePasses: stepped.coveragePasses, interpolatedCoveragePasses: interpolated.coveragePasses })) }, null, 2));
