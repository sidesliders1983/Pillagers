/**
 * Reproduce the reviewed native underlay fit from exact original owner armor,
 * prepared vest, field-tunic and native body assets. This is offline authoring;
 * runtime applies only the declared fit to a private wearer clone on appearance
 * changes. No ignored QA fixture or source model is published by this script.
 */
import assert from 'node:assert/strict';
import { createSurfaceQuery } from './outfit-surface-binding.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Box3, Ray, Triangle, Vector3 } from 'three';
import { loadTypeScript } from '../load-typescript.mjs';
const load = path => loadTypeScript(new URL(path, import.meta.url));
const { MeshyHumanFactory } = load('../../src/characters/MeshyHuman.ts');
const { defaultDNA } = load('../../src/characters/CharacterDNA.ts');
const { fjordClothingSets } = load('../../src/fjord-play/FjordWardrobe.ts');
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() { } });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const verifyOnly = process.argv.includes('--verify');
const item = process.argv.find(argument => argument.startsWith('--item='))?.slice(7) ?? 'leatherBodyArmor';
const expectedOwnerSource = JSON.parse(await readFile('scripts/characters/native-personal-armor.sources.json', 'utf8'))
    .find(source => source.item === item);
assert.ok(expectedOwnerSource && item.endsWith('BodyArmor'), 'Choose an actual supplied body-armor source');
const armorPath = 'public/character-lab/modules/native-personal-armor/' + expectedOwnerSource.name + '.glb';
const dataPath = expectedOwnerSource.underlayFit?.path ?? 'scripts/characters/native-iron-body-armor-underlay-fit.json';
const proofStem = item === 'leatherBodyArmor' ? 'underlay-fit-derivation' : 'variants/iron-body-armor-underlay-fit-derivation';
const tunicPath = 'public/character-lab/candidates/meshy-grid-trial-002/outfit.glb';
const armorHash = hash(await readFile(armorPath)), tunicHash = hash(await readFile(tunicPath));
assert.equal(armorHash, expectedOwnerSource.preparation.preparedAssetSha256 ?? expectedOwnerSource.underlayFit.armorSha256);
assert.equal(tunicHash, '79794137e3e2bb33da24429d084cec0e5fb84711fdc4fd87c1568b1dabb4d52e');
const receipt = JSON.parse(await readFile(armorPath.replace('.glb', '.provenance.json'), 'utf8'));
const outerFaces = receipt.fitting.sourceMainOuterTriangles;
assert.equal(outerFaces.length, expectedOwnerSource.preparation.mainOuterTriangles ?? 1319);
await MeshoptDecoder.ready;
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }),
    tunicDocument = await io.read(tunicPath),
    vestDocument = await io.read(armorPath);
const rawTunic = tunicDocument.getRoot().listMeshes()
    .find(mesh => mesh.getName() === 'Module_grid_trial_top_0').listPrimitives()[0];
const rawVest = vestDocument.getRoot().listMeshes()[0].listPrimitives()[0];
const positionsOf = primitive => Array.from(
    { length: primitive.getAttribute('POSITION').getCount() },
    (_, vertex) => new Vector3(...primitive.getAttribute('POSITION').getElement(vertex, [])),
);
const tunicPoints = positionsOf(rawTunic), vestPoints = positionsOf(rawVest);
const tunicIndices = Array.from(rawTunic.getIndices().getArray()),
    vestIndices = Array.from(rawVest.getIndices().getArray());

