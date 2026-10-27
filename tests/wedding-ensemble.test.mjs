import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from './load-source.mjs';
import { Box3, Vector3 } from 'three';
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
    assert.equal(pending.length, 5);
    ensemble.dispose();
    for (const item of pending) item.resolve(await read(item.path));
    await preparation;
    assert.equal(ensemble.inspect().templates, 0);
    assert.equal(ensemble.inspect().actors, 0);
    const missing = new WeddingEnsemble(async () => { throw new Error('Missing asset'); });
    await missing.prepare();
    assert.equal(missing.inspect().unavailable.length, 5);
    assert.equal(missing.inspect().templates, 0);
    missing.dispose();
});

test('the actual review residents keep their instrument grips across native DNA proportions and the final music phrase', async () => {
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const { weddingCandidates } = load('../src/simulation/SimulationCore.ts');
    const { weddingCast, weddingSlots } = load('../src/fjord-play/WeddingCast.ts');
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
        const slots = weddingSlots(cast, { x: 0, z: 0 });
        for (const { id, human } of residents) {
            const { target, facing } = slots['persona:' + id];
            human.root.position.set(target.x, 0, target.z);
            human.root.rotation.y = Math.atan2(facing.x - target.x, facing.z - target.z);
        }
        const [first, second] = cast.filter(role => role.role === 'couple')
            .map(role => residents.find(person => person.id === role.id).human);
        const hand = (human, side) => human.fit.nativeSkeleton.bones
            .find(bone => bone.name.endsWith(side + 'HandMiddle4')).getWorldPosition(new Vector3());
        for (const elapsed of [0, 12, 29]) {
            for (const person of residents) person.human.update(.1);
            ensemble.update(cast, residents, elapsed);
            assert.ok(hand(first, 'Left').distanceTo(hand(second, 'Right')) < .08, 'Actual review couple left fingertip contact');
            assert.ok(hand(first, 'Right').distanceTo(hand(second, 'Left')) < .08, 'Actual review couple right contact');
            assert.ok(ensemble.inspect().maximumGripError < .12, 'Actual review cast support targets');
        }
    } finally { ensemble.dispose(); for (const person of residents) person.human.dispose(); }
});

test('the actual native couple reaches shared hand contact without relocating feet or stretching bones', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await read(path), ''), read);
    const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    const first = await factory.create({ ...defaultDNA(), age: 35 }, 2, undefined, bare);
    const second = await factory.create({ ...defaultDNA(), age: 32, sex: 'female' }, 2, undefined, bare);
    first.root.position.set(-.52, 0, 0); first.root.rotation.y = Math.PI / 2;
    second.root.position.set(.52, 0, 0); second.root.rotation.y = -Math.PI / 2;
    first.update(.1); second.update(.1);
    const roots = [first.root.position.clone(), second.root.position.clone()];
    const heads = [first, second].map(human => human.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith('Head')).getWorldPosition(new Vector3()));
    const scales = [first, second].map(human => human.fit.nativeSkeleton.bones.map(bone => bone.scale.clone()));
    const rotations = [first, second].map(human => human.fit.nativeSkeleton.bones.map(bone => bone.quaternion.clone()));
    const ensemble = new WeddingEnsemble(read);
    const hand = (human, side) => human.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith(side + 'HandMiddle4')).getWorldPosition(new Vector3());
    try {
        ensemble.update([{ id: 'a', role: 'couple' }, { id: 'b', role: 'couple' }],
            [{ id: 'a', human: first }, { id: 'b', human: second }], 2);
        assert.ok(hand(first, 'Left').distanceTo(hand(second, 'Right')) < .08,
            'Actual fingertip gap: ' + hand(first, 'Left').distanceTo(hand(second, 'Right')) + '; reach error ' + ensemble.inspect().maximumGripError);
        assert.ok(hand(first, 'Right').distanceTo(hand(second, 'Left')) < .08);
        for (const [index, human] of [first, second].entries()) {
            assert.ok(human.root.position.equals(roots[index]));
            const head = human.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith('Head')).getWorldPosition(new Vector3());
            assert.ok(Math.hypot(head.x - heads[index].x, head.z - heads[index].z) < .18,
                'Hand contact should not require a deep bow');
            assert.ok(human.fit.nativeSkeleton.bones.every((bone, boneIndex) => bone.scale.equals(scales[index][boneIndex])));
        }
        ensemble.stop();
        for (const [index, human] of [first, second].entries())
            assert.ok(human.fit.nativeSkeleton.bones.every((bone, boneIndex) =>
                1 - Math.abs(bone.quaternion.dot(rotations[index][boneIndex])) < 1e-5),
                'Native spine, clavicles, arms and hands restore completely after the couple pose');
    } finally { ensemble.dispose(); first.dispose(); second.dispose(); }
});


test('the delivered open book is supported by both hands and the flower crown follows the bride head', async () => {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const factory = new MeshyHumanFactory(async path => loader.parseAsync(await read(path), ''), read);
    const bare = { ...defaultCharacterPresentation, hair: 'none', beard: 'none', outfit: 'none' };
    const elder = await factory.create({ ...defaultDNA(), age: 65 }, 2, undefined, bare);
    const bride = await factory.create({ ...defaultDNA(), age: 25, sex: 'female' }, 2, undefined, { ...bare, headwear: 'headwear/occupation-farmer' });
    const ensemble = new WeddingEnsemble(read);
    try {
        await ensemble.prepare();
        ensemble.update([{ id: 'elder', role: 'officiant' }, { id: 'bride', role: 'couple', crown: true }],
            [{ id: 'elder', human: elder }, { id: 'bride', human: bride }], 2);
        const book = elder.root.getObjectByName('wedding-book');
        const crown = bride.root.getObjectByName('wedding-crown');
        assert.ok(book, 'The actual compact open-book export must be used');
        assert.ok(crown, 'The actual flower export must be used');
        assert.ok(crown.parent === bride.fit.sockets.get('socket_head_top'), 'The crown uses the fitted scalp socket');
        const hat = bride.fit.modules.get('headwear/occupation-farmer');
        assert.ok(hat, 'Use the real occupation cap to reproduce the regression');
        assert.equal(hat.visible, false, 'A wedding crown temporarily replaces the occupation cap');
        const frame = crown.parent;
        const bounds = new Box3().setFromObject(crown);
        const center = frame.worldToLocal(bounds.getCenter(new Vector3()));
        assert.ok(Math.abs(center.x) < .08 && Math.abs(center.z) < .10, 'The wreath surrounds the actual scalp');
        for (const [side, x] of [['Left', .55], ['Right', -.55]]) {
            const wrist = elder.fit.nativeSkeleton.bones.find(bone => bone.name.endsWith(side + 'Hand'));
            assert.ok(wrist.getWorldPosition(new Vector3()).distanceTo(book.localToWorld(new Vector3(x, .02, .05))) < .12,
                side + ' hand supports the book');
        }
        assert.equal(ensemble.inspect().instruments, 0);
        assert.equal(ensemble.inspect().accessories, 2);
        ensemble.stop();
        assert.equal(elder.root.getObjectByName('wedding-book'), undefined);
        assert.equal(bride.root.getObjectByName('wedding-crown'), undefined);
        assert.equal(hat.visible, true, 'The original cap is restored after the ceremony');
    } finally { ensemble.dispose(); elder.dispose(); bride.dispose(); }
});
