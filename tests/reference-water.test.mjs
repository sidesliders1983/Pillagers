import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrontSide, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { load } from './load-source.mjs';

const { ReferenceWater } = load('../src/water/ReferenceWater.ts');

function textures(water) {
    return [...new Set(Object.values(water.mesh.material.uniforms)
        .map(uniform => uniform.value)
        .filter(value => value?.isTexture))];
}

test('mobile water tiers keep one surface within explicit geometry and texture budgets', () => {
    const budgets = { low: 2048, medium: 8192, high: 18432 };
    for (const [quality, triangles] of Object.entries(budgets)) {
        const water = new ReferenceWater({ quality });
        try {
            const stats = water.getStats();
            assert.equal(stats.quality, quality);
            assert.equal(stats.drawCalls, 1);
            assert.ok(stats.triangles <= triangles);
            assert.equal(water.mesh.geometry.index.count / 3, stats.triangles);
            assert.ok(stats.textureBytes > 0 && stats.textureBytes <= 1024 * 1024);
            assert.equal(water.mesh.material.side, FrontSide);
            assert.equal(water.mesh.material.transparent, false);
            assert.equal(water.mesh.material.depthWrite, true);
            assert.equal(water.mesh.castShadow, false);
        } finally {
            water.dispose();
        }
    }
});

test('frame updates retain geometry, material and textures instead of reallocating GPU resources', () => {
    const water = new ReferenceWater({ quality: 'low' });
    try {
        const camera = new PerspectiveCamera();
        camera.position.set(2, 6, 10);
        camera.updateMatrixWorld();
        const geometry = water.mesh.geometry;
        const material = water.mesh.material;
        const maps = textures(water);
        const positions = geometry.attributes.position.array.slice();
        const stats = water.getStats();
        for (let frame = 0; frame <= 120; frame++) water.update(frame / 60, camera);
        assert.equal(water.mesh.geometry, geometry);
        assert.equal(water.mesh.material, material);
        assert.deepEqual(textures(water), maps);
        assert.deepEqual(geometry.attributes.position.array, positions);
        assert.deepEqual(water.getStats(), stats);
    } finally {
        water.dispose();
    }
});

test('quality changes retire old geometry and setting the current tier allocates nothing', () => {
    const water = new ReferenceWater({ quality: 'low' });
    try {
        const firstGeometry = water.mesh.geometry;
        const firstMaterial = water.mesh.material;
        const firstTextures = textures(water);
        let disposed = 0;
        firstGeometry.addEventListener('dispose', () => disposed++);
        water.setQuality('low');
        assert.equal(water.mesh.geometry, firstGeometry);
        assert.equal(disposed, 0);
        water.setQuality('high');
        assert.equal(disposed, 1);
        assert.notEqual(water.mesh.geometry, firstGeometry);
        assert.equal(water.mesh.material, firstMaterial);
        assert.deepEqual(textures(water), firstTextures);
        assert.equal(water.getStats().quality, 'high');
    } finally {
        water.dispose();
    }
});

test('invalid numeric options cannot leak nonfinite coordinates or shader parameters', () => {
    for (const size of [0, -1, NaN, Infinity]) {
        assert.throws(() => new ReferenceWater({ size }), RangeError);
    }
    for (const level of [NaN, Infinity, -Infinity]) {
        assert.throws(() => new ReferenceWater({ level }), RangeError);
    }
    for (const name of ['waveAmplitude', 'waveSpeed', 'detailStrength']) {
        for (const value of [-1, NaN, Infinity]) {
            assert.throws(() => new ReferenceWater({ [name]: value }), RangeError);
        }
    }
    const water = new ReferenceWater();
    try {
        for (const time of [-1, NaN, Infinity]) assert.throws(() => water.update(time), RangeError);
        for (const name of ['waveAmplitude', 'waveSpeed', 'detailStrength']) {
            assert.throws(() => water.setParameters({ [name]: NaN }), RangeError);
        }
        assert.throws(() => water.setQuality('ultra'), RangeError);
        water.setParameters({ waveAmplitude: 0, waveSpeed: 0, detailStrength: 0 });
        water.update(0);
    } finally {
        water.dispose();
    }
});

