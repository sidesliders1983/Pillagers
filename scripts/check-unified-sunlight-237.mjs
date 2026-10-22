import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { loadTypeScript } from './load-typescript.mjs';
const { Scene, Group, Mesh, BoxGeometry, MeshStandardMaterial, Box3, Vector3, PerspectiveCamera } =
    createRequire(import.meta.url)('three');
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { WorldLighting } = load('../src/core/WorldLighting.ts');
const { DirectionalAtmosphere } = load('../src/world/DirectionalAtmosphere.ts');
const { FjordsideWater } = load('../src/world/FjordsideWater.ts');
const { fjordPresentation } = load('../src/config/FjordPresentation.ts');
const { projectFjordWeather } = load('../src/fjord-play/FjordWeather.ts');

function measure(enabled, quality, lowCamera, movingCamera) {
    const scene = new Scene(), renderer = { shadowMap: { enabled: true }, toneMappingExposure: 1 };
    const lighting = new WorldLighting(scene, renderer, { windowMaterials: [], fireMaterials: [] },
        new Vector3(), new Vector3(), quality, fjordPresentation.lighting);
    const atmosphere = enabled ? new DirectionalAtmosphere() : undefined;
    const water = new FjordsideWater(0, new Vector3(), quality, atmosphere);
    const root = new Group(), geometry = new BoxGeometry(160, 30, 160), material = new MeshStandardMaterial();
    const terrain = new Mesh(geometry, material); terrain.castShadow = terrain.receiveShadow = true;
    water.mesh.userData.shadowReceiverBounds = new Box3(new Vector3(-96, -.2, -96), new Vector3(96, .2, 96));
    root.add(terrain, water.mesh);
    lighting.includeWorldShadowBounds(root); atmosphere?.bind(root);
    const camera = new PerspectiveCamera(45, 1.5, .1, 600);
    camera.position.set(-28, lowCamera ? 25 : 45, 42); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    lighting.setSeason(.3, projectFjordWeather('Normal').lighting, .4);
    const resources = { geometry: water.mesh.geometry, material: water.mesh.material,
        shadow: lighting.directional.shadow, scene: [...scene.children] };
    const round = () => {
        const started = performance.now();
        for (let frame = 0; frame < 3000; frame++) {
            if (movingCamera) { camera.position.x = -28 + Math.sin(frame / 300) * 20; camera.lookAt(0, 0, 0); }
            lighting.update(0, .3);
            lighting.updateShadowView(camera);
            atmosphere?.update(lighting, camera);
            water.update(0, lighting, camera);
        }
        return (performance.now() - started) / 3000;
    };
    try {
        round();
        const rounds = Array.from({ length: 5 }, round).sort((a, b) => a - b);
        if (resources.geometry !== water.mesh.geometry || resources.material !== water.mesh.material ||
            resources.shadow !== lighting.directional.shadow ||
            scene.children.some((node, index) => node !== resources.scene[index]))
            throw new Error('Per-frame sunlight updates changed resource ownership.');
        return { cpuMsPerFrame: rounds[2], rounds, shadowSources: 1,
            receiverBounds: lighting.inspectShadowCoverage().receiverBounds,
            shadowSamplesPerWaterFragment: enabled ? (quality === 'low' ? 4 : 9) : 0 };
    } finally { water.dispose(); atmosphere?.dispose(); lighting.dispose(); geometry.dispose(); material.dispose(); }
}
const report = { version: 1, runtime: process.version, platform: process.platform,
    measurement: 'CPU-only light, native shadow receiver crop and water/atmosphere uniform updates with a mock renderer',
    limitation: 'No shader execution, WebGL GPU timing, whole-game frame-time or physical-device performance claim; extra per-pixel shadow/glow work remains unmeasured',
    samples: [] };
for (const quality of ['low', 'standard']) for (const lowCamera of [false, true]) for (const movingCamera of [false, true]) {
    const baseline = measure(false, quality, lowCamera, movingCamera);
    const candidate = measure(true, quality, lowCamera, movingCamera);
    report.samples.push({ quality, lowCamera, movingCamera, baseline, candidate,
        incrementalCpuMs: candidate.cpuMsPerFrame - baseline.cpuMsPerFrame });
}
const output = new URL('../output/unified-sunlight-237/', import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL('cpu-report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ samples: report.samples.length,
    maximumIncrementalCpuMs: Math.max(...report.samples.map(sample => sample.incrementalCpuMs)),
    limitation: report.limitation }, null, 2));