function tree(entries) {
    const box = new Box3();
    for (const entry of entries)
        box.union(entry.box);
    if (entries.length <= 10)
        return { box, entries };
    const size = box.getSize(new Vector3()),
        axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    entries.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
    const middle = Math.floor(entries.length / 2);
    return { box, left: tree(entries.slice(0, middle)), right: tree(entries.slice(middle)) };
}
function shell(points, indices, selected) {
    const entries = [];
    for (const id of selected ?? Array.from({ length: indices.length / 3 }, (_, i) => i)) {
        const vertices = indices.slice(id * 3, id * 3 + 3), ps = vertices.map(v => points[v]);
        const triangle = new Triangle(...ps);
        if (triangle.getArea() < 1e-14)
            continue;
        entries.push({
            id, vertices, triangle, normal: triangle.getNormal(new Vector3()),
            box: new Box3().setFromPoints(ps),
        });
    }
    const root = tree(entries), ray = new Ray(), hit = new Vector3();
    return (origin, direction, all = false) => {
        ray.origin.copy(origin);
        ray.direction.copy(direction);
        const hits = [];
        let nearest = Infinity;
        const visit = node => {
            if (!ray.intersectsBox(node.box))
                return;
            if (node.entries)
                for (const entry of node.entries) {
                    if (!ray.intersectTriangle(entry.triangle.a, entry.triangle.b, entry.triangle.c, false, hit))
                        continue;
                    const distance = origin.distanceTo(hit);
                    if (distance < 1e-7 || !all && distance >= nearest)
                        continue;
                    const value = {
                        ...entry, distance, point: hit.clone(),
                        barycentric: entry.triangle.getBarycoord(hit, new Vector3()).toArray(),
                    };
                    if (all)
                        hits.push(value);
                    else {
                        nearest = distance;
                        hits[0] = value;
                    }
                }
            else {
                visit(node.left);
                visit(node.right);
            }
        };
        visit(root);
        hits.sort((a, b) => a.distance - b.distance);
        return all ? hits.filter((value, i) => i === 0 || value.distance - hits[i - 1].distance > 1e-5) : hits[0];
    };
}
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
    bytes = async (path) => {
        const value = await readFile('public' + path.split('?')[0]);
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    };
const factory = new MeshyHumanFactory(async (path) => loader.parseAsync(await bytes(path), ''), bytes);
const presentation = { ...fjordClothingSets.generic, hair: 'none', beard: 'none' };
assert.equal(hash(await readFile('public/game-assets/human/Human_LOD2.glb')),
    'd2a05aa67337187686325f40e9dd2c4c5867517c933a09aefb857594f2faa682');
const setup = await factory.create(defaultDNA(), 2, undefined, presentation),
    bodySource = setup.fit.source;
const bodyNativePoints = Array.from(
    { length: bodySource.positions.length / 3 },
    (_, v) => new Vector3().fromArray(bodySource.positions, v * 3),
);
const sourceBodyIdentity = setup.fit.body.sha256;
const nativeIndices = setup.fit.sourceGeometry.getAttribute('skinIndex'),
    nativeWeights = setup.fit.sourceGeometry.getAttribute('skinWeight');
const bodyJointValues = Array.from(
    { length: bodySource.positions.length / 3 * 4 },
    (_, i) => nativeIndices.getComponent(Math.floor(i / 4), i % 4),
), bodyWeightValues = Array.from(
    { length: bodySource.positions.length / 3 * 4 },
    (_, i) => nativeWeights.getComponent(Math.floor(i / 4), i % 4),
);
setup.dispose();
const exposedHeadNeck = new Set(['HEAD', 'NECK']);
const barySamples = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [.5, .5, 0], [0, .5, .5], [.5, 0, .5], [1 / 3, 1 / 3, 1 / 3]];
const mainPoints = vestPoints;
const minY = Math.min(...mainPoints.map(p => p.y)), maxY = Math.max(...mainPoints.map(p => p.y));
const completeBodyQuery = createSurfaceQuery({ ...bodySource, triangles: bodySource.indices.length / 3 });
function bodyAnchor(point) {
    if (point.y < minY - .03 || point.y > maxY + .03)
        return null;
    const contact = completeBodyQuery.closest(point),
        vertices = bodySource.indices.slice(contact.anchor.triangle * 3, contact.anchor.triangle * 3 + 3);
    if (vertices.some(v => exposedHeadNeck.has(bodySource.regions[v])))
        return null;
    return {
        triangle: contact.anchor.triangle, vertices, barycentric: contact.anchor.barycentric,
        sourceDistance: contact.distance, regions: vertices.map(v => bodySource.regions[v]),
    };
}
// Derive connected source panels from the exact privately retained owner model.
// No ignored QA output participates in reproducible generation.
const source = expectedOwnerSource;
const originalBytes = await readFile(source.path);
assert.equal(hash(originalBytes), source.sha256);
const original = (await io.readBinary(originalBytes)).getRoot().listMeshes()[0].listPrimitives()[0];
const originalPoints = positionsOf(original), originalIndices = Array.from(original.getIndices().getArray());
const parents = originalPoints.map((_, i) => i),
    find = i => parents[i] === i ? i : (parents[i] = find(parents[i])),
    union = (a, b) => {
        parents[find(a)] = find(b);
    },
    keys = new Map();
