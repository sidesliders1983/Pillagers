import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { Group, Matrix3, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from './load-typescript.mjs';

const { MeshyBodyFitAdapter, closestSurface } = loadTypeScript(
    new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const { meshyHumanAssetIdentity } = loadTypeScript(
    new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const sourceRoot = resolve(process.argv[2] ?? 'Assets/Characters/Human/Manual-Fitting/female');
const publicDirectory = '/character-lab/modules/female-hair';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const pipeline = { path: 'scripts/prepare-female-hair.mjs',
    sha256: hash(await readFile(new URL(import.meta.url))) };
const styles = [
    { name: 'knotted-braid', node: 'low_poly_unwrapped', label: 'Knotted braid', style: 'braid' },
    { name: 'mid-hair-knotted', node: 'low_poly_unwrapped.001', label: 'Mid-length knotted hair', style: 'tied' },
    { name: 'mid-wavy-long', node: 'low_poly_unwrapped.002', label: 'Wavy long hair', style: 'long' },
];

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const adapters = [];
for (const [lod, identity] of meshyHumanAssetIdentity.entries()) {
    const bytes = await readFile('public' + identity.path);
    assert.equal(hash(bytes), identity.sha256);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength), '');
    let mesh;
    gltf.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
    const fit = new MeshyBodyFitAdapter(mesh, new Group().add(gltf.scene), gltf.scene, lod);
    assert.deepEqual([5, 4, 3].map(index => fit.nativeSkeleton.bones[index].name),
        ['mixamorigHead', 'mixamorigNeck', 'mixamorigSpine2']);
    adapters.push(fit);
}

const smooth = value => {
    const amount = Math.max(0, Math.min(1, value));
    return amount * amount * (3 - 2 * amount);
};
const io = new NodeIO();
const records = [];
const measurements = {};
await mkdir('public' + publicDirectory, { recursive: true });

// Exported scenes contain reference bodies, older hair and their large textures.
// Select the explicitly audited new object, preserving its owner's manual fit.
for (const style of styles) {
    const sourceBytes = await readFile(resolve(sourceRoot, style.name + '.glb'));
    const source = await io.readBinary(sourceBytes);
    const candidates = source.getRoot().listNodes().filter(node => node.getName() === style.node && node.getMesh());
    assert.equal(candidates.length, 1, 'The audited hair object must be unambiguous');
    const node = candidates[0];
    assert.equal(node.getSkin(), null, 'Do not publish the copied reference rig');
    assert.equal(node.getMesh().listPrimitives().length, 1);
    const original = node.getMesh().listPrimitives()[0];
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    const normalMatrix = new Matrix3().getNormalMatrix(matrix);
    const inputPositions = original.getAttribute('POSITION');
    const inputNormals = original.getAttribute('NORMAL');
    assert.ok(inputNormals);
    const points = Array.from({ length: inputPositions.getCount() }, (_, vertex) =>
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
    const meshName = 'Module_female_' + style.name.replaceAll('-', '_');
    document.createScene().addChild(document.createNode(meshName)
        .setMesh(document.createMesh(meshName).addPrimitive(primitive)));
    const output = Buffer.from(await io.writeBinary(document));
    const id = 'hair/manual-female-' + style.name;
    // Existing long-hair rule: scalp follows Head; lower locks blend to Neck and
    // Spine2. No arm influences, copied skeleton or extra animation system.
    const weights = points.map(point => {
        const head = smooth((point.y - 1.38) / .10);
        const back = (1 - head) * smooth((1.40 - point.y) / .09);
        return { joints: [5, 4, 3, 0], weights: [head, 1 - head - back, back, 0] };
    });
    const binding = {
        version: 'pillagers-fit/0.2', id, moduleSha256: hash(output),
        rigSignature: adapters[0].body.rigSignature,
        recipe: { id: 'manual-female-hair', version: 1, blender: 'not-required' },
        coordinateFrame: { up: '+Y', front: '+Z', unit: 'metre', origin: 'Meshy source bind' },
        construction: 'intentional-asymmetry', skinning: 'authored-four-native',
        supportedAges: { min: 18, max: 100 }, lods: {},
        regions: { hair: { contact: [], free: Array.from({ length: count }, (_, i) => i), boundary: [] } },
        seams: [], garmentFrames: {},
    };
    for (const fit of adapters) {
        binding.lods[fit.body.lod] = { bodySha256: fit.body.sha256, topology: fit.topologySignature,
            anchors: points.map(point => closestSurface(fit.source, point, ['HEAD', 'NECK', 'TORSO_UPPER'])),
            vertexAnchors: Array.from({ length: count }, (_, i) => i), weights, coverageTriangles: [] };
    }
    const bindingBytes = Buffer.from(JSON.stringify(binding) + '\n');
    const path = publicDirectory + '/' + style.name + '.glb';
    const record = { id, label: style.label, style: style.style, path,
        bindingPath: path.replace('.glb', '.binding.json'), bindingSha256: hash(bindingBytes),
        triangles: indices.length / 3 };
    const measurement = { sha256: hash(output), triangles: record.triangles,
        materials: 1, bytes: output.length,
        bounds: { min: [0, 1, 2].map(axis => Math.min(...points.map(point => point.getComponent(axis)))),
            max: [0, 1, 2].map(axis => Math.max(...points.map(point => point.getComponent(axis)))) } };
    const receipt = { schemaVersion: 1, route: 'manual-female-hair', moduleId: id,
        source: { path: 'Assets/Characters/Human/Manual-Fitting/female/' + style.name + '.glb',
            sha256: hash(sourceBytes), bytes: sourceBytes.length, selectedNode: style.node,
            excludedMeshes: source.getRoot().listMeshes().length - 1, nodeTransform: matrix.elements },
        output: { ...measurement, vertices: count }, bindingSha256: record.bindingSha256, pipeline,
        operations: ['Extract only the audited hairstyle; exclude reference body, rig and older hair',
            'Bake manual fit into metre positions; preserve source normals, vertices and triangle indices',
            'Remove texture maps and UVs; apply the existing DNA hair colour and greying',
            'Reuse Head/Neck/Spine2 binding for all three native body LODs'], reviewStatus: 'preview' };
    await writeFile('public' + path, output);
    await writeFile('public' + record.bindingPath, bindingBytes);
    await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
    records.push(record);
    measurements[path] = measurement;
    console.log(JSON.stringify({ name: style.name, sourceBytes: sourceBytes.length,
        runtimeBytes: output.length, vertices: count, triangles: record.triangles }));
}
await writeFile('src/characters/FemaleHairMeasurements.ts',
    '/** Generated by scripts/prepare-female-hair.mjs. */\n' +
    'export const femaleHairRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const femaleHairMeasurements = ' + JSON.stringify(measurements, null, 4) + ';\n');
