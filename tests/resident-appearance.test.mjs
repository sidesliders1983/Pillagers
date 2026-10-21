import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('world and portrait appearance share recorded ancestry, current age and archived identity without changing the campaign', () => {
    const { createSettlement, serializeState } = load('../src/simulation/SimulationCore.ts');
    const { projectResidentAppearance } = load('../src/characters/ResidentAppearance.ts');
    const { projectFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    const state = createSettlement(1983);
    const before = serializeState(state);
    const child = projectResidentAppearance(state, 'astrid');
    assert.deepEqual(child.face, projectFacialIdentity(state, 'astrid'));
    assert.equal(child.face.derivation, 'two-parents');
    assert.equal(child.dna.age, 0);
    child.dna.traits.intelligence = 0;
    assert.equal(serializeState(state), before);
    state.personaArchive = { astrid: { ...state.personas.astrid, deathWinter: 800, deathTick: 0 } };
    delete state.personas.astrid;
    const archived = projectResidentAppearance(state, 'astrid');
    assert.deepEqual(archived.face, child.face);
    assert.equal(projectResidentAppearance(state, 'missing'), undefined);
});
