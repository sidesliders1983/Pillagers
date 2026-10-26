import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
const cue = id => ({ id, bus: 'world', gain: .4, variants: [id], loop: false,
    cooldown: [0, 0], range: 36, priority: 2, limit: 1, pitch: [1, 1] });
const pack = {
    assets: [{ id: 'murmur', path: 'game-assets/audio/culture/murmur.wav', seconds: 3, channels: 1 },
        { id: 'applause', path: 'game-assets/audio/culture/applause.wav', seconds: 2, channels: 1 }],
    cues: [cue('murmur'), cue('applause')],
    decodedBudget: { assetIds: ['murmur', 'applause'], maximumBytes: 2 * 1024 * 1024 },
};

function browserAudio(sampleRate) {
    const parameter = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; },
        setTargetAtTime(value) { this.value = value; } });
    const node = () => ({ connect() {}, disconnect() {}, gain: parameter() });
    return { sampleRate, state: 'suspended', currentTime: 0, destination: node(),
        listener: {}, addEventListener() {}, createGain: node,
        createBuffer(channels, length, rate) { return { length, numberOfChannels: channels, sampleRate: rate,
            duration: length / rate, getChannelData: () => new Float32Array(length) }; },
        createBufferSource: () => ({ ...node(), playbackRate: parameter(), start() {}, stop() { this.onended?.(); } }),
        async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; },
        async close() { this.state = 'closed'; },
    };
}

test('the public audio owner skips the cultural pair before fetching when its actual context rate exceeds the budget', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = browserAudio(192000);
    context.decodeAudioData = async () => context.createBuffer(1, 576000, context.sampleRate);
    let requests = 0;
    const audio = new FjordAudio({ createContext: () => context,
        fetch: async () => { requests++; return new Response(new Uint8Array(4)); } });
    await audio.enable();
    const world = audio.world(pack);
    world.prepare('murmur');
    world.prepare('applause');
    await settle();
    assert.equal(requests, 0, 'The 192 kHz pair would consume 3,840,000 float PCM bytes');
    assert.equal(world.sampleRate, 192000);
    assert.equal(world.ready('murmur'), false);
    assert.equal(audio.inspect().decodedBytes, 0);
    assert.equal(audio.inspect().failure, '', 'Unsupported rate is a silent admission skip');
    await audio.dispose();
});

test('actual decoded buffers are admitted atomically under the cultural family cap', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = browserAudio(96000);
    context.decodeAudioData = async () => context.createBuffer(1, 300000, context.sampleRate);
    const audio = new FjordAudio({ createContext: () => context,
        fetch: async () => new Response(new Uint8Array(4)) });
    await audio.enable();
    const world = audio.world(pack);
    world.prepare('murmur');
    world.prepare('applause');
    await settle();
    assert.equal(audio.inspect().buffers, 1, 'Two actual1.2MB buffers cannot both enter a2MiB family');
    assert.equal(audio.inspect().decodedBytes, 1200000);
    assert.equal(world.ready('murmur'), true);
    assert.equal(world.ready('applause'), false);
    await audio.dispose();
});

