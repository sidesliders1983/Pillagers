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

test('a wedding stream is a positioned world source, keeps ambience at its chosen volume and fades with listener distance', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
        setTargetAtTime(value) { this.value = value; } });
    const gains = [], panners = [];
    const node = () => ({ outputs: [], connect(target) { this.outputs.push(target); }, disconnect() { this.outputs = []; } });
    const context = { state: 'suspended', currentTime: 0, sampleRate: 24000, destination: node(), addEventListener() {},
        listener: Object.fromEntries(['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ']
            .map(name => [name, parameter()])),
        createGain() { const value = { ...node(), gain: parameter() }; gains.push(value); return value; },
        createPanner() { const value = { ...node(), positionX: parameter(), positionY: parameter(), positionZ: parameter() }; panners.push(value); return value; },
        createMediaElementSource() { return node(); },
        async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; }, async close() {} };
    const f = fixture();
    const audio = new FjordAudio({ createContext: () => context, createMedia: () => f.element });
    await audio.enable(); audio.configure({ ambience: .6, world: .7 });
    const world = audio.world({ assets: [], cues: [] });
    const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: 1 }, distance: 12 };
    world.update(camera, [], false, true);
    const ambience = gains[1].gain.value;
    const track = audio.foreground({ path: 'game-assets/wedding/firelight-vow.mp3', seconds: 30.041 }, { spatial: true });
    track.setPosition({ x: 8, y: 1.7, z: 2 }); track.update(0, true);
    try {
        assert.equal(await track.play(), true);
        assert.equal(panners.length, 1, 'One existing-context native Panner owns the scene music');
        assert.equal(panners[0].positionX.value, 8);
        assert.equal(panners[0].positionZ.value, 2);
        assert.equal(audio.inspect().foregroundDucking, false, 'Diegetic music leaves the ordinary ambience running');
        assert.equal(gains[1].gain.value, ambience);
        const routeGain = gains.at(-1), near = routeGain.gain.value;
        assert.ok(near > 0);
        world.update({ ...camera, focus: { x: 300, y: 0, z: 0 } }, [], false, true);
        track.update(1, true);
        assert.equal(routeGain.gain.value, 0, 'Walking the listener away silences the source instead of following the menu');
        world.update(camera, [], false, true); track.update(2, true);
        assert.ok(routeGain.gain.value > 0);
        audio.configure({ muted: true });
        assert.equal(f.element.paused, true);
        track.dispose();
        assert.equal(panners[0].outputs.length, 0, 'Spatial route releases on scene cleanup');
        assert.equal(audio.inspect().decodedBytes, 0, 'The streamed song does not enter the SFX PCM cache');
    } finally { await audio.dispose(); }
});
