import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { DiscoveryFogMask } = load('../src/fjord-play/DiscoveryFogMask.ts');
const { DiscoveryFog } = load('../src/fjord-play/DiscoveryFog.ts');
const { discoveryAt } = load('../src/simulation/ClanDiscovery.ts');
const encode = bytes => Buffer.from(bytes).toString('hex');

function view(columns = 12, rows = 10, partial = false) {
    const states = Array.from({ length: columns * rows }, (_, cell) => cell % 7 < 2 ? 0 : cell % 3 ? 1 : 2);
    return knowledge(states, { version: 1, worldId: 'fog-fixture', cellSize: 8,
        grid: { columns, rows, bounds: { minX: -24, minZ: 16,
            maxX: -24 + columns * 8 - (partial ? 5 : 0), maxZ: 16 + rows * 8 - (partial ? 3 : 0) } } });
}

function knowledge(states, base) {
    const explored = new Uint8Array(Math.ceil(states.length / 8));
    const visible = new Uint8Array(explored.length);
    states.forEach((state, cell) => {
        if (state) explored[cell >> 3] |= 1 << (cell & 7);
        if (state === 2) visible[cell >> 3] |= 1 << (cell & 7);
    });
    return { ...base, explored: encode(explored), visible: encode(visible) };
}

// Independent, full-image oracle copied from the previous renderer. Incremental
// rasterization must preserve its inside-only feather, opacity and partial edges.
function legacyMask(view) {
    const { grid, cellSize } = view, { bounds, columns, rows } = grid;
    const width = columns * 4 + 2, height = rows * 4 + 2;
    const bytes = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const x = bounds.minX + (col - .5) * cellSize / 4;
        const z = bounds.minZ + (row - .5) * cellSize / 4;
        let alpha = 255;
        const known = discoveryAt(view, x, z);
        if (known !== 'unknown') {
            let distance = cellSize;
            const cx = Math.floor((x - bounds.minX) / cellSize), cz = Math.floor((z - bounds.minZ) / cellSize);
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                const minX = bounds.minX + (cx + dx) * cellSize;
                const minZ = bounds.minZ + (cz + dz) * cellSize;
                if (discoveryAt(view, minX + cellSize / 2, minZ + cellSize / 2) !== 'unknown') continue;
                distance = Math.min(distance, Math.hypot(
                    Math.max(minX - x, x - minX - cellSize, 0),
                    Math.max(minZ - z, z - minZ - cellSize, 0)));
            }
            alpha = Math.max(known === 'mapped' ? 55 : 0,
                Math.round(255 * Math.max(0, Math.min(1, 1 - (distance - 1) / (cellSize - 1)))));
        }
        bytes.set([alpha, alpha, alpha, 255], (row * width + col) * 4);
    }
    return bytes;
}

test('persistent mask matches the original full raster, including partial cells and border feathering', () => {
    for (const partial of [false, true]) {
        const initial = view(12, 10, partial), mask = new DiscoveryFogMask(initial);
        assert.deepEqual(mask.pixels, legacyMask(initial));
        const states = Array.from({ length: 120 }, (_, cell) => cell % 7 < 2 ? 0 : cell % 3 ? 1 : 2);
        const pixels = mask.pixels;
        for (const cell of [0, 1, 13, 44, 57, 58, 106, 118, 119]) {
            states[cell] = (states[cell] + 1) % 3;
            const next = knowledge(states, initial);
            const before = structuredClone(next);
            mask.setKnowledge(next);
            mask.update(1);
            assert.equal(mask.pixels, pixels);
            assert.deepEqual(mask.pixels, legacyMask(next), 'Changed cell or neighbour feather became stale: ' + cell);
            assert.deepEqual(next, before, 'Presentation cannot mutate canonical discovery.');
        }
    }
});

test('unchanged snapshots and settled frames allocate no replacement layer or texture and do no raster work', () => {
    const knowledge = view();
    const world = { waterLevel: -1, terrain: { ...knowledge.grid,
        columns: 13, rows: 11, spacing: 8, heights: Array(143).fill(0) } };
    const fog = new DiscoveryFog(world, knowledge);
    try {
        const mesh = fog.root.children[0], material = mesh.material, texture = material.alphaMap;
        const pixels = texture.image.data.slice(), version = texture.version;
        const metrics = fog.inspect();
        let disposed = 0;
        texture.addEventListener('dispose', () => disposed++);
        material.addEventListener('dispose', () => disposed++);
        for (let update = 0; update < 1000; update++) {
            fog.setKnowledge(structuredClone(knowledge));
            fog.update(1 / 60);
        }
        assert.equal(fog.root.children.length, 1);
        assert.equal(fog.root.children[0], mesh);
        assert.equal(mesh.material, material);
        assert.equal(material.alphaMap, texture);
        assert.equal(texture.version, version, 'No needless GPU texture upload.');
        assert.deepEqual(texture.image.data, pixels);
        assert.deepEqual(fog.inspect(), metrics);
        assert.equal(disposed, 0);
    } finally { fog.dispose(); }
});

