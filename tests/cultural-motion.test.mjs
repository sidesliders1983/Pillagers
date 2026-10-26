import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from './load-source.mjs';

const { CulturalMotion } = load('../src/characters/CulturalMotion.ts');
const bytes = readFileSync('public/game-assets/human/Human_CulturalAnimations.glb');
const arrayBuffer = () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

test('an accepted visible gathering shares one lazy native motion bank', async () => {
    let downloads = 0;
    const motion = new CulturalMotion(async url => {
        downloads++;
        assert.match(url, /^\/game-assets\/human\/Human_CulturalAnimations\.glb(?:\?|$)/);
        return arrayBuffer();
    });
    assert.equal(downloads, 0);
    const [first, second] = await Promise.all([
        motion.prepare({ eventId: 'gathering-1', visible: true }),
        motion.prepare({ eventId: 'gathering-1', visible: true }),
    ]);
    assert.deepEqual(first?.map(clip => clip.name), ['Storytelling_Gesture', 'Gathering_Applause']);
    assert.ok(first[0] === second[0]);
    assert.equal(downloads, 1);
});

test('offscreen or unaccepted gatherings do not download motion', async () => {
    let downloads = 0;
    const motion = new CulturalMotion(async () => { downloads++; return arrayBuffer(); });
    assert.ok(await motion.prepare({ eventId: '', visible: true }) === null);
    assert.ok(await motion.prepare({ eventId: 'gathering-2', visible: false }) === null);
    assert.equal(downloads, 0);
});

test('HTTP LAN still verifies bank bytes and rejects a changed clip quietly', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    try {
        const valid = new CulturalMotion(async () => arrayBuffer());
        assert.ok(await valid.prepare({ eventId: 'gathering-lan', visible: true }) !== null);
        const changed = Buffer.from(bytes);
        changed[changed.length - 8] ^= 1;
        const altered = new CulturalMotion(async () => changed.buffer.slice(
            changed.byteOffset, changed.byteOffset + changed.byteLength,
        ));
        assert.ok(await altered.prepare({ eventId: 'gathering-lan', visible: true }) === null);
    } finally {
        if (original) Object.defineProperty(globalThis, 'crypto', original);
        else delete globalThis.crypto;
    }
});

test('scene reset ignores old requests while retaining one pending bank', async () => {
    let release;
    let downloads = 0;
    const motion = new CulturalMotion(async () => {
        downloads++;
        return new Promise(resolve => { release = resolve; });
    });
    const previous = motion.prepare({ eventId: 'old-scene', visible: true });
    motion.reset();
    const current = motion.prepare({ eventId: 'new-scene', visible: true });
    release(arrayBuffer());
    assert.ok(await previous === null);
    assert.equal((await current)?.length, 2);
    assert.equal(downloads, 1);
    motion.dispose();
    assert.ok(await motion.prepare({ eventId: 'disposed', visible: true }) === null);
    assert.equal(downloads, 1);
});

// Real committed native body, with only images/materials removed for a DOM-free Node model test.
let nativeSource;
async function nativeHumanSource() {
    nativeSource ??= (async () => {
        const { NodeIO } = await import('@gltf-transform/core');
        const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
        const { MeshoptDecoder } = await import('meshoptimizer');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        await MeshoptDecoder.ready;
        const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
            .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
        const document = await io.read('public/game-assets/human/Human_LOD2.glb');
        for (const mesh of document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) primitive.setMaterial(null);
        }
        for (const material of document.getRoot().listMaterials()) material.dispose();
        for (const texture of document.getRoot().listTextures()) texture.dispose();
        for (const extension of document.getRoot().listExtensionsUsed()) {
            if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
        }
        const bytes = await io.writeBinary(document);
        return new GLTFLoader().parseAsync(bytes.buffer, '');
    })();
    return nativeSource;
}

const { MeshyHuman } = load('../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../src/characters/CharacterDNA.ts');

test('existing native residents play shared presentation motion once and return to Idle', async () => {
    const source = await nativeHumanSource();
    const sourceNames = source.animations.map(clip => clip.name);
    const human = new MeshyHuman(source, defaultDNA(), 2);
    const other = new MeshyHuman(source, defaultDNA(), 2);
    const motion = new CulturalMotion(async () => arrayBuffer());
    try {
        const clips = await motion.prepare({ eventId: 'gathering-native', visible: true });
        assert.equal(human.registerPresentationClips(clips), true);
        assert.equal(human.registerPresentationClips(clips), true);
        human.root.position.set(12, 3, -8);
        human.setPlaybackRate(1);
        assert.equal(human.playPresentationClip('Storytelling_Gesture'), true);
        assert.equal(human.root.userData.clip, 'Storytelling_Gesture');
        human.update(.1);
        assert.equal(other.root.userData.clip, 'Idle_02');
        human.update(4.2);
        assert.equal(human.root.userData.clip, 'Idle_02');
        assert.deepEqual(human.root.position.toArray(), [12, 3, -8]);
        assert.deepEqual(source.animations.map(clip => clip.name), sourceNames);
        assert.equal(human.clips.length, sourceNames.length);
        human.dispose();
        assert.equal(human.isDisposed, true);
        assert.equal(human.playPresentationClip('Gathering_Applause'), false);
    } finally {
        human.dispose();
        other.dispose();
        motion.dispose();
    }
});

