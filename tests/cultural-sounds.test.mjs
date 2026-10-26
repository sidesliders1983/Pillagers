import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const point = { x: 2, y: 1, z: 3 };
const presentation = { id: 'held-4', phase: 'gathering', phaseElapsedSeconds: .1,
    position: point, visible: true, stagedParticipants: 3 };
const frame = { presentation, running: true, hidden: false, sampleRate: 48000, ready: () => true };

test('only a fresh accepted gathering can prepare and project one current group source', () => {
    const { CulturalSounds } = load('../src/audio/CulturalSounds.ts');
    const sounds = new CulturalSounds(3);
    assert.deepEqual(sounds.sample(frame).sources, [], 'Historical state is not an audio command');
    assert.equal(sounds.start({ id: 'held-3', sequence: 3 }), false);
    assert.equal(sounds.start({ id: 'held-4', sequence: 4 }), true);
    const approach = sounds.sample({ ...frame, ready: () => false,
        presentation: { ...presentation, phase: 'approach' } });
    assert.deepEqual(approach.prepareCueIds, ['culture-murmur', 'culture-applause']);
    assert.deepEqual(approach.sources, []);
    const current = sounds.sample(frame);
    assert.equal(current.sources.length, 1);
    assert.equal(current.sources[0].cue, 'culture-murmur');
    assert.deepEqual(current.sources[0].position, point);
    assert.equal(current.fresh, true);
});

test('pause, hidden, offscreen, missing actors and missing presentation never replay a consumed phase', () => {
    const { CulturalSounds } = load('../src/audio/CulturalSounds.ts');
    const { Soundscape } = load('../src/audio/Soundscape.ts');
    const camera = { focus: point, forward: { x: 0, z: -1 }, distance: 20 };
    const cue = id => ({ id, bus: 'world', variants: [id], gain: .3, loop: false,
        cooldown: [0, 0], range: 36, priority: 2, limit: 1, pitch: [1, 1] });
    for (const unavailable of [
        { running: false }, { hidden: true }, { presentation: undefined },
        { presentation: { ...presentation, visible: false } },
        { presentation: { ...presentation, stagedParticipants: 0 } },
    ]) {
        const sounds = new CulturalSounds();
        const mix = new Soundscape([cue('culture-murmur'), cue('culture-applause')], () => 0);
        sounds.start({ id: presentation.id, sequence: 1 });
        const first = sounds.sample(frame);
        assert.equal(mix.update(0, camera, first.sources, false).voices.length, 1);
        const refreshed = sounds.sample(frame);
        const removed = sounds.sample({ ...frame, ...unavailable });
        assert.deepEqual(removed.sources, []);
        mix.update(1, camera, removed.sources, false);
        const returned = sounds.sample(frame);
        assert.equal(mix.update(2, camera, returned.sources, false).voices.length, 0,
            'Transient source-marker eviction must not replay a consumed group phase');
        assert.equal(refreshed.fresh, false, 'Refresh is not another phase entry');
        assert.equal(removed.invalidated, true);
        const response = sounds.sample({ ...frame,
            presentation: { ...presentation, phase: 'response' } });
        assert.equal(response.sources.length, 1);
        assert.equal(response.sources[0].id, first.sources[0].id, 'One group source across phases');
        assert.equal(response.sources[0].cue, 'culture-applause');
    }
});

test('late or cold first observations skip the phase rather than catch up after readiness', () => {
    const { CulturalSounds } = load('../src/audio/CulturalSounds.ts');
    const late = new CulturalSounds();
    late.start({ id: presentation.id, sequence: 1 });
    assert.deepEqual(late.sample({ ...frame,
        presentation: { ...presentation, phaseElapsedSeconds: 1.5 } }).sources, [],
        'A late phase observation must not sound as a fresh group response');
    assert.deepEqual(late.sample(frame).sources, [], 'Changing the elapsed input cannot reopen a missed phase');
    const cold = new CulturalSounds();
    cold.start({ id: presentation.id, sequence: 1 });
    assert.deepEqual(cold.sample({ ...frame, ready: () => false }).sources, []);
    assert.deepEqual(cold.sample(frame).sources, [], 'A late decode does not replay the missed phase');
    cold.clear();
    assert.equal(cold.start({ id: presentation.id, sequence: 1 }), false, 'Clear preserves duplicate watermark');
    assert.deepEqual(cold.sample(frame).sources, []);
});
