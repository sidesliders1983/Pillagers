import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Document, NodeIO} from '@gltf-transform/core';
import sharp from 'sharp';
import {Group, Matrix3, Matrix4, Ray, Vector3, Color} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {loadTypeScript} from './load-typescript.mjs';

const {MeshyBodyFitAdapter, closestSurface} = loadTypeScript(
    new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const {meshyHumanAssetIdentity} = loadTypeScript(
    new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const filename = resolve(process.argv[2] ?? 'Assets/Characters/Human/Manual-Fitting/Long-hair-braided.glb');
const sourceBytes = await readFile(filename);
const hash = data => createHash('sha256').update(data).digest('hex');
const io = new NodeIO();
const source = await io.readBinary(sourceBytes);
assert.equal(source.getRoot().listSkins().length, 0);
assert.equal(source.getRoot().listAnimations().length, 0);
const nodes = source.getRoot().listNodes().filter(node => node.getMesh());
assert.equal(nodes.length, 1);
const node = nodes[0], original = node.getMesh().listPrimitives()[0];
const matrix = new Matrix4().fromArray(node.getWorldMatrix());
const normalMatrix = new Matrix3().getNormalMatrix(matrix);
const inputPositions = original.getAttribute('POSITION');
const inputNormals = original.getAttribute('NORMAL');
const originalPoints = Array.from({length: inputPositions.getCount()}, (_, v) =>
    new Vector3().fromArray(inputPositions.getElement(v, [])).applyMatrix4(matrix));
const texture = original.getMaterial().getBaseColorTexture();
const {data, info} = await sharp(texture.getImage()).removeAlpha().raw().toBuffer({resolveWithObject: true});
const uv = original.getAttribute('TEXCOORD_0');
function sampleColor(vertices) {
    const texel = [0, 0];
    for (const vertex of vertices) uv.getElement(vertex, []).forEach((value, k) => texel[k] += value / vertices.length);
    const x = Math.min(info.width - 1, Math.max(0, Math.floor(texel[0] * info.width)));
    const y = Math.min(info.height - 1, Math.max(0, Math.floor(texel[1] * info.height)));
    return Array.from(data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3));
}
const positions = [], normals = [], indices = [], fixedVertices = [], sourceVertices = [];
const palette = [], split = new Map();
const leatherColor = '#684c33';
const leather = new Color(leatherColor).toArray();
let strapTriangles = 0;
const sourceIndices = original.getIndices().getArray();
for (let face = 0; face < sourceIndices.length; face += 3) {
    const corners = Array.from(sourceIndices.subarray(face, face + 3));
    const y = corners.reduce((sum, v) => sum + originalPoints[v].y / 3, 0);
    const [r, g, b] = sampleColor(corners);
    // The source has one baked material. This measured band plus its atlas colour
    // separates the leather from adjacent hair without recolouring a whole height slice.
    const strap = y >= 1.246 && y <= 1.272 && r < 170 && g < 125 && b < 95;
    if (strap) strapTriangles++;
    for (const sourceVertex of corners) {
        const key = sourceVertex + ':' + strap;
        let vertex = split.get(key);
        if (vertex === undefined) {
            vertex = positions.length / 3;
            split.set(key, vertex);
            positions.push(...originalPoints[sourceVertex].toArray());
            normals.push(...new Vector3().fromArray(inputNormals.getElement(sourceVertex, []))
                .applyNormalMatrix(normalMatrix).toArray());
            palette.push(...(strap ? leather : [1, 1, 1]));
            sourceVertices.push(sourceVertex);
            if (strap) fixedVertices.push(vertex);
        }
        indices.push(vertex);
    }
}
assert.ok(strapTriangles > 50 && strapTriangles < 1500, 'Unexpected leather segmentation');
const count = positions.length / 3;
const document = new Document(), buffer = document.createBuffer();
const accessor = (name, values, type) => document.createAccessor(name)
    .setArray(values).setType(type).setBuffer(buffer);
const primitive = document.createPrimitive()
    .setAttribute('POSITION', accessor('Fitted metre positions', new Float32Array(positions), 'VEC3'))
    .setAttribute('NORMAL', accessor('Source normals', new Float32Array(normals), 'VEC3'))
    .setAttribute('COLOR_0', accessor('DNA hair and fixed leather', new Float32Array(palette), 'VEC3'))
    .setIndices(accessor('Original source triangles', new Uint32Array(indices), 'SCALAR'))
    .setMaterial(document.createMaterial('DNA hair with fixed leather').setBaseColorFactor([1, 1, 1, 1])
        .setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(true));
document.createScene().addChild(document.createNode('Module_manual_braided_hair')
    .setMesh(document.createMesh('Module_manual_braided_hair').addPrimitive(primitive)));
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
const native = adapters[0];
const headJoint = native.nativeSkeleton.bones.findIndex(bone => bone.name === 'mixamorigHead');
const backJoint = native.nativeSkeleton.bones.findIndex(bone => bone.name === 'mixamorigSpine2');
const centerline = [1.48, 1.41, 1.34, 1.26, 1.20, 1.14].map((y, index) => {
    const row = originalPoints.filter(p => Math.abs(p.y - y) < .012 && p.x > 0 && p.z < .025);
    assert.ok(row.length > 0);
    return {name: 'Hair_Braid_' + index, position: [
        row.reduce((sum, p) => sum + p.x / row.length, 0), y,
        row.reduce((sum, p) => sum + p.z / row.length, 0),
    ]};
});
const surface = native.source;
function backZ(x, y) {
    const ray = new Ray(new Vector3(x, y, -2), new Vector3(0, 0, 1));
    const hit = new Vector3();
    let z = Infinity;
    for (let t = 0; t < surface.indices.length; t += 3) {
        const corners = surface.indices.slice(t, t + 3).map(v => new Vector3().fromArray(surface.positions, v * 3));
        if (ray.intersectTriangle(...corners, false, hit)) z = Math.min(z, hit.z);
    }
    return z;
}
let measuredRadius = 0;
for (const point of originalPoints) {
    if (point.y > 1.44 || point.x < -.005 || point.z >= .035) continue;
    let nearest = Infinity;
    for (let i = 1; i < centerline.length; i++) {
        const a = new Vector3(...centerline[i - 1].position), b = new Vector3(...centerline[i].position);
        const edge = b.sub(a);
        const fraction = Math.max(0, Math.min(1, point.clone().sub(a).dot(edge) / edge.lengthSq()));
        nearest = Math.min(nearest, point.distanceTo(a.addScaledVector(edge, fraction)));
    }
    measuredRadius = Math.max(measuredRadius, nearest);
}
// Include the flared tassel, not just the narrow woven section.
const radius = Math.ceil((measuredRadius + .004) * 1000) / 1000, clearance = .016;
const rearProfile = [];
for (let y = 1.1; y <= 1.511; y += .02) {
    const heights = [0, .04, .065].map(x => backZ(x, y));
    assert.ok(heights.some(Number.isFinite), 'Missing complete back section at ' + y);
    rearProfile.push([+y.toFixed(3), Math.min(...heights) - radius - clearance]);
}
const rearAt = y => {
    const next = rearProfile.findIndex(row => row[0] >= y);
    if (next <= 0) return rearProfile[Math.max(0, next)][1];
    const a = rearProfile[next - 1], b = rearProfile[next];
    return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
};
const positionKey = point => point.toArray().map(value => Math.round(value * 1e6)).join(',');
const strapContacts = new Set(fixedVertices.map(vertex => positionKey(originalPoints[sourceVertices[vertex]])));
const weights = sourceVertices.map(sourceVertex => {
    if (strapContacts.has(positionKey(originalPoints[sourceVertex]))) {
        return {joints: [44 + 3, 0, 0, 0], weights: [1, 0, 0, 0]};
    }
    const point = originalPoints[sourceVertex];
    const isBraid = point.y < 1.50 && point.z < .035 && point.x > -.005;
    if (!isBraid) return {joints: [headJoint, 0, 0, 0], weights: [1, 0, 0, 0]};
    const blend = Math.max(0, Math.min(1, (1.50 - point.y) / .06));
    const alpha = blend * blend * (3 - 2 * blend);
    let segment = centerline.findIndex(bone => bone.position[1] < point.y) - 1;
    segment = Math.max(0, Math.min(centerline.length - 2, segment < 0 ? centerline.length - 2 : segment));
    if (point.y >= centerline[0].position[1]) segment = 0;
    const a = centerline[segment].position[1], b = centerline[segment + 1].position[1];
    const fraction = Math.max(0, Math.min(1, (a - point.y) / (a - b)));
    return {joints: [headJoint, 44 + segment, 45 + segment, 0],
        weights: [1 - alpha, alpha * (1 - fraction), alpha * fraction, 0]};
});
const id = 'hair/manual-long-braided';
const binding = {version: 'pillagers-fit/0.2', id, moduleSha256: hash(bytes),
    rigSignature: native.body.rigSignature, recipe: {id: 'manual-braided-hair', version: 1, blender: 'not-required'},
    coordinateFrame: {up: '+Y', front: '+Z', unit: 'metre', origin: 'Meshy source bind'},
    construction: 'intentional-asymmetry', skinning: 'secondary-hair-chain',
    supportedAges: {min: 18, max: 100},
    hairRig: {version: 1, headJoint, backJoint, bones: centerline, rearProfile,
        radius, clearance, fixedColor: {color: leatherColor, vertices: fixedVertices}},
    lods: {}, regions: {hair: {contact: [], free: Array.from({length: count}, (_, i) => i), boundary: []}},
    seams: [], garmentFrames: {}};
for (const fit of adapters) {
    const anchors = Array.from({length: count}, (_, vertex) => closestSurface(fit.source,
        new Vector3().fromArray(positions, vertex * 3), ['HEAD', 'NECK', 'TORSO_UPPER', 'TORSO_LOWER']));
    binding.lods[fit.body.lod] = {bodySha256: fit.body.sha256, topology: fit.topologySignature,
        anchors, vertexAnchors: Array.from({length: count}, (_, i) => i), weights, coverageTriangles: []};
}
const bindingBytes = Buffer.from(JSON.stringify(binding) + '\n');
const path = '/character-lab/modules/manual-braided-hair/braided.glb';
await mkdir('public/character-lab/modules/manual-braided-hair', {recursive: true});
await writeFile('public' + path, bytes);
await writeFile('public' + path.replace('.glb', '.binding.json'), bindingBytes);
const record = {id, path, bindingPath: path.replace('.glb', '.binding.json'), bindingSha256: hash(bindingBytes),
    triangles: indices.length / 3, materials: 1};
const measurement = {sha256: hash(bytes), triangles: record.triangles, materials: 1, bytes: bytes.length,
    bounds: {min: [0, 1, 2].map(k => Math.min(...originalPoints.map(p => p.getComponent(k)))),
        max: [0, 1, 2].map(k => Math.max(...originalPoints.map(p => p.getComponent(k))))}};
const receipt = {schemaVersion: 1, route: 'manual-braided-hair', source: {
    path: 'Assets/Characters/Human/Manual-Fitting/Long-hair-braided.glb', sha256: hash(sourceBytes),
    nodeTransform: matrix.elements}, output: measurement, bindingSha256: record.bindingSha256,
    pipeline: {path: 'scripts/prepare-braided-hair.mjs', sha256: hash(await readFile(new URL(import.meta.url)))},
    material: {hair: 'DNA colour', leather: leatherColor, strapTriangles,
        segmentation: {minimumY: 1.246, maximumY: 1.272, maximumAtlasRGB: [170, 125, 95]}},
    rig: binding.hairRig, sourceVertices, reviewStatus: 'preview'};
await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
await writeFile('src/characters/BraidedHairMeasurements.ts',
    '/** Generated by scripts/prepare-braided-hair.mjs. */\n' +
    'export const braidedHairRecord = ' + JSON.stringify(record, null, 4) + ' as const;\n' +
    'export const braidedHairMeasurement = ' + JSON.stringify(measurement, null, 4) + ';\n');
console.log(JSON.stringify({triangles: record.triangles, vertices: count, bytes: bytes.length,
    strapTriangles, fixedVertices: fixedVertices.length, measuredRadius, radius, centerline,
    draped: centerline.map(bone => [bone.position[0], bone.position[1], rearAt(bone.position[1])])}));
