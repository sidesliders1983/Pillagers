import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';
import { createExplorationCampaign, digest } from './exploration-integration.mjs';

const output = process.env.QA_OUTPUT || 'artifacts/exploration-151';
const trace = JSON.parse(await readFile(output + '/trace-17.json', 'utf8'));
const load = path => loadTypeScript(new URL('../../src/' + path, import.meta.url));
const core = load('simulation/SimulationCore.ts');
const { commitClanObservation } = load('simulation/ClanDiscovery.ts');
const { spatialMemberPosition } = load('simulation/SpatialExpeditions.ts');
const shared = createExplorationCampaign(17);
const frozenWorld = shared.fjord.blueprint;
assert.equal(digest(frozenWorld), trace.worldSha256);
const mutableControl = structuredClone(frozenWorld);
let state = core.reconstructState(JSON.stringify(trace.initial));
const until = trace.checkpoints.find(item => item.name === 'two-groups-traveling').afterCommand;
for (const row of trace.commands.slice(0, until)) {
    if (row.rejected) continue;
    state = core.applyCommand(state, row.command, { ...row.context, world: frozenWorld });
}
const observations = [{ id: 'founding-settlement', kind: 'settlement', ...frozenWorld.settlement.center }];
if (frozenWorld.settlement.harbor)
    observations.push({ id: 'founding-landing', kind: 'settlement', ...frozenWorld.settlement.harbor });
for (const mission of Object.values(state.world.spatial.missions)) {
    for (const id of mission.memberIds) observations.push({ id: mission.id + ':' + id, kind: 'expedition',
        ...spatialMemberPosition(mission, id) });
}
const at = state.time.winter * state.ticksPerWinter + state.time.tick;
const observe = world => commitClanObservation(state.discovery, world, state.discovery.worldId,
    state.clan.id, observations, at);
const expected = observe(mutableControl);
for (let warm = 0; warm < 5; warm++) { observe(mutableControl); observe(frozenWorld); }
const samples = [];
for (let repeat = 0; repeat < 3; repeat++) {
    for (const treatment of ['control', 'cached', 'cached', 'control']) {
        for (let index = 0; index < 20; index++) {
            const started = performance.now();
            const result = observe(treatment === 'control' ? mutableControl : frozenWorld);
            const milliseconds = performance.now() - started;
            assert.deepEqual(result, expected);
            samples.push({ repeat, treatment, milliseconds });
        }
    }
}
const summarize = treatment => {
    const values = samples.filter(item => item.treatment === treatment).map(item => item.milliseconds)
        .sort((a, b) => a - b);
    return { count: values.length, p50Ms: values[Math.ceil(values.length * .5) - 1],
        p95Ms: values[Math.ceil(values.length * .95) - 1], p99Ms: values[Math.ceil(values.length * .99) - 1] };
};
const result = { status: 'PASS', seed: 17, node: process.version, allMasksExact: true,
    note: 'ABBA over identical actual traveling observers and surface bytes. Mutable control disables only the immutable-surface cache. Both paths keep normal validation. No LOS timing wrappers or browser workload.',
    control: summarize('control'), cached: summarize('cached'), samples,
    maskSha256: digest(expected), maximumCachedViewsPerWorld: 8,
    coarseCellCount: state.discovery.grid.columns * state.discovery.grid.rows };
await writeFile(output + '/los-abba.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, control: result.control, cached: result.cached }));
