import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const { SharedSettlement, inspectSettlementSave } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { expeditionEligible } = loadTypeScript(new URL('../../src/simulation/WorldExpeditions.ts', import.meta.url));
const owner = new SharedSettlement(32, undefined, true, 'island-pool-v1', 'summer-800-v1');
owner.fjord.enableDiscovery();
const commands = [{ type: 'CreateExplorationGroup' }];
owner.command(commands[0]);
const groupId = Object.keys(owner.session.readSnapshot().world.groups)[0];
const members = Object.values(owner.session.readSnapshot().personas)
    .filter(person => expeditionEligible(owner.session.readSnapshot(), person.id, groupId)).slice(0, 2);
if (members.length !== 2) throw new Error('The QA scenario requires two eligible founders.');
for (const person of members) {
    const command = { type: 'SetExplorationMember', groupId, personaId: person.id, included: true };
    owner.command(command);
    commands.push(command);
}
const data = JSON.parse(owner.persist());
data.target = 'fjord';
data.pace.running = false;
const bytes = JSON.stringify(data) + '\n';
inspectSettlementSave(bytes);
const output = 'docs/qa/integrated-playtest-180';
await mkdir(output, { recursive: true });
await writeFile(output + '/exploration-800.json', bytes);
await writeFile(output + '/exploration-scenario.json', JSON.stringify({
    version: 'exploration-playtest-180-v1', seed: 32, foundingPhase: 'summer-800-v1',
    preparation: 'Fresh SharedSettlement with island-pool-v1; FjordCampaign.enableDiscovery; canonical group commands.',
    commands, members: members.map(person => person.id), worldVersion: data.fjord.campaign.world.version,
    sha256: createHash('sha256').update(bytes).digest('hex'),
}, null, 2) + '\n');
console.log('Prepared a paused exploration campaign with one hidden rival and two eligible group members.');