test('the real cultural WAV pair loads lazily through the shared owner and survives world replacement without replay', async () => {
    const { readFileSync } = await import('node:fs');
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const { CulturalSounds } = load('../src/audio/CulturalSounds.ts');
    const { withCulturalSoundPack } = load('../src/audio/CulturalSoundPack.ts');
    const { approvedSoundPack } = load('../src/audio/SoundPack.ts');
    const frozen = JSON.stringify(approvedSoundPack);
    const manifest = withCulturalSoundPack(approvedSoundPack);
    assert.equal(JSON.stringify(approvedSoundPack), frozen, 'The accepted release is not rewritten');
    assert.equal(manifest.assets.length, approvedSoundPack.assets.length + 2);
    const context = browserAudio(96000);
    context.listener = { setPosition() {}, setOrientation() {} };
    const parameter = () => ({ setValueAtTime() {} });
    context.createPanner = () => ({ connect() {}, disconnect() {}, positionX: parameter(),
        positionY: parameter(), positionZ: parameter() });
    context.decodeAudioData = async data => {
        const bytes = Buffer.from(data);
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
        const channels = bytes.readUInt16LE(22), sourceRate = bytes.readUInt32LE(24);
        let frames;
        for (let offset = 12; offset + 8 <= bytes.length;) {
            const length = bytes.readUInt32LE(offset + 4);
            if (bytes.toString('ascii', offset, offset + 4) === 'data') frames = length / (channels * 2);
            offset += 8 + length + length % 2;
        }
        assert.ok(frames > 0);
        return context.createBuffer(channels, Math.ceil(frames / sourceRate * context.sampleRate), context.sampleRate);
    };
    let requests = 0, now = 0;
    const audio = new FjordAudio({ createContext: () => context, now: () => now,
        fetch: async path => { requests++; return new Response(readFileSync('public' + path)); } });
    let world = audio.world(manifest);
    world.prepare('culture-murmur');
    await settle();
    assert.equal(requests, 0, 'Consent remains required');
    await audio.enable();
    world.prepare('culture-murmur');
    world.prepare('culture-applause');
    await settle();
    assert.equal(requests, 2);
    assert.equal(audio.inspect().decodedBytes, 1920000);
    assert.equal(world.ready('culture-murmur'), true);
    assert.equal(world.ready('culture-applause'), true);
    const sounds = new CulturalSounds();
    sounds.start({ id: 'held-1', sequence: 1 });
    const position = { x: 1, y: 0, z: 0 };
    const view = { id: 'held-1', phase: 'gathering', phaseElapsedSeconds: .1,
        position, visible: true, stagedParticipants: 3 };
    const camera = { focus: position, forward: { x: 0, z: -1 }, distance: 20 };
    const frame = { presentation: view, running: true, hidden: false,
        sampleRate: world.sampleRate, ready: world.ready };
    const first = sounds.sample(frame);
    world.update(camera, first.sources, false, first.fresh);
    await settle();
    assert.equal(audio.inspect().startedCues['culture-murmur'], 1);
    now = .3;
    const paused = sounds.sample({ ...frame, running: false });
    world.update(camera, paused.sources, true, paused.invalidated);
    const returned = sounds.sample(frame);
    now = .6;
    world.update(camera, returned.sources, false, returned.fresh);
    await settle();
    assert.equal(audio.inspect().startedCues['culture-murmur'], 1);
    assert.equal(audio.inspect().playing, 0);
    world.dispose();
    const oldWorld = world;
    world = audio.world(manifest);
    assert.equal(oldWorld.ready('culture-murmur'), false);
    assert.equal(world.ready('culture-murmur'), true, 'Application cache is shared, not duplicated per scene');
    assert.equal(requests, 2);
    assert.equal(audio.inspect().decodedBytes, 1920000);
    const restored = new CulturalSounds(1);
    assert.equal(restored.start({ id: 'held-1', sequence: 1 }), false);
    assert.deepEqual(restored.sample({ ...frame, ready: world.ready }).sources, []);
    await audio.dispose();
    assert.equal(audio.inspect().decodedBytes, 0);
});

test('a warmed actual buffer is included before fetching the other cultural member', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = browserAudio(96000);
    context.decodeAudioData = async () => context.createBuffer(1, 450000, context.sampleRate);
    let requests = 0;
    const audio = new FjordAudio({ createContext: () => context,
        fetch: async () => { requests++; return new Response(new Uint8Array(4)); } });
    await audio.enable();
    const world = audio.world(pack);
    world.prepare('murmur');
    await settle();
    assert.equal(audio.inspect().decodedBytes, 1800000);
    world.prepare('applause');
    await settle();
    assert.equal(requests, 1, 'Known actual 1.8MB plus the other expected 768KB cannot fit');
    assert.equal(audio.inspect().decodedBytes, 1800000);
    await audio.dispose();
});

test('scene suspension stops an accepted world cue before another frame and cannot replay it', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = browserAudio(48000);
    context.listener = { setPosition() {}, setOrientation() {} };
    const parameter = () => ({ setValueAtTime() {} });
    context.createPanner = () => ({ connect() {}, disconnect() {}, positionX: parameter(),
        positionY: parameter(), positionZ: parameter() });
    context.decodeAudioData = async () => context.createBuffer(1, 144000, 48000);
    const audio = new FjordAudio({ createContext: () => context,
        fetch: async () => new Response(new Uint8Array(4)) });
    await audio.enable();
    const world = audio.world(pack);
    world.prepare('murmur');
    await settle();
    const camera = { focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 20 };
    const sources = [{ id: 'gathering', cue: 'murmur', position: { x: 0, y: 0, z: 0 },
        permitted: true, event: 'paid-gathering:story' }];
    world.update(camera, sources, false, true);
    await settle();
    assert.equal(audio.inspect().playing, 1);
    world.pause();
    assert.equal(audio.inspect().playing, 0, 'No subsequent animation frame is required');
    world.update(camera, sources, false, true);
    await settle();
    assert.equal(audio.inspect().startedCues.murmur, 1, 'The accepted phase marker survives suspension');
    await audio.dispose();
});

test('an unavailable browser audio adapter cannot break synchronous scene suspension', async () => {
    const { FjordAudio } = load('../src/audio/FjordAudio.ts');
    const context = browserAudio(48000);
    context.listener = { setPosition() { throw new Error('Browser audio interrupted'); } };
    const audio = new FjordAudio({ createContext: () => context });
    await audio.enable();
    const world = audio.world(pack);
    world.update({ focus: { x: 0, y: 0, z: 0 }, forward: { x: 0, z: -1 }, distance: 20 }, [], false, true);
    assert.doesNotThrow(() => world.pause());
    assert.equal(audio.inspect().playing, 0);
    await audio.dispose();
});