test('presentation clips reject incompatible bindings without partial registration', async () => {
    const source = await nativeHumanSource();
    const human = new MeshyHuman(source, defaultDNA(), 2);
    const motion = new CulturalMotion(async () => arrayBuffer());
    try {
        const clips = await motion.prepare({ eventId: 'gathering-bindings', visible: true });
        const incompatible = clips[1].clone();
        incompatible.tracks[0].name = 'UnrelatedSkeleton.position';
        assert.equal(human.registerPresentationClips([clips[0], incompatible]), false);
        assert.equal(human.playPresentationClip('Storytelling_Gesture'), false);
        assert.equal(human.registerPresentationClips([source.animations[0]]), false);
        assert.equal(human.root.userData.clip, 'Idle_02');
    } finally {
        human.dispose();
        motion.dispose();
    }
});

test('event playback reuses existing resident motion and does not restart the same event', async () => {
    const human = new MeshyHuman(await nativeHumanSource(), defaultDNA(), 2);
    const motion = new CulturalMotion(async () => arrayBuffer());
    try {
        human.setPlaybackRate(1);
        const request = { eventId: 'gathering-play-once', visible: true };
        assert.deepEqual(await Promise.all([
            motion.play(human, 'Storytelling_Gesture', request),
            motion.play(human, 'Storytelling_Gesture', request),
        ]), [true, true]);
        human.update(1);
        const before = human.animationState.time;
        assert.equal(await motion.play(human, 'Storytelling_Gesture', request), true);
        assert.equal(human.animationState.time, before);
        human.update(4);
        assert.equal(human.root.userData.clip, 'Idle_02');
        assert.equal(await motion.play(human, 'Storytelling_Gesture', request), true);
        assert.equal(human.root.userData.clip, 'Idle_02');
        assert.equal(await motion.play(human, 'Gathering_Applause', {
            eventId: 'gathering-next', visible: true,
        }), true);
        assert.equal(human.root.userData.clip, 'Gathering_Applause');
        assert.equal(human.stopPresentationClip(), true);
        assert.equal(human.root.userData.clip, 'Idle_02');
    } finally {
        human.dispose();
        motion.dispose();
    }
});

test('late motion never revives a dead or disposed resident', async () => {
    const source = await nativeHumanSource();
    const dead = new MeshyHuman(source, defaultDNA(), 2);
    const removed = new MeshyHuman(source, defaultDNA(), 2);
    let release;
    const motion = new CulturalMotion(() => new Promise(resolve => { release = resolve; }));
    try {
        const request = { eventId: 'gathering-late', visible: true };
        const deathLoad = motion.play(dead, 'Gathering_Applause', request);
        const disposalLoad = motion.play(removed, 'Storytelling_Gesture', request);
        dead.setAnimation('Death');
        removed.dispose();
        release(arrayBuffer());
        assert.deepEqual(await Promise.all([deathLoad, disposalLoad]), [false, false]);
        assert.equal(dead.animationState.animation, 'Death');
        assert.equal(dead.stopPresentationClip(), false);
        assert.equal(dead.animationState.animation, 'Death');
    } finally {
        dead.dispose();
        removed.dispose();
        motion.dispose();
    }
});

test('the production loader fetches and verifies the same lazy asset without injected transport', async () => {
    const originalFetch = globalThis.fetch;
    let downloads = 0;
    globalThis.fetch = async url => {
        downloads++;
        assert.match(String(url), /Human_CulturalAnimations\.glb\?v=8fb9ff11a617/);
        return { ok: true, arrayBuffer: async () => arrayBuffer() };
    };
    const motion = new CulturalMotion();
    try {
        const clips = await motion.prepare({ eventId: 'gathering-http', visible: true });
        assert.equal(clips?.length, 2);
        assert.equal(downloads, 1);
    } finally {
        motion.dispose();
        globalThis.fetch = originalFetch;
    }
});

test('a failed download stays quiet until an explicit scene reset allows one retry', async () => {
    let downloads = 0;
    const motion = new CulturalMotion(async () => {
        if (++downloads === 1) throw new Error('Offline');
        return arrayBuffer();
    });
    assert.ok(await motion.prepare({ eventId: 'gathering-failed', visible: true }) === null);
    assert.ok(await motion.prepare({ eventId: 'gathering-next-frame', visible: true }) === null);
    assert.equal(downloads, 1);
    motion.reset();
    assert.equal((await motion.prepare({ eventId: 'gathering-new-scene', visible: true }))?.length, 2);
    assert.equal(downloads, 2);
    motion.dispose();
});

test('a queued scene reset cannot activate an already resolved motion bank', async () => {
    const human = new MeshyHuman(await nativeHumanSource(), defaultDNA(), 2);
    const motion = new CulturalMotion(async () => arrayBuffer());
    try {
        await motion.prepare({ eventId: 'gathering-warm', visible: true });
        const playing = motion.play(human, 'Storytelling_Gesture', {
            eventId: 'gathering-replaced', visible: true,
        });
        queueMicrotask(() => motion.reset());
        assert.equal(await playing, false);
        assert.equal(human.root.userData.clip, 'Idle_02');
    } finally {
        human.dispose();
        motion.dispose();
    }
});
