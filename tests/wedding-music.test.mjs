import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';
const { ForegroundTrack } = load('../src/audio/ForegroundTrack.ts');

function fixture() {
    let allowed = true, ducked = false, released = 0, connects = 0;
    const element = { paused: true, currentTime: 0, duration: 30.015, src: '', preload: '',
        onended: null, onerror: null, async play() { this.paused = false; },
        pause() { this.paused = true; }, removeAttribute() { this.src = ''; }, load() {} };
    const track = new ForegroundTrack({ path: 'game-assets/wedding/firelight-vow.mp3', seconds: 30.041 }, {
        createMedia: () => element, allowed: () => allowed,
        connect: () => { connects++; return { gain() {}, dispose() { released++; } }; },
        duck: value => { ducked = value; },
    });
    return { track, element, allow(value) { allowed = value; },
        inspect: () => ({ ducked, released, connects }) };
}

test('one streamed foreground cue follows pause, current preference and idempotent release without a PCM cache', async () => {
    const f = fixture();
    f.track.update(2, true, 1);
    assert.equal(f.inspect().connects, 0, 'No media work before explicit playback');
    assert.equal(await f.track.play(), true);
    assert.equal(f.element.currentTime, 2);
    assert.equal(f.track.duration, 30.015, 'Actual media duration wins over encoded-frame estimate');
    assert.equal(f.inspect().ducked, true);
    f.track.update(6, false, 1);
    assert.equal(f.element.paused, true);
    assert.equal(f.inspect().ducked, false);
    f.track.update(6, true, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.element.currentTime, 6);
    f.allow(false);
    f.track.update(7, true, 1);
    assert.equal(f.element.paused, true);
    assert.equal(f.inspect().ducked, false);
    f.track.dispose(); f.track.dispose();
    assert.deepEqual(f.inspect(), { ducked: false, released: 1, connects: 1 });
    assert.equal(f.element.src, '');
});

test('the existing audio owner streams one foreground lease and restores buses on mute/world replacement', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; } });
    const gain = () => ({ gain: param(), connect() {}, disconnect() {} });
    let sources = 0;
    const context = { state: 'suspended', currentTime: 0, destination: gain(), createGain: gain,
        addEventListener() {}, createMediaElementSource() { sources++; return { connect() {}, disconnect() {} }; },
        async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; }, async close() {} };
    const f = fixture();
    const audio = new FjordAudio({ createContext: () => context, createMedia: () => f.element });
    await audio.enable();
    const track = audio.foreground({ path: 'game-assets/wedding/firelight-vow.mp3', seconds: 30.041 });
    track.update(0, true);
    assert.equal(await track.play(), true);
    assert.equal(sources, 1);
    assert.equal(audio.inspect().decodedBytes, 0);
    assert.equal(audio.inspect().foregroundDucking, true);
    audio.configure({ muted: true });
    assert.equal(f.element.paused, true);
    assert.equal(audio.inspect().foregroundDucking, false);
    audio.world({ assets: [], cues: [] });
    assert.equal(track.inspect().state, 'released');
    await audio.dispose();
});

test('blocked autoplay and a late native play result cannot leak music or ducking after release', async () => {
    const f = fixture();
    f.element.play = async () => { throw new Error('Autoplay denied'); };
    f.track.update(3, true, 1);
    assert.equal(await f.track.play(), false);
    assert.equal(f.track.inspect().state, 'blocked');
    assert.equal(f.inspect().ducked, false);
    let resolve;
    f.element.play = () => new Promise(done => { resolve = () => { f.element.paused = false; done(); }; });
    const pending = f.track.play();
    f.track.dispose();
    resolve();
    assert.equal(await pending, false);
    assert.equal(f.element.paused, true);
    assert.equal(f.inspect().ducked, false);
});

test('the wedding gesture primes a silent stream so the same media element plays when the cast arrives', async () => {
    const f = fixture();
    f.track.update(0, false, 0);
    assert.equal(await f.track.prime(), true);
    assert.equal(f.element.paused, true, 'No soundtrack during the approach');
    assert.equal(f.element.currentTime, 0);
    assert.equal(f.inspect().ducked, false);
    f.track.update(0, true, 0);
    assert.equal(await f.track.play(), true);
    assert.equal(f.element.paused, false);
    assert.equal(f.inspect().connects, 1, 'Priming and the ceremony share one native media source');
    f.track.dispose();
});

test('an arrival request waits for the enabled context to finish resuming without another menu click', async () => {
    const f = fixture();
    f.allow(false);
    f.track.update(0, true, 1);
    assert.equal(await f.track.play(), false);
    f.allow(true);
    f.track.update(.2, true, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.element.paused, false);
    assert.equal(f.inspect().ducked, true);
    f.track.dispose();
});
