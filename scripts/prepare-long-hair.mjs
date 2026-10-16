import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Document, NodeIO} from '@gltf-transform/core';
import {Group, Matrix3, Matrix4, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {loadTypeScript} from './load-typescript.mjs';

const {MeshyBodyFitAdapter, closestSurface} = loadTypeScript(
    new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const {meshyHumanAssetIdentity} = loadTypeScript(
    new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const filename = resolve(process.argv[2] ?? 'Assets/Characters/Human/Manual-Fitting/Long-hair-2.glb');
const sourceBytes = await readFile(filename);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const io = new NodeIO();
const source = await io.readBinary(sourceBytes);
assert.equal(source.getRoot().listSkins().length, 0);
assert.equal(source.getRoot().listAnimations().length, 0);
const nodes = source.getRoot().listNodes().filter(node => node.getMesh());
assert.equal(nodes.length, 1);
const node = nodes[0];
assert.equal(node.getMesh().listPrimitives().length, 1);
const original = node.getMesh().listPrimitives()[0];
const matrix = new Matrix4().fromArray(node.getWorldMatrix());
const normalMatrix = new Matrix3().getNormalMatrix(matrix);
const inputPositions = original.getAttribute('POSITION');
const inputNormals = original.getAttribute('NORMAL');
const points = Array.from({length: inputPositions.getCount()}, (_, vertex) =>
    new Vector3().fromArray(inputPositions.getElement(vertex, [])).applyMatrix4(matrix));
const positions = new Float32Array(points.flatMap(point => point.toArray()));
const normals = new Float32Array(points.flatMap((_, vertex) =>
    new Vector3().fromArray(inputNormals.getElement(vertex, [])).applyNormalMatrix(normalMatrix).toArray()));
const indices = new Uint32Array(original.getIndices().getArray());
const count = points.length;
const document = new Document();
const buffer = document.createBuffer();
const attribute = (name, array, type) => document.createAccessor(name)
    .setArray(array).setType(type).setBuffer(buffer);
const primitive = document.createPrimitive()
    .setAttribute('POSITION', attribute('Fitted metre positions', positions, 'VEC3'))
    .setAttribute('NORMAL', attribute('Source normals', normals, 'VEC3'))
    .setAttribute('COLOR_0', attribute('DNA hair colour', new Float32Array(count * 3).fill(1), 'VEC3'))
    .setIndices(attribute('Original source triangles', indices, 'SCALAR'))
    .setMaterial(document.createMaterial('DNA hair colour').setBaseColorFactor([1, 1, 1, 1])
        .setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(true));
document.createScene().addChild(document.createNode('Module_manual_long_hair_2')
    .setMesh(document.createMesh('Module_manual_long_hair_2').addPrimitive(primitive)));
const bytes = Buffer.from(await io.writeBinary(document));

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const adapters = [];
for (const [lod, identity] of meshyHumanAssetIdentity.entries()) {
    const bodyBytes = await readFile('public' + identity.path);
    assert.equal(hash(bodyBytes), identity.sha256);
    const gltf = await loader.parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset,
        bodyBytes.byteOffset + bodyBytes.byteLength), '');
    let mesh;
    gltf.scene.traverse(node => {if (node.isSkinnedMesh) mesh = node;});
    adapters.push(new MeshyBodyFitAdapter(mesh, new Group().add(gltf.scene), gltf.scene, lod));
}

// The cap stays rigid to Head. Shoulder-length ends gradually follow Neck and
// Spine2, never the arms: raising an arm must not pull hair off the scalp.
const smooth = value => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
};
const weights = points.map(point => {
    const head = smooth((point.y - 1.38) / .10);
    const back = (1 - head) * smooth((1.40 - point.y) / .09);
    return {joints: [5, 4, 3, 0], weights: [head, 1 - head - back, back, 0]};
});
const id = 'hair/manual-long-2';
const binding = {
    version: 'pillagers-fit/0.2', id, moduleSha256: hash(bytes),
    rigSignature: adapters[0].body.rigSignature,
    recipe: {id: 'manual-long-hair', version: 1, blender: 'not-required'},
    coordinateFrame: {up: '+Y', front: '+Z', unit: 'metre', origin: 'Meshy source bind'},
    construction: 'intentional-asymmetry', skinning: 'authored-four-native',
    supportedAges: {min: 18, max: 100}, lods: {},
    regions: {hair: {contact: [], free: Array.from({length: count}, (_, i) => i), boundary: []}},
    seams: [], garmentFrames: {},
};
for (const fit of adapters) {
    const anchors = points.map(point => closestSurface(fit.source, point, ['HEAD', 'NECK', 'TORSO_UPPER']));
    binding.lods[fit.body.lod] = {
        bodySha256: fit.body.sha256, topology: fit.topologySignature, anchors,
        vertexAnchors: Array.from({length: count}, (_, i) => i), weights, coverageTriangles: [],
    };
}
const bindingBytes = Buffer.from(JSON.stringify(binding) + '\n');
const path = '/character-lab/modules/manual-long-hair/long-2.glb';
await mkdir('public/character-lab/modules/manual-long-hair', {recursive: true});
await writeFile('public' + path, bytes);
await writeFile('public' + path.replace('.glb', '.binding.json'), bindingBytes);
const record = {id, path, bindingPath: path.replace('.glb', '.binding.json'),
    bindingSha256: hash(bindingBytes), triangles: indices.length / 3};
const measurement = {
    sha256: hash(bytes), triangles: record.triangles, materials: 1, bytes: bytes.length,
    bounds: {min: [0, 1, 2].map(axis => Math.min(...points.map(point => point.getComponent(axis)))),
        max: [0, 1, 2].map(axis => Math.max(...points.map(point => point.getComponent(axis))))},
};
const receipt = {
    schemaVersion: 1, route: 'manual-long-hair', source: {
        path: 'Assets/Characters/Human/Manual-Fitting/Long-hair-2.glb',
        sha256: hash(sourceBytes), bytes: sourceBytes.length, nodeTransform: matrix.elements,
    },
    output: {...measurement, vertices: count}, bindingSha256: record.bindingSha256,
    pipeline: {path: 'scripts/prepare-long-hair.mjs', sha256: hash(await readFile(new URL(import.meta.url)))},
    operations: ['Bake source transform; preserve all source vertices, normals and triangle indices',
        'Remove baked textures and UVs; tint all hair with DNA colour',
        'Blend existing Head, Neck and Spine2 weights over the lower locks; no arm influences'],
    reviewStatus: 'preview',
};
await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
await writeFile('src/characters/LongHairMeasurements.ts',
    '/** Generated by scripts/prepare-long-hair.mjs. */\n' +
    'export const longHairRecord = ' + JSON.stringify(record, null, 4) + ' as const;\n' +
    'export const longHairMeasurement = ' + JSON.stringify(measurement, null, 4) + ';\n');
console.log(JSON.stringify({...measurement, vertices: count,
    headOnly: weights.filter(value => value.weights[0] === 1).length,
    backSupported: weights.filter(value => value.weights[2] > .5).length}));
