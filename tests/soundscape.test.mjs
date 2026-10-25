import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

test('strategy listening stays near the ground focus and rejects unknown or distant sources', () => {
    const { Soundscape } = load('../src/audio/Soundscape.ts');
    const cue = { id: 'test', bus: 'world', gain: .2, variants: ['a', 'b'], loop: false,
        cooldown: [10, 12], range: 30, priority: 1, limit: 2, pitch: [1, 1] };
    const sounds = new Soundscape([cue], () => 0);
    const camera = { focus: { x: 0, y: 5, z: 0 }, forward: { x: 0, z: -1 }, distance: 30 };
    const sources = [
        { id: 'near', cue: 'test', permitted: true, position: { x: 0, y: 6.7, z: 5 } },
        { id: 'far', cue: 'test', permitted: true, position: { x: 80, y: 0, z: 0 } },
        { id: 'hidden', cue: 'test', permitted: false, position: { x: 0, y: 0, z: 0 } },
    ];
    const plan = sounds.update(0, camera, sources, false);
    assert.equal(plan.listener.position.y, 6.7);
    assert.deepEqual(plan.voices.map(voice => voice.source.id), ['near']);
    assert.ok(plan.voices[0].gain > 0 && plan.voices[0].gain < .2);
    assert.equal(sounds.update(.1, camera, sources, false).voices.length, 0, 'No repeated calls on repaint');
});

test('bounded families prioritize nearby detail, retain quiet spacing and re-anchor camera jumps', () => {
    const { Soundscape } = load('../src/audio/Soundscape.ts');
    const loop = id => ({ id, bus: 'world', gain: .2, variants: ['a', 'b'], loop: true,
        cooldown: [10, 10], range: 100, priority: id === 'important' ? 10 : 1, limit: 4, pitch: [1, 1] });
    const calls = { ...loop('call'), loop: false, cooldown: [2, 2] };
    const sounds = new Soundscape([loop('first'), loop('second'), loop('important'), calls,
        { ...calls, id: 'ui', bus: 'interface' }], () => 0);
    const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 30 };
    const emitters = ['first', 'second', 'important'].flatMap(cue => Array.from({ length: 6 }, (_, index) =>
        ({ id: cue + index, cue, permitted: true, position: { x: 2, y: 0, z: 0 } })));
    const plan = sounds.update(0, camera, emitters, false);
    assert.equal(plan.voices.length, 8);
    assert.equal(plan.voices.filter(voice => voice.cue.id === 'important').length, 4);
    assert.ok(sounds.update(.5, { ...camera, distance: 300 }, emitters, false).voices.length <= 2,
        'A far overview reduces density as well as volume');
    assert.deepEqual(sounds.update(1, camera,
        [...emitters, { id: 'confirmation', cue: 'ui', permitted: true }], true).voices.map(voice => voice.source.id),
    ['confirmation'], 'Pause silences local work/fauna but still allows an explicit interface cue');
    const one = [{ id: 'a', cue: 'call', permitted: true, position: { x: 2, y: 0, z: 0 }, event: 'contact-1' }];
    const first = sounds.update(2, camera, one, false).voices[0];
    assert.equal(sounds.update(6, camera, one, false).voices.length, 0, 'Unchanged contact never repeats');
    const second = sounds.update(7, camera, [{ ...one[0], event: 'contact-2' }], false).voices[0];
    assert.notEqual(first.variant, second.variant);
    const moved = sounds.update(8, { ...camera, focus: { x: 300, y: 0, z: 0 } }, [], false);
    assert.equal(moved.listener.jumped, true);
    assert.equal(moved.listener.position.x, 300, 'No audible trip across undiscovered terrain');
    assert.equal(sounds.update(9, { ...camera, focus: { x: NaN, y: 0, z: 0 } }, one, false).voices.length, 0);
});

test('a changed source revision uses its current loop variant instead of a retired asset', () => {
    const { Soundscape } = load('../src/audio/Soundscape.ts');
    const cue = { id: 'first', bus: 'world', gain: .1, variants: ['old'], loop: true,
        cooldown: [1, 1], range: 50, priority: 1, limit: 2, pitch: [1, 1] };
    const sounds = new Soundscape([cue, { ...cue, id: 'second', variants: ['new'] }], () => 0);
    const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 30 };
    const source = { id: 'one', cue: 'first', revision: 1, permitted: true, position: { x: 1, y: 0, z: 0 } };
    assert.equal(sounds.update(0, camera, [source], false).voices[0].variant, 'old');
    assert.equal(sounds.update(1, camera, [{ ...source, cue: 'second', revision: 2 }], false).voices[0].variant, 'new');
});


test('ordinary Fjord audio selects the published game mix and keeps synthetic proof explicitly opt-in', () => {
    const { selectFjordSoundPack } = load('../src/audio/SoundPack.ts');
    const game = selectFjordSoundPack('');
    assert.equal(game.mode, 'game');
    assert.ok(game.manifest.assets.some(asset => asset.id === 'pig' && asset.path.startsWith('game-assets/audio/')));
    assert.ok(!game.manifest.assets.some(asset => asset.proof));
    assert.equal(selectFjordSoundPack('?audioMix=1').mode, 'review');
    const proof = selectFjordSoundPack('?audioProof=1&audioMix=1');
    assert.equal(proof.mode, 'proof');
    assert.ok(proof.manifest.assets.every(asset => asset.proof));
});
