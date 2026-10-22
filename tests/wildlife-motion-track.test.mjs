import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { WildlifeMotionTrack } = load('../src/wildlife/WildlifeMotionTrack.ts');
const origin = { x: 0, y: 0, z: 0 };

test('confirmed fleeing distance is spread evenly across the actual snapshot interval at different frame rates', () => {
    for (const frames of [15, 30, 60]) {
        const track = new WildlifeMotionTrack(origin, 0);
        track.retarget({ x: 0, y: 0, z: 1.3 }, 0, .5);
        let previous = 0;
        for (let frame = 0; frame < frames; frame++) {
            track.advance(.5 / frames, true, frame === 0);
            const step = track.position.z - previous;
            assert.ok(Math.abs(step - 1.3 / frames) < 1e-10, 'No jump-and-stall between snapshots');
            previous = track.position.z;
        }
        assert.ok(Math.abs(track.distance - 1.3) < 1e-10);
        track.advance(10, true, false);
        assert.ok(Math.abs(track.position.z - 1.3) < 1e-10, 'Never extrapolate past confirmed positions');
        assert.ok(Math.abs(track.distance - 1.3) < 1e-10, 'A stationary body cannot keep cycling its legs');
    }
});

test('gait distance stays continuous through faster targets, interruptions and different campaign pacing', () => {
    for (const duration of [.18, .5, .6]) {
        const track = new WildlifeMotionTrack(origin, Math.PI - .05);
        track.retarget({ x: .4, y: 0, z: 0 }, -Math.PI + .05, duration);
        track.advance(duration / 2, true, true);
        assert.ok(Math.abs(track.distance - .2) < 1e-10);
        assert.ok(Math.abs(track.heading - Math.PI) < 1e-10, 'Use the short heading arc');
        track.retarget({ x: 1.2, y: 0, z: 0 }, -Math.PI + .05, duration);
        assert.ok(Math.abs(track.distance - .2) < 1e-10, 'Changing pace cannot reset the gait phase');
        track.advance(duration, true, true);
        assert.ok(Math.abs(track.distance - 1.2) < 1e-10);
    }
});

test('pause freezes an interpolated pose and a loaded snapshot snaps without counting teleport distance', () => {
    const track = new WildlifeMotionTrack(origin, 0);
    track.retarget({ x: 4, y: 0, z: 0 }, 1, .5);
    track.advance(.2, true, true);
    const before = [track.position.toArray(), track.heading, track.distance];
    track.advance(10, false, false);
    assert.deepEqual([track.position.toArray(), track.heading, track.distance], before);
    track.retarget({ x: 4, y: 0, z: 0 }, 1, .5);
    track.advance(10, false, true);
    assert.deepEqual([track.position.toArray(), track.heading, track.distance], before,
        'An unchanged snapshot from the pause command cannot finish the pending movement');
    track.retarget({ x: 200, y: 0, z: 0 }, 2, .5, true);
    assert.deepEqual(track.position.toArray(), [200, 0, 0]);
    assert.equal(track.distance, before[2]);
});
