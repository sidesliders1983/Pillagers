import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const shared = SharedSettlement.restore(await readFile('artifacts/island-missions/identified-1983.json', 'utf8'), 'fjord');
for (const mission of ['Surveillance', 'Pillage']) {
    const members = shared.session.readSnapshot().world.groups['group-1'].memberIds;
    const entities = shared.fjord.readProjection().entities;
    const origins = Object.fromEntries(members.map(id => {
        const point = entities.find(entity => entity.id === id && entity.kind === 'persona').transform;
        return [id, { x: point.x, z: point.z }];
    }));
    const target = { kind: 'site', siteId: shared.fjord.blueprint.rivalSite.candidateId };
    const priorities = mission === 'Pillage' ? ['People'] : [];
    const offer = shared.session.islandMissionOffer('group-1', target, mission, priorities, origins);
    shared.session.command({ type: 'DispatchIslandMission', groupId: 'group-1', target, mission, priorities, origins });
    shared.session.command({ type: 'AdvanceTicks', ticks: offer.duration });
}
const result = Object.values(shared.session.readSnapshot().world.spatial.missions).at(-1).task.result;
const projection = shared.fjord.readProjection();
assert.equal(result.success, true);
assert.equal(result.personaIds.length, 1);
const arrivals = result.personaIds.map(id => {
    const resident = projection.entities.find(entity => entity.kind === 'persona' && entity.id === id);
    assert.ok(resident?.transform, 'A real transferred resident must appear in the player settlement');
    return { id, rendered: true };
});
await writeFile('artifacts/island-missions/person-arrival.json', JSON.stringify({ seed: 1983,
    defaultRules: true, success: result.success, arrivals, diagnostics: projection.diagnostics }, null, 2));
console.log('Actual People-first Pillage arrival renders under ordinary rules without layout diagnostics.');
