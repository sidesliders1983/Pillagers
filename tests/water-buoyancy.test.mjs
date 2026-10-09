import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { load } from './load-source.mjs';

const { ReferenceWater } = load('../src/water/ReferenceWater.ts');
const { FloatingSample } = load('../src/water-lab/FloatingSample.ts');

test('flat water queries respect world translation, bounds and invalid inputs', () => {
    const water = new ReferenceWater({ size: 40, level: 2, waveAmplitude: 0 });
    const parent = new Group();
    parent.position.set(10, 3, -7);
    parent.add(water.mesh);
    try {
        assert.equal(water.getHeightAt(10, -7, 12), 5);
        assert.ok(Math.abs(water.getHeightAt(30, 13, 12) - 5) < 1e-10);
        assert.equal(water.getHeightAt(30.01, -7, 12), null);
        for (const args of [[NaN, 0, 0], [0, Infinity, 0], [0, 0, -1]]) {
            assert.throws(() => water.getHeightAt(...args), RangeError);
        }
    } finally {
        water.dispose();
    }
    assert.throws(() => water.getHeightAt(0, 0, 0), /disposed/);
});

test('height at a grid vertex matches the reference shader wave phase and amplitude', () => {
    const water = new ReferenceWater({ size: 40, quality: 'high' });
    try {
        const vertices = water.mesh.geometry.attributes.position;
        const index = 50 * 97 + 53;
        const x = vertices.getX(index);
        const z = vertices.getZ(index);
        const time = 1.7;
        // High-quality 40 m grid resolves all three original shader wavelengths fully.
        const waves = [[0.94, 0.342, 8.5, 0.55], [-0.48, 0.877, 5.2, 0.29],
            [0.32, -0.947, 2.8, 0.16]];
        let expected = 0;
        for (const [dx, dz, wavelength, weight] of waves) {
            const frequency = 6.2831853 / wavelength;
            expected += Math.sin((x * dx + z * dz) * frequency
                - time * Math.sqrt(9.81 * frequency)) * 0.18 * weight;
        }
        assert.ok(Math.abs(water.getHeightAt(x, z, time) - expected) < 1e-7);
    } finally {
        water.dispose();
    }
});

test('height queries agree with raycast triangle interpolation in every tier and the skirt', () => {
    const raycaster = new Raycaster();
    const material = new MeshBasicMaterial();
    for (const quality of ['low', 'medium', 'high']) {
        const water = new ReferenceWater({ size: 40, extent: 2000, quality });
        const geometry = water.mesh.geometry.clone();
        const positions = geometry.attributes.position;
        const fixture = new Mesh(geometry, material);
        try {
            // Build an independent Three.js triangle surface from its displaced vertices.
            for (let index = 0; index < positions.count; index++) {
                positions.setY(index, water.getHeightAt(positions.getX(index), positions.getZ(index), 2.3));
            }
            geometry.computeBoundingSphere();
            fixture.updateMatrixWorld();
            const spacing = 40 / ({ low: 32, medium: 64, high: 96 }[quality]);
            for (const [x, z] of [
                [spacing * 0.2, spacing * 0.3], [spacing * 0.8, spacing * 0.7],
                [-3.7, 6.1], [900, 0], [-800, 700], [19.8, 0.3],
            ]) {
                raycaster.set(new Vector3(x, 5, z), new Vector3(0, -1, 0));
                const hit = raycaster.intersectObject(fixture)[0];
                assert.ok(hit);
                assert.ok(Math.abs(water.getHeightAt(x, z, 2.3) - hit.point.y) < 1e-6);
            }
            assert.equal(water.getHeightAt(900, 0, 25), 0);
        } finally {
            geometry.dispose();
            water.dispose();
        }
    }
    material.dispose();
});

test('floating sample is level at its draft on flat water and owns reusable resources', () => {
    const water = new ReferenceWater({ level: 3, waveAmplitude: 0 });
    const sample = new FloatingSample();
    const geometry = sample.mesh.geometry;
    const material = sample.mesh.material;
    let disposals = 0;
    geometry.addEventListener('dispose', () => disposals++);
    material.addEventListener('dispose', () => disposals++);
    sample.update(water, 10);
    assert.ok(Math.abs(sample.mesh.position.y - (3 + 0.85 / 2 - 0.34)) < 1e-10);
    assert.ok(sample.mesh.quaternion.toArray().slice(0, 3).every(value => Math.abs(value) < 1e-10));
    assert.equal(sample.mesh.quaternion.w, 1);
    for (let frame = 0; frame < 60; frame++) sample.update(water, frame / 60);
    assert.equal(sample.mesh.geometry, geometry);
    assert.equal(sample.mesh.material, material);
    sample.dispose();
    sample.dispose();
    assert.equal(disposals, 2);
    water.dispose();
});

test('four-point floating follows wave motion deterministically and ignores shading-only detail', () => {
    const water = new ReferenceWater({ quality: 'high', waveAmplitude: 0.36 });
    const sample = new FloatingSample();
    const second = new FloatingSample();
    const state = object => [...object.mesh.position.toArray(), ...object.mesh.quaternion.toArray()];
    try {
        sample.update(water, 0);
        const start = state(sample);
        sample.update(water, 1.5);
        const moved = state(sample);
        assert.ok(moved.some((value, index) => Math.abs(value - start[index]) > 0.001));
        assert.ok(Math.abs(sample.mesh.quaternion.length() - 1) < 1e-10);
        for (let frame = 0; frame <= 90; frame++) second.update(water, frame / 60);
        assert.deepEqual(state(second), moved, 'The same time must not depend on update history.');
        water.setParameters({ detailStrength: 5 });
        sample.update(water, 1.5);
        assert.deepEqual(state(sample), moved, 'Normal texture ripples do not displace the surface.');
        water.setParameters({ waveSpeed: 0 });
        sample.update(water, 2);
        const frozen = state(sample);
        sample.update(water, 20);
        assert.deepEqual(state(sample), frozen);
    } finally {
        sample.dispose();
        second.dispose();
        water.dispose();
    }
});