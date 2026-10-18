import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
// Extract the unchanged parent revision with git archive before running this comparison.
const before = loadTypeScript(new URL('../../artifacts/island-missions/legacy-baseline/src/simulation/SimulationCore.ts', import.meta.url));
const after = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const results = [];
for (const seed of [17, 42, 91]) {
    const create = core => core.createCampaign(seed, { initialFood: 400 }, {}, { enabled: false }, {
        successBps: { Recon: 10000, Surveillance: 10000, Pillage: 10000 },
        casualtyBps: { Recon: 0, Surveillance: 0, Pillage: 0 },
    });
    let oldState = create(before), newState = create(after);
    const regionId = Object.values(oldState.world.regions).find(region => region.targetClanId && !region.requiresShip).id;
    const commands = [
        { type: 'CreateExpeditionGroup', name: 'Old crew', memberIds: ['founder-1', 'founder-2'] },
        { type: 'DispatchExpedition', groupId: 'group-1', regionId, mission: 'Recon' },
        { type: 'AdvanceTicks', ticks: 113 },
        { type: 'AdvanceTicks', ticks: 137 },
        { type: 'DispatchExpedition', groupId: 'group-1', regionId, mission: 'Surveillance' },
        { type: 'AdvanceTicks', ticks: 400 },
        { type: 'DispatchExpedition', groupId: 'group-1', regionId, mission: 'Pillage', priorities: ['People', 'Food'] },
        { type: 'AdvanceTicks', ticks: 500 },
        { type: 'AdvanceTicks', ticks: 2000 },
    ];
    for (const command of commands) {
        oldState = before.applyCommand(before.reconstructState(before.serializeState(oldState)), command);
        newState = after.applyCommand(after.reconstructState(after.serializeState(newState)), command);
        assert.deepEqual(newState, oldState, 'Parent revision equivalence: ' + seed + ' / ' + command.type);
    }
    results.push({ seed, commands: commands.length, exactCanonicalEquality: true });
}
await writeFile('artifacts/island-missions/legacy-replay.json', JSON.stringify({ parent: '255ef2d', results }, null, 2));
console.log('Exact parent-revision replay passed: 3 seeds, 27 commands, real person transfer and later Winters.');
