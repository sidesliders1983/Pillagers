import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { Matrix3, Matrix4, Vector3, Box3 } from 'three';
import sharp from 'sharp';
import { createSurfaceQuery } from './outfit-surface-binding.mjs';
import { createFishermanUpperFit } from './fisherman-upper-fit.mjs';
const pass = 'output/meshy-outfit-pipeline/pass-009';
const revision = process.argv[2] ?? 'native-012';
const tunicSourcePart = process.argv[3] ?? 'tunic-002';
assert.ok(['tunic-002', 'tunic-003'].includes(tunicSourcePart));
const tunicOnly = tunicSourcePart === 'tunic-003';
const inputManifestPath = tunicOnly ? 'conversion-inputs-005.json' : 'conversion-inputs.json';
const approvalPath = tunicOnly ? 'image-approval-005.json' : 'image-approval.json';
assert.match(revision, /^native-\d{3}$/);
const output = 'public/character-lab/candidates/meshy-fisherman-009';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = JSON.parse(await readFile(pass + '/' + inputManifestPath));
const recipe = JSON.parse(await readFile(pass + '/source/authoring-a20-002.json'));
assert.equal(recipe.nativeBoneCount, 44);
assert.equal(hash(await readFile(recipe.source.path)), recipe.source.sha256);
assert.equal(hash(await readFile(recipe.output.path)), recipe.output.sha256);
const approval = JSON.parse(await readFile(pass + '/' + approvalPath));
assert.equal(approval.decision, 'approved');
assert.equal(approval.inputManifestSha256, hash(await readFile(pass + '/' + inputManifestPath)));
const matrices = recipe.bones.map(bone => new Matrix4().fromArray(bone.skinMatrix));
await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const original = await io.read(pass + '/source/Human-textured.glb');
const posed = await io.read(pass + '/source/authoring-a20-002.glb');
const native = original.getRoot().listMeshes()[0].listPrimitives()[0];
const authoring = posed.getRoot().listMeshes()[0].listPrimitives()[0];
const bodyPositions = Array.from(authoring.getAttribute('POSITION').getArray());
const bodyIndices = Array.from(authoring.getIndices().getArray());
const sourceJoints = ['JOINTS_0', 'JOINTS_1'].map(name => native.getAttribute(name).getArray());
const sourceWeights = ['WEIGHTS_0', 'WEIGHTS_1'].map(name => native.getAttribute(name).getArray());
const template = JSON.parse(await readFile('public/character-lab/candidates/meshy-additional-005/long-skirt.binding.json'));
function makeQuery(part) {
    const indices = [];
    for (let index = 0; index < bodyIndices.length; index += 3) {
        const vertices = bodyIndices.slice(index, index + 3);
        const points = vertices.map(vertex => new Vector3().fromArray(bodyPositions, vertex * 3));
        const included = part === 'tunic' ? points.every(point => point.y > .72 && point.y < 1.48)
            : part === 'trousers' ? points.every(point => point.y < 1.05)
                : points.every(point => point.x > 0 && point.y < .27);
        if (included)
            indices.push(...vertices);
    }
    const surface = { positions: bodyPositions, indices, triangles: indices.length / 3 };
    return { surface, query: createSurfaceQuery(surface) };
}
function transfer(surface, anchor, part, point, sector) {
    const smooth = (minimum, maximum, value) => {
        const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
        return t * t * (3 - 2 * t);
    };
    const bone = index => new Vector3().setFromMatrixPosition(new Matrix4().fromArray(recipe.bones[index].authoringWorld));
    const mixture = new Map();
    const add = (joint, weight) => mixture.set(joint, (mixture.get(joint) ?? 0) + weight);
    if (part === 'shoe') {
        const shin = smooth(.13, .20, point.y);
        const toe = smooth(.12, .22, point.z) * .6;
        add(35, shin);
        add(36, (1 - shin) * (1 - toe));
        add(37, (1 - shin) * toe);
    }
    else if (part === 'trousers') {
        const hip = smooth(.80, .95, point.y);
        const left = smooth(-.04, .04, point.x);
        add(0, hip);
        for (const [side, amount] of [[34, left], [39, 1 - left]]) {
            const kneeY = bone(side + 1).y;
            const shin = 1 - smooth(kneeY - .09, kneeY + .09, point.y);
            add(side, (1 - hip) * amount * (1 - shin));
            add(side + 1, (1 - hip) * amount * shin);
        }
    }
    else {
        const waist = smooth(.85, 1.10, point.y);
        const chest = smooth(1.10, 1.29, point.y);
        const neck = smooth(1.365, 1.43, point.y)
            * (1 - smooth(.075, .13, Math.abs(point.x)));
        const arm = point.x >= 0 ? [9, 10, 11] : [22, 23, 24];
        const shoulder = bone(arm[0]), elbow = bone(arm[1]), wrist = bone(arm[2]);
        const axis = elbow.clone().sub(shoulder).normalize();
        const axial = point.clone().sub(shoulder).dot(axis);
        const elbowAt = shoulder.distanceTo(elbow), wristAt = shoulder.distanceTo(wrist);
        const forearm = smooth(elbowAt - .09, elbowAt + .09, axial);
        const hand = smooth(wristAt - .015, wristAt + .045, axial);
        // The boundary follows the empty space between torso and sleeve. A fixed X
        // threshold would incorrectly attach the flared hem to an arm.
        const armX = Math.abs(shoulder.x) + Math.max(0, shoulder.y - point.y) * Math.tan(Math.PI / 9);
        const centre = (.18 + armX) / 2;
        const transition = .050 + .020 * smooth(1.20, 1.40, point.y);
        const geometricSleeve = smooth(centre - transition, centre + transition, Math.abs(point.x));
        const sectorBlend = smooth(1.02, 1.15, point.y);
        const sleeve = sector === undefined ? geometricSleeve
            : Math.abs(sector) * (1 - sectorBlend) + geometricSleeve * sectorBlend;
        const hem = 1 - smooth(.80, .95, point.y);
        const leftHem = smooth(-.04, .04, point.x);
        add(0, (1 - sleeve) * (1 - waist) * (1 - hem));
        add(34, (1 - sleeve) * hem * leftHem);
        add(39, (1 - sleeve) * hem * (1 - leftHem));
        add(1, (1 - sleeve) * waist * (1 - chest));
        add(3, (1 - sleeve) * waist * chest * (1 - neck));
        add(4, (1 - sleeve) * waist * chest * neck);
        add(arm[0], sleeve * (1 - forearm));
        add(arm[1], sleeve * forearm * (1 - hand));
        add(arm[2], sleeve * forearm * hand);
    }
    const full = [...mixture].filter(([, weight]) => weight > 1e-8).sort((a, b) => b[1] - a[1]);
    const kept = full.slice(0, 4), sum = kept.reduce((total, [, weight]) => total + weight, 0);
    return { joints: Array.from({ length: 4 }, (_, i) => kept[i]?.[0] ?? 0),
        weights: Array.from({ length: 4 }, (_, i) => (kept[i]?.[1] ?? 0) / sum) };
}
function sleeveSectors(primitive) {
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices().getArray();
    const parent = Array.from({ length: positions.getCount() }, (_, i) => i);
    const keys = new Map();
    const find = i => parent[i] === i ? i : parent[i] = find(parent[i]);
    const union = (a, b) => { parent[find(a)] = find(b); };
    for (let i = 0; i < positions.getCount(); i++) {
        const point = positions.getElement(i, []);
        if (point[1] >= 1.15)
            continue;
        const key = point.map(value => Math.round(value * 1e5)).join(',');
        if (keys.has(key))
            union(i, keys.get(key));
        else
            keys.set(key, i);
    }
    for (let i = 0; i < indices.length; i += 3) {
        const face = Array.from(indices.subarray(i, i + 3))
            .filter(vertex => positions.getElement(vertex, [])[1] < 1.15);
        for (let j = 1; j < face.length; j++)
            union(face[0], face[j]);
    }
    const groups = new Map();
    for (let i = 0; i < positions.getCount(); i++) {
        const [x, y] = positions.getElement(i, []);
        if (y >= 1.15)
            continue;
        const id = find(i);
        if (!groups.has(id))
            groups.set(id, { n: 0, x: 0 });
        groups.get(id).n++;
        groups.get(id).x += x;
    }
    const major = [...groups].filter(([, group]) => group.n > 100);
    assert.ok(major.length === 3 || major.length === 4, 'Expected front/back torso surfaces and two separated sleeves.');
    const labels = new Map(major.map(([id, group]) => [id,
        group.x / group.n > .15 ? 1 : group.x / group.n < -.15 ? -1 : 0]));
    assert.deepEqual([...new Set(labels.values())].sort(), [-1, 0, 1], 'Both sleeves and the torso must remain identifiable.');
    return Array.from({ length: positions.getCount() }, (_, vertex) => positions.getElement(vertex, [])[1] < 1.15 ? labels.get(find(vertex)) : undefined);
}
function blend(joints, weights) {
    const matrix = new Matrix4();
    matrix.elements.fill(0);
    for (let channel = 0; channel < 4; channel++) {
        const source = matrices[joints[channel]].elements;
        for (let element = 0; element < 16; element++) {
            matrix.elements[element] += source[element] * weights[channel];
        }
    }
    assert.ok(Math.abs(matrix.determinant()) > 1e-5);
    return matrix;
}
async function bounds(part, view) {
    const record = inputs.records.find(record => record.part === part && record.view === view);
    const bytes = await readFile(pass + '/' + record.path);
    assert.equal(hash(bytes), record.sha256);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const min = [Infinity, Infinity], max = [-Infinity, -Infinity];
    for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * 4 + 3] < 128)
                continue;
            min[0] = Math.min(min[0], x);
            max[0] = Math.max(max[0], x + 1);
            min[1] = Math.min(min[1], y);
            max[1] = Math.max(max[1], y + 1);
        }
    const scale = record.frame.frameMetres / 1024;
    const center = record.frame.projectedCenter;
    return { lo: center + (min[0] - 512) * scale, hi: center + (max[0] - 512) * scale,
        bottom: record.frame.centerY + (512 - max[1]) * scale,
        top: record.frame.centerY + (512 - min[1]) * scale,
        cameraTarget: record.frame.cameraTarget };
}
function compact(document, primitive, target) {
    const positions = primitive.getAttribute('POSITION').getArray();
    const indices = Uint32Array.from(primitive.getIndices().getArray());
    const [reduced, error] = MeshoptSimplifier.simplify(indices, positions, 3, Math.min(indices.length, target * 3), .003, ['LockBorder']);
    const retained = [...new Set(reduced)].sort((a, b) => a - b);
    const mapping = new Map(retained.map((original, index) => [original, index]));
    const buffer = document.getRoot().listBuffers()[0];
    for (const semantic of primitive.listSemantics()) {
        const source = primitive.getAttribute(semantic), raw = source.getArray();
        const width = source.getElementSize();
        const array = new raw.constructor(retained.length * width);
        retained.forEach((original, index) => array.set(raw.subarray(original * width, (original + 1) * width), index * width));
        primitive.setAttribute(semantic, document.createAccessor().setType(source.getType())
            .setNormalized(source.getNormalized()).setArray(array).setBuffer(buffer));
    }
    primitive.setIndices(document.createAccessor().setType('SCALAR')
        .setArray(Uint32Array.from(reduced, original => mapping.get(original))).setBuffer(buffer));
    return { before: indices.length / 3, after: reduced.length / 3, error };
}
const rejections = JSON.parse(await readFile(pass + '/source-rejections.json'));
const selectedSource = JSON.parse(await readFile(pass + '/meshy/' + tunicSourcePart + '/download/provenance.json'));
assert.ok(!rejections.rejected.some(record => record.sha256 === selectedSource.sha256), 'The selected tunic source was rejected for neck and shoulder fit. New approved inputs and a new source are required.');
await mkdir(output, { recursive: true });
await mkdir(pass + '/' + revision);
const reports = [], measurements = {}, records = [], pendingPublication = [];
if (tunicOnly) {
    const { loadTypeScript } = await import('../load-typescript.mjs');
    const existing = loadTypeScript(new URL('../../src/characters/FishermanOutfitMeasurements.ts', import.meta.url));
    Object.assign(measurements, existing.fishermanOutfitMeasurements);
    records.push(...existing.fishermanOutfitRecords.filter(record => record.slot !== 'upper'));
    for (const record of records) {
        assert.equal(hash(await readFile('public' + record.path)), measurements[record.path].sha256);
        assert.equal(hash(await readFile('public' + record.bindingPath)), record.bindingSha256);
    }
}
const upperFit = await createFishermanUpperFit(recipe);
let trouserEnvelope = [];
if (tunicOnly) {
    const trousers = await io.read(pass + '/native-011/trousers-authoring.glb');
    for (const mesh of trousers.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const positions = primitive.getAttribute('POSITION');
            for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                const point = new Vector3(...positions.getElement(vertex, []));
                if (point.y > .74)
                    trouserEnvelope.push(point);
            }
        }
    }
}
for (const part of tunicOnly ? ['tunic'] : ['trousers', 'tunic', 'shoe']) {
    const sourcePart = part === 'tunic' ? tunicSourcePart : part;
    const provenance = JSON.parse(await readFile(pass + '/meshy/' + sourcePart + '/download/provenance.json'));
    const source = await readFile(pass + '/meshy/' + sourcePart + '/download/source.glb');
    assert.equal(hash(source), provenance.sha256);
    assert.equal(provenance.inputManifestSha256, approval.inputManifestSha256);
    const document = await io.readBinary(source);
    assert.equal(document.getRoot().listSkins().length, 0);
    assert.equal(document.getRoot().listAnimations().length, 0);
    if (part === 'shoe')
        for (const mesh of document.getRoot().listMeshes()) {
            for (const primitive of mesh.listPrimitives()) {
                const positions = primitive.getAttribute('POSITION');
                const indices = primitive.getIndices().getArray();
                const selected = [];
                for (let i = 0; i < indices.length; i += 3) {
                    const face = Array.from(indices.subarray(i, i + 3));
                    if (face.every(vertex => positions.getElement(vertex, [])[0] > 0))
                        selected.push(...face);
                }
                assert.ok(selected.length / indices.length > .45 && selected.length / indices.length < .55, 'Expected the inspected two disconnected source shoes; retain exactly one.');
                primitive.setIndices(document.createAccessor().setType('SCALAR')
                    .setArray(Uint32Array.from(selected)).setBuffer(document.getRoot().listBuffers()[0]));
                compact(document, primitive, selected.length / 3);
            }
        }
    const front = await bounds(part, 'front'), side = await bounds(part, 'left');
    const expected = { min: [front.cameraTarget[0] + front.lo, front.bottom,
            side.cameraTarget[2] - side.hi], max: [front.cameraTarget[0] + front.hi,
            front.top, side.cameraTarget[2] - side.lo] };
    const nodes = document.getRoot().listNodes().filter(node => node.getMesh());
    const rawBounds = new Box3();
    for (const node of nodes)
        for (const primitive of node.getMesh().listPrimitives()) {
            const matrix = new Matrix4().fromArray(node.getWorldMatrix());
            const array = primitive.getAttribute('POSITION').getArray();
            for (let i = 0; i < array.length; i += 3)
                rawBounds.expandByPoint(new Vector3().fromArray(array, i).applyMatrix4(matrix));
        }
    const scale = expected.min.map((minimum, axis) => (expected.max[axis] - minimum) / (rawBounds.max.getComponent(axis) - rawBounds.min.getComponent(axis)));
    const translation = expected.min.map((minimum, axis) => minimum - scale[axis] * rawBounds.min.getComponent(axis));
    const registration = new Matrix4().makeScale(...scale).setPosition(...translation);
    for (const [index, node] of nodes.entries()) {
        const matrix = registration.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()));
        for (const primitive of node.getMesh().listPrimitives()) {
            const positions = primitive.getAttribute('POSITION');
            const normals = primitive.getAttribute('NORMAL');
            for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                positions.setElement(vertex, new Vector3(...positions.getElement(vertex, [])).applyMatrix4(matrix).toArray());
                normals.setElement(vertex, new Vector3(...normals.getElement(vertex, []))
                    .applyNormalMatrix(new Matrix3().getNormalMatrix(matrix)).toArray());
            }
            primitive.getMaterial().setDoubleSided(true).setMetallicFactor(0).setRoughnessFactor(1);
        }
        node.setMatrix(new Matrix4().toArray());
        node.setName('Module_fisherman_' + part + '_left_' + index);
        node.getMesh().setName(node.getName());
    }
    await document.transform(weld({ tolerance: 0 }));
    const simplification = [];
    for (const node of nodes)
        for (const primitive of node.getMesh().listPrimitives()) {
            simplification.push(compact(document, primitive, part === 'tunic' ? 9000 : part === 'trousers' ? 7000 : 3500));
        }
    // Reflection takes place in the approved authoring pose; each side is then unposed
    // with its own native matrices. Reflecting a posed/native bind mesh directly is wrong.
    if (part === 'shoe')
        for (const node of [...nodes]) {
            const mesh = document.createMesh('Module_fisherman_shoe_right');
            for (const primitive of node.getMesh().listPrimitives()) {
                const mirrored = primitive.clone();
                for (const semantic of primitive.listSemantics()) {
                    const attribute = primitive.getAttribute(semantic), array = attribute.getArray().slice();
                    const width = attribute.getElementSize();
                    if (semantic === 'POSITION' || semantic === 'NORMAL') {
                        for (let i = 0; i < array.length; i += width) {
                            array[i] = semantic === 'POSITION' ? -.0007660388946533203 - array[i] : -array[i];
                        }
                    }
                    mirrored.setAttribute(semantic, document.createAccessor().setType(attribute.getType())
                        .setArray(array).setBuffer(document.getRoot().listBuffers()[0]));
                }
                const indices = primitive.getIndices().getArray().slice();
                for (let i = 0; i < indices.length; i += 3)
                    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
                mirrored.setIndices(document.createAccessor().setType('SCALAR').setArray(indices)
                    .setBuffer(document.getRoot().listBuffers()[0]));
                mesh.addPrimitive(mirrored);
            }
            const reflected = document.createNode(mesh.getName()).setMesh(mesh);
            document.getRoot().getDefaultScene().addChild(reflected);
            nodes.push(reflected);
        }
    let maximumLayerCorrection = 0;
    if (part === 'trousers')
        for (const node of nodes)
            for (const primitive of node.getMesh().listPrimitives()) {
                const positions = primitive.getAttribute('POSITION');
                for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                    const p = new Vector3(...positions.getElement(vertex, []));
                    const t = Math.max(0, Math.min(1, (p.y - .58) / .20));
                    const inset = .020 * t * t * (3 - 2 * t);
                    const radius = Math.hypot(p.x, p.z);
                    const scale = radius > .04 ? (radius - inset) / radius : 1;
                    p.x *= scale;
                    p.z *= scale;
                    positions.setElement(vertex, p.toArray());
                    if (p.y > .74)
                        trouserEnvelope.push(p);
                }
            }
    if (part === 'tunic')
        for (const node of nodes)
            for (const primitive of node.getMesh().listPrimitives()) {
                const positions = primitive.getAttribute('POSITION');
                const sectors = sleeveSectors(primitive);
                const originals = Array.from({ length: positions.getCount() }, (_, v) => new Vector3(...positions.getElement(v, [])));
                const levels = 50, minimum = .78, maximum = 1.04;
                const transforms = Array.from({ length: levels }, (_, level) => {
                    const y = minimum + level / (levels - 1) * (maximum - minimum);
                    const cloth = originals.filter((p, v) => sectors[v] === 0 && Math.abs(p.y - y) < .018);
                    const pants = trouserEnvelope.filter(p => Math.abs(p.y - y) < .018);
                    if (!cloth.length || !pants.length)
                        return [1, 1];
                    return ['x', 'z'].map(axis => {
                        const source = Math.max(...cloth.map(p => Math.abs(p[axis])));
                        const target = Math.max(...pants.map(p => Math.abs(p[axis]))) + .006;
                        return Math.max(1, target / Math.max(.04, source));
                    });
                });
                const smoothed = transforms.map((_, level) => [0, 1].map(axis => {
                    const neighbours = transforms.slice(Math.max(0, level - 2), Math.min(levels, level + 3));
                    return neighbours.reduce((sum, row) => sum + row[axis], 0) / neighbours.length;
                }));
                for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                    const p = originals[vertex];
                    if (sectors[vertex] !== 0 || p.y >= maximum)
                        continue;
                    const value = Math.max(0, Math.min(levels - 1, (p.y - minimum) / (maximum - minimum) * (levels - 1)));
                    const a = Math.floor(value), b = Math.min(levels - 1, a + 1), t = value - a;
                    const result = p.clone();
                    for (const [axis, channel] of [['x', 0], ['z', 1]]) {
                        result[axis] *= smoothed[a][channel] * (1 - t) + smoothed[b][channel] * t;
                    }
                    const correction = result.distanceTo(p);
                    assert.ok(correction < .05, 'Layer fitting must stay below five centimetres.');
                    maximumLayerCorrection = Math.max(maximumLayerCorrection, correction);
                    positions.setElement(vertex, result.toArray());
                }
            }
    if (part === 'tunic') {
        for (const node of nodes)
            for (const primitive of node.getMesh().listPrimitives()) {
                upperFit.conform(primitive);
            }
    }
    await io.write(pass + '/' + revision + '/' + part + '-authoring.glb', document);
    const { query, surface } = makeQuery(part);
    const counts = [];
    let roundTrip = 0, maximumDistance = 0;
    for (const node of nodes) {
        for (const primitive of node.getMesh().listPrimitives()) {
            const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL');
            const sectors = part === 'tunic' ? sleeveSectors(primitive) : [];
            const joints = new Uint16Array(positions.getCount() * 4);
            const weights = new Float32Array(positions.getCount() * 4);
            for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                const point = new Vector3(...positions.getElement(vertex, []));
                const canonical = part === 'shoe' && point.x < 0
                    ? new Vector3(-.0007660388946533203 - point.x, point.y, point.z) : point;
                const contact = query.closest(canonical);
                maximumDistance = Math.max(maximumDistance, contact.distance);
                let influence = transfer(surface, contact.anchor, part, canonical, sectors[vertex]);
                if (part === 'tunic')
                    influence = upperFit.influences(primitive, vertex, influence);
                if (part === 'shoe' && point.x < 0)
                    influence.joints = influence.joints.map(joint => joint >= 34 && joint <= 38 ? joint + 5 : joint);
                joints.set(influence.joints, vertex * 4);
                weights.set(influence.weights, vertex * 4);
                const matrix = blend(influence.joints, Array.from(weights.subarray(vertex * 4, vertex * 4 + 4)));
                const inverse = matrix.clone().invert();
                positions.setElement(vertex, point.clone().applyMatrix4(inverse).toArray());
                normals.setElement(vertex, new Vector3(...normals.getElement(vertex, []))
                    .applyNormalMatrix(new Matrix3().getNormalMatrix(inverse)).toArray());
                const recovered = new Vector3(...positions.getElement(vertex, [])).applyMatrix4(matrix);
                roundTrip = Math.max(roundTrip, recovered.distanceTo(point));
            }
            const buffer = document.getRoot().listBuffers()[0];
            primitive.setAttribute('JOINTS_0', document.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
            primitive.setAttribute('WEIGHTS_0', document.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
        }
        counts.push({ mesh: node.getName(), vertices: node.getMesh().listPrimitives()
                .reduce((sum, primitive) => sum + primitive.getAttribute('POSITION').getCount(), 0) });
    }
    assert.ok(roundTrip < 1e-6, 'The exact retained native weights must reconstruct the approved pose.');
    await document.transform(prune({ keepAttributes: true }));
    const bytes = Buffer.from(await io.writeBinary(document));
    const coverage = part === 'tunic' ? [
        { regions: ['PELVIS', 'TORSO_LOWER', 'TORSO_UPPER', 'UPPER_LEG_L', 'UPPER_LEG_R'], minimumY: .76, maximumY: 1.43 },
        { regions: ['UPPER_ARM_L', 'UPPER_ARM_R', 'LOWER_ARM_L', 'LOWER_ARM_R'], minimumY: .86, maximumY: 1.47 },
    ] : part === 'trousers' ? [{ regions: ['PELVIS', 'UPPER_LEG_L', 'UPPER_LEG_R', 'LOWER_LEG_L', 'LOWER_LEG_R'], minimumY: .165, maximumY: .99 }]
        : [{ regions: ['FEET', 'LOWER_LEG_L', 'LOWER_LEG_R'], minimumY: -.04, maximumY: .17 }];
    const binding = { ...template, id: 'garment/meshy-fisherman-' + part + '-009',
        moduleSha256: hash(bytes), skinning: 'authored-four-native',
        recipe: { id: 'fisherman-a20-native-transfer', version: 3, blender: 'not-used' },
        materialPolicy: { ...template.materialPolicy, sourceSha256: provenance.sha256 },
        precomputedNative: { version: 3, coordinateFrame: 'metre', meshes: counts,
            bodyBindings: template.precomputedNative.bodyBindings, moduleCoverage: coverage,
            ...(part === 'tunic' ? {
                lowerUnderlap: { id: 'garment/meshy-fisherman-trousers-009', moduleSha256: measurements['/character-lab/candidates/meshy-fisherman-009/trousers.glb'].sha256, maximumY: .805 },
                bodyOpenings: [
                    // Only the real neck and front slit are exposed. Restoring
                    // the covered shoulder/chest surface causes visible poke-through.
                    { minimumY: 1.39, maximumY: 1.49, planes: [
                            { normal: [1, 0, 0], constant: .09 }, { normal: [-1, 0, 0], constant: .09 },
                        ] },
                    { minimumY: 1.30, maximumY: 1.49, planes: [
                            { normal: [1, 0, 0], constant: .04 }, { normal: [-1, 0, 0], constant: .04 },
                            { normal: [0, 0, -1], constant: 0 },
                        ] },
                ],
                // Retain actual exposed neck/chest geometry and its material. A colour
                // discard here would punch holes into the restored body surface.
                ...(!tunicOnly ? { neckMaterial: { minimumY: 1.25, maximumY: 1.49,
                        halfWidth: .24, undershirtHalfWidth: 0, stabilizeSkinWeights: false } } : {}),
            } : {}) }, supportedAges: { min: 18, max: 100 },
        reviewScope: 'Approved images; adult native Walking/Idle screening; human 3D appearance review pending' };
    const bindingBytes = Buffer.from(JSON.stringify(binding, null, 2) + '\n');
    const triangles = document.getRoot().listMeshes().reduce((sum, mesh) => sum
        + mesh.listPrimitives().reduce((total, primitive) => total + primitive.getIndices().getCount() / 3, 0), 0);
    const assetPath = '/character-lab/candidates/meshy-fisherman-009/' + part + '.glb';
    const nativeBounds = new Box3();
    for (const node of nodes)
        for (const primitive of node.getMesh().listPrimitives()) {
            const positions = primitive.getAttribute('POSITION');
            for (let vertex = 0; vertex < positions.getCount(); vertex++) {
                nativeBounds.expandByPoint(new Vector3(...positions.getElement(vertex, [])));
            }
        }
    measurements[assetPath] = { sha256: hash(bytes), bytes: bytes.length, triangles,
        materials: document.getRoot().listMaterials().length,
        bounds: { min: nativeBounds.min.toArray(), max: nativeBounds.max.toArray() } };
    records.push({ id: binding.id, label: part === 'tunic' ? 'Fisherman wool tunic (preview)'
            : part === 'trousers' ? 'Fisherman linen trousers (preview)' : 'Fisherman leather shoes (preview)',
        path: assetPath, bindingPath: assetPath.replace('.glb', '.binding.json'),
        bindingSha256: hash(bindingBytes), slot: part === 'tunic' ? 'upper' : part === 'trousers' ? 'lower' : 'footwear',
        triangles, materials: measurements[assetPath].materials });
    pendingPublication.push({ part, bytes, bindingBytes });
    await writeFile(pass + '/' + revision + '/' + part + '.glb', bytes);
    await writeFile(pass + '/' + revision + '/' + part + '.binding.json', bindingBytes);
    reports.push({ part, provenance, expected, rawBounds: { min: rawBounds.min.toArray(), max: rawBounds.max.toArray() },
        registration: { scale, translation }, simplification, triangles, roundTrip,
        maximumSurfaceDistance: maximumDistance, maximumLayerCorrection,
        ...(part === 'tunic' ? { upperFit: upperFit.report } : {}), meshes: counts });
    console.log(JSON.stringify({ part, sourcePart, triangles, roundTrip, maximumLayerCorrection }));
}
// Publish only after every component has passed preparation. Failed candidates stay in their review directory.
for (const { part, bytes, bindingBytes } of pendingPublication) {
    await writeFile(output + '/' + part + '.glb', bytes);
    await writeFile(output + '/' + part + '.binding.json', bindingBytes);
}
await writeFile('src/characters/FishermanOutfitMeasurements.ts', '/** Generated by prepare-fisherman-native.mjs; reviewed separately from accepted outfits. */\n'
    + 'export const fishermanOutfitMeasurements = ' + JSON.stringify(measurements, null, 4) + ';\n'
    + 'export const fishermanOutfitRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n');
await writeFile(pass + '/' + revision + '/preparation.json', JSON.stringify({ revision, reports }, null, 2) + '\n');
upperFit.dispose();
