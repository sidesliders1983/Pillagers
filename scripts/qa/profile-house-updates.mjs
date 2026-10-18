import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { loadTypeScript } from '../load-typescript.mjs';

const load = file => loadTypeScript(new URL('../../src/' + file, import.meta.url));
const { SharedSettlement } = load('play/SharedSettlement.ts');
const ground = load('fjord-play/FjordGround.ts');
const groundUrl = new URL('../../src/fjord-play/FjordGround.ts', import.meta.url);
const sourceRef = process.env.QA_GROUND_REF;
if (sourceRef && !/^[a-f0-9]{40}$/.test(sourceRef)) throw new Error('Use an exact control commit.');
const source = sourceRef
    ? execFileSync(process.env.GIT_EXECUTABLE || 'git',
        ['show', sourceRef + ':src/fjord-play/FjordGround.ts'], { encoding: 'utf8' })
    : await readFile(groundUrl, 'utf8');
if (sourceRef) {
    // Use the original path projector with the same campaign, Core and real terrain queries.
    const compiled = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
    } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', compiled)(
        name => loadTypeScript(new URL(name + '.ts', groundUrl)), module, module.exports);
    Object.assign(ground, module.exports);
}

const digest = value => createHash('sha256').update(
    typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const output = process.env.QA_OUTPUT || 'artifacts/house-updates/profile.json';
const seeds = (process.env.QA_SEEDS || '17,32').split(',').map(Number);
const report = { sourceRef: sourceRef ?? 'working-tree', sourceSha256: digest(source), seeds: [] };
for (const seed of seeds) {
    const shared = new SharedSettlement(seed, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const result = { seed, terrainSeed: shared.fjord.blueprint.config.seed, samples: [] };
    function measure(phase, command) {
        const start = performance.now();
        shared.session.command(command);
        const committed = performance.now();
        const view = shared.fjord.readProjection();
        const projected = performance.now();
        result.samples.push({ phase, commandMs: committed - start, projectionMs: projected - committed,
            houses: view.ground.plots.length, coreSha256: digest(shared.session.saveJSON()),
            groundSha256: digest({ home: view.ground, rival: view.rival.ground }),
            layoutSha256: digest({ home: view.layout, entities: view.entities }) });
    }
    const tick = phase => measure(phase, { type: 'AdvanceTicks', ticks: 1 });
    for (let index = 0; index < 3; index++) tick('tents');
    measure('salvage-longship', { type: 'SalvageLongship', longshipId: 'founding-longship' });
    for (const count of [1, 2]) {
        const state = shared.session.readSnapshot();
        const home = Object.values(state.households).find(home => home.memberIds.length &&
            state.residences[home.residenceId]?.kind === 'tent');
        measure('build-' + count, { type: 'BuildHouse', householdId: home.id });
        for (let index = 0; index < 8; index++) tick(count + '-house');
    }
    report.seeds.push(result);
    console.log(JSON.stringify({ seed, terrainSeed: result.terrainSeed,
        projections: Object.fromEntries(['tents', '1-house', '2-house'].map(phase => {
            const values = result.samples.filter(sample => sample.phase === phase)
                .map(sample => sample.projectionMs).sort((a, b) => a - b);
            return [phase, { p50: values[Math.floor(values.length / 2)],
                p95: values[Math.ceil(values.length * .95) - 1] }];
        })) }));
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
