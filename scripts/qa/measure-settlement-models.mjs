import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
const { newFjordScenario } = load('fjord-play/FjordScenario');
const { projectResidentAppearance } = load('characters/ResidentAppearance');
const legacyClearance = process.argv.includes('--legacy-clearance');
if (legacyClearance) {
    // Matched A/B: only this class changes; all assets, identities and instrumentation stay current.
    const url = new URL('../../src/characters/NativeHairRig.ts', import.meta.url);
    const input = execFileSync('git', ['show', 'f9feee5406630c88b2b0aa49c20b16c4e9c74484:src/characters/NativeHairRig.ts'], { encoding: 'utf8' });
    const module = { exports: {} }, nativeRequire = createRequire(import.meta.url);
    const source = ts.transpileModule(input, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', source)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    load('characters/NativeHairRig').NativeHairRig = module.exports.NativeHairRig;
}
const clearance = [];
const Rig = load('characters/NativeHairRig').NativeHairRig;
const originalClearance = Rig.prototype.configureClearance;
Rig.prototype.configureClearance = function (...args) {
    const result = originalClearance.apply(this, args);
    if (this.lastClearanceWork) clearance.push({ ...this.lastClearanceWork });
    return result;
};
const samples = new Map();
const preparation = [], memory = [];
const seedOption = process.argv.find(value => value.startsWith('--seed='));
const seed = seedOption ? Number(seedOption.slice(7)) : 32;
const observePreparation = sample => {
    preparation.push(sample);
    record('span/' + sample.mode + '/' + sample.stage, sample.durationMs);
};
function completeAppearance(human) {
    const hash = createHash('sha256');
    const bytes = array => hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    human.root.traverse(node => {
        if (!node.isMesh || node.name.startsWith('MeshyFitDebug')) return;
        hash.update(node.name);
        for (const [name, attribute] of Object.entries(node.geometry.attributes)) {
            hash.update(name); bytes(attribute.array);
        }
        if (node.geometry.index) bytes(node.geometry.index.array);
        for (const [name, values] of Object.entries(node.geometry.morphAttributes))
            for (const value of values) { hash.update(name); bytes(value.array); }
    });
    for (const clip of ['Idle', 'Walk', 'Run']) {
        human.sampleAnimation(clip, .37);
        human.root.updateMatrixWorld(true);
        human.root.traverse(node => {
            if (!node.isMesh || node.name.startsWith('MeshyFitDebug')) return;
            hash.update(JSON.stringify(node.matrixWorld.elements));
            if (node.isSkinnedMesh) { node.skeleton.update(); bytes(node.skeleton.boneMatrices); }
        });
    }
    return hash.digest('hex');
}
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
const verifiedSources = process.argv.includes('--verified-sources');
const legacySourceBytes = process.argv.includes('--legacy-source-bytes');
const httpDigest = process.argv.includes('--http-digest');
let requestedSourceBytes = 0;
if (verifiedSources) {
    globalThis.fetch = async url => {
        const body = await bytes(url);
        requestedSourceBytes += body.byteLength;
        return new Response(body);
    };
    if (httpDigest) {
        const digest = load('characters/AssetDigest');
        digest.assetDigest = async body => digest.sha256Bytes(new Uint8Array(body));
    }
    if (legacySourceBytes) {
        const { characterAsync } = load('characters/CharacterPreparation');
        const { assetDigest } = load('characters/AssetDigest');
        load('characters/PreparedCharacterBytes').verifiedCharacterBytes = async (url, expected, observe, kind = 'source') => {
            const body = await characterAsync(observe, kind + '-fetch-read', () => bytes(url), url);
            requestedSourceBytes += body.byteLength;
            assert.equal(await characterAsync(observe, kind + '-digest', () => assetDigest(body), url), expected);
            return body;
        };
    }
}
const factory = verifiedSources ? new MeshyHumanFactory() : new MeshyHumanFactory(async url => {
    const start = performance.now();
    const result = await loader.parseAsync(await bytes(url), '');
    record('file-read-and-GLTF-parse', performance.now() - start);
    return result;
}, bytes);
const Models = modelsClass(), models = new Models({}, observePreparation);
models.humans = factory;
models.wardrobe = new FjordWardrobe(factory, message => { throw new Error(message); });
const state = seedOption ? newFjordScenario(seed).readSnapshot() : createCampaign(seed), residents = [];
globalThis.gc?.();
memory.push(process.memoryUsage());
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
        const preparedMs = performance.now() - before;
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
        residents.push({ id: person.id, milliseconds: preparedMs,
            modules: root.userData.selectedAssets, pace: models.pace(root), coverageSha256: hash.digest('hex'),
            appearanceSha256: completeAppearance(human) });
        models.release(root);
        memory.push(process.memoryUsage());
    }
} finally { models.dispose(); }
const report = {
    platform: `Node ${process.version}, ${process.platform}/${process.arch}; CPU-only, image decode stubbed`,
    scene: `10 actual seed-${seed} founder identities/faces; source assets read from disk; world LOD unchanged`,
    seed, scenario: seedOption ? 'newFjordScenario/summer-800-v1' : 'legacy CPU harness',
    verifiedSources, legacySourceBytes, httpDigest, requestedSourceBytes,
    sourceSha256: Object.fromEntries(['src/fjord-play/FjordModels.ts', 'src/characters/BodyCoverage.ts',
        'src/characters/PreparedNativeOutfit.ts', 'src/characters/MeshyHuman.ts', 'src/characters/NativeHairRig.ts'].map(path =>
        [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
    elapsedMs: performance.now() - started, residents, operations: Object.fromEntries(samples),
    preparationElapsedMs: residents.reduce((sum, resident) => sum + resident.milliseconds, 0),
    clearanceImplementation: legacyClearance ? 'f9feee5406630c88b2b0aa49c20b16c4e9c74484' : 'current', clearance,
    diagnostics: models.diagnostics, preparation,
    nodeMemory: { initial: memory[0], final: process.memoryUsage(),
        maxObservedHeapUsed: Math.max(...memory.map(value => value.heapUsed)),
        maxObservedArrayBuffers: Math.max(...memory.map(value => value.arrayBuffers)),
        note: 'Node checkpoint samples, not true peak memory, browser memory or GPU memory.' },
    retainedFactorySources: { bodies: factory.sources.size, facialBodies: factory.facialSources.size,
        modules: factory.modules.size },
    limitations: 'Nested timings overlap. No physical iPhone, network/image decoding, GPU or full island load measurement.',
};
mkdirSync('output/island-loading-259', { recursive: true });
const label = process.argv[2] ?? 'current';
const baselinePath = process.argv.slice(3).find(value => !value.startsWith('--'));
if (baselinePath) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    const outputs = run => run.residents.map(value =>
        [value.id, value.coverageSha256, value.modules, value.pace,
            baseline.residents[0].appearanceSha256 ? value.appearanceSha256 : undefined]);
    assert.deepEqual(outputs(report), outputs(baseline), 'Native body buffers, wardrobe selections and pace must stay exact');
    report.comparison = { baselineMs: baseline.elapsedMs, exactBodyBuffersSelectionsAndPace: true,
        reductionPercent: (1 - report.elapsedMs / baseline.elapsedMs) * 100 };
}
writeFileSync(`output/island-loading-259/settlement-${label}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ elapsedMs: report.elapsedMs, operations: report.operations, residents: residents.length,
    diagnostics: report.diagnostics }, null, 2));
