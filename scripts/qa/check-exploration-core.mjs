import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
import { baselineSeeds, heldOutSeeds, createExplorationCampaign, runExplorationScenario,
    digest, coreDigest, assertClanIdentity } from './exploration-integration.mjs';

const output = process.env.QA_OUTPUT || 'artifacts/exploration-151';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const git = process.env.GIT_BINARY || 'git';
const revision = execFileSync(git, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const stats = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
    return { count: values.length, totalMs: values.reduce((sum, value) => sum + value, 0),
        p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maximumMs: sorted.at(-1) ?? null };
};
await mkdir(output, { recursive: true });
const report = { version: 1, status: 'RUNNING', revision, node: process.version,
    baselineSeeds, heldOutSeeds, cases: [], errors: [],
    note: 'Normal gameplay rules. Command/LOS timings include QA instrumentation; they are not uninstrumented device frame benchmarks.' };
const raw = [];
try {
    for (const seed of [...baselineSeeds, ...heldOutSeeds]) {
        console.log('OPEN Core integration seed ' + seed);
        const result = runExplorationScenario(seed, { encounter: seed === 17 || seed === 73 });
        const tracePath = output + '/trace-' + seed + '.json';
        const worldPath = output + '/world-' + result.world.config.seed + '.json';
        await writeFile(tracePath, JSON.stringify(result.trace));
        await writeFile(worldPath, JSON.stringify(result.world));
        const replay = JSON.parse(execFileSync(process.execPath,
            ['scripts/qa/replay-exploration-without-renderer.mjs', tracePath, worldPath],
            { encoding: 'utf8', maxBuffer: 1024 * 1024 }));
        assert.equal(replay.coreSha256, result.summary.coreSha256);
        assert.equal(replay.threeImports, 0);
        const queries = result.profiling.sightlines.length;
        const samples = result.trace.commands.filter(row => !row.rejected);
        const commandTypes = [...new Set(samples.map(row => row.command.type))];
        const timings = Object.fromEntries(commandTypes.map(type => [type,
            stats(samples.filter(row => row.command.type === type).map(row => row.milliseconds))]));
        const discovery = result.shared.session.readSnapshot().discovery;
        report.cases.push({ ...result.summary, cohort: heldOutSeeds.includes(seed) ? 'held-out' : 'baseline',
            replay, traceBytes: Buffer.byteLength(JSON.stringify(result.trace)),
            discoverySavedBytes: Buffer.byteLength(JSON.stringify(discovery)),
            rawMaskBytesPerClan: discovery.grid.columns * discovery.grid.rows / 8 * 2,
            grid: { cellSize: discovery.policy.cellSize, columns: discovery.grid.columns,
                rows: discovery.grid.rows }, timings,
            observation: stats(result.profiling.observation), sightlines: stats(result.profiling.sightlines),
            sightlineQueryCount: queries, cpuTick: stats(result.profiling.cpuTicks) });
        raw.push({ seed, ...result.profiling,
            commands: result.trace.commands.map(row => ({ type: row.command.type,
                rejected: !!row.rejected, milliseconds: row.milliseconds })) });
        if (seed === 17) {
            const fresh = createExplorationCampaign(seed);
            await writeFile(output + '/fresh.json', fresh.persist());
            assert.ok(result.observedSave);
            await writeFile(output + '/observed.json', result.observedSave);
            await writeFile(output + '/returned.json', result.shared.persist());
        }
        console.log('PASS seed ' + seed + ': ' + result.summary.encounter + ', ' + queries + ' LOS queries');
    }

    const fresh = createExplorationCampaign(32);
    const initial = fresh.session.snapshot();
    const independentStarted = performance.now();
    const expected = core.applyCommand(initial.world.targetClans['island-rival'],
        { type: 'AdvanceTicks', ticks: 100000 });
    const independentMs = performance.now() - independentStarted;
    let coupled = initial;
    const years = [];
    for (let year = 1; year <= 100; year++) {
        const began = performance.now();
        coupled = core.applyCommand(coupled, { type: 'AdvanceWinter' });
        const milliseconds = performance.now() - began;
        if (year === 50) {
            const saved = core.serializeState(coupled);
            coupled = core.reconstructState(saved);
            assert.equal(core.serializeState(coupled), saved);
        }
        const rival = coupled.world.targetClans['island-rival'];
        assertClanIdentity(coupled);
        years.push({ year, milliseconds,
            living: Object.values(rival.personas).filter(person => person.deathWinter === null).length,
            households: Object.keys(rival.households).length, buildings: Object.keys(rival.buildings).length,
            cattle: Object.values(rival.landing.cattle).filter(animal => animal.deathWinter === null).length,
            cpuEvents: rival.events.length, coreSaveBytes: Buffer.byteLength(core.serializeState(coupled)) });
    }
    assert.deepEqual(coupled.world.targetClans['island-rival'], expected);
    assert.deepEqual(coupled.discovery, initial.discovery, 'No exploration means no fresh knowledge.');
    const eventsByType = {};
    for (const event of expected.events) eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    report.longRun = { seed: 32, winters: 100, ticks: 100000, saveAtYear: 50,
        independentMs, exactCpuReplay: true, identityCheckedEachWinter: true,
        cpuSha256: coreDigest(expected), eventsByType, years };
    report.curatedGeometries = [...new Set(report.cases.map(item => item.islandSeed))];
    report.sourceHashes = {};
    for (const path of ['src/simulation/SimulationCore.ts', 'src/simulation/ClanDiscovery.ts',
        'src/simulation/SpatialExpeditions.ts', 'src/simulation/WorldExpeditions.ts',
        'src/simulation/Mechanics.ts', 'src/fjord-play/FjordCampaign.ts',
        'src/fjord-play/RivalSettlement.ts', 'src/fjord-play/CampaignIsland.ts']) {
        report.sourceHashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
    }
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.errors.push(String(error));
    throw error;
} finally {
    await writeFile(output + '/core-results.json', JSON.stringify(report, null, 2) + '\n');
    await writeFile(output + '/raw-core-timings.json', JSON.stringify(raw) + '\n');
}
console.log('PASS fourteen seeded integration traces and 100-Winter independent CPU replay.');
