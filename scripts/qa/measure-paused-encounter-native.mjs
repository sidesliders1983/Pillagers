import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { loadTypeScript } from '../load-typescript.mjs';

const root = new URL('../../', import.meta.url);
const moduleAt = path => loadTypeScript(new URL('src/' + path + '.ts', root));
function runtimeClass(path, name) {
    const url = new URL('src/' + path, root), module = { exports: {} };
    const source = readFileSync(url, 'utf8').replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'));
    const code = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const nativeRequire = createRequire(import.meta.url);
    new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ?
        loadTypeScript(new URL(name + '.ts', url)) : nativeRequire(name), module, module.exports);
    return module.exports[name];
}

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async path => String(path).startsWith('blob:') ? originalFetch(path) :
    new Response(await readFile(new URL('public' + String(path).split('?')[0], root)));
const Models = runtimeClass('fjord-play/FjordModels.ts', 'FjordModels');
const Assets = runtimeClass('core/AssetManager.ts', 'AssetManager');
const { defaultDNA } = moduleAt('characters/CharacterDNA');
const models = new Models(new Assets());
try {
    const actors = [];
    for (let index = 0; index < 16; index++) actors.push(await models.create({ kind: 'persona',
        id: 'paused-measurement-' + index, dna: { ...defaultDNA(), age: 32 },
        transform: { x: 0, y: 0, z: 0, rotation: 0, scale: 1 },
        status: { living: true, expedition: 'measurement',
            equipment: { weapon: 'woodenSpear', shield: 'woodenShield' } } }));
    if (models.diagnostics.length) throw new Error(models.diagnostics.join('\n'));
    const request = { key: 'same-recorded-exchange', action: 'spear', startedAt: 100,
        durationTicks: 8, tick: 104, hasSpear: true, hasShield: true };
    const times = [];
    for (let frame = 0; frame < 70; frame++) {
        const started = performance.now();
        for (const actor of actors) models.animateEncounter(actor, request);
        if (frame >= 10) times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    for (const actor of actors) models.release(actor);
    const { FjordEntities } = moduleAt('fjord-play/FjordEntities');
    const { LivingWorldController } = moduleAt('fjord-play/LivingWorldController');
    const bounds = { minX: 0, maxX: 320, minZ: 0, maxZ: 256 };
    const world = { waterLevel: -1, config: { seed: 32 }, placementPlan: [],
        terrain: { bounds, spacing: 8, columns: 41, rows: 33, heights: Array(1353).fill(0) },
        navigation: { bounds, spacing: 8, columns: 41, rows: 33, cells: Array(1353).fill(true) },
        settlement: { center: { x: 64, z: 128 }, harbor: null,
            bounds: { minX: 24, maxX: 112, minZ: 80, maxZ: 184 } } };
    const entities = Array.from({ length: 16 }, (_, index) => ({ kind: 'persona',
        id: 'scene-measurement-' + index, selectionKey: 'persona:scene-measurement-' + index,
        label: 'Measured participant', asset: 'human', dna: { ...defaultDNA(), age: 32 },
        transform: { x: 160 + index % 4 * 2, y: 0, z: 120 + Math.floor(index / 4) * 2, rotation: 0, scale: 1 },
        status: { living: true, expedition: 'measurement',
            equipment: { weapon: 'woodenSpear', shield: 'woodenShield' },
            encounter: { version: 1, id: 'known-scene-encounter', phase: 'engaging', active: true,
                snapshotTick: 104, startedAt: 100, exchangeTicks: 8, withdrawing: false,
                withdrawalStartedAt: null, withdrawalTicks: 5, facing: null,
                outgoing: { key: 'known-scene-exchange-' + index, tick: 100, facing: null, outcome: 'survived' } } } }));
    const scene = new FjordEntities(models), motion = new LivingWorldController(world);
    let sceneTimes;
    try {
        scene.prepareEncounterPresentation(104);
        await scene.sync(entities);
        motion.reconcile(entities, { plots: [], paths: [] });
        scene.configureMotion(motion);
        sceneTimes = [];
        for (let frame = 0; frame < 70; frame++) {
            const started = performance.now();
            scene.advance(motion, 0, false);
            if (frame >= 10) sceneTimes.push(performance.now() - started);
        }
        sceneTimes.sort((a, b) => a - b);
    } finally { scene.dispose(); }
    const report = { schemaVersion: 1, environment: { node: process.version,
        platform: process.platform, architecture: process.arch },
        participants: 16, warmupFrames: 10, measuredFrames: times.length,
        sameRecordedKeyAndTick: true, medianMilliseconds: times[Math.floor(times.length / 2)],
        p95Milliseconds: times[Math.floor(times.length * .95)],
        minimumMilliseconds: times[0], maximumMilliseconds: times.at(-1),
        actualScene: { participants: 16, productionModelAndMovementOwners: true,
            medianMilliseconds: sceneTimes[Math.floor(sceneTimes.length / 2)],
            p95Milliseconds: sceneTimes[Math.floor(sceneTimes.length * .95)] },
        gpuRendering: false, physicalDeviceAcceptance: false,
        limitation: 'CPU-only production model sampling, no renderer, not a device/frame-rate certification.' };
    const output = process.argv[2] ?? 'docs/qa/encounter-animation-310/paused-native-measurement.json';
    await mkdir(new URL(output.slice(0, output.lastIndexOf('/')) + '/', root), { recursive: true });
    await writeFile(new URL(output, root), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
} finally { models.dispose(); globalThis.fetch = originalFetch; }
