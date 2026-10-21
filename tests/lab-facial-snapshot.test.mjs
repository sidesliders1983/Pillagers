import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('a native Lab snapshot preserves inherited face data and rejects unsupported shapes without modifying DNA', () => {
    const { parseLabSnapshot, snapshotModules, labSnapshotVersion } = load('../src/character-lab/LabSnapshot.ts');
    const { labBodyAsset } = load('../src/characters/LabBodySources.ts');
    const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
    const { defaultCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');
    const { founderFacialIdentity } = load('../src/characters/FacialIdentity.ts');
    const dna = defaultDNA();
    const body = { version: 1, preset: 'auto', source: 'meshy' };
    const presentation = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    const face = { ...founderFacialIdentity(dna.seed), derivation: 'two-parents', parentIds: ['a', 'b'] };
    const snapshot = { version: labSnapshotVersion, styleVersion: labBodyAsset('meshy', 0).styleVersion,
        contractVersion: 1, fitVersion: 'pillagers-fit/0.2', lighting: 'lab-neutral/1',
        dna, body, face, presentation, lod: 0, pose: { animation: 'Idle', time: .4, paused: true },
        camera: { type: 'perspective', scale: null, fov: 38, position: [0, 1, 4], target: [0, 1, 0] },
        modules: snapshotModules(dna, presentation, 0, body) };
    const restored = parseLabSnapshot(JSON.parse(JSON.stringify(snapshot)));
    assert.deepEqual(restored.face, face);
    restored.face.axes.faceWidth = .99;
    assert.notEqual(face.axes.faceWidth, .99);
    assert.deepEqual(restored.dna, dna);
    assert.throws(() => parseLabSnapshot({ ...snapshot, face: { ...face, version: 'future' } }));
});
