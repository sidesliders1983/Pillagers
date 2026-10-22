import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Object3D, Matrix4, Ray, Triangle, Vector3 } from 'three';
import { load } from './load-source.mjs';
const { NativeHairRig } = load('../src/characters/NativeHairRig.ts');

test('hair clearance broad phase matches exhaustive native ray queries at edges and transformed indexed/unindexed garments', () => {
    const meshes = [], material = new MeshBasicMaterial();
    for (const indexed of [false, true]) {
        const points = [0, 0, -.1, .1, 0, -.1, 0, 2, -.1,
            .04, .5, -.2, .065, .5, -.2, .04, 1.5, -.2];
        for (let index = 0; index < 100; index++) points.push(
            10 + index, 0, 0, 10 + index, 1, 0, 11 + index, 0, 0);
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
        if (indexed) geometry.setIndex(Array.from({ length: points.length / 3 }, (_, index) => index));
        const mesh = new Mesh(geometry, material);
        mesh.position.set(0, .05, indexed ? .3 : 0);
        meshes.push(mesh);
    }
    const rig = { back: new Object3D(), backBindInverse: new Matrix4(),
        binding: { rearProfile: [[0, 0], [.55, 0], [1, 0], [1.55, 0], [2, 0]] } };
    const expected = [], ray = new Ray(new Vector3(), new Vector3(0, 0, 1)), hit = new Vector3();
    try {
        for (const [y] of rig.binding.rearProfile) for (const [column, x] of [0, .04, .065].entries()) {
            ray.origin.set(x, y, -2);
            let rear = Infinity, nearest;
            for (const mesh of meshes) {
                mesh.updateWorldMatrix(true, false);
                const positions = mesh.geometry.attributes.position;
                for (let index = 0; index < positions.count; index += 3) {
                    const triangle = [0, 1, 2].map(offset =>
                        mesh.localToWorld(mesh.getVertexPosition(index + offset, new Vector3())));
                    if (ray.intersectTriangle(...triangle, false, hit) && hit.z < rear) {
                        rear = hit.z;
                        nearest = { mesh, vertices: [index, index + 1, index + 2],
                            weights: new Triangle(...triangle).getBarycoord(hit, new Vector3()).toArray() };
                    }
                }
            }
            if (nearest) expected.push({ column, ...nearest });
        }
        NativeHairRig.prototype.configureClearance.call(rig, meshes);
        assert.equal(rig.garmentSamples.length, expected.length);
        for (const [index, sample] of rig.garmentSamples.entries()) {
            assert.equal(sample.column, expected[index].column);
            assert.deepEqual(sample.corners.map(corner => rig.garmentVertices[corner].vertex), expected[index].vertices);
            for (const corner of sample.corners) assert.equal(rig.garmentVertices[corner].mesh, expected[index].mesh);
            assert.ok(sample.weights.toArray().every((value, component) => Math.abs(value - expected[index].weights[component]) < 1e-12));
        }
        assert.ok(rig.lastClearanceWork.testedIntersections < rig.lastClearanceWork.possibleIntersections / 10);
        assert.equal(rig.lastClearanceWork.temporaryCandidateBytes, 2 * 2 * 4);
    } finally {
        for (const mesh of meshes) mesh.geometry.dispose();
        material.dispose();
    }
});

test('dense clothing falls back to exhaustive hair queries at the fixed candidate budget', () => {
    const geometry = new BufferGeometry().setAttribute('position',
        new Float32BufferAttribute([-.1, 0, 0, .2, 0, 0, -.1, 2, 0], 3));
    const triangles = 65_537;
    geometry.setIndex(Array.from({ length: triangles * 3 }, (_, index) => index % 3));
    const material = new MeshBasicMaterial(), mesh = new Mesh(geometry, material);
    const rig = { back: new Object3D(), backBindInverse: new Matrix4(), binding: { rearProfile: [[.55, 0]] } };
    try {
        NativeHairRig.prototype.configureClearance.call(rig, [mesh]);
        assert.equal(rig.lastClearanceWork.temporaryCandidateBytes, 0);
        assert.equal(rig.lastClearanceWork.testedIntersections, triangles * 3);
        assert.equal(rig.garmentSamples.length, 3);
        assert.ok(rig.garmentSamples.every(sample => sample.corners.every((corner, index) =>
            rig.garmentVertices[corner].vertex === index)));
    } finally { geometry.dispose(); material.dispose(); }
});
