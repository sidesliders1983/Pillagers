import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from './load-typescript.mjs';

const { Group, Mesh, BoxGeometry, MeshStandardMaterial } = createRequire(import.meta.url)('three');
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { SeasonAppearanceTransition } = load('../src/world/SeasonAppearanceTransition.ts');
const { SeasonTint } = load('../src/world/SeasonTint.ts');
const { StructureSeasonTint } = load('../src/world/StructureSeasonTint.ts');
const { projectFjordCalendar } = load('../src/fjord-play/FjordCalendar.ts');

function measure(fps, structureCount, interpolate) {
    const geometry = new BoxGeometry(), source = new MeshStandardMaterial();
    const root = new Group(), ground = new Mesh(geometry, source.clone());
    for (let index = 0; index < 11; index++) ground.add(new Mesh(geometry, source.clone()));
    root.add(ground);
    const foliageSources = [];
    for (let index = 0; index < 24; index++) {
        const material = source.clone(), mesh = new Mesh(geometry, material);
        foliageSources.push(material);
        mesh.userData.seasonalFoliage = true;
        root.add(mesh);
    }
    const terrain = new SeasonTint(root, ground, 30);
    const roofs = Array.from({ length: structureCount }, () => new Mesh(geometry, source));
    const structures = roofs.map(roof => new StructureSeasonTint(roof));
    const transition = new SeasonAppearanceTransition();
    const resources = roofs.map(roof => roof.material);
    const apply = () => {
        terrain.applyAppearance(transition.current);
        for (const structure of structures) structure.setSnowAmount(transition.current.snowAmount);
    };
    const round = () => {
        let writes = 0;
        const start = performance.now();
        for (let frame = 0; frame < fps * 60; frame++) {
            if (frame % (fps / 2) === 0) {
                const tick = Math.floor(frame / fps * 1000 / 60);
                const progress = projectFjordCalendar({ winter: 800, tick }, 1000).visualProgress;
                if (transition.anchor(progress, interpolate ? .5 : 0)) { apply(); writes++; }
            }
            if (transition.advance(1 / fps, true)) { apply(); writes++; }
        }
        return { cpuMsPerFrame: (performance.now() - start) / (fps * 60), materialPasses: writes };
    };
    try {
        round();
        const rounds = Array.from({ length: 5 }, round).sort((a, b) => a.cpuMsPerFrame - b.cpuMsPerFrame);
        if (roofs.some((roof, index) => roof.material !== resources[index] || roof.geometry !== geometry))
            throw new Error('Snow interpolation replaced GPU resources.');
        return { ...rounds[2], roundMs: rounds.map(round => round.cpuMsPerFrame) };
    } finally {
        terrain.dispose();
        for (const structure of structures) structure.dispose();
        ground.traverse(mesh => mesh.material.dispose());
        for (const material of foliageSources) material.dispose();
        source.dispose(); geometry.dispose();
    }
}

const report = {
    version: 1, runtime: process.version, platform: process.platform,
    measurement: 'CPU-only annual snow/color interpolation and real SeasonTint/StructureSeasonTint material writes; no WebGL draws',
    fixture: '12 terrain materials, 24 foliage materials, 20 or 100 structure instances; 500 ms committed samples, 60-second year',
    limitation: 'Material-binding benchmark, not whole-scene browser/GPU, physical-device or GC evidence',
    samples: [],
};
for (const fps of [30, 60]) for (const structures of [20, 100]) {
    const stepped = measure(fps, structures, false), interpolated = measure(fps, structures, true);
    report.samples.push({ fps, structures, stepped, interpolated,
        incrementalCpuMs: interpolated.cpuMsPerFrame - stepped.cpuMsPerFrame });
}
const output = new URL('../output/northern-light-236/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('snow-cpu-report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