originalPoints.forEach((point, i) => {
    const key = point.toArray().map(v => Math.round(v * 1e6)).join(':');
    if (keys.has(key))
        union(i, keys.get(key));
    else
        keys.set(key, i);
});
for (let f = 0; f < originalIndices.length; f += 3) {
    union(originalIndices[f], originalIndices[f + 1]);
    union(originalIndices[f], originalIndices[f + 2]);
}
const components = new Map();
for (let f = 0; f < originalIndices.length; f += 3) {
    const root = find(originalIndices[f]);
    if (!components.has(root))
        components.set(root, []);
    components.get(root).push(f / 3);
}
const wanted = source.preparation.underlayPanelComponentCounts ?? [2346, 356, 78];
const groups = wanted.map(count => {
    const matching = [...components.values()].filter(faces => faces.length === count);
    assert.ok(matching.length > 0, 'A declared actual opaque source panel is missing');
    if (item === 'leatherBodyArmor') assert.equal(matching.length, 1);
    return matching.flat();
});
const panelFaces = groups.flat(), nativeVestRay = shell(vestPoints, vestIndices, panelFaces);
const tucked = [];
for (let vertex = 0; vertex < tunicPoints.length; vertex++) {
    const point = tunicPoints[vertex], anchor = bodyAnchor(point);
    if (!anchor)
        continue;
    const corners = anchor.vertices.map(v => bodyNativePoints[v]),
        bodyPoint = corners.reduce((sum, p, i) => sum.addScaledVector(p, anchor.barycentric[i]), new Vector3()),
        normal = new Triangle(...corners).getNormal(new Vector3());
    const opaque = (offset) => {
        const hit = nativeVestRay(bodyPoint.clone().add(offset), normal);
        return hit && hit.distance < .15;
    };
    if (!opaque(new Vector3()))
        continue;
    const u = new Vector3(...(Math.abs(normal.y) > .8 ? [1, 0, 0] : [0, 1, 0])).cross(normal).normalize(),
        v = normal.clone().cross(u).normalize();
    let distance = 0;
    for (const radius of [.002, .004, .006, .008]) {
        let pass = true;
        for (let angle = 0; angle < 8; angle++) {
            const a = 2 * Math.PI * angle / 8;
            if (!opaque(u.clone().multiplyScalar(radius * Math.cos(a)).addScaledVector(v, radius * Math.sin(a)))) {
                pass = false;
                break;
            }
        }
        if (!pass)
            break;
        distance = radius;
    }
    const t = distance / .008, amount = t * t * (3 - 2 * t);
    if (amount === 0)
        continue;
    const target = bodyPoint.clone().addScaledVector(normal, .003), fitted = point.clone().lerp(target, amount);
    tucked.push({
        vertex, anchor, amount, original: point.toArray(), position: fitted.toArray(),
        displacement: fitted.distanceTo(point),
    });
}
// A compact geodesic falloff compresses the connected inner opening seam,
// while the outer sleeves/neck/hem distant from the vest keep exact positions.
const weldIds = [], weldKeys = new Map(), weldPoints = [], adjacency = [];
for (const point of tunicPoints) {
    const key = point.toArray().map(v => Math.round(v * 1e6)).join(':');
    if (!weldKeys.has(key)) {
        weldKeys.set(key, weldPoints.length);
        weldPoints.push(point);
        adjacency.push(new Map());
    }
    weldIds.push(weldKeys.get(key));
}
for (let f = 0; f < tunicIndices.length; f += 3)
    for (let edge = 0; edge < 3; edge++) {
        const a = weldIds[tunicIndices[f + edge]], b = weldIds[tunicIndices[f + (edge + 1) % 3]];
        if (a === b)
            continue;
        const distance = weldPoints[a].distanceTo(weldPoints[b]);
        adjacency[a].set(b, distance);
        adjacency[b].set(a, distance);
    }
