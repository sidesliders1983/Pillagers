import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTypeScript } from './load-typescript.mjs';

const core = loadTypeScript(new URL('../src/simulation/SimulationCore.ts', import.meta.url));
const smithery = loadTypeScript(new URL('../src/simulation/Smithery.ts', import.meta.url));
const { resolveExpeditionCrew } = loadTypeScript(new URL('../src/simulation/WorldExpeditions.ts', import.meta.url));
const samples = 10000;
const memberIds = ['founder-1', 'founder-2', 'founder-3', 'founder-4'];
const template = core.createCampaign(32, {}, { mortalityBands: [{ minAge: 0, chanceBps: 0 }] }, { enabled: false });
template.world.targetClans = {};
template.world.missions = { calibration: { id: 'calibration', status: 'Away', memberIds } };
template.events = [];
const scenarios = {
    none: [[], []],
    partial: [[0, 2], ['woodenShield', 'leatherShield', null, 'woodenShield']],
    fullWood: [[0, 1, 2, 3], Array(4).fill('woodenShield')],
    fullLeather: [[0, 1, 2, 3], Array(4).fill('leatherShield')],
};
const results = [];
for (const [name, [spearHolders, shields]] of Object.entries(scenarios)) {
    let successes = 0, casualties = 0, lostItems = 0;
    const deathsByMember = Array(4).fill(0);
    let snapshot;
    for (let seed = 1; seed <= samples; seed++) {
        const state = structuredClone(template);
        state.rngState = seed;
        state.smithery.assignments = Object.fromEntries(memberIds.map((id, index) => [id, {
            weapon: spearHolders.includes(index) ? 'woodenSpear' : null, shield: shields[index] ?? null,
        }]).filter(([, gear]) => gear.weapon || gear.shield));
        snapshot = smithery.pillageEquipment(state, memberIds, 6000, 1000);
        const result = resolveExpeditionCrew(state, { id: 'calibration', memberIds,
            successBps: snapshot.successBps, casualtyBps: 1000, equipment: snapshot });
        successes += Number(result.success);
        for (let index = 0; index < memberIds.length; index++) {
            if (!result.live.includes(memberIds[index])) { casualties++; deathsByMember[index]++; }
        }
        lostItems += result.equipment.lost.reduce((sum, gear) => sum + Number(!!gear.weapon) + Number(!!gear.shield), 0);
    }
    results.push({ name, samples, snapshot, successPercent: 100 * successes / samples,
        casualtiesPerHundredMembers: 100 * casualties / (samples * memberIds.length),
        deathsByMember, lostItems });
}
const report = {
    issue: 221, protocol: 'Matched seeds 1..10000; same four named adults, same current shared resolver; no weather, 60% base success, 10% base individual casualty risk.',
    status: 'Owner-approved balance proposal, 2026-10-23; no merge or deployment implied.',
    rules: smithery.defaultSmitheryConfig,
    production: 'At 100% effective productivity, ordinary 1000-tick Winters and workPerUnit=10000000: 4 spears or wooden shields/Winter; 2 leather shields/Winter. DNA, tent, care, age, career-switch and specialization modifiers still apply.',
    results,
};
if (!process.argv[2]) throw new Error('Pass the output JSON path.');
writeFileSync(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ name, successPercent, casualtiesPerHundredMembers }) =>
    ({ name, successPercent, casualtiesPerHundredMembers })), null, 2));
