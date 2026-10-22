import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
function modelsClass() {
    const url = new URL('../../src/fjord-play/FjordModels.ts', import.meta.url);
    const module = { exports: {} }, nativeRequire = createRequire(import.meta.url);
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports.FjordModels;
}
const { MeshyHumanFactory, MeshyHuman } = load('characters/MeshyHuman');
const { MeshyBodyFitAdapter } = load('characters/MeshyBodyFitAdapter');
const { MeshyModuleRuntime } = load('characters/MeshyModuleRuntime');
const { FjordWardrobe } = load('fjord-play/FjordWardrobe');
const { createCampaign } = load('simulation/SimulationCore');
const { projectResidentAppearance } = load('characters/ResidentAppearance');
const samples = new Map();
function record(label, milliseconds) {
    const current = samples.get(label) ?? { calls: 0, milliseconds: 0 };
    current.calls++;
    current.milliseconds += milliseconds;
    samples.set(label, current);
}
function observe(prototype, method) {
    const original = prototype[method];
    prototype[method] = function (...args) {
        const start = performance.now();
        try { return original.apply(this, args); }
        finally { record(prototype.constructor.name + '.' + method, performance.now() - start); }
    };
}
for (const method of ['applyDNA', 'setNativeModules', 'sampleAnimation']) observe(MeshyHuman.prototype, method);
observe(MeshyBodyFitAdapter.prototype, 'refit');
observe(MeshyModuleRuntime.prototype, 'refit');
globalThis.self = globalThis;
// CPU-only fixture: image decode, network, layout and GPU cost are deliberately unmeasured.
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const bytes = async url => buffer(await readFile('public' + url.split('?')[0]));
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const factory = new MeshyHumanFactory(async url => {
    const start = performance.now();
    const result = await loader.parseAsync(await bytes(url), '');
    record('file-read-and-GLTF-parse', performance.now() - start);
    return result;
}, bytes);
const Models = modelsClass(), models = new Models({});
models.humans = factory;
models.wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
const state = createCampaign(32), residents = [];
const started = performance.now();
try {
    for (const person of Object.values(state.personas)) {
        const appearance = projectResidentAppearance(state, person.id);
        const entity = { kind: 'persona', id: person.id, asset: 'human', dna: appearance.dna,
            facialIdentity: appearance.face, transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
            status: { living: true, occupation: person.occupation } };
        const before = performance.now();
        const root = await models.create(entity);
        await models.reconcile(root, entity); // actual entity layer reconciles new instances too
        const human = models.actors.get(root).human;
        const coverage = human.fit.mesh.geometry;
        const hash = createHash('sha256');
        for (const [name, attribute] of Object.entries(coverage.attributes)) {
            hash.update(name);
            hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
        }
        for (const [name, attributes] of Object.entries(coverage.morphAttributes)) for (const attribute of attributes) {
            hash.update(name);
            hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
        }
        if (coverage.index) hash.update(new Uint8Array(coverage.index.array.buffer,
            coverage.index.array.byteOffset, coverage.index.array.byteLength));
        residents.push({ id: person.id, milliseconds: performance.now() - before,
            modules: root.userData.selectedAssets, pace: models.pace(root), coverageSha256: hash.digest('hex') });
        models.release(root);
    }
} finally { models.dispose(); }
const report = {
    platform: `Node ${process.version}, ${process.platform}/${process.arch}; CPU-only, image decode stubbed`,
    scene: '10 actual seed-32 founder identities/faces; source assets read from disk; world LOD unchanged',
    sourceSha256: Object.fromEntries(['src/fjord-play/FjordModels.ts', 'src/characters/BodyCoverage.ts',
        'src/characters/PreparedNativeOutfit.ts'].map(path =>
        [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
    elapsedMs: performance.now() - started, residents, operations: Object.fromEntries(samples),
    diagnostics: models.diagnostics,
    limitations: 'Nested timings overlap. No physical iPhone, network/image decoding, GPU or full island load measurement.',
};
mkdirSync('output/island-loading-259', { recursive: true });
const label = process.argv[2] ?? 'current';
if (process.argv[3]) {
    const baseline = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const outputs = run => run.residents.map(value =>
        [value.id, value.coverageSha256, value.modules, value.pace]);
    assert.deepEqual(outputs(report), outputs(baseline), 'Native body buffers, wardrobe selections and pace must stay exact');
    report.comparison = { baselineMs: baseline.elapsedMs, exactBodyBuffersSelectionsAndPace: true,
        reductionPercent: (1 - report.elapsedMs / baseline.elapsedMs) * 100 };
}
writeFileSync(`output/island-loading-259/settlement-${label}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ elapsedMs: report.elapsedMs, operations: report.operations, residents: residents.length,
    diagnostics: report.diagnostics }, null, 2));
