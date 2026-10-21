import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const core = load('simulation/SimulationCore');
const { projectFacialIdentity } = load('characters/FacialIdentity');
const output = 'docs/qa/facial-identity';
await mkdir(output, { recursive: true });
let state = core.createCampaign(1983, { initialFood: 100000, initialMaterials: 10000 });
let selected;
for (let year = 0; year < 45; year++) {
    state = core.applyCommand(state, { type: 'AdvanceWinter' });
    const identities = { ...state.personaArchive, ...state.personas };
    for (const child of Object.values(identities)) {
        const parents = child.parentIds.map(id => identities[id]);
        if (parents.length !== 2 || parents.some(person => !person)) continue;
        const parent = parents.find(person => person.parentIds.length === 2);
        if (!parent) continue;
        const siblings = Object.values(identities).filter(person => person.id !== child.id &&
            person.parentIds.length === 2 && person.parentIds.every(id => child.parentIds.includes(id)));
        if (!siblings.length) continue;
        selected = [...new Set([...parent.parentIds, ...child.parentIds, child.id, siblings[0].id])];
        break;
    }
    if (selected) break;
}
assert.ok(selected, 'The bounded real-Core fixture must produce a three-generation family with siblings');
const before = core.serializeState(state), restored = core.reconstructState(before);
const rows = selected.map(id => {
    const person = state.personas[id] ?? state.personaArchive[id];
    const face = projectFacialIdentity(state, id);
    assert.deepEqual(projectFacialIdentity(restored, id), face);
    return { id, name: person.name, age: core.personaAge(state, id),
        archived: !state.personas[id], deceased: person.deathWinter !== null,
        occupation: person.occupation,
        parentIds: person.parentIds,
        parentNames: person.parentIds.map(parentId => (state.personas[parentId] ?? state.personaArchive[parentId]).name),
        dna: { ...person.dna, age: Math.min(100, core.personaAge(state, id)) }, face };
});
assert.equal(core.serializeState(state), before, 'Visual derivation cannot alter simulation data');
const events = state.events.filter(event => ['ChildBorn', 'PartnershipFormed', 'PersonaDied'].includes(event.type) &&
    [event.personaId, ...(event.details?.participants ?? [])].some(id => selected.includes(id)));
const digest = createHash('sha256').update(before).digest('hex');
await mkdir('scratch/facial-identity', { recursive: true });
await writeFile('scratch/facial-identity/family-save.json', before);
await writeFile(output + '/family.json', JSON.stringify({ seed: 1983, winter: state.time.winter,
    fixture: 'Real Core, existing default mechanics, funded 100000 Food / 10000 Materials solely for a bounded visual-family fixture; no forced births, fabricated parent links or shipping rule changes.',
    sourceRevision: 'd36d7ef3cbd27ec45bb5bd6cc2fbcc7e8c761d2b', saveSha256: digest,
    saveRoundTripFaces: true, rows, events }, null, 2));
console.log(JSON.stringify({ winter: state.time.winter, selected: rows.map(({ id, name, age, parentIds }) =>
    ({ id, name, age, parentIds })), events: events.length, saveSha256: digest }, null, 2));
