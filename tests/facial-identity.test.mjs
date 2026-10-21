import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { createSettlement, serializeState, reconstructState } = load('../src/simulation/SimulationCore.ts');

test('a standalone Lab face uses the same founder profile as its canonical DNA seed', () => {
    const { founderFacialIdentity, projectFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    const family = createSettlement(1983);
    assert.deepEqual(founderFacialIdentity(family.personas.einar.dna.seed),
        projectFacialIdentity(family, 'einar'));
});

test('a face follows recorded parents, stays individually distinct and never changes canonical DNA or RNG', () => {
    const { projectFacialIdentity, facialAxes } = load('../src/characters/FacialIdentity.ts');
    const state = createSettlement(1983), before = serializeState(state);
    const father = projectFacialIdentity(state, 'einar');
    const mother = projectFacialIdentity(state, 'liv');
    const child = projectFacialIdentity(state, 'astrid');
    assert.equal(child.version, 'facial-identity-v1');
    assert.equal(child.derivation, 'two-parents');
    assert.deepEqual(child.parentIds, ['einar', 'liv']);
    for (const axis of facialAxes) {
        assert.ok(child.axes[axis] >= Math.min(father.axes[axis], mother.axes[axis]) - .08);
        assert.ok(child.axes[axis] <= Math.max(father.axes[axis], mother.axes[axis]) + .08);
    }
    assert.notDeepEqual(child.axes, father.axes);
    assert.notDeepEqual(child.axes, mother.axes);
    assert.equal(serializeState(state), before);
    assert.deepEqual(projectFacialIdentity(reconstructState(before), 'astrid'), child);
    const unrelated = structuredClone(state);
    unrelated.personas.astrid.parentIds = [];
    assert.notDeepEqual(projectFacialIdentity(unrelated, 'astrid').axes, child.axes,
        'The same child seed without its actual parent links cannot masquerade as inherited identity');
});

test('historical parents, unknown ancestry and aging have explicit stable projection semantics', () => {
    const { projectFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    const state = createSettlement(1983);
    const original = projectFacialIdentity(state, 'astrid');
    state.personaArchive = { einar: state.personas.einar };
    delete state.personas.einar;
    state.personas.astrid.parentIds.reverse();
    state.personas.astrid.dna.age = 80;
    state.personas.astrid.dna.traits.intelligence = 0;
    state.personas.astrid.dna.traits.cunning = 1;
    state.personas.astrid.dna.traits.temperament = 1;
    assert.deepEqual(projectFacialIdentity(state, 'astrid'), original);
    delete state.personaArchive.einar;
    const partial = projectFacialIdentity(state, 'astrid');
    assert.equal(partial.derivation, 'one-parent');
    assert.deepEqual(partial.parentIds, ['liv'], 'No unknown parent identity is invented');
    state.personas.astrid.parentIds = ['unknown'];
    assert.equal(projectFacialIdentity(state, 'astrid').derivation, 'founder');
    assert.throws(() => projectFacialIdentity(state, 'unknown'), /recorded person/);
    state.personas.liv.parentIds = ['astrid'];
    state.personas.astrid.parentIds = ['liv'];
    assert.throws(() => projectFacialIdentity(state, 'astrid'), /cyclic ancestry/);
});
