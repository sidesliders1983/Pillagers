import assert from 'node:assert/strict';
import { Session } from 'node:inspector';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadSource } from './fixture-tools.mjs';

const root = process.env.PROFILE_SOURCE_ROOT || process.cwd();
const api = await loadSource(root);
assert.equal(api.pin.head, '0041b92b49dd2f0a1865eb158100a20e20e5df0c');
const fixture = new URL('final-0041b92b-population-50-groups-2-enabled.shared.json', import.meta.url);
let shared = api.SharedSettlement.restore(await readFile(fixture, 'utf8'), 'fjord');
const context = api.context(shared);
let state = shared.session.snapshot();
shared = null;
const command = { type: 'AdvanceTicks', ticks: 1 };
for (let index = 0; index < 20; index++) state = api.core.applyCommand(state, command, context);
if (global.gc) for (let index = 0; index < 3; index++) global.gc();
const session = new Session();
session.connect();
const post = (method, parameters = {}) => new Promise((resolve, reject) => {
    session.post(method, parameters, (error, response) => error ? reject(error) : resolve(response));
});
await post('Profiler.enable');
await post('Profiler.setSamplingInterval', { interval: 1000 });
await post('Profiler.start');
for (let index = 0; index < 250; index++) state = api.core.applyCommand(state, command, context);
const { profile } = await post('Profiler.stop');
session.disconnect();
const file = new URL('0041b92b-adopted-50-groups-2.cpuprofile', import.meta.url);
await writeFile(file, JSON.stringify(profile));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const inclusive = new Map();
function total(id) {
    if (inclusive.has(id)) return inclusive.get(id);
    const node = nodes.get(id);
    const count = (node.hitCount || 0) + (node.children || []).reduce((sum, child) => sum + total(child), 0);
    inclusive.set(id, count);
    return count;
}
for (const node of profile.nodes) total(node.id);
const byFunction = new Map();
for (const node of profile.nodes) {
    const name = node.callFrame.functionName || '(anonymous)';
    const entry = byFunction.get(name) || { functionName: name, selfSamples: 0, inclusiveSamples: 0 };
    entry.selfSamples += node.hitCount || 0;
    entry.inclusiveSamples += inclusive.get(node.id);
    byFunction.set(name, entry);
}
const functions = [...byFunction.values()];
const summary = { status: 'passed', source: api.pin, fixture: fileURLToPath(fixture),
    method: 'Untimed V8 sampling profile of250 public Core AdvanceTicks1 calls after20 warmup calls. No timed benchmark runs were active. Bootstrap, warmup, serialization and metadata inspection are outside the profiling window.',
    profile: fileURLToPath(file), startTick: 520, endTime: state.time,
    sampleIntervalMicroseconds: 1000, sampleCount: profile.samples?.length,
    observedProfileMicroseconds: profile.endTime - profile.startTime,
    limit: 'Sample attribution estimates CPU hot paths. Aggregated inclusive totals can count recursive/nested instances more than once; this is not a replacement for wall-clock tick timings.',
    selected: functions.filter(row => /^(isCaregiver|isProvidingCare|movingPresenceClear|planRoute|validate.*|assert.*)$/.test(row.functionName)),
    topSelf: functions.sort((a, b) => b.selfSamples - a.selfSamples).slice(0, 35),
    topInclusive: functions.slice().sort((a, b) => b.inclusiveSamples - a.inclusiveSamples).slice(0, 35),
    phases: api.core.inspectTerritory(state).incidents.map(incident => incident.phase) };
await writeFile(new URL('0041b92b-cpu-profile-summary.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ status: summary.status, samples: summary.sampleCount,
    topSelf: summary.topSelf.slice(0, 12), selected: summary.selected }));
