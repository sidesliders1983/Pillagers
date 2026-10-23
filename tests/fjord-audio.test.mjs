import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

function webAudio() {
    const parameter = () => ({ value: 0, cancelScheduledValues() {},
        setValueAtTime(value) { this.value = value; }, setTargetAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value) { this.value = value; } });
    const node = () => ({ connect() {}, disconnect() {}, gain: parameter() });
    const context = { state: 'suspended', currentTime: 0, sampleRate: 24000, destination: node(),
        listener: Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ',
            'upX', 'upY', 'upZ'].map(key => [key, parameter()])),
        createGain: node, addEventListener() {},
        createPanner: () => ({ ...node(), positionX: parameter(), positionY: parameter(), positionZ: parameter() }),
        createBuffer(channels, length, sampleRate) { return { length, numberOfChannels: channels, sampleRate,
            duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; },
        createBufferSource: () => ({ ...node(), playbackRate: parameter(), start() {},
            stop() { this.onended?.(); } }),
        async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; },
        async close() { this.state = 'closed'; },
    };
    return context;
}
const manifest = { assets: [{ id: 'tone', proof: 'tone', seconds: .2, channels: 1, frequency: 250 }],
    cues: [{ id: 'local', bus: 'world', gain: .1, variants: ['tone'], loop: true,
        cooldown: [1, 1], range: 40, priority: 1, limit: 2, pitch: [1, 1] }] };
const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 30 };
const emitter = { id: 'a', cue: 'local', permitted: true, position: { x: 1, y: 0, z: 0 } };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('explicit activation requests media playback even when the device ringer is silent', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const session = { type: 'auto' };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { audioSession: session },
    });
    const context = webAudio();
    context.resume = async function () {
        assert.equal(session.type, 'playback', 'Media routing must be chosen before resuming sound');
        this.state = 'running';
    };
    const audio = new FjordAudio({ createContext: () => context });
    try {
        assert.equal(session.type, 'auto', 'Creating the owner must not change device routing');
        assert.equal(await audio.enable(), true);
        const world = audio.world(manifest);
        world.update(camera, [emitter], false);
        await settle();
        assert.equal(audio.inspect().playing, 1);
        audio.setHidden(true);
        assert.equal(audio.inspect().playing, 0, 'Playback routing does not permit background sound');
        world.dispose();
        assert.equal(session.type, 'playback', 'World replacement preserves the application route');
        await audio.dispose();
        assert.equal(session.type, 'auto', 'Application disposal restores the prior route');
    } finally {
        await audio.dispose();
        if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
        else delete globalThis.navigator;
    }
});

test('a delayed source cannot play an obsolete in-place revision', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = webAudio();
    let finish, now = 0;
    context.decodeAudioData = () => new Promise(resolve => { finish = resolve; });
    const audio = new FjordAudio({ createContext: () => context, now: () => now,
        fetch: async () => new Response(new Uint8Array(4)) });
    const pack = { ...manifest, assets: [{ id: 'tone', path: 'game-assets/audio/test.wav', seconds: .2, channels: 1 }] };
    const source = { ...emitter, revision: 1 };
    await audio.enable();
    const world = audio.world(pack);
    world.update(camera, [source], false);
    await settle();
    source.revision = 2;
    now = .5;
    world.update(camera, [source], false);
    finish(context.createBuffer(1, 4800, 24000));
    await settle();
    assert.equal(audio.inspect().playing, 0);
    now = 1;
    world.update(camera, [source], false);
    await settle();
    assert.equal(audio.inspect().playing, 1, 'Only a new update may start the current revision');
    await audio.dispose();
});

test('repeated world replacement bounds callbacks waiting on a non-abortable decode', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = webAudio();
    let finish, now = 0;
    context.decodeAudioData = () => new Promise(resolve => { finish = resolve; });
    const audio = new FjordAudio({ createContext: () => context, now: () => now,
        fetch: async () => new Response(new Uint8Array(4)) });
    const pack = { ...manifest, assets: [{ id: 'tone', path: 'game-assets/audio/test.wav', seconds: .2, channels: 1 }] };
    await audio.enable();
    for (let index = 0; index < 30; index++) {
        now++;
        audio.world(pack).update(camera, [emitter], false);
        await settle();
    }
    assert.ok(audio.inspect().inflightClients <= 11);
    assert.equal(audio.inspect().decodes, 1);
    finish(context.createBuffer(1, 4800, 24000));
    await settle();
    assert.equal(audio.inspect().inflightClients, 0);
    assert.equal(audio.inspect().playing, 0, 'Retired requests do not become the latest world');
    await audio.dispose();
});