const distances = new Float64Array(weldPoints.length).fill(Infinity), heap = [];
const push = (node, distance) => {
    let index = heap.length;
    heap.push({ node, distance });
    while (index) {
        const parent = (index - 1) >> 1;
        if (heap[parent].distance <= distance)
            break;
        heap[index] = heap[parent];
        index = parent;
    }
    heap[index] = { node, distance };
};
const pop = () => {
    const result = heap[0], last = heap.pop();
    if (heap.length) {
        let index = 0;
        while (true) {
            let child = index * 2 + 1;
            if (child >= heap.length)
                break;
            if (child + 1 < heap.length && heap[child + 1].distance < heap[child].distance)
                child++;
            if (heap[child].distance >= last.distance)
                break;
            heap[index] = heap[child];
            index = child;
        }
        heap[index] = last;
    }
    return result;
};
for (const entry of tucked)
    if (entry.amount === 1 && distances[weldIds[entry.vertex]] !== 0) {
        distances[weldIds[entry.vertex]] = 0;
        push(weldIds[entry.vertex], 0);
    }
while (heap.length) {
    const { node, distance } = pop();
    if (distance !== distances[node])
        continue;
    for (const [other, length] of adjacency[node]) {
        const next = distance + length;
        if (next < .03 && next < distances[other]) {
            distances[other] = next;
            push(other, next);
        }
    }
}
const byVertex = new Map(tucked.map(entry => [entry.vertex, entry]));
let boundaryVertices = 0;
for (let vertex = 0; vertex < tunicPoints.length; vertex++) {
    const distance = distances[weldIds[vertex]];
    if (distance >= .03)
        continue;
    const t = 1 - distance / .03, amount = t * t * (3 - 2 * t), current = byVertex.get(vertex);
    if (amount <= (current?.amount ?? 0))
        continue;
    const point = tunicPoints[vertex], anchor = bodyAnchor(point);
    if (!anchor)
        continue;
    const corners = anchor.vertices.map(v => bodyNativePoints[v]),
        bodyPoint = corners.reduce((sum, p, i) => sum.addScaledVector(p, anchor.barycentric[i]), new Vector3()),
        normal = new Triangle(...corners).getNormal(new Vector3());
    const position = point.clone().lerp(bodyPoint.clone().addScaledVector(normal, .003), amount);
    byVertex.set(vertex, {
        vertex, anchor, amount, original: point.toArray(), position: position.toArray(),
        displacement: position.distanceTo(point), boundaryGeodesicDistance: distance,
    });
    boundaryVertices++;
}
tucked.splice(0, tucked.length, ...[...byVertex.values()].sort((a, b) => a.vertex - b.vertex));
let nativeDonorVertices = 0, maximumDiscardedNativeWeight = 0;
for (const entry of tucked) {
    const blend = entry.amount;
    if (blend < 1e-6)
        continue;
    const mixture = new Map(),
        js = rawTunic.getAttribute('JOINTS_0').getElement(entry.vertex, []),
        ws = rawTunic.getAttribute('WEIGHTS_0').getElement(entry.vertex, []);
    for (let influence = 0; influence < 4; influence++)
        mixture.set(js[influence], (mixture.get(js[influence]) ?? 0) + ws[influence] * (1 - blend));
    for (let corner = 0; corner < 3; corner++)
        for (let influence = 0; influence < 4; influence++) {
            const index = entry.anchor.vertices[corner] * 4 + influence,
                joint = bodyJointValues[index],
                weight = bodyWeightValues[index] * entry.anchor.barycentric[corner] * blend;
            mixture.set(joint, (mixture.get(joint) ?? 0) + weight);
        }
    const sorted = [...mixture].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]),
        retained = sorted.slice(0, 4),
        mass = retained.reduce((sum, [, w]) => sum + w, 0);
    entry.joints = [...retained.map(([j]) => j), ...Array(4 - retained.length).fill(0)];
    entry.weights = [...retained.map(([, w]) => w / mass), ...Array(4 - retained.length).fill(0)];
    entry.actualBodyDonorBlend = blend;
    maximumDiscardedNativeWeight = Math.max(maximumDiscardedNativeWeight, 1 - mass);
    nativeDonorVertices++;
}
const data = {
    version: 1,
    meshName: 'Module_grid_trial_top_0',
    vertices: tucked.map(({ vertex, position, joints, weights }) => ({
        vertex, position, ...(joints ? { joints, weights } : {}),
    })),
    maximumDisplacementMetres: Math.max(...tucked.map(entry => entry.displacement)),
};
assert.ok(data.maximumDisplacementMetres < .08, 'Qualified underlay fit exceeds the measured80mm bound');
const dataBytes = Buffer.from(JSON.stringify(data) + '\n');
const previousData = await readFile(dataPath).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
});
if (verifyOnly) assert.ok(previousData?.equals(dataBytes), 'Underlay fit reproduction differs');
else if (!previousData?.equals(dataBytes)) await writeFile(dataPath, dataBytes);
const proof = {
    version: 1,
    derivationScriptSha256: hash(await readFile(new URL(import.meta.url))),
    status: 'Candidate fit-only recipe; actual textured combined owner acceptance pending',
    armorSha256: armorHash,
    tunicSha256: tunicHash,
    bodySourceSha256: sourceBodyIdentity,
    bodyLOD: 2,
    sourceOwnerArmorSha256: source.sha256,
    dataSha256: hash(dataBytes),
    sourceTunicVertices: tunicPoints.length,
    fitVertices: tucked.length,
    nativeDonorVertices: nativeDonorVertices,
    maximumDiscardedNativeWeight,
    maximumDisplacementMetres: data.maximumDisplacementMetres,
    boundaryVertices,
    boundaryGeodesicFalloffMetres: .03,
    bodyCoverageChanged: false,
    indicesChanged: false,
    uvsChanged: false,
    method: 'Nearest COMPLETE actual native body anchors; body+3mm under opaque main/belt/tab footprint,8mm tangent boundary,30mm source-cloth geodesic seam falloff; coherent actual native4 blended by the same fitted amount. Distant garment attributes remain exact.',
    largest: tucked.slice().sort((a, b) => b.displacement - a.displacement).slice(0, 10),
    vertices: tucked,
};
const detailBytes = Buffer.from(JSON.stringify(proof, null, 2) + '\n');
const detailGzip = gzipSync(detailBytes, { level: 9 });
await mkdir('output/native-personal-armor-333/variants', { recursive: true });
const detailPath = 'output/native-personal-armor-333/' + proofStem + '.json.gz';
const summary = {
    ...proof,
    vertices: undefined,
    detail: {
        path: detailPath,
        sha256: hash(detailGzip),
        bytes: detailGzip.length,
        decodedSha256: hash(detailBytes),
        decodedBytes: detailBytes.length,
    },
};
async function writeProof(path, bytes) {
    const previous = await readFile(path).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (verifyOnly) assert.ok(previous?.equals(bytes), 'Reproduction differs: ' + path);
    else if (!previous?.equals(bytes)) await writeFile(path, bytes);
}
await writeProof(detailPath, detailGzip);
await writeProof('output/native-personal-armor-333/' + proofStem + '.json',
    Buffer.from(JSON.stringify(summary, null, 2) + '\n'));
console.log(JSON.stringify({ ...proof, vertices: undefined, largest: undefined }));
