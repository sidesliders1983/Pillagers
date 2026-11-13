import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { Box3, BufferAttribute, BufferGeometry, Group, Matrix4, Quaternion, Ray, Triangle, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadTypeScript } from './load-typescript.mjs';
import { createSurfaceQuery, barycentricNativeWeights } from './characters/outfit-surface-binding.mjs';
const { MeshyBodyFitAdapter } = loadTypeScript(new URL('../src/characters/MeshyBodyFitAdapter.ts', import.meta.url));
const { meshyHumanAssetIdentity } = loadTypeScript(new URL('../src/characters/MeshyHumanAssetIdentity.ts', import.meta.url));
const sources = JSON.parse(await readFile('scripts/characters/native-personal-armor.sources.json', 'utf8'));
const template = JSON.parse(await readFile('public/character-lab/modules/occupation-hats/smith.binding.json', 'utf8'));
const directory = '/character-lab/modules/native-personal-armor';
const outputDirectory = 'output/native-personal-armor-333';
const underlayId = 'garment/meshy-grid-trial-001';
const underlayPath = 'public/character-lab/candidates/meshy-grid-trial-002/outfit.glb';
const underlaySha256 = '79794137e3e2bb33da24429d084cec0e5fb84711fdc4fd87c1568b1dabb4d52e';
const clearanceMetres = .008;
const prepareBaseOnly = process.argv.includes('--base-only');
const verifyOnly = process.argv.includes('--verify');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function writeChanged(path, data) {
    const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    const previous = await readFile(path).catch(error => {
        if (error.code === 'ENOENT')
            return null;
        throw error;
    });
    if (verifyOnly)
        assert.ok(previous?.equals(bytes), 'Reproduction differs: ' + path);
    else if (!previous || !previous.equals(bytes))
        await writeFile(path, bytes);
}
await mkdir('public' + directory, { recursive: true });
await mkdir(outputDirectory, { recursive: true });
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({
    width: 2048,
    height: 2048,
    close() { }
});
const bodyBytes = await readFile('public' + meshyHumanAssetIdentity[0].path);
assert.equal(hash(bodyBytes), meshyHumanAssetIdentity[0].sha256);
const bodyGltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength), '');
let body;
bodyGltf.scene.traverse(node => {
    if (node.isSkinnedMesh)
        body = node;
});
const root = new Group();
root.add(bodyGltf.scene);
const fit = new MeshyBodyFitAdapter(body, root, bodyGltf.scene, 0);
fit.refit();
// Geometry preparation retains the original LOD0 source cage. Final skinning
// can use the same exact canonical LOD2 field as the fitted underlay.
const donorBodyBytes = await readFile('public' + meshyHumanAssetIdentity[2].path);
assert.equal(hash(donorBodyBytes), meshyHumanAssetIdentity[2].sha256);
const donorGltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(donorBodyBytes.buffer.slice(donorBodyBytes.byteOffset, donorBodyBytes.byteOffset + donorBodyBytes.byteLength), '');
let donorBody;
donorGltf.scene.traverse(node => {
    if (node.isSkinnedMesh)
        donorBody = node;
});
const donorRoot = new Group();
donorRoot.add(donorGltf.scene);
const donorFit = new MeshyBodyFitAdapter(donorBody, donorRoot, donorGltf.scene, 2);
const donorQuery = createSurfaceQuery(donorFit.source);
const donorJoints = [], donorWeights = [];
for (let vertex = 0; vertex < donorFit.source.positions.length / 3; vertex++) {
    for (let channel = 0; channel < 4; channel++) {
        donorJoints.push(donorBody.geometry.getAttribute('skinIndex').getComponent(vertex, channel));
        donorWeights.push(donorBody.geometry.getAttribute('skinWeight').getComponent(vertex, channel));
    }
}
function shellQuery(positions, indices) {
    const faces = [];
    for (let index = 0; index < indices.length; index += 3) {
        const points = indices.slice(index, index + 3).map(v => new Vector3().fromArray(positions, v * 3));
        const triangle = new Triangle(...points);
        if (triangle.getArea() > 1e-14)
            faces.push({
                index: index / 3,
                triangle,
                normal: triangle.getNormal(new Vector3()),
                box: new Box3().setFromPoints(points)
            });
    }
    function build(entries) {
        const box = new Box3();
        for (const face of entries)
            box.union(face.box);
        if (entries.length <= 12)
            return { box, faces: entries };
        const size = box.getSize(new Vector3());
        const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
        entries.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
        const middle = Math.floor(entries.length / 2);
        return {
            box,
            left: build(entries.slice(0, middle)),
            right: build(entries.slice(middle))
        };
    }
    const tree = build(faces);
    return (origin, direction, contacts = false) => {
        const ray = new Ray(origin, direction), point = new Vector3(), distances = [];
        function visit(node) {
            if (!ray.intersectsBox(node.box))
                return;
            if (node.faces) {
                for (const face of node.faces)
                    if (ray.intersectTriangle(face.triangle.a, face.triangle.b, face.triangle.c, false, point)) {
                        const distance = point.distanceTo(origin);
                        if (distance > .000001)
                            distances.push({
                                distance,
                                triangle: face.index,
                                barycentric: face.triangle.getBarycoord(point, new Vector3()).toArray(),
                                point: point.clone(),
                                orientation: face.normal.dot(direction)
                            });
                    }
            }
            else {
                visit(node.left);
                visit(node.right);
            }
        }
        visit(tree);
        distances.sort((a, b) => a.distance - b.distance);
        const unique = distances.filter((value, index) => index === 0 || value.distance - distances[index - 1].distance > .000001);
        return contacts ? unique : unique.map(value => value.distance);
    };
}
const underlayBytes = await readFile(underlayPath);
assert.equal(hash(underlayBytes), underlaySha256);
const underlay = await io.readBinary(underlayBytes);
const top = underlay.getRoot().listMeshes().find(mesh => mesh.getName() === 'Module_grid_trial_top_0').listPrimitives()[0];
const bodyJoints = [], bodyWeights = [];
for (let vertex = 0; vertex < fit.source.positions.length / 3; vertex++)
    for (let channel = 0; channel < 4; channel++) {
        bodyJoints.push(body.geometry.getAttribute('skinIndex').getComponent(vertex, channel));
        bodyWeights.push(body.geometry.getAttribute('skinWeight').getComponent(vertex, channel));
    }