test('one explicit audio owner survives world replacement and respects mute, hide and disposal', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = webAudio();
    let creations = 0, now = 0;
    const audio = new FjordAudio({ createContext: () => { creations++; return context; }, now: () => now });
    const first = audio.world(manifest);
    first.update(camera, [emitter], false);
    assert.equal(creations, 0, 'A camera update cannot authorize audio');
    assert.equal(await audio.enable(), true);
    first.update(camera, [emitter], false);
    await settle();
    assert.equal(audio.inspect().playing, 1);
    assert.equal(audio.inspect().buffers, 1);
    const second = audio.world(manifest);
    assert.equal(audio.inspect().playing, 0);
    now = 1;
    first.update(camera, [emitter], false);
    await settle();
    assert.equal(audio.inspect().playing, 0, 'A retired world cannot emit');
    second.update(camera, [emitter], false);
    await settle();
    assert.equal(audio.inspect().playing, 1);
    audio.setHidden(false);
    assert.equal(audio.inspect().playing, 1, 'An ordinary pageshow is not an audio interruption');
    audio.setHidden(true);
    assert.equal(audio.inspect().playing, 0);
    audio.configure({ muted: true });
    audio.setHidden(false);
    await settle();
    now = 2;
    second.update(camera, [emitter], false);
    assert.equal(audio.inspect().playing, 0, 'Visibility never unmutes user intent');
    second.dispose();
    assert.notEqual(context.state, 'closed', 'World disposal does not close the application context');
    assert.equal(creations, 1);
    audio.configure({ muted: false });
    await audio.enable();
    const interrupted = audio.world(manifest);
    context.listener.positionX.setValueAtTime = () => { throw new Error('Interrupted driver'); };
    now = 3;
    assert.doesNotThrow(() => interrupted.update(camera, [emitter], false),
        'A browser audio failure never escapes into gameplay');
    await audio.dispose();
    assert.equal(context.state, 'closed');
    assert.equal(audio.inspect().buffers, 0);
});

test('sustained one-shots and higher priorities cannot exceed the physical voice budget', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = webAudio();
    let now = 0;
    const cues = ['old-a', 'old-b', 'new-a', 'new-b'].map(id => ({ ...manifest.cues[0],
        id, loop: false, cooldown: [0, 0], limit: 4, priority: id.startsWith('new') ? 10 : 1 }));
    const source = cue => Array.from({ length: 4 }, (_, index) => ({ ...emitter, id: cue + index, cue }));
    const old = [...source('old-a'), ...source('old-b')];
    const fresh = [...source('new-a'), ...source('new-b')];
    const audio = new FjordAudio({ createContext: () => context, now: () => now });
    await audio.enable();
    const world = audio.world({ ...manifest, cues });
    world.update(camera, old, false);
    await settle();
    assert.equal(audio.inspect().playing, 8);
    now = 1;
    world.update(camera, [...old, ...fresh], false);
    await settle();
    assert.ok(audio.inspect().playing <= 8);
    assert.ok(audio.inspect().retiring <= 2);
    assert.ok(audio.inspect().physical <= 13);
    now = 2;
    world.update({ ...camera, focus: { x: 500, y: 0, z: 0 } }, [...old, ...fresh], false);
    await settle();
    assert.equal(audio.inspect().playing, 0, 'Even long one-shot tails obey the finite distance cutoff');
    await audio.dispose();
});

test('delayed file decoding cannot restart a replaced world and invalid assets fail locally', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = webAudio();
    let decoded, requests = 0, now = 0;
    context.decodeAudioData = () => new Promise(resolve => { decoded = resolve; });
    const pack = { ...manifest, assets: [{ id: 'tone', path: 'game-assets/audio/test.wav', seconds: .2, channels: 1 }] };
    const audio = new FjordAudio({ createContext: () => context, now: () => now, base: '/review/',
        fetch: async url => {
            requests++;
            assert.equal(url, '/review/game-assets/audio/test.wav');
            return new Response(new Uint8Array(8), { headers: { 'Content-Type': 'audio/wav' } });
        } });
    await audio.enable();
    const old = audio.world(pack);
    old.update(camera, [emitter], false);
    await settle();
    const replacement = audio.world(pack);
    decoded(context.createBuffer(1, 4800, 24000));
    await settle();
    assert.equal(audio.inspect().playing, 0);
    now = 1;
    replacement.update(camera, [emitter], false);
    await settle();
    assert.equal(audio.inspect().playing, 1);
    assert.equal(requests, 1, 'World replacement reuses the shared decoded buffer');
    const broken = audio.world({ ...pack, assets: [{ ...pack.assets[0], path: 'https://provider.invalid/secret' }] });
    now = 2;
    assert.doesNotThrow(() => broken.update(camera, [emitter], false));
    await settle();
    assert.equal(audio.inspect().playing, 0);
    assert.equal(requests, 1, 'Runtime playback never contacts an external provider');
    assert.match(audio.inspect().failure, /could not be loaded/);
    const oversized = audio.world({ ...manifest, assets: [{ ...manifest.assets[0], seconds: 1000 }] });
    now = 3;
    oversized.update(camera, [emitter], false);
    await settle();
    assert.equal(audio.inspect().playing, 0);
    assert.ok(audio.inspect().decodedBytes <= 24 * 1024 * 1024);
    await audio.dispose();
});

test('audio state, presentation randomness and repeated worlds retain exact Core and saved geography', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
    const original = new SharedSettlement(32);
    const observed = SharedSettlement.restore(original.persist(), 'fjord');
    const audio = new FjordAudio({ createContext: webAudio });
    await audio.enable();
    for (const ticks of [11, 24, 3]) {
        const world = audio.world(manifest);
        world.update(camera, [emitter], false);
        original.command({ type: 'AdvanceTicks', ticks });
        observed.command({ type: 'AdvanceTicks', ticks });
        audio.configure({ world: .25, master: .3 });
        await settle();
        world.dispose();
        assert.equal(observed.persist(), original.persist());
    }
    await audio.dispose();
});
