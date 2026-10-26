import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { loadTypeScript } from '../../../../scripts/load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../../../' + path, import.meta.url));
const { SharedSettlement } = load('src/play/SharedSettlement.ts');
const { loadBakedCampaignIsland } = load('src/fjord-play/BakedCampaignIsland.ts');
const checkpoint = readFileSync('docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json', 'utf8');
const data = JSON.parse(checkpoint);
await loadBakedCampaignIsland(data.fjord.campaign.seed, data.fjord.island, undefined,
    async url => new Response(readFileSync('public' + url.split('?')[0])));
const shared = SharedSettlement.restore(checkpoint, 'fjord');
function runtimeClass(path, name) {
    const url = new URL('../../../../src/' + path, import.meta.url);
    const module = { exports: {} }, nativeRequire = createRequire(import.meta.url);
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports[name];
}
const FjordModels = runtimeClass('fjord-play/FjordModels.ts', 'FjordModels');
const AssetManager = runtimeClass('core/AssetManager.ts', 'AssetManager');
const original = { fetch: globalThis.fetch, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap };
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
globalThis.fetch = async path => String(path).startsWith('blob:') ? original.fetch(path) :
    new Response(readFileSync(resolve('public', '.' + String(path).split('?')[0])));
const samples = [], residents = [];
const models = new FjordModels(new AssetManager(), sample => samples.push(sample));
try {
    const entities = shared.fjord.readProjection().entities.filter(entity =>
        entity.kind === 'persona' && entity.dna && entity.transform);
    for (const entity of entities) {
        const started = performance.now();
        const model = await models.create(entity);
        residents.push({ entity, model, id: entity.id, totalCreateMs: performance.now() - started,
            walkPace: models.pace(model), runPace: models.pace(model, 'Run') });
    }
    const run = samples.filter(sample => sample.stage === 'running-pace-preparation');
    const walk = samples.filter(sample => sample.stage === 'walking-pace-preparation');
    assert.equal(run.length, 10);
    assert.ok(run.every(sample => sample.outcome === 'complete'));
    for (const resident of residents) {
        resident.model.position.set(13, 2, -7);
        resident.model.rotation.set(.1, .5, .2);
        const position = resident.model.position.clone(), rotation = resident.model.quaternion.clone();
        await models.reconcile(resident.model, resident.entity);
        assert.ok(resident.model.position.distanceTo(position) < 1e-9);
        assert.ok(resident.model.quaternion.angleTo(rotation) < 1e-7);
    }
    const reusedRunCount = samples.filter(sample => sample.stage === 'running-pace-preparation').length - run.length;
    assert.equal(reusedRunCount, 0);
    const summarize = rows => ({ count: rows.length,
        totalMs: rows.reduce((sum, sample) => sum + sample.durationMs, 0),
        meanMs: rows.reduce((sum, sample) => sum + sample.durationMs, 0) / rows.length,
        maximumMs: Math.max(...rows.map(sample => sample.durationMs)) });
    const result = {
        baseHead: '874a5f6fa5890dc78f4a4c887c3621b71342555e',
        sourceHashConvention: 'SHA-256 of UTF-8 with CRLF normalized to LF only.',
        sourceFiles: Object.fromEntries(['src/fjord-play/FjordModels.ts', 'src/fjord-play/FjordWardrobe.ts',
            'src/characters/MeshyModuleRuntime.ts', 'src/characters/MeshyHuman.ts',
            'src/character-lab/HumanPreviewPace.ts',
            'docs/qa/cultural-occasions-277/participation-v4/native-preparation.mjs'].map(path =>
            [path, createHash('sha256').update(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')).digest('hex')])),
        fixtureSHA256: createHash('sha256').update(checkpoint).digest('hex'),
        method: 'Real public FjordModels.create/reconcile, actual committed LOD2 body, face, DNA and wardrobe. Filesystem-backed fetch and inert decoded-image surface for Node. Synchronous CharacterPreparation spans isolate added Running gait sampling; no renderer, GPU, browser or device-performance claim. Source caches warm naturally across the ten residents.',
        addedRunningPreparation: summarize(run), existingWalkingPreparation: summarize(walk),
        unchangedReconcileAdditionalRunPreparations: reusedRunCount,
        poseAndRotationPreserved: true,
        residents: residents.map(({ id, totalCreateMs, walkPace, runPace }) => ({ id, totalCreateMs, walkPace, runPace })),
        spans: run,
    };
    writeFileSync(new URL('native-preparation.json', import.meta.url), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ addedRunningPreparation: result.addedRunningPreparation,
        existingWalkingPreparation: result.existingWalkingPreparation,
        unchangedReconcileAdditionalRunPreparations: reusedRunCount, poseAndRotationPreserved: true }));
} finally {
    models.dispose();
    for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
    }
}
