import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createBlueprintTerrain, disposeBlueprintTerrain } = load('../src/world/BlueprintTerrain.ts');

function smallWorld(heights) {
    const world = structuredClone(generateWorld({ seed: 17 }));
    world.terrain = { ...world.terrain, columns: 3, rows: 3, spacing: 1,
        bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, heights };
    delete world.environment;
    return world;
}
function near(actual, expected, message) {
    assert.equal(actual.length, expected.length);
    for (let axis = 0; axis < expected.length; axis++)
        assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-6, message + ': ' + actual);
}

test('smooth terrain shares the area-weighted corner normal without changing its triangles or world', () => {
    const world = smallWorld([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const canonical = JSON.stringify(world);
    const baseline = createBlueprintTerrain(world);
    const smooth = createBlueprintTerrain(world, undefined, 'none', undefined, 'baseline', false, 'smooth');
    try {
        const positions = smooth.geometry.getAttribute('position');
        const normals = smooth.geometry.getAttribute('normal');
        let shared = 0;
        for (let vertex = 0; vertex < positions.count; vertex++) {
            if (positions.getX(vertex) === 1 && positions.getZ(vertex) === 1) {
                near([normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)], [0, 1, 0],
                    'The symmetric peak has one upward averaged normal at every duplicate');
                shared++;
            }
        }
        assert.ok(shared >= 4);
        assert.deepEqual(positions.array, baseline.geometry.getAttribute('position').array);
        assert.equal(positions.count, 24);
        assert.equal(smooth.geometry.index, baseline.geometry.index);
        assert.equal(smooth.material.flatShading, false);
        assert.equal(baseline.material.flatShading, true);
        assert.equal(JSON.stringify(world), canonical);
    } finally { disposeBlueprintTerrain(baseline); disposeBlueprintTerrain(smooth); }
});

test('canonical exposed rock retains face definition while ground materials own their smooth flags', async () => {
    const { MeshStandardMaterial, Texture } = await import('three');
    const world = smallWorld([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    world.environment = structuredClone(generateWorld({ seed: 17, environment: { version: 1 } }).environment);
    world.environment.fields.rockExposure.fill(1);
    world.environment.primary.fill('bedrock');
    const sources = new Map(['Ground037', 'Ground054', 'mossy_rock', 'grass_path_2'].map(id =>
        [id, new MeshStandardMaterial({ name: id, flatShading: true, map: new Texture(), normalMap: new Texture() })]));
    const baseline = createBlueprintTerrain(world, sources);
    const smooth = createBlueprintTerrain(world, sources, 'none', undefined, 'baseline', false, 'smooth');
    try {
        const old = baseline.geometry.getAttribute('normal').array;
        near(smooth.geometry.getAttribute('normal').array, old, 'Fully exposed rock keeps its original geometric face normals');
        for (const material of smooth.material) {
            assert.equal(material.flatShading, false);
            assert.equal(sources.get(material.name).flatShading, true);
            assert.equal(material.normalMap.source, sources.get(material.name).normalMap.source);
        }
    } finally {
        disposeBlueprintTerrain(baseline); disposeBlueprintTerrain(smooth);
        for (const material of sources.values()) { material.map.dispose(); material.normalMap.dispose(); material.dispose(); }
    }
});

test('smooth island perimeter meets its canonical flat deep-sea continuation without a lighting seam', () => {
    const world = smallWorld([-7, -7, -7, -7, 1, -7, -7, -7, -7]);
    world.config = { ...world.config, preset: 'island', width: 2, depth: 2 };
    world.waterLevel = 0;
    const mesh = createBlueprintTerrain(world, undefined, 'form', undefined, 'baseline', false, 'smooth');
    try {
        const positions = mesh.geometry.getAttribute('position'), normals = mesh.geometry.getAttribute('normal');
        for (let vertex = 0; vertex < positions.count; vertex++)
            if (positions.getY(vertex) === -7)
                near([normals.getX(vertex), normals.getY(vertex), normals.getZ(vertex)], [0, 1, 0],
                    'The existing flat outer sea and matching boundary corners keep an upward normal');
    } finally { disposeBlueprintTerrain(mesh); }
});

test('zoned smoothing preserves source UVs, native masks, layer indices and asynchronous output', async () => {
    const { MeshStandardMaterial, Texture } = await import('three');
    const { createBlueprintTerrainAsync } = load('../src/world/BlueprintTerrain.ts');
    const world = structuredClone(generateWorld({ seed: 17, environment: { version: 1 } }));
    world.environment.fields.snowRetentionPotential.fill(.5);
    const canonical = JSON.stringify(world);
    const sources = new Map(['Ground037', 'Ground054', 'mossy_rock', 'grass_path_2'].map(id =>
        [id, new MeshStandardMaterial({ name: id, flatShading: true, map: new Texture(), normalMap: new Texture(), roughnessMap: new Texture() })]));
    const baseline = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned', true);
    const smooth = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned', true, 'smooth');
    let yields = 0;
    const asynchronous = await createBlueprintTerrainAsync(world, sources, 'none', undefined, 'zoned', true,
        async () => { yields++; }, 'smooth');
    try {
        for (const attribute of ['position', 'uv', 'uv1', 'uv2', 'uv3', 'color']) {
            assert.deepEqual(smooth.geometry.getAttribute(attribute).array, baseline.geometry.getAttribute(attribute).array);
            assert.deepEqual(asynchronous.geometry.getAttribute(attribute).array, smooth.geometry.getAttribute(attribute).array);
        }
        assert.deepEqual(smooth.geometry.index.array, baseline.geometry.index.array);
        assert.deepEqual(smooth.geometry.groups, baseline.geometry.groups);
        assert.deepEqual(asynchronous.geometry.getAttribute('normal').array, smooth.geometry.getAttribute('normal').array);
        assert.equal(smooth.material.length, baseline.material.length);
        assert.equal(smooth.material.length, 7, 'The fixture exercises the optional climate snow layer');
        smooth.material.forEach((material, index) => {
            assert.equal(material.flatShading, false);
            if (material.alphaMap) assert.deepEqual(material.alphaMap.image.data, baseline.material[index].alphaMap.image.data);
        });
        assert.ok(yields > 3, 'Asynchronous preparation continues yielding between CPU batches');
        assert.equal(JSON.stringify(world), canonical);
        assert.throws(() => createBlueprintTerrain(world, undefined, 'none', undefined, 'baseline', false, 'invalid'),
            /terrain shading/i);
    } finally {
        for (const mesh of [baseline, smooth, asynchronous]) disposeBlueprintTerrain(mesh);
        for (const material of sources.values()) { material.map.dispose(); material.normalMap.dispose(); material.roughnessMap.dispose(); material.dispose(); }
    }
});

test('source-only diagnostic holds normals fixed and isolates the approved grass UV projection', async () => {
    const { MeshStandardMaterial, Texture } = await import('three');
    const world = smallWorld([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const source = new MeshStandardMaterial({ map: new Texture(), normalMap: new Texture() });
    source.userData.repeatMeters = 24;
    const neutral = createBlueprintTerrain(world, undefined, 'form', undefined, 'baseline', false, 'smooth');
    const diagnostic = createBlueprintTerrain(world, new Map([['Ground037', source]]), 'source-grass', undefined, 'baseline', false, 'smooth');
    try {
        assert.ok(diagnostic.material.map);
        assert.equal(diagnostic.material.map.source, source.map.source);
        assert.equal(diagnostic.material.normalMap, null);
        assert.equal(diagnostic.material.alphaMap, null);
        assert.deepEqual(diagnostic.geometry.getAttribute('normal').array, neutral.geometry.getAttribute('normal').array);
        assert.deepEqual(diagnostic.geometry.getAttribute('position').array, neutral.geometry.getAttribute('position').array);
        assert.deepEqual(diagnostic.geometry.getAttribute('uv').array, neutral.geometry.getAttribute('uv').array);
        assert.equal(diagnostic.material.map.repeat.x, .125);
    } finally { disposeBlueprintTerrain(neutral); disposeBlueprintTerrain(diagnostic); source.map.dispose(); source.normalMap.dispose(); source.dispose(); }
});

test('grassy grid corners remain continuous even where the saved rock influence is nonzero', () => {
    const world = smallWorld([0, 0, 0, 0, 1, 0, 0, 0, 0]);
    world.environment = structuredClone(generateWorld({ seed: 17, environment: { version: 1 } }).environment);
    world.environment.primary.fill('grass');
    world.environment.fields.rockExposure.fill(.5);
    const mesh = createBlueprintTerrain(world, undefined, 'form', undefined, 'baseline', false, 'smooth');
    try {
        const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
        for (let vertex = 0; vertex < p.count; vertex++)
            if (p.getX(vertex) === 1 && p.getZ(vertex) === 1)
                near([n.getX(vertex), n.getY(vertex), n.getZ(vertex)], [0, 1, 0],
                    'Canonical grass receives the shared normal rather than residual per-face faceting');
    } finally { disposeBlueprintTerrain(mesh); }
});