const headPoints = [];
for (let vertex = 0; vertex < fit.source.positions.length / 3; vertex++)
    if (fit.source.regions[vertex] === 'HEAD')
        headPoints.push(new Vector3().fromArray(fit.source.positions, vertex * 3));
/**
 * Fit the actual source panels with a single native body-supported carrier.
 * Small detached stitches/rivets keep one common carrier frame, rather than
 * following unrelated nearest-point donors at every corner. The source's UVs,
 * indices, material and real neck/arm/hem openings remain intact.
 */
function armorFit(primitive, recipe) {
    const sourcePositions = primitive.getAttribute('POSITION'), count = sourcePositions.getCount();
    const indices = Array.from(primitive.getIndices().getArray());
    const seed = new Matrix4().makeTranslation(...recipe.sourceSeed.translation)
        .multiply(new Matrix4().makeScale(...recipe.sourceSeed.scale));
    const points = Array.from({ length: count }, (_, v) => new Vector3(...sourcePositions.getElement(v, [])).applyMatrix4(seed));
    const sourceParent = Array.from({ length: count }, (_, v) => v), positionKeys = new Map();
    const find = v => sourceParent[v] === v ? v : (sourceParent[v] = find(sourceParent[v]));
    const union = (a, b) => { sourceParent[find(a)] = find(b); };
    for (let v = 0; v < count; v++) {
        const key = sourcePositions.getElement(v, []).map(value => Math.round(value * 1e6)).join(':');
        if (positionKeys.has(key))
            union(v, positionKeys.get(key));
        else
            positionKeys.set(key, v);
    }
    for (let f = 0; f < indices.length; f += 3) {
        union(indices[f], indices[f + 1]);
        union(indices[f], indices[f + 2]);
    }
    const components = new Map();
    for (let f = 0; f < indices.length; f += 3) {
        const root = find(indices[f]);
        if (!components.has(root))
            components.set(root, {
                root,
                triangles: [],
                vertices: new Set(),
                area: 0
            });
        const component = components.get(root), ids = indices.slice(f, f + 3);
        component.triangles.push(f / 3);
        ids.forEach(v => component.vertices.add(v));
        component.area += new Triangle(...ids.map(v => points[v])).getArea();
    }
    const ordered = [...components.values()].sort((a, b) => b.area - a.area || a.root - b.root), main = ordered[0];
    assert.equal(main.triangles.length, recipe.mainSourceTriangles, 'The actual source main panel changed');
    const center = new Vector3(0, 1.18, -.018), outerIndices = [], innerIndices = [], outerSourceTriangles = [];
    for (const face of main.triangles) {
        const ids = indices.slice(face * 3, face * 3 + 3), triangle = new Triangle(...ids.map(v => points[v]));
        const radial = triangle.getMidpoint(new Vector3()).sub(center).normalize();
        const orientation = triangle.getNormal(new Vector3()).dot(radial);
        if (orientation > .05) {
            outerIndices.push(...ids);
            outerSourceTriangles.push(face);
        }
        if (orientation < -.05)
            innerIndices.push(...ids);
    }
    assert.ok(outerIndices.length > 300 && innerIndices.length > 300, 'Actual main outer and inner source surfaces are required');
    const sourceSurface = {
        positions: points.flatMap(p => p.toArray()),
        indices: outerIndices,
        triangles: outerIndices.length / 3
    };
    const sourceQuery = createSurfaceQuery(sourceSurface);
    const sourceInnerQuery = createSurfaceQuery({
        ...sourceSurface,
        indices: innerIndices,
        triangles: innerIndices.length / 3
    });
    const bodyIndices = [];
    for (let f = 0; f < fit.source.indices.length; f += 3) {
        const ids = fit.source.indices.slice(f, f + 3);
        if (ids.every(v => {
            const p = new Vector3().fromArray(fit.source.positions, v * 3);
            return p.y >= .85 && p.y <= 1.46 && Math.abs(p.x) <= .23;
        }))
            bodyIndices.push(...ids);
    }
    const bodySurface = {
        ...fit.source,
        indices: bodyIndices,
        triangles: bodyIndices.length / 3
    }, bodyQuery = createSurfaceQuery(bodySurface);
    const controls = [], controlByVertex = new Map(), welded = new Map();
    for (const vertex of new Set(outerIndices)) {
        const key = points[vertex].toArray().map(value => Math.round(value * 1e6)).join(':');
        if (!welded.has(key)) {
            const point = points[vertex], contact = bodyQuery.closest(point);
            const thickness = sourceInnerQuery.closest(point).distance;
            const target = contact.point.clone().addScaledVector(contact.normal, clearanceMetres + thickness);
            const skin = barycentricNativeWeights(bodySurface, bodyJoints, bodyWeights, contact.anchor);
            const full = new Float64Array(44);
            for (const [joint, weight] of skin.full)
                full[joint] = weight;
            const delta = target.clone().sub(point), control = {
                point: point.clone(),
                rawDelta: delta,
                delta: delta.clone(),
                rawWeights: full,
                weights: full.slice(),
                neighbours: new Set(),
                thickness,
                anchor: contact.anchor
            };
            welded.set(key, controls.length);
            controls.push(control);
        }
        controlByVertex.set(vertex, welded.get(key));
    }
    for (let f = 0; f < outerIndices.length; f += 3) {
        const ids = outerIndices.slice(f, f + 3).map(v => controlByVertex.get(v));
        for (let e = 0; e < 3; e++) {
            controls[ids[e]].neighbours.add(ids[(e + 1) % 3]);
            controls[ids[(e + 1) % 3]].neighbours.add(ids[e]);
        }
    }
    // Smooth displacement over the source panel, not across source openings.
    // An anchored update retains the supplied leather shape and decorations.
    for (let pass = 0; pass < 6; pass++) {
        const next = controls.map(control => {
            const delta = new Vector3(), weights = new Float64Array(44);
            let sum = 0;
            for (const neighbour of control.neighbours) {
                const other = controls[neighbour], weight = 1 / Math.max(.002, control.point.distanceTo(other.point));
                delta.addScaledVector(other.delta, weight);
                for (let joint = 0; joint < 44; joint++)
                    weights[joint] += other.weights[joint] * weight;
                sum += weight;
            }
            if (sum === 0)
                return { delta: control.rawDelta.clone(), weights: control.rawWeights.slice() };
            delta.multiplyScalar(.5 / sum).addScaledVector(control.rawDelta, .5);
            for (let joint = 0; joint < 44; joint++)
                weights[joint] = weights[joint] * .5 / sum + control.rawWeights[joint] * .5;
            return { delta, weights };
        });
        controls.forEach((control, i) => { control.delta = next[i].delta; control.weights = next[i].weights; });
    }
    // These exact source corners exposed 4.5-6.1 mm of the real native skin
    // during Spear. The compact smooth bias affects sixteen cage controls,
    // including the mirrored side; it adds no blanket garment inflation.
    const skinPatchVertices = recipe.localSkinClearance?.sourceVertices ?? [], skinPatchPoints = skinPatchVertices.flatMap(vertex => [points[vertex], points[vertex].clone().setX(-points[vertex].x)]);
    let projectedControls = 0, maximumControlProjection = 0, localSkinClearanceControls = 0;
    for (const control of controls) {
        const fitted = control.point.clone().add(control.delta), contact = bodyQuery.closest(fitted);
        const clearance = fitted.clone().sub(contact.point).dot(contact.normal);
        const patchDistance = Math.min(...skinPatchPoints.map(point => point.distanceTo(control.point)));
        const t = Math.max(0, 1 - patchDistance / .03), localSkinClearance = .008 * t * t * (3 - 2 * t);
        const required = clearanceMetres + control.thickness + localSkinClearance;
        if (localSkinClearance > 1e-7)
            localSkinClearanceControls++;
        if (clearance < required) {
            const correction = required - clearance;
            control.delta.addScaledVector(contact.normal, correction);
            projectedControls++;
            maximumControlProjection = Math.max(maximumControlProjection, correction);
        }
        // Placement and the complete native weight field share the same
        // admitted body surface. No rejected/remote sleeve donor is reused.
        const finalContact = bodyQuery.closest(control.point.clone().add(control.delta));
        const skin = barycentricNativeWeights(bodySurface, bodyJoints, bodyWeights, finalContact.anchor);
        control.weights.fill(0);
        for (const [joint, weight] of skin.full)
            control.weights[joint] = weight;
        control.anchor = finalContact.anchor;
    }
    const fittedControl = v => points[v].clone().add(controls[controlByVertex.get(v)].delta);
    const componentByVertex = new Map(), rigidAnchors = new Map(), rigidCenters = new Map(), rigidDonors = new Map();
    let rigidDetails = 0;
    for (const component of ordered) {
        const vertices = [...component.vertices], box = new Box3().setFromPoints(vertices.map(v => points[v]));
        vertices.forEach(v => componentByVertex.set(v, component.root));
        if (component !== main && box.getSize(new Vector3()).length() <= .08) {
            const centroid = new Vector3();
            vertices.forEach(v => centroid.add(points[v]));
            centroid.multiplyScalar(1 / vertices.length);
            rigidAnchors.set(component.root, sourceQuery.closest(centroid).anchor);
            rigidCenters.set(component.root, centroid);
            rigidDetails++;
        }
    }
    const positions = new Float32Array(count * 3), joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    let maximumDiscardedMass = 0, maximumDisplacement = 0, maximumResidual = 0;
    const nativeJointVertexCounts = {};
    let maximumPreviousToFinalWeightDifference = 0, maximumBackClearanceBias = 0, backClearanceVertices = 0;
    const backBias = point => {
        const recipeBias = recipe.centralBackClearance;
        if (!recipeBias || point.z >= recipeBias.maximumZ)
            return 0;
        const radius = Math.hypot((point.x - recipeBias.center[0]) / recipeBias.radii[0], (point.y - recipeBias.center[1]) / recipeBias.radii[1]);
        const t = Math.max(0, Math.min(1, (2 - radius) / 1.25));
        return recipeBias.maximumOffset * t * t * (3 - 2 * t);
    };
    for (let vertex = 0; vertex < count; vertex++) {
        const point = points[vertex], anchor = rigidAnchors.get(componentByVertex.get(vertex)) ?? sourceQuery.closest(point).anchor;
        const ids = outerIndices.slice(anchor.triangle * 3, anchor.triangle * 3 + 3), sourceTriangle = ids.map(v => points[v]), targetTriangle = ids.map(fittedControl);
        const sourcePoint = new Vector3(), targetPoint = new Vector3(), full = new Float64Array(44);
        for (let corner = 0; corner < 3; corner++) {
            const amount = anchor.barycentric[corner], control = controls[controlByVertex.get(ids[corner])];
            sourcePoint.addScaledVector(sourceTriangle[corner], amount);
            targetPoint.addScaledVector(targetTriangle[corner], amount);
            for (let joint = 0; joint < 44; joint++)
                full[joint] += control.weights[joint] * amount;
        }
        const sourceU = sourceTriangle[1].clone().sub(sourceTriangle[0]).normalize(), sourceN = new Triangle(...sourceTriangle).getNormal(new Vector3()), sourceV = sourceN.clone().cross(sourceU).normalize();
        const targetU = targetTriangle[1].clone().sub(targetTriangle[0]).normalize(), targetN = new Triangle(...targetTriangle).getNormal(new Vector3()), targetV = targetN.clone().cross(targetU).normalize();
        assert.ok(targetN.lengthSq() > .99, 'Native cage must not collapse a source carrier triangle');
        // Carry the actual supplied thickness, straps and stitches through a
        // locally rotated surface frame instead of flattening them onto skin.
        const residual = point.clone().sub(sourcePoint), fitted = targetPoint.clone().addScaledVector(targetU, residual.dot(sourceU)).addScaledVector(targetV, residual.dot(sourceV)).addScaledVector(targetN, residual.dot(sourceN));
        const detailCenter = rigidCenters.get(componentByVertex.get(vertex));
        let detailTarget;
        if (detailCenter) {
            const offset = detailCenter.clone().sub(sourcePoint);
            detailTarget = targetPoint.clone().addScaledVector(targetU, offset.dot(sourceU))
                .addScaledVector(targetV, offset.dot(sourceV)).addScaledVector(targetN, offset.dot(sourceN));
        }
        const localBackBias = backBias(detailTarget ?? fitted);
        fitted.z -= localBackBias;
        if (detailTarget)
            detailTarget.z -= localBackBias;
        maximumBackClearanceBias = Math.max(maximumBackClearanceBias, localBackBias);
        if (localBackBias > 1e-7)
            backClearanceVertices++;
        if (recipe.finalPointDonorBodyLOD === 2) {
            const previous = full.slice();
            const component = componentByVertex.get(vertex), detailCenter = rigidCenters.get(component);
            let donor = detailCenter ? rigidDonors.get(component) : undefined;
            if (!donor) {
                const donorPoint = fitted.clone();
                if (detailTarget)
                    donorPoint.copy(detailTarget);
                donor = barycentricNativeWeights(donorFit.source, donorJoints, donorWeights, donorQuery.closest(donorPoint).anchor);
                if (detailCenter)
                    rigidDonors.set(component, donor);
            }
            full.fill(0);
            for (const [joint, weight] of donor.full)
                full[joint] = weight;
            maximumPreviousToFinalWeightDifference = Math.max(maximumPreviousToFinalWeightDifference, previous.reduce((sum, weight, joint) => sum + Math.abs(weight - full[joint]), 0));
        }
        const sorted = Array.from(full, (weight, joint) => [joint, weight]).filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]), retained = sorted.slice(0, 4), mass = retained.reduce((sum, [, weight]) => sum + weight, 0);
        const js = [...retained.map(([joint]) => joint), ...Array(4 - retained.length).fill(0)], ws = [...retained.map(([, weight]) => weight / mass), ...Array(4 - retained.length).fill(0)];
        positions.set(fitted.toArray(), vertex * 3);
        joints.set(js, vertex * 4);
        weights.set(ws, vertex * 4);
        maximumDiscardedMass = Math.max(maximumDiscardedMass, 1 - mass);
        maximumDisplacement = Math.max(maximumDisplacement, fitted.distanceTo(point));
        maximumResidual = Math.max(maximumResidual, residual.length());
        js.forEach((joint, i) => {
            if (ws[i] > .001)
                nativeJointVertexCounts[joint] = (nativeJointVertexCounts[joint] ?? 0) + 1;
        });
    }
    assert.ok(maximumDisplacement < .12, 'The smooth native cage exceeds its measured12cm source deformation bound');
    const normalThickness = controls.map(control => control.thickness);
    return {
        positions,
        joints,
        weights,
        audit: {
            method: 'Smooth native BODY-supported main source panel cage; actual details preserved as source-surface residuals',
            sourceVertices: count,
            sourceTriangles: indices.length / 3,
            sourceComponents: ordered.length,
            mainSourceTriangles: main.triangles.length,
            mainOuterTriangles: outerIndices.length / 3,
            mainInnerTriangles: innerIndices.length / 3,
            cageControls: controls.length,
            cageSmoothingPasses: 6,
            projectedControls,
            maximumControlProjection,
            localSkinClearance: {
                sourceVertices: skinPatchVertices,
                mirrored: true,
                maximumOffset: .008,
                footprint: .03,
                controls: localSkinClearanceControls,
                reason: recipe.localSkinClearance?.reason ?? 'Measured4.5–6.1mm complete-body Spear rear-armhole exposure against source faces1358/3847'
            },
            rigidSmallDetailComponents: rigidDetails,
            smallDetailMaximumDiameter: .08,
            maximumSourceDisplacement: maximumDisplacement,
            maximumDetailResidual: maximumResidual,
            maximumDiscardedNativeMass: maximumDiscardedMass,
            finalPointDonorBodyLOD: recipe.finalPointDonorBodyLOD ?? null,
            finalPointDonorBodySha256: recipe.finalPointDonorBodyLOD === 2 ? meshyHumanAssetIdentity[2].sha256 : null,
            maximumPreviousToFinalWeightDifference,
            centralBackClearance: recipe.centralBackClearance ?? null,
            maximumBackClearanceBias,
            backClearanceVertices,
            nativeJointVertexCounts,
            sourceNormalThickness: {
                min: Math.min(...normalThickness),
                max: Math.max(...normalThickness),
                mean: normalThickness.reduce((a, b) => a + b, 0) / normalThickness.length
            },
            bodySourceSha256: meshyHumanAssetIdentity[0].sha256,
            bodyDomainTriangles: bodySurface.triangles,
            clearanceMetres,
            sourceMainPanelTriangles: main.triangles,
            sourceMainOuterTriangles: outerSourceTriangles
        }
    };
}
function helmetFit(primitive, recipe = {}) {
    const count = primitive.getAttribute('POSITION').getCount();
    const source = Array.from({ length: count }, (_, vertex) => new Vector3(...primitive.getAttribute('POSITION').getElement(vertex, [])));
    const openingNormal = new Vector3(...(recipe.openingNormal ?? [.01909356764293636, .9329022265811046, .3596232352263713])).normalize();
    const rotation = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(openingNormal, new Vector3(0, 1, 0)));
    const level = rotation.clone().multiply(new Matrix4().makeTranslation(0, -(recipe.openingCenterY ?? .08546512046603905), 0));
    const points = source.map(p => p.clone().applyMatrix4(level));
    const rays = shellQuery(points.flatMap(p => p.toArray()), Array.from(primitive.getIndices().getArray()));
    const sourceRim = recipe.sourceRim ?? .025;
    const maximumY = Math.max(...points.map(p => p.y));
    const radii = y => {
        const values = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(dir => rays(new Vector3(0, y, 0), new Vector3(...dir))[0] ?? 0);
        return [Math.min(values[0], values[1]), Math.min(values[2], values[3])];
    };
    const raw = Array.from({ length: 81 }, (_, i) => {
        const y = sourceRim + (maximumY - sourceRim) * i / 80;
        return [y - sourceRim, ...radii(Math.min(y, maximumY - .001))];
    });
    let ceiling = raw.findIndex((row, index) => index > 10 && (row[1] < .002 || row[2] < .002));
    if (ceiling < 0)
        ceiling = raw.length;
    const profile = raw.slice(0, ceiling);
    assert.ok(profile.length > 12 && profile[0][1] > .03 && profile[0][2] > .03, 'Actual helmet cavity must be measured');
    function radius(y, axis) {
        if (y < 0 || y > profile[profile.length - 1][0])
            return 0;
        let high = profile.findIndex(row => row[0] >= y);
        if (high <= 0)
            return profile[0][axis];
        const a = profile[high - 1], b = profile[high], amount = (y - a[0]) / (b[0] - a[0]);
        return a[axis] * (1 - amount) + b[axis] * amount;
    }
    let best;
    const cx = -.000634807064279222, cz = .015;
    for (let rimY = 1.58; rimY <= 1.6051; rimY += .005) {
        const above = headPoints.filter(p => p.y >= rimY);
        for (let sy = .4; sy <= 1.0001; sy += .01) {
            let radial = 1, sx = .68, sz = .78;
            for (const point of above) {
                const y = (point.y - rimY + .003) / sy;
                const rx = radius(y, 1), rz = radius(y, 2);
                if (rx < .001 || rz < .001) {
                    radial = Infinity;
                    break;
                }
                radial = Math.max(radial, Math.hypot((Math.abs(point.x - cx) + .003) / (rx * sx), (Math.abs(point.z - cz) + .003) / (rz * sz)));
            }
            sx *= radial;
            sz *= radial;
            const aspect = sy / Math.sqrt(sx * sz);
            if (recipe.verticalToRadialScale && (aspect < recipe.verticalToRadialScale.minimum
                || aspect > recipe.verticalToRadialScale.maximum)) continue;
            const cost = sx * sz * sy + .7 * Math.abs(rimY - 1.59);
            if (sx < 1.10 && sz < 1.20 && (!best || cost < best.cost))
                best = {
                    sx,
                    sy,
                    sz,
                    rimY,
                    cost
                };
        }
    }
    assert.ok(best, 'No measured native skull fit for supplied helmet cavity');
    let lowerBandSamples = 0;
    for (let pass = 0; pass < 16; pass++) {
        let required = 1;
        for (const point of headPoints) {
            const local = new Vector3((point.x - cx) / best.sx, (point.y - best.rimY) / best.sy + sourceRim, (point.z - cz) / best.sz);
            const radial = Math.hypot(local.x, local.z);
            if (radial < .001)
                continue;
            const wall = rays(new Vector3(0, local.y, 0), new Vector3(local.x / radial, 0, local.z / radial))[0];
            if (!wall)
                continue; // The actual face opening has no invented wall.
            lowerBandSamples++;
            required = Math.max(required, (radial + .004 / Math.min(best.sx, best.sz)) / wall);
        }
        if (required <= 1.00001)
            break;
        best.sx *= required;
        best.sz *= required;
    }
    assert.ok(best.sx < 1.2 && best.sz < 1.3, 'Helmet lower-band fit would require excessive enlargement');
    const frame = new Matrix4().makeTranslation(cx, best.rimY, cz);
    const transform = frame.clone().multiply(new Matrix4().makeScale(best.sx, best.sy, best.sz))
        .multiply(new Matrix4().makeTranslation(0, -sourceRim, 0)).multiply(level);
    const output = new Float32Array(count * 3), joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let vertex = 0; vertex < count; vertex++) {
        output.set(source[vertex].clone().applyMatrix4(transform).toArray(), vertex * 3);
        joints[vertex * 4] = 5;
        weights[vertex * 4] = 1;
    }
    const localCapPositions = Array.from({ length: count }, (_, vertex) => [
        output[vertex * 3] - cx, output[vertex * 3 + 1] - best.rimY, output[vertex * 3 + 2] - cz,
    ]).flat();
    const actualCapRays = shellQuery(localCapPositions, Array.from(primitive.getIndices().getArray()));
    const angularSamples = 96, heightSamples = 80;
    const minimumY = Math.min(...Array.from({ length: count }, (_, vertex) => localCapPositions[vertex * 3 + 1])) + .0001 - (recipe.crownRimGutterMetres ?? 0);
    const upperY = Math.max(...Array.from({ length: count }, (_, vertex) => localCapPositions[vertex * 3 + 1])) - .0001;
    const stepY = (upperY - minimumY) / (heightSamples - 1), cavityRadii = [];
    let ceilingY = -Infinity, closedRows = 0;
    for (let row = 0; row < heightSamples; row++) {
        const y = minimumY + row * stepY, measured = [];
        for (let angle = 0; angle < angularSamples; angle++) {
            const theta = angle * Math.PI * 2 / angularSamples;
            const distance = actualCapRays(new Vector3(0, y, 0), new Vector3(Math.cos(theta), 0, Math.sin(theta)))[0];
            measured.push(Number.isFinite(distance) && distance > .0001 && distance < .30 ? distance : null);
        }
        cavityRadii.push(...measured);
        if (measured.every(distance => distance !== null && distance > .008)) {
            ceilingY = y;
            closedRows++;
        }
    }
    assert.ok(Number.isFinite(ceilingY) && closedRows > 3, 'Actual cap must contain measured closed crown rows');
    const crownCavity = {
        version: 1,
        minimumY,
        stepY,
        angularSamples,
        radii: cavityRadii,
        ceilingY
    };
    return {
        positions: output,
        joints,
        weights,
        headwearFit: {
            version: 1,
            headJoint: 5,
            frame: frame.elements,
            profile: profile.map(row => [row[0] * best.sy, row[1] * best.sx * .98, row[2] * best.sz * .98]),
            clearance: recipe.hairClearanceMetres ?? .003,
            maximumLift: .012,
            maximumRadialScale: 1.08,
            crownCavity
        },
        audit: {
            method: 'Level actual source opening, ray-measure inner cavity, then solve against native skull',
            sourceOpeningNormal: openingNormal.toArray(),
            sourceRim,
            lowerBandSamples,
            cavityField: {
                angularSamples,
                heightSamples,
                minimumY,
                stepY,
                ceilingY,
                closedRows
            },
            sourceProfile: profile,
            scale: [best.sx, best.sy, best.sz],
            frame: frame.elements,
            transform: transform.elements,
            skullClearanceMetres: .003
        }
    };
}
const records = [], measurements = {}, receipts = [];
for (const source of sources) {
    const isBodyArmor = source.item.endsWith('BodyArmor');
    const original = await readFile(source.path);
    assert.equal(original.length, source.bytes);
    assert.equal(hash(original), source.sha256, 'Do not substitute a supplied source');
    const document = await io.readBinary(original);
    assert.equal(document.getRoot().listSkins().length, 0);
    assert.equal(document.getRoot().listAnimations().length, 0);
    const nodes = document.getRoot().listNodes().filter(node => node.getMesh());
    assert.equal(nodes.length, 1);
    const node = nodes[0], primitive = node.getMesh().listPrimitives()[0];
    assert.equal(node.getMesh().listPrimitives().length, 1);
    assert.equal(primitive.getIndices().getCount() / 3, source.triangles);
    const sourceUV = Array.from(primitive.getAttribute('TEXCOORD_0').getArray());
    const sourceIndices = Array.from(primitive.getIndices().getArray());
    const prepared = isBodyArmor ? armorFit(primitive, source.preparation) : helmetFit(primitive, source.preparation);
    const buffer = primitive.getAttribute('POSITION').getBuffer();
    const accessor = (array, type) => document.createAccessor().setArray(array).setType(type).setBuffer(buffer);
    primitive.setAttribute('POSITION', accessor(prepared.positions, 'VEC3'))
        .setAttribute('JOINTS_0', accessor(prepared.joints, 'VEC4'))
        .setAttribute('WEIGHTS_0', accessor(prepared.weights, 'VEC4'));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(prepared.positions, 3));
    geometry.setIndex(sourceIndices);
    geometry.computeVertexNormals();
    primitive.setAttribute('NORMAL', accessor(new Float32Array(geometry.getAttribute('normal').array), 'VEC3'));
    geometry.dispose();
    assert.deepEqual(Array.from(primitive.getAttribute('TEXCOORD_0').getArray()), sourceUV);
    assert.deepEqual(Array.from(primitive.getIndices().getArray()), sourceIndices);
    const meshName = 'Module_' + source.id.split('/')[1].replaceAll('-', '_');
    node.setName(meshName);
    node.getMesh().setName(meshName);
    const material = primitive.getMaterial(), texture = material.getBaseColorTexture();
    if (texture)
        texture.setImage(await sharp(texture.getImage()).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 90 }).toBuffer()).setMimeType('image/jpeg');
    material.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null)
        .setDoubleSided(true).setRoughnessFactor(1).setMetallicFactor(0);
    await document.transform(prune({ keepAttributes: true }));
    const output = await io.writeBinary(document), path = directory + '/' + source.name + '.glb';
    let underlayFit;
    if (source.underlayFit && !prepareBaseOnly) {
        const fitBytes = await readFile(source.underlayFit.path);
        assert.equal(hash(fitBytes), source.underlayFit.sha256);
        assert.equal(hash(output), source.underlayFit.armorSha256, 'Re-derive the fitted underlay after armor geometry changes');
        assert.equal(underlaySha256, source.underlayFit.tunicSha256);
        underlayFit = JSON.parse(fitBytes.toString('utf8'));
        assert.equal(underlayFit.version, 1);
        assert.equal(underlayFit.meshName, 'Module_grid_trial_top_0');
        assert.equal(underlayFit.vertices.length, source.underlayFit.vertices);
        assert.ok(underlayFit.maximumDisplacementMetres <= .08);
        const positions = top.getAttribute('POSITION');
        for (const [index, entry] of underlayFit.vertices.entries()) {
            assert.ok(Number.isInteger(entry.vertex) && entry.vertex >= 0 && entry.vertex < positions.getCount());
            assert.ok(index === 0 || entry.vertex > underlayFit.vertices[index - 1].vertex);
            assert.ok(entry.position.length === 3 && entry.position.every(Number.isFinite));
            const original = new Vector3(...positions.getElement(entry.vertex, []));
            assert.ok(original.distanceTo(new Vector3(...entry.position)) <= underlayFit.maximumDisplacementMetres + 1e-9);
            if (entry.joints || entry.weights) {
                assert.ok(entry.joints?.length === 4 && entry.weights?.length === 4);
                assert.ok(entry.joints.every(joint => Number.isInteger(joint) && joint >= 0 && joint < 44));
                assert.ok(entry.weights.every(weight => Number.isFinite(weight) && weight >= 0));
                assert.ok(Math.abs(entry.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-5);
            }
        }
    }
    const { headwearFit: ignoredHeadwear, ...baseTemplate } = template;
    const binding = {
        ...baseTemplate,
        id: source.id,
        moduleSha256: hash(output),
        skinning: isBodyArmor ? 'surface-barycentric-native' : 'rigid-native-head',
        recipe: {
            id: 'supplied-native-personal-armor',
            version: 1,
            blender: 'not-required'
        },
        reviewScope: 'Actual owner-supplied personal armor, native fitting pending combined owner QA',
        supportedAges: { min: 16, max: 100 },
        materialPolicy: {
            kind: 'provider-original',
            provider: 'Meshy',
            sourceSha256: source.sha256,
            reviewOnly: true
        },
        precomputedNative: {
            version: 3,
            coordinateFrame: 'metre',
            meshes: [{ mesh: meshName, vertices: prepared.positions.length / 3 }],
            bodyBindings: template.precomputedNative.bodyBindings,
            moduleCoverage: []
        },
        ...(isBodyArmor
            ? { bodyArmorLayer: {
                    version: 1,
                    underlayId,
                    underlaySha256,
                    clearanceMetres,
                    ...(underlayFit ? { underlayFit } : {})
                } }
            : { headwearFit: prepared.headwearFit }),
    };
    const bindingBytes = Buffer.from(JSON.stringify(binding, null, isBodyArmor ? 0 : 2) + '\n');
    const bounds = new Box3().setFromBufferAttribute(new BufferAttribute(prepared.positions, 3));
    const entry = {
        id: source.id,
        item: source.item,
        label: source.label,
        path,
        triangles: primitive.getIndices().getCount() / 3,
        materials: document.getRoot().listMaterials().length,
        bindingPath: path.replace('.glb', '.binding.json'),
        bindingSha256: hash(bindingBytes),
        anchor: isBodyArmor ? 'socket_chest' : 'socket_head_top',
        supportedAges: binding.supportedAges
    };
    measurements[path] = {
        sha256: hash(output),
        triangles: entry.triangles,
        materials: entry.materials,
        bytes: output.length,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }
    };
    const receipt = {
        schemaVersion: 1,
        source,
        reviewRequired: true,
        reviewStatus: 'pending-combined-owner-QA',
        output: measurements[path],
        bindingSha256: entry.bindingSha256,
        nativeRig: binding.rigSignature,
        fitting: { ...prepared.audit, ...(underlayFit ? { underlayFit: {
                    vertices: underlayFit.vertices.length,
                    maximumDisplacementMetres: underlayFit.maximumDisplacementMetres,
                    sourceDataSha256: source.underlayFit.sha256,
                    nativeBodyCoverageAdded: 0,
                    originalUnderlayIndicesRetained: true
                } } : {}) },
        preservation: {
            sourceUVsExact: true,
            sourceIndicesExact: true,
            sourceVertices: prepared.positions.length / 3,
            derivedVertices: prepared.positions.length / 3,
        },
        operations: [
            'Preserve actual supplied triangle indices, UVs, material colors and source openings',
            'Reuse native 44-joint skin, no source mannequin, separate skeleton, new clips or per-frame fitting',
            'Resize actual albedo to 1024 JPEG; retain original colors'
        ]
    };
    await writeChanged('public' + path, output);
    await writeChanged('public' + entry.bindingPath, bindingBytes);
    await writeChanged('public' + path.replace('.glb', '.provenance.json'), JSON.stringify(receipt, null, 2) + '\n');
    records.push(entry);
    receipts.push(receipt);
    console.log(source.item + ': ' + entry.triangles + ' triangles; ' + output.length + ' bytes; ' + JSON.stringify(prepared.audit));
}
await writeChanged('src/characters/NativePersonalArmorMeasurements.ts', '/** Generated by scripts/prepare-native-personal-armor.mjs. */\n' +
    'import type { AssetMeasurement } from \'./CharacterAssetMeasurements\';\n' +
    'export const nativePersonalArmorRecords = ' + JSON.stringify(records, null, 4) + ' as const;\n' +
    'export const nativePersonalArmorMeasurements: Record<string, AssetMeasurement> = ' + JSON.stringify(measurements, null, 4) + ';\n');
await writeChanged(outputDirectory + '/preparation.json', JSON.stringify(receipts, null, 2) + '\n');