test('lighting and time changes do not replace the caller-owned scene object', () => {
    const water = new ReferenceWater({ level: -0.12 });
    try {
        const mesh = water.mesh;
        water.setLighting({ sunDirection: new Vector3(-1, 2, -3), intensity: 0.5,
            sunColor: '#fff5db', skyColor: '#b8d8e2' });
        water.update(10);
        assert.equal(water.mesh, mesh);
        assert.equal(mesh.position.y, -0.12);
        assert.ok(Object.values(mesh.material.uniforms)
            .filter(uniform => typeof uniform.value === 'number')
            .every(uniform => Number.isFinite(uniform.value)));
    } finally {
        water.dispose();
    }
});

test('disposing one component once releases its resources without invalidating another component', () => {
    const first = new ReferenceWater();
    const second = new ReferenceWater();
    const resources = [first.mesh.geometry, first.mesh.material, ...textures(first)];
    const secondResources = [second.mesh.geometry, second.mesh.material, ...textures(second)];
    const counts = resources.map(() => 0);
    let otherDisposals = 0;
    resources.forEach((resource, index) => resource.addEventListener('dispose', () => counts[index]++));
    secondResources.forEach(resource => resource.addEventListener('dispose', () => otherDisposals++));
    first.dispose();
    first.dispose();
    assert.deepEqual(counts, resources.map(() => 1));
    assert.equal(otherDisposals, 0);
    second.update(1);
    second.dispose();
});


test('the optional far skirt preserves budgets and remains inside displacement-aware culling bounds', () => {
    for (const extent of [0, -1, 39, NaN, Infinity]) {
        assert.throws(() => new ReferenceWater({ size: 40, extent }), RangeError);
    }
    const water = new ReferenceWater({ size: 40, extent: 2000, quality: 'low' });
    try {
        assert.equal(water.getStats().triangles, 2048);
        assert.equal(water.getStats().drawCalls, 1);
        water.setParameters({ waveAmplitude: 2 });
        const geometry = water.mesh.geometry;
        const point = new Vector3();
        let maxHorizontal = 0;
        for (let index = 0; index < geometry.attributes.position.count; index++) {
            point.fromBufferAttribute(geometry.attributes.position, index);
            maxHorizontal = Math.max(maxHorizontal, Math.abs(point.x), Math.abs(point.z));
            assert.ok(geometry.boundingBox.containsPoint(point));
            assert.ok(geometry.boundingSphere.containsPoint(point));
        }
        assert.equal(maxHorizontal, 1000);
        assert.ok(geometry.boundingBox.min.y <= -2 && geometry.boundingBox.max.y >= 2);

        // A camera aimed at the skirt must not cull the water using only the inner patch.
        const camera = new PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(900, 20, 0);
        camera.lookAt(900, 0, 0);
        camera.updateMatrixWorld();
        water.mesh.updateMatrixWorld();
        const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        assert.equal(new Frustum().setFromProjectionMatrix(projection).intersectsObject(water.mesh), true);
    } finally {
        water.dispose();
    }
});


test('every stretched skirt triangle has zero wave slope to prevent radial horizon streaks', () => {
    const size = 40;
    for (const quality of ['low', 'medium', 'high']) {
        const water = new ReferenceWater({ size, extent: 2000, quality });
        try {
            const geometry = water.mesh.geometry;
            const positions = geometry.attributes.position;
            const fade = geometry.attributes.waveFade;
            const indices = geometry.index.array;
            let skirtTriangles = 0;
            for (let offset = 0; offset < indices.length; offset += 3) {
                const triangle = [indices[offset], indices[offset + 1], indices[offset + 2]];
                const touchesSkirt = triangle.some(index =>
                    Math.abs(positions.getX(index)) > size / 2 ||
                    Math.abs(positions.getZ(index)) > size / 2);
                if (!touchesSkirt) continue;
                skirtTriangles++;
                for (const index of triangle) {
                    assert.equal(fade.getX(index), 0,
                        quality + ' skirt triangles must not interpolate near-field slopes over the horizon.');
                }
            }
            assert.ok(skirtTriangles > 0, 'The fixture must exercise the stretched far skirt.');
            assert.ok(fade.array.some(value => value === 1), 'Interior wave displacement must remain active.');
        } finally {
            water.dispose();
        }
    }
});
