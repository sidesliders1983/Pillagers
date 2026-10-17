import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {Document, NodeIO} from '@gltf-transform/core';
import {Matrix3, Matrix4, Quaternion, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadTypeScript} from '../load-typescript.mjs';

const output = 'output/meshy-outfit-pipeline/pass-009';
const sourcePath = output + '/source/Human-textured.glb';
const sourceBytes = await readFile(sourcePath);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(sourceBytes), 'be5173fa4f3b6e63fa7bc3506b3d61b4def28b7f67477b9a29b5eb527d80f8fe');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({width: 2048, height: 2048, close() {}});
const gltf = await new GLTFLoader().parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset,
    sourceBytes.byteOffset + sourceBytes.byteLength), '');
const model = gltf.scene;
model.updateMatrixWorld(true);
let mesh;
model.traverse(node => {if (node.isSkinnedMesh) mesh = node;});
assert.ok(mesh);
assert.equal(mesh.skeleton.bones.length, 44);
const {meshyNativeRig, meshyRigSignature} = loadTypeScript(
    new URL('../../src/characters/MeshyNativeRig.ts', import.meta.url));
mesh.skeleton.bones.forEach((bone, index) => {
    assert.equal(bone.name, meshyNativeRig[index].name);
    assert.ok(bone.matrixWorld.elements.every((value, channel) =>
        Math.abs(value - meshyNativeRig[index].matrix[channel]) < 1e-5));
});
const bones = new Map(mesh.skeleton.bones.map(bone => [bone.name, bone]));
const baseline = mesh.skeleton.bones.map(bone => ({
    world: bone.matrixWorld.clone(), position: bone.position.toArray(),
    quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray(),
}));
const bonePoint = name => bones.get('mixamorig' + name).getWorldPosition(new Vector3());
function align(name, child, direction, profileOnly = false) {
    const bone = bones.get('mixamorig' + name);
    const before = bonePoint(child).sub(bonePoint(name)).normalize();
    const delta = profileOnly
        ? new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.atan2(-before.z, before.y))
        : new Quaternion().setFromUnitVectors(before, new Vector3(...direction).normalize());
    const world = delta.multiply(bone.getWorldQuaternion(new Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    model.updateMatrixWorld(true);
}
for (const [name, child] of [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'],
    ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End']]) align(name, child, [0, 1, 0], true);
for (const [side, sign] of [['Left', 1]]) {
    const arm = [sign * Math.sin(Math.PI / 9), -Math.cos(Math.PI / 9), 0];
    align(side + 'Arm', side + 'ForeArm', arm);
    align(side + 'ForeArm', side + 'Hand', arm);
    align(side + 'Hand', side + 'HandMiddle1', arm);
    const leg = [sign * Math.sin(8 * Math.PI / 180), -Math.cos(8 * Math.PI / 180), 0];
    align(side + 'UpLeg', side + 'Leg', leg);
    align(side + 'Leg', side + 'Foot', leg);
    const foot = bones.get('mixamorig' + side + 'Foot');
    const rest = baseline[mesh.skeleton.bones.indexOf(foot)].world;
    const rotation = new Quaternion();
    rest.decompose(new Vector3(), rotation, new Vector3());
    foot.quaternion.copy(foot.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
    model.updateMatrixWorld(true);
}
// Mirror the posed skin transform, rather than independently rotating the source's
// differently oriented left/right joints. Native names and inverse binds stay intact.
const reflection = new Matrix4().set(-1, 0, 0, -.0007660388946533203,
    0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
for (const [index, bone] of mesh.skeleton.bones.entries()) {
    const opposite = bone.name.includes('Right') ? bone.name.replace('Right', 'Left')
        : bone.name === 'Bone_046' ? 'Bone_045' : null;
    if (!opposite) continue;
    const left = bones.get(opposite);
    const leftIndex = mesh.skeleton.bones.indexOf(left);
    const leftSkin = left.matrixWorld.clone().multiply(baseline[leftIndex].world.clone().invert());
    const desired = reflection.clone().multiply(leftSkin).multiply(reflection).multiply(baseline[index].world);
    const local = bone.parent.matrixWorld.clone().invert().multiply(desired);
    local.decompose(bone.position, bone.quaternion, bone.scale);
    model.updateMatrixWorld(true);
}
const io = new NodeIO();
const document = await io.readBinary(sourceBytes);
const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
const positions = primitive.getAttribute('POSITION');
const normals = primitive.getAttribute('NORMAL');
const jointAttributes = ['JOINTS_0', 'JOINTS_1'].map(name => primitive.getAttribute(name)).filter(Boolean);
const weightAttributes = ['WEIGHTS_0', 'WEIGHTS_1'].map(name => primitive.getAttribute(name)).filter(Boolean);
function blend(vertex, matrices) {
    const result = new Matrix4();
    result.elements.fill(0);
    let total = 0;
    for (let group = 0; group < jointAttributes.length; group++) {
        const joints = jointAttributes[group].getElement(vertex, []);
        const weights = weightAttributes[group].getElement(vertex, []);
        for (let channel = 0; channel < 4; channel++) {
            total += weights[channel];
            const matrix = matrices[joints[channel]];
            matrix.elements.forEach((value, index) => result.elements[index] += weights[channel] * value);
        }
    }
    assert.ok(Math.abs(total - 1) < .001);
    result.elements.forEach((value, index) => result.elements[index] = value / total);
    return result;
}
const nativeMatrices = mesh.skeleton.bones.map((_, index) =>
    baseline[index].world.clone().multiply(mesh.skeleton.boneInverses[index]));
const posedMatrices = () => mesh.skeleton.bones.map((bone, index) =>
    bone.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[index]));
const sourcePoints = Array.from({length: positions.getCount()}, (_, vertex) =>
    new Vector3().fromArray(positions.getElement(vertex, [])));
const sourceMinimum = Math.min(...sourcePoints.map((point, vertex) =>
    point.clone().applyMatrix4(blend(vertex, nativeMatrices)).y));
let matrices = posedMatrices();
const posedMinimum = Math.min(...sourcePoints.map((point, vertex) =>
    point.clone().applyMatrix4(blend(vertex, matrices)).y));
model.position.y += sourceMinimum - posedMinimum;
model.updateMatrixWorld(true);
matrices = posedMatrices();
let maximumRoundTripMetres = 0;
const posedPoints = sourcePoints.map((point, vertex) => {
    const transform = blend(vertex, matrices);
    const posed = point.clone().applyMatrix4(transform);
    const stored = new Vector3(...new Float32Array(posed.toArray()));
    maximumRoundTripMetres = Math.max(maximumRoundTripMetres,
        stored.clone().applyMatrix4(transform.clone().invert()).distanceTo(point));
    return stored;
});
assert.ok(maximumRoundTripMetres < 1e-6);
const result = new Document();
const buffer = result.createBuffer();
const attribute = (name, values, type) => result.createAccessor(name).setType(type)
    .setArray(values).setBuffer(buffer);
const originalMaterial = primitive.getMaterial();
const texture = originalMaterial.getBaseColorTexture();
const material = result.createMaterial('Original Meshy body reference').setDoubleSided(true)
    .setRoughnessFactor(1).setMetallicFactor(0);
if (texture) material.setBaseColorTexture(result.createTexture('Original body texture')
    .setMimeType(texture.getMimeType()).setImage(texture.getImage()));
const rendered = result.createPrimitive()
    .setAttribute('POSITION', attribute('A-pose positions', new Float32Array(posedPoints.flatMap(p => p.toArray())), 'VEC3'))
    .setAttribute('NORMAL', attribute('A-pose normals', new Float32Array(sourcePoints.flatMap((_, vertex) =>
        new Vector3().fromArray(normals.getElement(vertex, []))
            .applyNormalMatrix(new Matrix3().getNormalMatrix(blend(vertex, matrices))).toArray())), 'VEC3'))
    .setIndices(attribute('Original triangles', new Uint32Array(primitive.getIndices().getArray()), 'SCALAR'))
    .setMaterial(material);
const uv = primitive.getAttribute('TEXCOORD_0');
if (uv) rendered.setAttribute('TEXCOORD_0', attribute('Original UV', new Float32Array(uv.getArray()), 'VEC2'));
result.createScene().addChild(result.createNode('Meshy Human static A20 reference')
    .setMesh(result.createMesh('Reference only').addPrimitive(rendered)));
const posedBytes = await io.writeBinary(result);
await mkdir(output + '/source', {recursive: true});
await writeFile(output + '/source/authoring-a20-002.glb', posedBytes, {flag: 'wx'});
const recipe = {
    kind: 'fisherman-native-authoring-pose/1', source: {path: sourcePath, sha256: hash(sourceBytes)},
    output: {path: output + '/source/authoring-a20-002.glb', sha256: hash(posedBytes)},
    pose: {mode: 'authoring-neutral', animation: null, mixer: false, dnaAdjustments: false,
        armAngleFromDownDegrees: 20, legAngleFromDownDegrees: 8},
    nativeRigSignature: meshyRigSignature, nativeBoneCount: 44,
    maximumRoundTripMetres, geometryEdited: false,
    bindingRequirement: 'Unpose generated clothing through these recorded matrices before binding to the existing native rig.',
    bones: mesh.skeleton.bones.map((bone, index) => ({name: bone.name,
        nativeWorld: baseline[index].world.toArray(), authoringWorld: bone.matrixWorld.toArray(),
        skinMatrix: matrices[index].toArray()})),
};
await writeFile(output + '/source/authoring-a20-002.json', JSON.stringify(recipe, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({pose: recipe.pose, roundTripMetres: maximumRoundTripMetres,
    nativeBoneCount: recipe.nativeBoneCount, sourceSha256: hash(sourceBytes)}));
