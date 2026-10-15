import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const implementationCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const old = loadTypeScript(new URL('../../artifacts/persona-birthdays/base/src/simulation/SimulationCore.ts', import.meta.url));
const current = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { initializeBirthdayCalendar } = loadTypeScript(new URL('../../src/simulation/BirthdayCalendar.ts', import.meta.url));
const output = process.env.QA_OUTPUT || 'artifacts/persona-birthdays/core';
await mkdir(output, { recursive: true });
const summary = values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: values.length, totalMs: values.reduce((a, b) => a + b, 0),
        medianMs: sorted[Math.floor(sorted.length * .5)], p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))],
        maxMs: sorted.at(-1) };
};
function fixture(population, individual) {
    const state = old.createCampaign(32, { initialFood: 100000 }, { fertilityChanceBps: 0, partnershipChanceBps: 0,
        mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false }, {}, {}, {}, 'summer-800-v1');
    for (const clan of [state, ...Object.values(state.world.targetClans)]) {
        const original = Object.values(clan.personas);
        for (let index = 10; index < population; index++) {
            const id = (clan.entityPrefix ?? '') + 'bench-' + index;
            clan.personas[id] = { ...structuredClone(original[index % 10]), id, parentIds: [], partnerId: null };
            clan.mechanics.people[id] = structuredClone(clan.mechanics.people[original[index % 10].id]);
            clan.households[id] = { id, memberIds: [id], residenceId: 'tent-' + id };
            clan.residences['tent-' + id] = { id: 'tent-' + id, kind: 'tent', buildingId: null };
        }
        if (individual)
            initializeBirthdayCalendar(clan, 'individual-v1');
    }
    return state;
}
const rows = [];
for (const population of JSON.parse(process.env.QA_POPULATIONS || '[10,25,50,100]'))
    for (const batch of JSON.parse(process.env.QA_BATCHES || '[10,1000]'))
        for (let repeat = 0; repeat < 3; repeat++) {
            for (const variant of repeat % 2 ? ['individual', 'legacy-current', 'baseline'] : ['baseline', 'legacy-current', 'individual']) {
                const core = variant === 'baseline' ? old : current;
                const initial = fixture(population, variant === 'individual');
                // Warm the same code paths without advancing the measured initial fixture.
                core.applyCommand(initial, { type: 'AdvanceTicks', ticks: 10 });
                let state = initial;
                const samples = [];
                const started = performance.now();
                for (let tick = 0; tick < 1000; tick += batch) {
                    const start = performance.now();
                    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: batch });
                    samples.push(performance.now() - start);
                }
                const elapsedMs = performance.now() - started;
                assert.deepEqual(state, current.applyCommand(initial, { type: 'AdvanceTicks', ticks: 1000 }));
                rows.push({ populationPerClan: population, clans: 1 + Object.keys(state.world.targetClans).length, batch, repeat, variant,
                    elapsedMs, commands: summary(samples), snapshotBytes: Buffer.byteLength(core.serializeState(state)) });
                console.log(JSON.stringify(rows.at(-1)));
            }
        }
await writeFile(output + '/summary.json', JSON.stringify({ baseline: 'a20bac1', implementationCommit, ticksPerRun: 1000,
    repeats: 3, note: 'Synthetic adult population fixtures; timing variants alternate order. Baseline and legacy-current use identical saved states. Individual mode preserves initial DNA/age with independent birthdays; its later economy may differ by design. No browser or wardrobe CPU is included.', rows }, null, 2));
