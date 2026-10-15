import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { GameplaySession } = loadTypeScript(new URL('../../src/gameplay-lab/GameplaySession.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { createCrowdScenario } = await import('./fjord-stability-scenario.mjs');
const output = process.env.QA_OUTPUT || 'docs/qa/fjord-runtime-performance';
await mkdir(output + '/fixtures', { recursive: true });
export const digest = text => createHash('sha256').update(text).digest('hex');
const fixtures = [];
async function save(name, state) {
    const session = new GameplaySession(state.seed, 166);
    session.loadJSON(core.serializeState(state));
    const shared = new SharedSettlement(session, undefined, true, 'island-pool-v1');
    let json = shared.persist();
    const path = output + '/fixtures/' + name + '.json';
    try {
        const frozen = (await readFile(path, 'utf8')).trim();
        assert.deepEqual(JSON.parse(frozen).fjord.campaign, state, 'Frozen fixture Core changed: ' + name);
        json = frozen;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Preserve the frozen narrative identity/seed as well as Core, geography and layout.
    const fixture = { name, json, sha256: digest(json), time: state.time,
        residents: Object.values(state.personas).filter(p => p.deathWinter === null).length,
        cattle: Object.values(state.landing.cattle).filter(c => c.deathWinter === null).length,
        events: state.events.length };
    fixtures.push(fixture);
    return writeFile(output + '/fixtures/' + name + '.json', json + '\n');
}
for (const seed of [32, 17]) {
    const session = new GameplaySession(seed, 166, true, 'summer-800-v1');
    await save('summer-' + seed, session.snapshot());
}
let developed = core.createCampaign(32, { initialFood: 100000, initialMaterials: 10000,
    foundingCoupleChanceBps: 10000 }, {}, { enabled: true }, {}, { enabled: true }, {}, 'summer-800-v1');
for (const [index, id] of Object.keys(developed.personas).entries()) developed = core.applyCommand(developed,
    { type: 'AssignOccupation', personaId: id, occupation: ['farmer', 'fisher', 'woodworker', 'hunter'][index % 4] });
for (const household of Object.values(developed.households).filter(h => h.memberIds.length))
    developed = core.applyCommand(developed, { type: 'BuildHouse', householdId: household.id });
const farm = Object.values(developed.buildings).find(b => b.specialization === 'farmer')?.id || Object.keys(developed.buildings)[0];
for (const id of Object.keys(developed.landing.cattle)) developed = core.applyCommand(developed,
    { type: 'AssignCattle', cattleId: id, farmyardId: farm });
developed = core.applyCommand(developed, { type: 'AdvanceTicks', ticks: 10000 });
await save('developed-810', developed);
await save('rain-810', core.applyCommand(developed, { type: 'AdvanceTicks', ticks: 250 }));
await save('snow-811', core.applyCommand(developed, { type: 'AdvanceTicks', ticks: 500 }));
let boundary = core.applyCommand(developed, { type: 'AdvanceTicks', ticks: 490 });
await save('boundary-810', boundary);
await save('crowd-25', createCrowdScenario(25));
const summary = values => {
    const sorted = values.toSorted((a, b) => a - b), q = p => sorted[Math.ceil(sorted.length * p) - 1];
    return { n: values.length, mean: values.reduce((a, b) => a + b) / values.length,
        p50: q(.5), p95: q(.95), p99: q(.99), max: sorted.at(-1) };
};
const coreRuns = [];
for (const fixture of fixtures) {
    const state = JSON.parse(fixture.json).fjord.campaign;
    for (const ticks of [0, 1, 2, 3, 8, 10, 500, 1000]) {
        const values = [];
        for (let run = -5; run < 40; run++) {
            const start = performance.now();
            const next = core.applyCommand(state, { type: 'AdvanceTicks', ticks });
            const elapsed = performance.now() - start;
            assert.equal(next.time.winter * 1000 + next.time.tick, state.time.winter * 1000 + state.time.tick + ticks);
            if (run >= 0) values.push(elapsed);
        }
        coreRuns.push({ fixture: fixture.name, ticks, milliseconds: summary(values) });
    }
}
await writeFile(output + '/core.json', JSON.stringify({ fixtures: fixtures.map(({json, ...f}) => f), coreRuns }, null, 2) + '\n');
console.log(JSON.stringify(fixtures.map(({json, ...f}) => f)));
