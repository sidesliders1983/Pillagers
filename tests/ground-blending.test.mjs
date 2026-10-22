import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshStandardMaterial } from 'three';
import { load } from './load-source.mjs';

const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
const { createBlueprintTerrain, disposeBlueprintTerrain } = load('../src/world/BlueprintTerrain.ts');
const ids = ['Ground037', 'Ground054', 'grass_path_2', 'mossy_rock'];

test('initial prepared wear draws exactly the same terrain and masks as the prior zero-then-update path', async () => {
    const { createBlueprintTerrainAsync, updateBlueprintWearAsync } = load('../src/world/BlueprintTerrain.ts');
    const world = fixture(), before = JSON.stringify(world);
    const weights = world.terrain.heights.map((_, index) => (index % 9) / 8);
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const yieldControl = async () => {};
    const legacy = await createBlueprintTerrainAsync(world, sources, 'none', weights.map(() => 0), 'zoned', false, yieldControl);
    const direct = await createBlueprintTerrainAsync(world, sources, 'none', weights, 'zoned', false, yieldControl);
    const sameDrawnSurface = () => {
        for (const [name, attribute] of Object.entries(legacy.geometry.attributes))
            assert.deepEqual(direct.geometry.attributes[name].array, attribute.array, name);
        assert.deepEqual(direct.geometry.groups, legacy.geometry.groups);
        assert.deepEqual(direct.geometry.drawRange, legacy.geometry.drawRange);
        const indices = mesh => mesh.geometry.index.array.slice(0, mesh.geometry.drawRange.count);
        assert.deepEqual(indices(direct), indices(legacy));
        for (let index = 0; index < legacy.material.length; index++)
            assert.deepEqual(direct.material[index].alphaMap?.image.data, legacy.material[index].alphaMap?.image.data);
    };
    try {
        await updateBlueprintWearAsync(legacy, weights, yieldControl);
        sameDrawnSurface();
        const changed = weights.map(weight => 1 - weight);
        await updateBlueprintWearAsync(legacy, changed, yieldControl);
        await updateBlueprintWearAsync(direct, changed, yieldControl);
        sameDrawnSurface();
        assert.equal(JSON.stringify(world), before);
    } finally {
        disposeBlueprintTerrain(legacy); disposeBlueprintTerrain(direct);
        for (const material of sources.values()) material.dispose();
    }
});

function fixture() {
    const world = structuredClone(generateWorld({ seed: 17, environment: { version: 1 } }));
    world.terrain.heights.fill(4);
    world.biomes.worn.fill(0);
    for (const [field, value] of Object.entries({ grass: .2, sand: .3, mud: .4, rockExposure: .1 })) {
        world.environment.fields[field].fill(value);
    }
    return world;
}

// Read the native material stack as the renderer does: each new layer covers the previous ones.
function contributions(mesh, pixel) {
    const result = Object.fromEntries(ids.map(id => [id, 0]));
    for (const material of mesh.material) {
        const alpha = material.alphaMap ? material.alphaMap.image.data[pixel * 4 + 1] / 255 : 1;
        for (const id of ids) result[id] *= 1 - alpha;
        result[material.name] += alpha;
    }
    return result;
}

test('zoned ground blends the canonical continuous influences without changing saved terrain', () => {
    const world = fixture();
    const before = JSON.stringify(world);
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const original = createBlueprintTerrain(world, sources);
    const blended = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned');
    try {
        const weights = contributions(blended, Math.floor(world.terrain.heights.length / 2));
        for (const [id, expected] of Object.entries({ Ground037: .2, Ground054: .3,
            grass_path_2: .4, mossy_rock: .1 })) {
            assert.ok(Math.abs(weights[id] - expected) < .005, id + ': ' + weights[id]);
        }
        assert.deepEqual(blended.geometry.getAttribute('position').array,
            original.geometry.getAttribute('position').array);
        assert.equal(JSON.stringify(world), before);
    } finally {
        disposeBlueprintTerrain(original);
        disposeBlueprintTerrain(blended);
        for (const source of sources.values()) source.dispose();
    }
});

test('steep rock uses height-aware native UVs while preserving canonical triangles and wear', async () => {
    const { Texture } = await import('three');
    const world = fixture();
    const { terrain } = world;
    terrain.heights = terrain.heights.map((_, index) => 50 + index % terrain.columns * terrain.spacing * 10);
    for (const field of ['grass', 'sand', 'mud']) world.environment.fields[field].fill(0);
    world.environment.fields.rockExposure.fill(1);
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id, map: new Texture() })]));
    const mesh = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned');
    try {
        const pixel = Math.floor(terrain.heights.length / 2);
        const rock = mesh.material.filter(material => material.name === 'mossy_rock');
        const side = rock.find(material => material.map.channel >= 2 &&
            material.alphaMap.image.data[pixel * 4 + 1] > 250);
        assert.ok(side, 'A steep east/west rock face must use elevation in its texture projection.');
        const uv = mesh.geometry.getAttribute('uv' + side.map.channel);
        const positions = mesh.geometry.getAttribute('position');
        const rise = positions.getY(2) - positions.getY(0);
        const mappedRise = (uv.getY(2) - uv.getY(0)) * side.map.repeat.y;
        assert.ok(Math.abs(mappedRise - rise / 4) < .00001, 'Approved rock scale is four metres, including elevation.');
        assert.equal(mesh.geometry.getAttribute('position').getY(2), 70);
    } finally {
        disposeBlueprintTerrain(mesh);
        for (const source of sources.values()) { source.map.dispose(); source.dispose(); }
    }
});