test('one changed cell costs at most nine rasterized cells at both low and high exploration coverage', () => {
    const base = view(100, 100);
    for (const coverage of [.2, .9]) {
        const states = Array.from({ length: 10000 }, (_, cell) => cell < 10000 * coverage ? 1 : 0);
        const initial = knowledge(states, base), mask = new DiscoveryFogMask(initial);
        states[1050] = 2;
        mask.setKnowledge(knowledge(states, base));
        assert.equal(mask.inspect().maskBuilds, 1);
        assert.equal(mask.inspect().maskUpdates, 1);
        assert.equal(mask.inspect().lastRasterizedCells, 9);
        assert.equal(mask.inspect().rasterizedCells, 10009);
        mask.update(1);
        const metrics = mask.inspect();
        mask.setKnowledge(knowledge(states, base));
        mask.update(1);
        assert.deepEqual(mask.inspect(), metrics);
    }
});

test('local and interrupted reveals never pulse unchanged mapped pixels; concealment is immediate', () => {
    const base = view(20, 20), states = Array(400).fill(1);
    const mask = new DiscoveryFogMask(knowledge(states, base));
    const pixel = (col, row) => (mask.width * (row * 4 + 2) + col * 4 + 2) * 4;
    const unchanged = pixel(3, 3), revealed = pixel(12, 12);
    assert.equal(mask.pixels[unchanged], 55);
    states[12 * 20 + 12] = 2;
    mask.setKnowledge(knowledge(states, base));
    assert.equal(mask.pixels[revealed], 55, 'Reveal starts at the displayed mask.');
    mask.update(.2);
    const interrupted = mask.pixels[revealed];
    assert.ok(interrupted > 0 && interrupted < 55);
    const paused = mask.pixels.slice();
    for (const delta of [0, -1, NaN]) mask.update(delta);
    assert.deepEqual(mask.pixels, paused, 'Paused or invalid deltas cannot advance a reveal.');
    states[15 * 20 + 15] = 2;
    mask.setKnowledge(knowledge(states, base));
    assert.equal(mask.pixels[revealed], interrupted, 'An interrupted fade cannot jump.');
    for (let frame = 0; frame < 60; frame++) {
        mask.setKnowledge(knowledge(states, base));
        mask.update(1 / 60);
        assert.equal(mask.pixels[unchanged], 55, 'Distant mapped ground must not darken during a reveal.');
        assert.ok(mask.pixels[revealed] <= interrupted);
    }
    assert.equal(mask.inspect().transitioning, false);
    assert.equal(mask.pixels[revealed], 0);
    states[12 * 20 + 12] = 0;
    mask.setKnowledge(knowledge(states, base));
    assert.equal(mask.pixels[revealed], 255, 'Unknown cells are opaque immediately, without waiting for a fade.');
    mask.update(1);
    assert.deepEqual(mask.pixels, legacyMask(knowledge(states, base)));
});

test('a retained texture rejects a different world or grid even when its mask strings match', () => {
    const initial = view(), mask = new DiscoveryFogMask(initial);
    for (const changed of [
        { ...initial, worldId: 'other' }, { ...initial, cellSize: 16 },
        { ...initial, grid: { ...initial.grid, rows: 11 } },
        { ...initial, grid: { ...initial.grid, bounds: { ...initial.grid.bounds, minX: -32 } } },
    ]) assert.throws(() => mask.setKnowledge(changed), /world or discovery grid/);
});

test('a mutable caller cannot overwrite the previous mask or grid comparison baseline', () => {
    const initial = view(), mask = new DiscoveryFogMask(initial);
    initial.visible = '00'.repeat(initial.visible.length / 2);
    mask.setKnowledge(initial);
    mask.update(1);
    assert.deepEqual(mask.pixels, legacyMask(initial));
    assert.ok(mask.inspect().maskUpdates > 0);
    initial.grid.bounds.minX -= 8;
    assert.throws(() => mask.setKnowledge(initial), /world or discovery grid/);
});
