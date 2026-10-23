import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
// Positive source-action control based on the existing seed-17 woodworker test.
// Legacy geography is explicit; this is not a new campaign shipping default.
const village = new SharedSettlement(17, undefined, true, 'legacy', 'summer-800-v1');
const before = village.session.readSnapshot();
const commands = [
    { type: 'SalvageLongship', longshipId: 'founding-longship' },
    { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'farmer' },
    { type: 'AssignOccupation', personaId: 'founder-5', occupation: 'woodworker' },
];
for (const command of commands) village.command(command);
const householdId = Object.values(before.households).find(h => h.memberIds.includes('founder-1')).id;
const build = { type: 'BuildHouse', householdId };
village.command(build); commands.push(build);
const current = village.session.readSnapshot();
const household = current.households[householdId];
const farmyardId = current.residences[household.residenceId].buildingId;
for (const animal of Object.values(current.landing.cattle)) {
    const command = { type: 'AssignCattle', cattleId: animal.id, farmyardId };
    village.command(command); commands.push(command);
}
const light = { type: 'SetCampfire', lit: true };
village.command(light); commands.push(light);
const output = village.fjord.exportJSON();
const receipt = { scope: 'Separate legacy seed-17 positive action control; ordinary founding stocks and real paid commands.',
    commands, before: before.stocks, after: village.session.readSnapshot().stocks,
    time: village.session.readSnapshot().time,
    outputSHA256: createHash('sha256').update(output).digest('hex') };
mkdirSync('scratch/audio-230', { recursive: true });
writeFileSync('scratch/audio-230/work-village.json', output);
writeFileSync('scratch/audio-230/work-village-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
