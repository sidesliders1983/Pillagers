import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';
import { Box3, Group, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from './load-typescript.mjs';
import { nativeFingerPose, nativeToolGrip } from './characters/native-tool-grip.mjs';

const { MeshyBodyFitAdapter } = loadTypeScript(new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const { meshyHumanAssetIdentity } = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const sources = JSON.parse(await readFile(new URL('./characters/native-combat-equipment.sources.json', import.meta.url), 'utf8'));
const template = JSON.parse(await readFile('public/character-lab/modules/occupation-tools/farmer.binding.json', 'utf8'));
const directory = '/character-lab/modules/native-combat-equipment';
const outputDirectory = 'output/native-combat-equipment-309';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const io = new NodeIO();
await mkdir('public' + directory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
const bodyBytes = await readFile('public' + meshyHumanAssetIdentity[0].path);
assert.equal(hash(bodyBytes), meshyHumanAssetIdentity[0].sha256);
const bodyGLTF = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength), '');
let body;
bodyGLTF.scene.traverse(node => { if (node.isSkinnedMesh) body = node; });
const root = new Group();
root.add(bodyGLTF.scene);
const fit = new MeshyBodyFitAdapter(body, root, bodyGLTF.scene, 0);
fit.refit();
const fingers = nativeFingerPose(bodyGLTF);
const hands = { right: nativeToolGrip(fit, false, fingers), left: nativeToolGrip(fit, true, fingers) };
const records = [], measurements = {}, receipts = [];

function spearGrip(positions, y) {
    const section = [];
    for (let vertex = 0; vertex < positions.getCount(); vertex++) {
        const point = new Vector3(...positions.getElement(vertex, []));
        if (Math.abs(point.y - y) < .04) section.push(point);
    }
    assert.ok(section.length, 'The measured source shaft section must exist');
    const box = new Box3().setFromPoints(section);
    return new Vector3((box.min.x + box.max.x) / 2, y, (box.min.z + box.max.z) / 2);
}

function shieldRotation(hand) {
    const x = new Vector3(...hand.pose.axis);
    const y = new Vector3(0, 1, 0).addScaledVector(x, -x.y).normalize();
    if (x.clone().cross(y).x < 0) x.negate();
    return new Matrix4().makeBasis(x, y, x.clone().cross(y).normalize());
}

for (const source of sources) {
    const original = await readFile(source.path);
    assert.equal(original.length, source.bytes);
    assert.equal(hash(original), source.sha256, 'Do not silently replace a supplied source');
    const document = await io.readBinary(original);
    assert.equal(document.getRoot().listSkins().length, 0);
    assert.equal(document.getRoot().listAnimations().length, 0);
    const nodes = document.getRoot().listNodes().filter(node => node.getMesh());
    assert.equal(nodes.length, 1, 'Review source components before accepting another source layout');
    const node = nodes[0], mesh = node.getMesh(), primitive = mesh.listPrimitives()[0];
    assert.equal(mesh.listPrimitives().length, 1);
    assert.ok(node.getWorldMatrix().every((value, index) => Math.abs(value - new Matrix4().elements[index]) < 1e-7));
    const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
    const indices = primitive.getIndices(), triangles = indices.getCount() / 3;
    assert.equal(triangles, source.triangles);
    const hand = hands[source.hand], joint = source.hand === 'right' ? 24 : 11;
    const socket = source.hand === 'right' ? 'socket_hand_R' : 'socket_hand_L';
    const rotation = source.hand === 'right' ? hand.rotation.clone() : shieldRotation(hand);
    const sourceMin = positions.getMin([]), sourceMax = positions.getMax([]);
    const grip = source.hand === 'right' ? spearGrip(positions, source.gripY) :
        new Vector3((sourceMin[0] + sourceMax[0]) / 2, (sourceMin[1] + sourceMax[1]) / 2, sourceMin[2] + .015);
    const originalGrip = grip.clone();
    const rearMountOffset = source.rearMountOffsetMetres ?? 0;
    assert.ok(Number.isFinite(rearMountOffset) && rearMountOffset >= 0 && rearMountOffset <= .2);
    assert.ok(source.hand === 'left' || rearMountOffset === 0, 'A spear retains its measured shaft grip');
    // The finger cavity lies inward of the wrist. Move the shield itself outside
    // the dorsal forearm surface while keeping that real hand anchor and rig.
    grip.z -= rearMountOffset / source.scale;
    const mount = source.hand === 'left' ? {
        kind: 'forearm-backed-shield', sourceFront: '+Z', rearMountOffsetMetres: rearMountOffset,
        originalSourceGrip: originalGrip.toArray(),
    } : undefined;
    const transform = new Matrix4().makeTranslation(...hand.centre.toArray()).multiply(rotation)
        .multiply(new Matrix4().makeScale(source.scale, source.scale, source.scale))
        .multiply(new Matrix4().makeTranslation(...grip.clone().negate().toArray()));
    const normalTransform = new Matrix3().getNormalMatrix(transform), bounds = new Box3();
    const transformedPositions = new Float32Array(positions.getCount() * 3);
    const transformedNormals = new Float32Array(positions.getCount() * 3);
    const joints = new Uint16Array(positions.getCount() * 4), weights = new Float32Array(positions.getCount() * 4);
    for (let vertex = 0; vertex < positions.getCount(); vertex++) {
        const point = new Vector3(...positions.getElement(vertex, [])).applyMatrix4(transform);
        transformedPositions.set(point.toArray(), vertex * 3);
        transformedNormals.set(new Vector3(...normals.getElement(vertex, [])).applyNormalMatrix(normalTransform).toArray(), vertex * 3);
        joints[vertex * 4] = joint;
        weights[vertex * 4] = 1;
        bounds.expandByPoint(point);
    }
    const outputBuffer = document.getRoot().listBuffers()[0];
    const accessor = (array, type) => document.createAccessor().setArray(array).setType(type).setBuffer(outputBuffer);
    primitive.setAttribute('POSITION', accessor(transformedPositions, 'VEC3'))
        .setAttribute('NORMAL', accessor(transformedNormals, 'VEC3'))
        .setAttribute('JOINTS_0', accessor(joints, 'VEC4')).setAttribute('WEIGHTS_0', accessor(weights, 'VEC4'));
    const meshName = 'Module_native_' + source.name.replaceAll('-', '_');
    node.setName(meshName);
    mesh.setName(meshName);
    const material = primitive.getMaterial();
    const albedo = material.getBaseColorTexture(), pbr = material.getMetallicRoughnessTexture();
    if (albedo) albedo.setImage(await sharp(albedo.getImage()).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    if (pbr) pbr.setImage(await sharp(pbr.getImage()).resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 }).toBuffer()).setMimeType('image/jpeg');
    material.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setDoubleSided(true);
    await document.transform(prune({ keepAttributes: true }));
    const output = await io.writeBinary(document), path = directory + '/' + source.name + '.glb';
    const binding = { ...template, id: source.id, moduleSha256: hash(output),
        recipe: { id: 'supplied-native-combat-prop-grip', version: mount ? 2 : 1, blender: 'not-required' },
        reviewScope: 'Owner-supplied Meshy prop; derived native fitting pending combined owner QA',
        supportedAges: { min: 16, max: 100 },
        materialPolicy: { kind: 'provider-original', provider: 'Meshy', sourceSha256: source.sha256, reviewOnly: true },
        rigidEquipment: { version: 1, parts: [{ mesh: meshName, joint, socket, grip: hand.centre.toArray() }], gripPose: hand.pose },
        precomputedNative: { version: 3, coordinateFrame: 'metre', meshes: [{ mesh: meshName, vertices: positions.getCount() }],
            bodyBindings: template.precomputedNative.bodyBindings, moduleCoverage: [] } };
    const bindingBytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
    const quaternion = new Quaternion().setFromRotationMatrix(rotation).toArray();
    const offset = hand.centre.clone().sub(new Vector3(...fit.socketFrame(socket).position));
    const entry = { id: source.id, item: source.item, label: source.label, path, triangles,
        materials: document.getRoot().listMaterials().length,
        bindingPath: path.replace('.glb', '.binding.json'), bindingSha256: hash(bindingBytes), anchor: socket,
        equipmentBindings: { grip: { position: hand.centre.toArray(), quaternion },
            sockets: { [socket]: { position: offset.toArray(), quaternion } } } };
    measurements[path] = { sha256: hash(output), triangles, materials: entry.materials, bytes: output.length,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    const receipt = { schemaVersion: 1, source, reviewRequired: true, reviewStatus: 'pending-combined-owner-QA',
        output: measurements[path], bindingSha256: entry.bindingSha256, nativeRig: binding.rigSignature,
        bodyBindings: binding.precomputedNative.bodyBindings,
        grip: { localSource: grip.toArray(), nativeTarget: hand.centre.toArray(), transform: transform.elements },
        ...(mount ? { mount } : {}),
        operations: ['Preserve all supplied source triangles, UVs and material colours; no mannequin/body replacement',
            'Resize albedo to 1024 and metallic/roughness to 512; remove normal/occlusion/emissive maps',
            'Bind rigidly to the measured native hand/finger cavity without new bones, body masks or clips',
            ...(mount ? ['Place the shield rear surface outside the dorsal forearm, preserving the native hand anchor'] : [])],
        originalBounds: { min: sourceMin, max: sourceMax }, scale: source.scale };
    await writeFile('public' + path, output);
    await writeFile('public' + entry.bindingPath, bindingBytes);
    await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
    records.push(entry);
    receipts.push(receipt);
    console.log(source.name + ': ' + triangles + ' triangles; ' + output.length + ' bytes; ' + socket);
}
await writeFile('src/characters/NativeCombatEquipmentMeasurements.ts',
    '/** Generated by scripts/prepare-native-combat-equipment.mjs. */\n' +
    'import type { AssetMeasurement } from \'./CharacterAssetMeasurements\';\n' +
    'export const nativeCombatEquipmentRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const nativeCombatEquipmentMeasurements: Record<string, AssetMeasurement> = ' + JSON.stringify(measurements, null, 4) + ';\n');
// Keep the original three-item receipt scoped to #309; metalworking has its own
// reproducibility record rather than rewriting that historical source audit.
for (const [reportDirectory, items] of [
    [outputDirectory, new Set(['woodenSpear', 'woodenShield', 'leatherShield'])],
    ['output/native-combat-equipment-224', new Set(['ironSpear', 'ironShield'])],
]) {
    const report = receipts.filter(receipt => items.has(receipt.source.item));
    if (!report.length) continue;
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(reportDirectory + '/preparation.json', JSON.stringify(report, null, 2) + '\n');
}
