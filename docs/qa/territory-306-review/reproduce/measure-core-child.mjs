import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { loadSource, digest } from './fixture-tools.mjs';

const [sourceRoot, fixtureFile, outputFile, requestedTicks = '250', requestedWarmup = '20', commonContextFile] = process.argv.slice(2);
assert.ok(sourceRoot && fixtureFile && outputFile);
assert.equal(typeof global.gc, 'function', 'Use a fresh node --expose-gc child process');
const api = await loadSource(sourceRoot);
assert.equal(api.pin.dirtyTracked, null, 'Measure a pinned clean source snapshot');
let shared = api.SharedSettlement.restore(await readFile(fixtureFile, 'utf8'), 'fjord');
const context = api.context(shared);
if (commonContextFile) {
    const common = JSON.parse(await readFile(commonContextFile, 'utf8'));
    assert.equal(common.worldId, context.worldId);
    context.exclusions = common.exclusions;
    shared.session.bindPhysicalWorld(api.world, common.worldId, () => common.exclusions);
}
let state = shared.session.snapshot();
shared = null;
const ticks = Number(requestedTicks), warmup = Number(requestedWarmup);
assert.ok(Number.isSafeInteger(ticks) && ticks > 0 && ticks <= 500);
assert.ok(Number.isSafeInteger(warmup) && warmup >= 0 && warmup <= 100);
assert.ok(state.time.tick + ticks + warmup < state.ticksPerWinter, 'Ordinary window excludes Winter boundary');
const command = { type: 'AdvanceTicks', ticks: 1 };
for (let index = 0; index < warmup; index++) state = api.core.applyCommand(state, command, context);
const startTime = { ...state.time };
const startPopulation = api.population(state);
const startPresence = api.presenceSummary(state);
let startSerialized = api.core.serializeState(state);
const startBytes = Buffer.byteLength(startSerialized);
const startStateFile = outputFile.replace(/\.json$/, '-start.core.json');
await writeFile(startStateFile, startSerialized);
startSerialized = null;
const missionFacts = value => Object.values(value.world.spatial.missions).map(mission => ({
    id: mission.id, target: mission.target, memberRoutes: mission.memberRoutes, status: mission.status, travelled: mission.travelled,
}));
const startMissions = missionFacts(state);
const startEventCount = state.events.length;
for (let index = 0; index < 3; index++) global.gc();
const memoryBefore = process.memoryUsage();
const durations = [], phaseTicks = {}, dutyTicks = {};
const seenTransitions = [];
for (let index = 0; index < ticks; index++) {
    const started = performance.now();
    state = api.core.applyCommand(state, command, context);
    durations.push(performance.now() - started);
    // Read observations outside the measured command window.
    const phases = state.world.territory ? api.core.inspectTerritory(state).incidents.map(incident => incident.phase) : [];
    const key = phases.sort().join('+') || 'no-incident';
    phaseTicks[key] = (phaseTicks[key] || 0) + 1;
    if (seenTransitions.at(-1)?.phases !== key) seenTransitions.push({ time: { ...state.time }, phases: key });
    const clans = [state, ...Object.values(state.world.targetClans)];
    const responders = clans.reduce((total, clan) => total + api.core.inspectTerritory(state, clan.clan.id)
        .incidents.reduce((sum, incident) => sum + (incident.responderCount || 0), 0), 0);
    dutyTicks[responders] = (dutyTicks[responders] || 0) + 1;
}
for (let index = 0; index < 3; index++) global.gc();
const memoryAfter = process.memoryUsage();
const endSerialized = api.core.serializeState(state);
assert.ok(api.core.serializeState(api.core.reconstructState(endSerialized)) === endSerialized,
    'Real Core save/load parity after measured commands');
assert.equal(state.time.winter, startTime.winter);
const endStateFile = outputFile.replace(/\.json$/, '-end.core.json');
await writeFile(endStateFile, endSerialized);
const sorted = durations.slice().sort((a, b) => a - b);
const quantile = fraction => sorted[Math.ceil(sorted.length * fraction) - 1];
const report = { source: api.pin, node: process.version, platform: process.platform, architecture: process.arch,
    fixtureFile, commonContextFile: commonContextFile || null, startStateFile, endStateFile, presenceMetadataVersion: 2, fixtureSha256: digest(await readFile(fixtureFile)), territoryEnabled: !!state.world.territory,
    measurement: 'Wall milliseconds for public applyCommand(state, AdvanceTicks1, physicalContext); includes cloning, validation and one Core tick. Startup, warmup, inspections, serialization and GC are outside timed windows.',
    limits: 'Node Core profile only; no rendering, browser FPS, thermals or physical device claim. Post-GC heap/RSS are fresh-process observations, not allocation counts. Peak RSS includes bootstrap/transpilation.',
    warmup, ticks, startTime, endTime: state.time, startPopulation, endPopulation: api.population(state), startPresence, endPresence: api.presenceSummary(state),
    contextSha256: digest(JSON.stringify(context.exclusions.slice().sort((a, b) =>
        a.minX - b.minX || a.minZ - b.minZ || a.maxX - b.maxX || a.maxZ - b.maxZ))), startRNGState: JSON.parse(await readFile(fixtureFile, 'utf8')).fjord.campaign.rngState,
    activeGroups: Object.values(state.world.spatial.missions).filter(mission => mission.status !== 'Returned').length,
    startMissions, endMissions: missionFacts(state), phaseTicks, dutyTicks, dutyTicksDefinition: 'Sum of public per-defending-clan responderCount; does not count other withdrawing residents.', transitions: seenTransitions,
    milliseconds: { p50: quantile(.5), p95: quantile(.95), max: sorted.at(-1),
        mean: durations.reduce((sum, value) => sum + value, 0) / durations.length, total: durations.reduce((sum, value) => sum + value, 0) },
    memoryBefore, memoryAfter, peakRSSKiB: process.resourceUsage().maxRSS,
    serialized: { startBytes, endBytes: Buffer.byteLength(endSerialized), deltaBytes: Buffer.byteLength(endSerialized) - startBytes },
    eventsAdded: state.events.length - startEventCount, durations };
await writeFile(outputFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputFile, enabled: report.territoryEnabled, p50: report.milliseconds.p50,
    p95: report.milliseconds.p95, phases: phaseTicks, duties: dutyTicks, memoryAfter, serialized: report.serialized }));
