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
const sourceRoot = resolve(process.argv[2] ?? 'Assets/Characters/Human/Beards');
const publicDirectory = '/character-lab/modules/manual-beards';
const destination = resolve('public' + publicDirectory);
await mkdir(destination, {recursive: true});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pipeline = {path: 'scripts/prepare-manual-beards.mjs',
    sha256: sha256(await readFile(new URL('./prepare-manual-beards.mjs', import.meta.url)))};

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const adapters = [];
for (const [lod, identity] of meshyHumanAssetIdentity.entries()) {
    const bytes = await readFile('public' + identity.path);
    assert.equal(sha256(bytes), identity.sha256);
    const gltf = await loader.parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    let mesh;
    gltf.scene.traverse(node => {if (node.isSkinnedMesh) mesh = node;});
    const root = new Group();
    root.add(gltf.scene);
    const fit = new MeshyBodyFitAdapter(mesh, root, gltf.scene, lod);
    assert.equal(fit.nativeSkeleton.bones[5].name, 'mixamorigHead');
    adapters.push(fit);
}

const io = new NodeIO();
const records = [];
const measurements = {};
for (const [filename, name, label, style] of [
    ['Braid-beard.glb', 'braid', 'Braided beard · manual fit', 'braid'],
    ['double-beard.glb', 'double', 'Double beard · manual fit', 'split-braid'],
    ['normal-beard.glb', 'normal', 'Normal beard · manual fit', 'short'],
    ['pointed-beard.glb', 'pointed', 'Pointed beard · manual fit', 'medium'],
]) {
    const sourceBytes = await readFile(resolve(sourceRoot, filename));
    const source = await io.readBinary(sourceBytes);
    assert.equal(source.getRoot().listSkins().length, 0, 'Beard must not contain a copied rig');
    assert.equal(source.getRoot().listAnimations().length, 0);
    const nodes = source.getRoot().listNodes().filter(node => node.getMesh());
    assert.equal(nodes.length, 1, 'Expected a single manually fitted beard object');
    const node = nodes[0];
    const primitives = node.getMesh().listPrimitives();
    assert.equal(primitives.length, 1);
    const original = primitives[0];
    const sourcePositions = original.getAttribute('POSITION');
    const count = sourcePositions.getCount();
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const originalNormals = original.getAttribute('NORMAL');
    assert.ok(originalNormals);
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < count; vertex++) {
        const point = new Vector3().fromArray(sourcePositions.getElement(vertex, []))
            .applyMatrix4(matrix);
        positions.set(point.toArray(), vertex * 3);
        normals.set(new Vector3().fromArray(originalNormals.getElement(vertex, []))
            .applyNormalMatrix(normalMatrix).toArray(), vertex * 3);
        point.toArray().forEach((value, axis) => {
            minimum[axis] = Math.min(minimum[axis], value);
            maximum[axis] = Math.max(maximum[axis], value);
        });
    }
    const indices = new Uint32Array(original.getIndices().getArray());
    const triangles = indices.length / 3;
    const document = new Document();
    const buffer = document.createBuffer();
    const attribute = (name, array, type) => document.createAccessor(name)
        .setArray(array).setType(type).setBuffer(buffer);
    const material = document.createMaterial('DNA beard colour')
        .setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1)
        .setMetallicFactor(0).setAlphaMode('OPAQUE').setDoubleSided(true);
    const primitive = document.createPrimitive()
        .setAttribute('POSITION', attribute('Metre positions', positions, 'VEC3'))
        .setAttribute('NORMAL', attribute('Source normals', normals, 'VEC3'))
        .setAttribute('COLOR_0', attribute('DNA colour carrier', new Float32Array(count * 3).fill(1), 'VEC3'))
        .setIndices(attribute('Source triangles', indices, 'SCALAR')).setMaterial(material);
    const meshName = 'Module_manual_beard_' + name;
    document.createScene().addChild(document.createNode(meshName)
        .setMesh(document.createMesh(meshName).addPrimitive(primitive)));
    const output = Buffer.from(await io.writeBinary(document));
    const id = 'beard/manual-fitted-' + name;
    const binding = {
        version: 'pillagers-fit/0.2', id, moduleSha256: sha256(output),
        rigSignature: adapters[0].body.rigSignature,
        recipe: {id: 'manual-fitted-beard', version: 1, blender: 'not-required'},
        coordinateFrame: {up: '+Y', front: '+Z', unit: 'metre', origin: 'Meshy source bind'},
        construction: 'intentional-asymmetry', skinning: 'rigid-native-head',
        supportedAges: {min: 18, max: 100}, lods: {},
        regions: {beard: {contact: [], free: Array.from({length: count}, (_, i) => i), boundary: []}},
        seams: [], garmentFrames: {},
    };
    for (const fit of adapters) {
        const anchors = Array.from({length: count}, (_, vertex) =>
            closestSurface(fit.source, new Vector3().fromArray(positions, vertex * 3), ['HEAD']));
        binding.lods[fit.body.lod] = {bodySha256: fit.body.sha256,
            topology: fit.topologySignature, anchors,
            vertexAnchors: Array.from({length: count}, (_, i) => i),
            weights: anchors.map(() => ({joints: [5, 0, 0, 0], weights: [1, 0, 0, 0]})),
            coverageTriangles: []};
    }
    const bindingBytes = Buffer.from(JSON.stringify(binding) + '\n');
    const path = publicDirectory + '/' + name + '.glb';
    const record = {id, label, style, path, triangles, bindingPath: path.replace('.glb', '.binding.json'),
        bindingSha256: sha256(bindingBytes)};
    const provenance = {schemaVersion: 1, route: 'manual-fitted-beard', moduleId: id,
        source: {path: 'Assets/Characters/Human/Beards/' + filename,
            sha256: sha256(sourceBytes), bytes: sourceBytes.length,
            nodeTransform: Array.from(matrix.elements)},
        output: {sha256: sha256(output), bytes: output.length, triangles, vertices: count},
        bindingSha256: record.bindingSha256, pipeline,
        operations: ['Bake existing node transform into metre positions',
            'Preserve vertex count and triangle indices',
            'Remove texture maps and UVs; use DNA vertex colour',
            'Bind every vertex to existing native Head joint for all three body LODs'],
        reviewStatus: 'preview', bodyBindings: adapters.map(fit => fit.body)};
    await writeFile('public' + path, output);
    await writeFile('public' + record.bindingPath, bindingBytes);
    await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
    records.push(record);
    measurements[path] = {sha256: sha256(output), triangles, materials: 1,
        bytes: output.length, bounds: {min: minimum, max: maximum}};
    console.log(filename + ': ' + triangles + ' triangles, ' + output.length + ' bytes; original fit retained.');
}
await writeFile('src/characters/ManualBeardMeasurements.ts',
    '/** Generated by scripts/prepare-manual-beards.mjs. */\n' +
    'export const manualBeardRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const manualBeardMeasurements = ' + JSON.stringify(measurements, null, 4) + ';\n');
