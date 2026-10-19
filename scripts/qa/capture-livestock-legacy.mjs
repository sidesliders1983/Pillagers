import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTypeScript } from '../load-typescript.mjs';

const source = process.env.QA_SOURCE_ROOT;
assert.ok(source, 'Capture from a clean pre-expansion checkout, never the changed Core');
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(commit, '034e91fa9475d5fc8b94edefd5b79041838f4f52');
assert.equal(execFileSync('git', ['-C', source, 'diff', 'HEAD', '--', 'src/simulation'],
    { encoding: 'utf8' }), '');
const core = loadTypeScript(pathToFileURL(resolve(source, 'src/simulation/SimulationCore.ts')));
const { SharedSettlement } = loadTypeScript(pathToFileURL(resolve(source, 'src/play/SharedSettlement.ts')));
const hash = value => createHash('sha256').update(value).digest('hex');
const cases = [];

function downgrade(state) {
    if (state.landing) {
        state.landing.version = 2;
        for (const key of Object.keys(state.landing.config))
            if (key.startsWith('cattle') && key !== 'cattleAdultAge') delete state.landing.config[key];
        for (const animal of Object.values(state.landing.cattle)) delete animal.lastCalvingWinter;
    }
    // Landing v2 predates independently simulated target clans.
    delete state.world;
    return state;
}

for (const [name, seed] of [['outside-17', 17], ['managed-32', 32], ['version-two-91', 91]]) {
    let input = core.createCampaign(seed);
    if (name.startsWith('version-two')) input = downgrade(input);
    const commands = [];
    if (name.startsWith('managed')) {
        const home = Object.values(input.households).find(home => home.memberIds.includes('founder-1'));
        commands.push({ type: 'SalvageLongship', longshipId: 'founding-longship' },
            { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' },
            { type: 'HouseHousehold', householdId: home.id });
        for (const cattleId of Object.keys(input.landing.cattle))
            commands.push({ type: 'AssignCattle', cattleId, farmyardId: 'house-1' });
    }
    commands.push({ type: 'AdvanceTicks', ticks: 137 }, { type: 'AdvanceTicks', ticks: 863 },
        { type: 'AdvanceWinter' }, { type: 'AdvanceTicks', ticks: 777 },
        { type: 'AdvanceTicks', ticks: 223 });
    cases.push({ name, input, commands });
}
const visited = JSON.parse(await readFile('docs/qa/rival-visibility/visited-review.json', 'utf8'));
cases.push({ name: 'physical-observed-rival', mode: 'shared', input: visited,
    commands: [{ type: 'AdvanceTicks', ticks: 137 }, { type: 'AdvanceTicks', ticks: 863 },
        { type: 'AdvanceTicks', ticks: 1000 }] });
for (const entry of cases) {
    if (entry.mode === 'shared') {
        const shared = SharedSettlement.restore(JSON.stringify(entry.input), 'fjord');
        entry.checkpoints = [hash(shared.session.saveJSON())];
        for (const command of entry.commands) {
            shared.command(command);
            entry.checkpoints.push(hash(shared.session.saveJSON()));
        }
        continue;
    }
    let state = core.reconstructState(JSON.stringify(entry.input));
    entry.checkpoints = [hash(core.serializeState(state))];
    for (const command of entry.commands) {
        state = core.applyCommand(state, command);
        entry.checkpoints.push(hash(core.serializeState(state)));
    }
}
await mkdir('artifacts/livestock-core-218', { recursive: true });
await writeFile('artifacts/livestock-core-218/legacy-reference.json', JSON.stringify({
    sourceCommit: commit,
    sourceNote: 'Simulation sources at this revision are identical to main 82f8797 before #218.',
    cases,
}, null, 2) + '\n');
console.log('Captured four independent pre-expansion Core traces, including legacy migration and CPU clans.');
