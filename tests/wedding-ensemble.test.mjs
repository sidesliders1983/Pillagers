import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from './load-source.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const { MeshyHumanFactory } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');
const { defaultCharacterPresentation } = load('../src/characters/CharacterPresentation.ts');
const { WeddingEnsemble } = load('../src/fjord-play/WeddingEnsemble.ts');
const buffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const read = async path => buffer(await readFile('public' + path.split('?')[0]));
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 512, height: 512, close() {} });

test('a real native resident holds a delivered instrument with bounded hand targets and restores the original rig on release', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await read(path), ''), read);
    const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    const human = await factory.create({ ...defaultDNA(), age: 35 }, 2, undefined, bare);
    const ensemble = new WeddingEnsemble(read);
    try {
        const original = human.fit.nativeSkeleton.bones.map(bone => bone.quaternion.clone());
        await ensemble.prepare();
        ensemble.update([{ id: 'player', role: 'musician', instrument: 'wedding-lyre' }],
            [{ id: 'player', human }], 2);
        const status = ensemble.inspect();
        assert.equal(status.instruments, 1);
        assert.equal(status.actors, 1);
        assert.ok(status.maximumGripError < .12, 'Actual native hands should reach their authored support/pluck targets');
        assert.equal(human.root.getObjectByName('wedding-lyre')?.visible, true);
        ensemble.stop();
        assert.equal(ensemble.inspect().actors, 0);
        assert.equal(human.root.getObjectByName('wedding-lyre'), undefined);
        const restored = human.fit.nativeSkeleton.bones.map(bone => bone.quaternion);
        for (const [index, rotation] of original.entries())
            assert.ok(1 - Math.abs(rotation.dot(restored[index])) < 1e-5, 'Ceremony must not retain a hand pose');
    } finally { ensemble.dispose(); human.dispose(); }
});

test('all three real instrument exports bind to the same native rig without extra character or skeleton creation', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await read(path), ''), read);
    const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    const human = await factory.create({ ...defaultDNA(), age: 65 }, 2, undefined, bare);
    const skeleton = human.fit.nativeSkeleton;
    const ensemble = new WeddingEnsemble(read);
    try {
        await ensemble.prepare();
        for (const instrument of ['wedding-lyre', 'wedding-flute', 'wedding-frame-drum']) {
            human.update(.1);
            ensemble.update([{ id: 'guest', role: 'musician', instrument }], [{ id: 'guest', human }], 3);
            assert.equal(ensemble.inspect().instruments, 1);
            assert.ok(ensemble.inspect().maximumGripError < .12, instrument + ' hand placement');
            assert.equal(human.fit.nativeSkeleton, skeleton);
            ensemble.stop();
        }
    } finally { ensemble.dispose(); human.dispose(); }
});

test('missing or late real instrument downloads cannot retain templates after the owning scene is disposed', async () => {
    const pending = [];
    const ensemble = new WeddingEnsemble(path => new Promise(resolve => pending.push({ path, resolve })));
    const preparation = ensemble.prepare();
    assert.equal(pending.length, 3);
    ensemble.dispose();
    for (const item of pending) item.resolve(await read(item.path));
    await preparation;
    assert.equal(ensemble.inspect().templates, 0);
    assert.equal(ensemble.inspect().actors, 0);
    const missing = new WeddingEnsemble(async () => { throw new Error('Missing asset'); });
    await missing.prepare();
    assert.equal(missing.inspect().unavailable.length, 3);
    assert.equal(missing.inspect().templates, 0);
    missing.dispose();
});

test('the actual review residents keep their instrument grips across native DNA proportions and the final music phrase', async () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { weddingCandidates } = load('../src/simulation/SimulationCore.ts');
    const { weddingCast } = load('../src/fjord-play/WeddingCast.ts');
    const text = await readFile(new URL('../docs/qa/cultural-occasions-277/review-fixture-v2/review-wedding-campaign.json', import.meta.url), 'utf8');
    const shared = SharedSettlement.restore(text, 'fjord');
    const choice = weddingCandidates(shared.session.snapshot()).find(item => item.allowed);
    const offer = shared.session.gatheringOffer('wedding', choice.sourceEventId);
    shared.session.command({ type: 'SponsorGathering', occasion: 'wedding', sourceEventId: choice.sourceEventId,
        expectedSequence: offer.expectedSequence, quotedFood: offer.foodCost, quotedMaterials: offer.materialsCost,
        expectedParticipantIds: offer.participantIds });
    const state = shared.session.snapshot();
    const cast = weddingCast(state, state.events.find(event => event.id === state.culture.lastGatheringEventId));
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await read(path), ''), read);
    const ensemble = new WeddingEnsemble(read);
    const residents = [];
    try {
        await ensemble.prepare();
        for (const role of cast) {
            const entity = shared.fjord.readProjection().entities.find(entity => entity.kind === 'persona' && entity.id === role.id);
            const human = await factory.create(entity.dna, 2, entity.visualProfile,
                { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' });
            residents.push({ id: role.id, human });
            human.update(.1);
            ensemble.update([role], [{ id: role.id, human }], 26.91);
            assert.ok(ensemble.inspect().maximumGripError < .12, role.id + ' / ' + role.role + ' grip');
            ensemble.stop();
        }
    } finally { ensemble.dispose(); for (const person of residents) person.human.dispose(); }
});
