import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from 'vite';

// Bundle the real presentation contracts for Node, replacing only the browser
// asset base. Graphics/PNG encoding are external boundaries, not emulated GPUs.
const directory = resolve('scratch/portrait-selection');
await mkdir(directory, { recursive: true });
const entry = resolve(directory, 'entry.ts');
await writeFile(entry, [
    "export * from '../../src/fjord-play/FjordModels';",
    "export * from '../../src/fjord-play/FjordEntities';",
    "export * from '../../src/fjord-play/FjordProjection';",
    "export * from '../../src/fjord-play/FjordWardrobe';",
    "export * from '../../src/core/AssetManager';",
    "export * from '../../src/characters/ResidentPortraitStudio';",
    "export * from '../../src/characters/ResidentAppearance';",
    "export * from '../../src/characters/MeshyBodyFitAdapter';",
    "export * from '../../src/characters/MeshyHuman';",
    "export * from '../../src/simulation/SimulationCore';",
    "export * from '../../src/world-generation/GenerateWorld';",
].join('\n'));
await build({ configFile: false, logLevel: 'error', define: { 'import.meta.env.BASE_URL': '"/"' },
    build: { ssr: entry, outDir: directory, emptyOutDir: false, minify: false,
        rollupOptions: { output: { entryFileNames: 'contracts.mjs' } } } });
const contracts = await import(pathToFileURL(resolve(directory, 'contracts.mjs')).href);
const { Color, Vector3, Vector4, SRGBColorSpace } = await import('three');
const requests = [];
const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.ProgressEvent = class { constructor(type, values) { this.type = type; Object.assign(this, values); } };
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
globalThis.fetch = async input => {
    if (String(input).startsWith('blob:')) return originalFetch(input);
    const path = new URL(String(input), 'http://fixture.invalid').pathname;
    const bytes = await readFile('public' + path);
    requests.push({ path, bytes: bytes.length });
    return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
};
const state = contracts.createCampaign(32, {}, {}, {}, {}, {}, {}, 'summer-800-v1');
const world = contracts.generateWorld({ seed: 32 });
const view = contracts.projectFjordSettlement(state, world, contracts.createFjordLayout(world));
const ids = ['founder-1', 'founder-3', 'founder-6'];
const entities = ids.map(id => view.entities.find(entity => entity.kind === 'persona' && entity.id === id));
const inputs = entities.map(entity => ({ residentId: entity.id,
    ...contracts.projectResidentAppearance(state, entity.id),
    presentation: contracts.fjordWardrobePresentation(entity), pixelRatio: 1 }));
const assets = new contracts.AssetManager();
const models = new contracts.FjordModels(assets);
const layer = new contracts.FjordEntities(models);
await layer.sync(entities);

let target = null;
const targets = new Set();
const renderer = {
    toneMapping: 3, toneMappingExposure: 1, outputColorSpace: SRGBColorSpace, autoClear: true,
    shadowMap: { enabled: true },
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: next => { target = next; if (next) targets.add(next); },
    getViewport: out => out.copy(new Vector4(0, 0, 800, 600)), setViewport() {},
    getScissor: out => out.copy(new Vector4(0, 0, 800, 600)), setScissor() {},
    getScissorTest: () => false, setScissorTest() {},
    getClearColor: out => out.copy(new Color('#123456')), getClearAlpha: () => 1, setClearColor() {},
    render() {}, readRenderTargetPixels() {},
};
const studio = new contracts.ResidentPortraitStudio(renderer, () => 'headless-PNG-boundary',
    async () => { throw new Error('A live selection tried to create another model'); });
const rows = [];
try {
    const readyRequests = requests.length;
    for (const input of [...inputs, ...inputs]) {
        const human = layer.residentForPortrait(input);
        assert.ok(human, 'The actual Fjord entity must supply its prepared resident: ' + input.residentId);
        const start = performance.now();
        await studio.render(input, human);
        rows.push({ route: 'borrowed-world-model', id: input.residentId,
            preparationMs: performance.now() - start, extraAssetRequests: requests.length - readyRequests });
    }
    assert.equal(requests.length, readyRequests);
    assert.equal(targets.size, 2);
    for (const input of inputs) {
        const before = requests.length, start = performance.now();
        // Exactly the old portrait's pre-render preparation; no GPU/PNG timing.
        const human = await contracts.meshyHumanFactory.create(input.dna, 0, input.profile,
            input.presentation, input.face);
        try {
            human.sampleAnimation('Idle', .4);
            const posed = human.fit.surface('posed');
            for (const point of [[0, 1.45, .11], [0, 1.60, .12], [.045, 1.54, .12], [-.045, 1.54, .12]])
                contracts.anchorPoint(posed, contracts.closestSurface(human.fit.source, new Vector3(...point), ['HEAD']));
            rows.push({ route: 'legacy-LOD0-preparation', id: input.residentId,
                preparationMs: performance.now() - start, extraAssetRequests: requests.length - before });
        } finally { human.dispose(); }
    }
} finally {
    studio.dispose();
    layer.dispose();
    models.dispose();
    assets.dispose();
    globalThis.fetch = originalFetch;
}
const paths = ['src/characters/ResidentPortraitStudio.ts', 'src/characters/CharacterPortraits.ts',
    'src/fjord-play/FjordModels.ts', 'src/fjord-play/FjordEntities.ts', 'src/fjord-play/FjordInterface.ts',
    'src/fjord-play/FjordScene.ts', 'scripts/qa/measure-portrait-selection.mjs'];
const hashes = Object.fromEntries(await Promise.all(paths.map(async path =>
    [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
const result = { base: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), hashes,
    seed: 32, rows, reusedTargetCount: targets.size, requests,
    limitation: 'Headless CPU preparation with stub GPU and PNG boundaries; not iPhone, browser or GPU timings.' };
const output = resolve(process.argv[2] ?? 'scratch/portrait-selection/result.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, rows, targets: targets.size }, null, 2));
