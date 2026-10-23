import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const input = process.argv[2];
if (!input) throw new Error('Pass an existing exported campaign. Originals are never modified.');
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const source = readFileSync(input);
const village = SharedSettlement.restore(source.toString(), 'fjord');
const before = village.session.readSnapshot();
const farmer = Object.values(before.personas).find(p => p.deathWinter === null && p.occupation === 'farmer');
const worker = Object.values(before.personas).find(p => p.deathWinter === null && p.occupation === 'woodworker');
assert.ok(farmer && worker, 'Use an existing campaign with a real farmer and woodworker');
const commands = [{ type: 'SetCampfire', lit: true }];
for (const person of [farmer, worker]) {
    const home = Object.values(before.households).find(h => h.memberIds.includes(person.id));
    commands.push({ type: 'BuildHouse', householdId: home.id });
}
for (const command of commands) village.command(command);
const built = village.session.readSnapshot();
const farmerHome = Object.values(built.households).find(h => h.memberIds.includes(farmer.id));
const residence = built.residences[farmerHome.residenceId];
const farmyardId = residence.buildingId;
assert.ok(farmyardId, 'Paid farmer residence must resolve to a real building');
for (const animal of Object.values(built.landing.cattle).filter(a => a.deathWinter === null)) {
    const command = { type: 'AssignCattle', cattleId: animal.id, farmyardId };
    village.command(command);
    commands.push(command);
}
const output = village.fjord.exportJSON();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
mkdirSync('scratch/audio-230', { recursive: true });
writeFileSync('scratch/audio-230/village.json', output);
const receipt = { scope: 'Expanded QA fixture derived from the existing owner campaign, using real paid commands only.',
    inputSHA256: hash(source), outputSHA256: hash(output), commands,
    before: { stocks: before.stocks, time: before.time },
    after: { stocks: village.session.readSnapshot().stocks, time: village.session.readSnapshot().time },
    farmer: farmer.id, woodworker: worker.id, farmyardId };
writeFileSync('scratch/audio-230/village-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
