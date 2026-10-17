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
const sources = JSON.parse(await readFile(new URL('./characters/occupation-tools.sources.json', import.meta.url), 'utf8'));
const template = JSON.parse(await readFile('public/character-lab/modules/occupation-hats/farmer.binding.json', 'utf8'));
const directory = '/character-lab/modules/occupation-tools', io = new NodeIO();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir('public' + directory, { recursive: true });
await mkdir('output/occupation-tools-001', { recursive: true });
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() { } });
const bodyBytes = await readFile('public' + meshyHumanAssetIdentity[0].path);
assert.equal(hash(bodyBytes), meshyHumanAssetIdentity[0].sha256);
const bodyGLTF = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength), '');
let body;
bodyGLTF.scene.traverse(node => {
    if (node.isSkinnedMesh)
        body = node;
});
const root = new Group();
root.add(bodyGLTF.scene);
const fit = new MeshyBodyFitAdapter(body, root, bodyGLTF.scene, 0);
fit.refit();
const fingerPose = nativeFingerPose(bodyGLTF);
const rightHand = nativeToolGrip(fit, false, fingerPose), leftHand = nativeToolGrip(fit, true, fingerPose);
const rightGrip = rightHand.centre, leftGrip = leftHand.centre;
await writeFile('output/occupation-tools-001/palm-measurements.json', JSON.stringify({ right: { centre: rightGrip, pose: rightHand.diagnostics }, left: { centre: leftGrip, pose: leftHand.diagnostics } }, null, 2) + '\n');
const records = [], measurements = {}, proofs = [];
const carryRotation = rightHand.rotation;
const identity = new Matrix4();
function gripSection(primitives, y, predicate = () => true) {
    const points = primitives.flatMap(p => {
        const a = p.getAttribute('POSITION'), values = [];
        for (let i = 0; i < a.getCount(); i++) {
            const v = a.getElement(i, []);
            if (Math.abs(v[1] - y) < .026 && predicate(v))
                values.push(new Vector3(...v));
        }
        return values;
    });
    assert.ok(points.length > 0, 'Grip section has no source vertices');
    const box = new Box3().setFromPoints(points);
    return new Vector3((box.min.x + box.max.x) / 2, y, (box.min.z + box.max.z) / 2);
}
function rodDeform(point) {
    const y = point.y, t = Math.max(0, Math.min(1, (y - .45) / .35));
    const width = .55 + .45 * t * t * (3 - 2 * t), centre = .83 - .75 * y;
    return new Vector3(centre + (point.x - centre) * width, y, point.z * width);
}
function rodNormal(normal, point) {
    const t = Math.max(0, Math.min(1, (point.y - .45) / .35));
    const width = .55 + .45 * t * t * (3 - 2 * t);
    const derivative = point.y > .45 && point.y < .80 ? .45 * 6 * t * (1 - t) / .35 : 0;
    const centre = .83 - .75 * point.y;
    const jacobian = new Matrix4().set(width, -.75 * (1 - width) + (point.x - centre) * derivative, 0, 0, 0, 1, 0, 0, 0, point.z * derivative, width, 0, 0, 0, 0, 1);
    return normal.applyNormalMatrix(new Matrix3().getNormalMatrix(jacobian));
}
function handleDeform(point, grip, factor, start, end, symmetric = false) {
    const distance = symmetric ? Math.abs(point.y) : point.y;
    const t = Math.max(0, Math.min(1, (distance - start) / (end - start)));
    const width = factor + (1 - factor) * t * t * (3 - 2 * t);
    return new Vector3(grip.x + (point.x - grip.x) * width, point.y, grip.z + (point.z - grip.z) * width);
}
function deformedNormal(normal, point, deform) {
    const columns = [], step = 1e-5;
    for (let axis = 0; axis < 3; axis++) {
        const plus = point.clone(), minus = point.clone();
        plus.setComponent(axis, plus.getComponent(axis) + step);
        minus.setComponent(axis, minus.getComponent(axis) - step);
        columns.push(deform(plus).sub(deform(minus)).multiplyScalar(.5 / step));
    }
    const jacobian = new Matrix4().makeBasis(...columns);
    return normal.applyNormalMatrix(new Matrix3().getNormalMatrix(jacobian));
}
for (const source of sources) {
    const original = await readFile(source.path);
    assert.equal(hash(original), source.sha256);
    const doc = await io.readBinary(original);
    assert.equal(doc.getRoot().listSkins().length, 0);
    assert.equal(doc.getRoot().listAnimations().length, 0);
    const baseTextures = new Set(), pbrTextures = new Set();
    for (const mat of doc.getRoot().listMaterials()) {
        if (mat.getBaseColorTexture())
            baseTextures.add(mat.getBaseColorTexture());
        if (mat.getMetallicRoughnessTexture())
            pbrTextures.add(mat.getMetallicRoughnessTexture());
        mat.setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setDoubleSided(true);
    }
    for (const tex of baseTextures)
        tex.setImage(await sharp(tex.getImage()).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    for (const tex of pbrTextures)
        tex.setImage(await sharp(tex.getImage()).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).setMimeType('image/jpeg');
    const nodes = doc.getRoot().listNodes().filter(n => n.getMesh());
    assert.ok(nodes.every(n => n.getWorldMatrix().every((v, i) => Math.abs(v - identity.elements[i]) < 1e-7)), 'Source transforms must be inspected before baking');
    const originals = nodes.flatMap(n => n.getMesh().listPrimitives());
    const outputBuffer = doc.createBuffer(), bounds = new Box3(), meshBindings = [], partReceipts = [];
    const attribute = (array, type) => doc.createAccessor().setArray(array).setType(type).setBuffer(outputBuffer);
    let totalTriangles = 0, totalVertices = 0, mainGrip, mainRotation, mainSocket, bowData;
    function addPart(name, primitive, selected, transform, joint, socket, grip, deform, normalDeform) {
        const pos = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), uv = primitive.getAttribute('TEXCOORD_0');
        assert.ok(normal && uv);
        const used = [...new Set(selected)], map = new Map(used.map((vertex, i) => [vertex, i]));
        const positions = new Float32Array(used.length * 3), normals = new Float32Array(used.length * 3), uvs = new Float32Array(used.length * 2);
        const nm = new Matrix3().getNormalMatrix(transform), localPoints = [];
        used.forEach((vertex, i) => {
            const originalPoint = new Vector3(...pos.getElement(vertex, []));
            localPoints.push(originalPoint);
            const point = (deform ? deform(originalPoint) : originalPoint.clone()).applyMatrix4(transform);
            const n = new Vector3(...normal.getElement(vertex, []));
            if (normalDeform)
                normalDeform(n, originalPoint);
            else if (deform)
                deformedNormal(n, originalPoint, deform);
            positions.set(point.toArray(), i * 3);
            normals.set(n.applyNormalMatrix(nm).toArray(), i * 3);
            uvs.set(uv.getElement(vertex, []), i * 2);
            bounds.expandByPoint(point);
        });
        const indices = new Uint32Array(selected.map(vertex => map.get(vertex))), joints = new Uint16Array(used.length * 4), weights = new Float32Array(used.length * 4);
        for (let i = 0; i < used.length; i++) {
            joints[i * 4] = joint;
            weights[i * 4] = 1;
        }
        const geometry = doc.createPrimitive().setMaterial(primitive.getMaterial())
            .setAttribute('POSITION', attribute(positions, 'VEC3')).setAttribute('NORMAL', attribute(normals, 'VEC3'))
            .setAttribute('TEXCOORD_0', attribute(uvs, 'VEC2')).setAttribute('JOINTS_0', attribute(joints, 'VEC4'))
            .setAttribute('WEIGHTS_0', attribute(weights, 'VEC4')).setIndices(attribute(indices, 'SCALAR'));
        doc.getRoot().listScenes()[0].addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(geometry)));
        meshBindings.push({ mesh: name, joint, socket, grip: grip.toArray() });
        partReceipts.push({ mesh: name, triangles: indices.length / 3, vertices: used.length, joint, socket, grip: grip.toArray(), transform: transform.elements });
        totalTriangles += indices.length / 3;
        totalVertices += used.length;
        return localPoints;
    }
    for (const [index, primitive] of originals.entries()) {
        const indices = Array.from(primitive.getIndices().getArray());
        if (source.occupation === 'hunter') {
            const pos = primitive.getAttribute('POSITION'), bow = [], quiver = [];
            for (let i = 0; i < indices.length; i += 3) {
                const tri = indices.slice(i, i + 3), sides = tri.map(v => pos.getElement(v, [])[0] < 0);
                assert.ok(sides.every(v => v === sides[0]), 'Bow/quiver split must not cut any source triangle');
                (sides[0] ? bow : quiver).push(...tri);
            }
            const grip = gripSection([primitive], 0, p => p[0] < 0), rotation = leftHand.rotation.clone().multiply(new Matrix4().makeRotationY(Math.PI));
            const transform = new Matrix4().makeTranslation(...leftGrip.toArray()).multiply(rotation)
                .multiply(new Matrix4().makeScale(.65, .65, .65)).multiply(new Matrix4().makeTranslation(...grip.clone().negate().toArray()));
            const bowDeform = point => handleDeform(point, grip, .55, .12, .30, true);
            const points = addPart('Module_tool_hunter_bow_' + index, primitive, bow, transform, 11, 'socket_hand_L', leftGrip, bowDeform);
            const box = new Box3().setFromPoints(points);
            const tip = y => { const close = points.filter(p => Math.abs(p.y - y) < .008); return close.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / close.length); };
            bowData = { a: tip(box.min.y).applyMatrix4(transform), b: tip(box.max.y).applyMatrix4(transform) };
            const qPoints = [...new Set(quiver)].map(v => new Vector3(...pos.getElement(v, [])));
            const qBox = new Box3().setFromPoints(qPoints), qCentre = qBox.getCenter(new Vector3());
            const scale = .64 / qBox.getSize(new Vector3()).y, qGrip = new Vector3(-.155, 1.235, -.170);
            const qTransform = new Matrix4().makeTranslation(...qGrip.toArray()).multiply(new Matrix4().makeRotationZ(.22))
                .multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(new Matrix4().makeTranslation(...qCentre.clone().negate().toArray()));
            addPart('Module_tool_hunter_quiver_' + index, primitive, quiver, qTransform, 3, 'socket_back', qGrip);
            mainGrip = leftGrip;
            mainRotation = rotation;
            mainSocket = 'socket_hand_L';
        }
        else {
            const farmer = source.occupation === 'farmer', fisher = source.occupation === 'fisher';
            const grip = gripSection(originals, fisher ? .25 : farmer ? .08 : .05);
            const rotation = fisher ? carryRotation.clone().multiply(new Matrix4().makeRotationZ(-Math.atan(.75))) : carryRotation, scale = fisher ? .60 : farmer ? 1 : 1.75;
            const authoredGrip = fisher ? rodDeform(grip) : grip;
            const transform = new Matrix4().makeTranslation(...rightGrip.toArray()).multiply(rotation)
                .multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(new Matrix4().makeTranslation(...authoredGrip.clone().negate().toArray()));
            const deform = fisher ? rodDeform : point => handleDeform(point, grip, farmer ? .80 : .70, farmer ? .12 : .10, farmer ? .18 : .14);
            addPart('Module_tool_' + source.occupation + '_' + index, primitive, indices, transform, 24, 'socket_hand_R', rightGrip, deform, fisher ? rodNormal : undefined);
            mainGrip = rightGrip;
            mainRotation = rotation;
            mainSocket = 'socket_hand_R';
        }
    }
    if (bowData) {
        // The supplied bow has no string. Add one simple eight-sided linen cord, not another rig.
        const { a, b } = bowData, axis = b.clone().sub(a).normalize(), u = new Vector3(0, 0, 1).cross(axis).normalize(), v = axis.clone().cross(u).normalize();
        const p = [], n = [], uv = [], idx = [], j = [], w = [], sides = 8, radius = .0014;
        for (let end = 0; end < 2; end++)
            for (let i = 0; i < sides; i++) {
                const angle = i / sides * Math.PI * 2, normal = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
                const point = (end ? b : a).clone().addScaledVector(normal, radius);
                p.push(...point.toArray());
                n.push(...normal.toArray());
                uv.push(i / sides, end);
                j.push(11, 0, 0, 0);
                w.push(1, 0, 0, 0);
                bounds.expandByPoint(point);
            }
        for (let i = 0; i < sides; i++) {
            const next = (i + 1) % sides;
            idx.push(i, next, i + sides, next, next + sides, i + sides);
        }
        const mat = doc.createMaterial('Authored linen bowstring').setBaseColorFactor([.63, .55, .40, 1]).setRoughnessFactor(1).setMetallicFactor(0).setDoubleSided(true);
        const primitive = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', attribute(new Float32Array(p), 'VEC3'))
            .setAttribute('NORMAL', attribute(new Float32Array(n), 'VEC3')).setAttribute('TEXCOORD_0', attribute(new Float32Array(uv), 'VEC2'))
            .setAttribute('JOINTS_0', attribute(new Uint16Array(j), 'VEC4')).setAttribute('WEIGHTS_0', attribute(new Float32Array(w), 'VEC4'))
            .setIndices(attribute(new Uint32Array(idx), 'SCALAR'));
        const name = 'Module_tool_hunter_string';
        doc.getRoot().listScenes()[0].addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));
        meshBindings.push({ mesh: name, joint: 11, socket: 'socket_hand_L', grip: leftGrip.toArray() });
        partReceipts.push({ mesh: name, triangles: idx.length / 3, vertices: p.length / 3, joint: 11, socket: 'socket_hand_L', authored: 'linen cord between original bow tips' });
        totalTriangles += idx.length / 3;
        totalVertices += p.length / 3;
    }
    assert.equal(totalTriangles, source.triangles + (source.occupation === 'hunter' ? 16 : 0));
    nodes.forEach(node => node.dispose());
    await doc.transform(prune({ keepAttributes: true }));
    const output = await io.writeBinary(doc), path = directory + '/' + source.occupation + '.glb', id = 'equipment/occupation-' + source.occupation;
    const binding = { ...template, id, moduleSha256: hash(output), skinning: 'rigid-native-equipment',
        recipe: { id: 'occupation-tool-native-grip', version: 2, blender: 'not-required' },
        reviewScope: 'Supplied carried tool; exact native hand/back bind, neutral and Walking/Idle review',
        materialPolicy: { kind: 'provider-original', provider: 'Meshy', sourceSha256: source.sha256, reviewOnly: true },
        rigidEquipment: { version: 1, parts: meshBindings, gripPose: source.occupation === 'hunter' ? leftHand.pose : rightHand.pose },
        precomputedNative: { version: 3, coordinateFrame: 'metre', meshes: partReceipts.map(p => ({ mesh: p.mesh, vertices: p.vertices })),
            bodyBindings: template.precomputedNative.bodyBindings, moduleCoverage: [] } };
    delete binding.headwearFit;
    const bindingBytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
    const quaternion = new Quaternion().setFromRotationMatrix(mainRotation).toArray();
    const socketPosition = fit.socketFrame(mainSocket).position;
    const socketOffset = mainGrip.clone().sub(new Vector3(...socketPosition)).toArray();
    const entry = { id, occupation: source.occupation, label: { farmer: 'Farmer · sickle', fisher: 'Fisher · fishing rod', hunter: 'Hunter · bow and quiver', smith: 'Smith · hammer' }[source.occupation],
        path, triangles: totalTriangles, materials: doc.getRoot().listMaterials().length,
        bindingPath: path.replace('.glb', '.binding.json'), bindingSha256: hash(bindingBytes), anchor: mainSocket,
        equipmentBindings: { grip: { position: mainGrip.toArray(), quaternion }, sockets: { [mainSocket]: { position: socketOffset, quaternion } } } };
    await writeFile('public' + path, output);
    await writeFile('public' + entry.bindingPath, bindingBytes);
    measurements[path] = { sha256: hash(output), triangles: totalTriangles, materials: entry.materials, bytes: output.length, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
    const receipt = { schemaVersion: 1, source, output: measurements[path], bindingSha256: entry.bindingSha256, parts: partReceipts,
        nativeRig: binding.rigSignature, bodyBindings: binding.precomputedNative.bodyBindings,
        operations: ['Preserve supplied source triangles and UVs; compact separated render corners',
            'Resize albedo to 1024 and metal/roughness map to 512; remove normal and occlusion maps',
            source.occupation === 'hunter' ? "Separate existing bow and quiver without cutting faces; add a 16-triangle linen bowstring and narrow the bow grip" :
                source.occupation === 'fisher' ? 'Narrow the lower rod grip locally; retain the upper rod, line and hook proportions' : source.occupation === 'farmer' ? "Narrow the sickle handle locally and align its shaft through the authored finger cavity" : "Narrow the hammer handle locally and align its shaft through the authored finger cavity",
            'Use the unchanged native hand and back joints, with no copied bones, clips or body mask'] };
    await writeFile('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
    records.push(entry);
    proofs.push(receipt);
    console.log(source.occupation + ': ' + totalTriangles + ' triangles; ' + output.length + ' bytes; ' + meshBindings.map(p => p.socket).join(', '));
}
await writeFile('src/characters/OccupationToolMeasurements.ts', '/** Generated by scripts/prepare-occupation-tools.mjs. */\nimport type {AssetMeasurement} from \'./CharacterAssetMeasurements\';\n' +
    'export const occupationToolRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const occupationToolMeasurements: Record<string, AssetMeasurement> = ' + JSON.stringify(measurements, null, 4) + ';\n');
await writeFile('output/occupation-tools-001/preparation.json', JSON.stringify(proofs, null, 2) + '\n');