test('existing clearing and path wear updates the blend without adding saved fields', () => {
    const { updateBlueprintWear } = load('../src/world/BlueprintTerrain.ts');
    const world = fixture();
    const before = JSON.stringify(world);
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const mesh = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned');
    try {
        updateBlueprintWear(mesh, world.biomes.worn.map(() => .5));
        const weights = contributions(mesh, Math.floor(world.terrain.heights.length / 2));
        for (const [id, expected] of Object.entries({ Ground037: .1, Ground054: .15,
            grass_path_2: .7, mossy_rock: .05 })) {
            assert.ok(Math.abs(weights[id] - expected) < .006, id + ': ' + weights[id]);
        }
        assert.equal(JSON.stringify(world), before);
    } finally {
        disposeBlueprintTerrain(mesh);
        for (const source of sources.values()) source.dispose();
    }
});

test('empty blend layers do not redraw terrain, including after path wear changes', () => {
    const { updateBlueprintWear } = load('../src/world/BlueprintTerrain.ts');
    const world = fixture();
    for (const field of ['sand', 'mud', 'rockExposure']) world.environment.fields[field].fill(0);
    world.environment.fields.grass.fill(1);
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const mesh = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned');
    try {
        const vertices = mesh.geometry.getAttribute('position').count;
        assert.equal(mesh.geometry.groups.reduce((sum, group) => sum + group.count, 0), vertices,
            'Only the opaque grass pass is visible on this all-grass surface.');
        updateBlueprintWear(mesh, world.biomes.worn.map(() => 1));
        assert.equal(mesh.geometry.groups.reduce((sum, group) => sum + group.count, 0), vertices * 2,
            'New wear adds the soil pass without omitting the underlying terrain.');
        assert.equal(contributions(mesh, 0).grass_path_2, 1);
    } finally {
        disposeBlueprintTerrain(mesh);
        for (const source of sources.values()) source.dispose();
    }
});

test('optional snow uses saved climate potential and leaves the normal-climate substrate untouched', () => {
    const world = fixture();
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const warm = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned', true);
    const cold = structuredClone(world);
    cold.config.environment.meanAnnualTemperatureC = -8;
    cold.environment.fields.snowRetentionPotential.fill(.6);
    const before = JSON.stringify(cold);
    const snow = createBlueprintTerrain(cold, sources, 'none', undefined, 'zoned', true);
    const off = createBlueprintTerrain(cold, sources, 'none', undefined, 'zoned', false);
    try {
        assert.equal(warm.material.some(material => material.name === 'Climate snow candidate'), false);
        const cover = snow.material.find(material => material.name === 'Climate snow candidate');
        assert.ok(cover, 'Cold saved potential can be previewed explicitly.');
        assert.equal(cover.alphaMap.image.data[1], 153);
        assert.equal(off.material.some(material => material.name === 'Climate snow candidate'), false);
        assert.deepEqual(off.geometry.getAttribute('position').array, snow.geometry.getAttribute('position').array);
        assert.equal(JSON.stringify(cold), before);
    } finally {
        for (const mesh of [warm, snow, off]) disposeBlueprintTerrain(mesh);
        for (const source of sources.values()) source.dispose();
    }
});

test('material masks reproduce through save/load and legacy worlds retain their original renderer', () => {
    const { serializeWorld, parseWorld } = load('../src/world-generation/WorldSave.ts');
    const world = generateWorld({ seed: 42, environment: { version: 1 } });
    const saved = serializeWorld(world);
    const restored = parseWorld(saved);
    const legacy = generateWorld({ seed: 42 });
    const sources = new Map(ids.map(id => [id, new MeshStandardMaterial({ name: id })]));
    const first = createBlueprintTerrain(world, sources, 'none', undefined, 'zoned');
    const replay = createBlueprintTerrain(restored, sources, 'none', undefined, 'zoned');
    const old = createBlueprintTerrain(legacy, sources);
    const fallback = createBlueprintTerrain(legacy, sources, 'none', undefined, 'zoned', true);
    try {
        const masks = mesh => mesh.material.map(material => material.alphaMap?.image.data ?? null);
        assert.deepEqual(masks(replay), masks(first));
        assert.deepEqual(replay.geometry.index.array, first.geometry.index.array);
        assert.equal(serializeWorld(restored), saved);
        assert.deepEqual(masks(fallback), masks(old));
        assert.equal(fallback.geometry.getAttribute('uv2'), undefined);
        assert.equal(fallback.material.length, 4);
    } finally {
        for (const mesh of [first, replay, old, fallback]) disposeBlueprintTerrain(mesh);
        for (const source of sources.values()) source.dispose();
    }
});
