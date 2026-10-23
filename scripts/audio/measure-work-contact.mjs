import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { AnimationMixer, Vector3 } from 'three';

// This samples the existing source clip. It does not add an axe, a work action,
// a target or a canonical event. The reach marker still needs visual acceptance.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const path = 'public/game-assets/human/Human_LOD2.glb';
const bytes = readFileSync(path);
const source = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const clip = source.animations.find(clip => clip.name === 'Attack');
if (!clip) throw new Error('Actual source Attack clip is unavailable');
const hand = source.scene.getObjectByName('mixamorigRightHand') ??
    source.scene.getObjectByProperty('name', 'RightHand');
if (!hand) throw new Error('Actual right-hand source bone is unavailable');
const mixer = new AnimationMixer(source.scene), action = mixer.clipAction(clip);
action.play();
const samples = [];
for (let step = 0; step <= 120; step++) {
    const time = clip.duration * step / 120;
    mixer.setTime(Math.min(time, clip.duration - .00001));
    source.scene.updateMatrixWorld(true);
    samples.push({ time, position: hand.getWorldPosition(new Vector3()).toArray() });
}
const reach = samples.reduce((best, sample) => sample.position[2] > best.position[2] ? sample : best);
const result = { source: path, sourceSHA256: createHash('sha256').update(bytes).digest('hex'),
    clip: clip.name, duration: clip.duration, marker: reach.time, markerFraction: reach.time / clip.duration,
    basis: 'Maximum forward (+Z) right-hand reach in the actual source Attack clip; provisional visual contact, not an authored axe collision.',
    samples };
const output = 'scratch/audio-230/work-contact.json';
mkdirSync('scratch/audio-230', { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output, ...result, samples: undefined }));
