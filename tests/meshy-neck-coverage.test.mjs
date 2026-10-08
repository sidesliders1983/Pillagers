import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {load} from './load-source.mjs';

const require = createRequire(import.meta.url);
const {GLTFLoader} = require('three/addons/loaders/GLTFLoader.js');
const {MeshoptDecoder} = require('three/addons/libs/meshopt_decoder.module.js');
const {Ray, Vector3} = require('three');
const {MeshyHumanFactory} = load('../src/characters/MeshyHuman.ts');
const {generateCharacterDNA} = load('../src/characters/generateCharacterDNA.ts');

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

async function publicBytes(url) {
    return readFile(new URL('../public' + url.split('?')[0], import.meta.url));
}

async function publicAsset(url) {
    const bytes = await publicBytes(url);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function firstSurfaceHit(positions, indices, ray) {
    let nearest = null;
    let distance = Infinity;
    const corners = [new Vector3(), new Vector3(), new Vector3()];
    const hit = new Vector3();
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
        corners.forEach((corner, k) => corner.fromArray(positions, indices[triangle + k] * 3));
        if (!ray.intersectTriangle(...corners, false, hit)) continue;
        const candidate = hit.distanceToSquared(ray.origin);
        if (candidate < distance) {
            distance = candidate;
            nearest = hit.clone();
        }
    }
    return nearest;
}

test('equipping the outfit preserves the exposed neck above its front neckline at every body LOD', async () => {
    const factory = new MeshyHumanFactory(publicAsset, async url => {
        const bytes = await publicBytes(url);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    });
    const dna = generateCharacterDNA(1983);
    dna.age = 32;
    dna.morphology = {height: 1.5, masculinity: 1};

    for (const lod of [0, 1, 2]) {
        const human = await factory.create(dna, lod, undefined, {
            hair: 'none', beard: 'none', outfit: 'garment/meshy-tunic-trousers', equipment: 'none',
        });
        try {
            const source = human.fit.surface('source');
            const geometry = human.fit.mesh.geometry;
            const positions = [];
            const attribute = geometry.getAttribute('position');
            for (let vertex = 0; vertex < attribute.count; vertex++) {
                positions.push(...new Vector3().fromBufferAttribute(attribute, vertex)
                    .applyMatrix4(human.fit.encoding).toArray());
            }
            const outfit = human.fit.modules.get('garment/meshy-tunic-trousers').children[0];
            const clothingPositions = [];
            const clothingAttribute = outfit.geometry.getAttribute('position');
            for (let vertex = 0; vertex < clothingAttribute.count; vertex++) {
                clothingPositions.push(...new Vector3().fromBufferAttribute(clothingAttribute, vertex)
                    .applyMatrix4(human.fit.encoding).toArray());
            }
            const clothingIndices = outfit.geometry.index?.array
                ?? Array.from({length: clothingAttribute.count}, (_, vertex) => vertex);
            let exposedSamples = 0;
            // Preserve the actual source neck wherever the outfit does not cover it.
            // Real clothing in front of a sample is legitimate coverage, not a skin hole.
            for (const x of [-0.01, 0, 0.01]) {
                for (const height of [1.374, 1.382, 1.390, 1.405, 1.415, 1.430]) {
                    const ray = new Ray(new Vector3(x, height, 0.5), new Vector3(0, 0, -1));
                    const original = firstSurfaceHit(source.positions, source.indices, ray);
                    const visible = firstSurfaceHit(positions, geometry.index.array, ray);
                    assert.ok(original, `LOD${lod}: source neck sample must exist`);
                    const clothing = firstSurfaceHit(clothingPositions, clothingIndices, ray);
                    if (clothing && clothing.distanceTo(ray.origin) < original.distanceTo(ray.origin)) continue;
                    exposedSamples++;
                    assert.ok(visible && visible.distanceTo(original) < 0.00001,
                        `LOD${lod}: outfit removed exposed neck at x=${x}, y=${height}`);
                }
            }
            assert.ok(exposedSamples >= 6, `LOD${lod}: the fixture must leave actual neck skin exposed`);
        } finally {
            human.dispose();
        }
    }
});
