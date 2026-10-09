import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {load} from './load-source.mjs';

const {MeshyHumanFactory, meshyOneShotClips} = load('../src/characters/MeshyHuman.ts');
const {defaultDNA} = load('../src/characters/CharacterDNA.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function asset(url) {
    const bytes = await readFile(new URL('../public' + url.split('?')[0], import.meta.url));
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

test('source-rate Human previews reach every GLB clip endpoint before repeating at each LOD', async () => {
    const factory = new MeshyHumanFactory(asset);
    const dna = defaultDNA();
    dna.age = 32;
    dna.traits.agility = 1;
    for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod);
        try {
            human.setPlaybackRate(1);
            for (const clip of human.clips) {
                const duration = Math.max(...clip.tracks.map(track => track.times.at(-1)));
                const epsilon = Math.min(0.001, duration / 100);
                human.sampleAnimation(clip.name, 0);
                assert.equal(human.duration, duration);
                human.update(duration - epsilon);
                assert.ok(Math.abs(human.animationState.time - (duration - epsilon)) < 1e-6,
                    `LOD${lod}/${clip.name}: preview reset before the GLB endpoint`);
                human.update(epsilon * 2);
                const expected = meshyOneShotClips.has(clip.name) ? duration : epsilon;
                assert.ok(Math.abs(human.animationState.time - expected) < 1e-6,
                    `LOD${lod}/${clip.name}: incorrect GLB end behavior`);
                // Age/DNA changes must preserve the Lab's source-rate override.
                human.applyDNA({...dna, age: 6});
                human.sampleAnimation(clip.name, 0);
                human.update(duration - epsilon);
                assert.ok(Math.abs(human.animationState.time - (duration - epsilon)) < 1e-6,
                    `LOD${lod}/${clip.name}: DNA changed the preview's clip length`);
                human.applyDNA(dna);
            }
        } finally {
            human.dispose();
        }
    }
});
