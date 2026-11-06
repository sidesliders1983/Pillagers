import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Matrix4, Vector3 } from 'three';
import { terrainIO } from './terrain-io.mjs';

const io = await terrainIO();
const modelRoot = 'public/game-assets/community-hearth/';
const profiles = [
    { tier: 1, file: 'gathering-shelter.glb', fireAnchor: { x: .1, z: .1 }, scale: 1.35,
        fireScale: .65, movementHeight: 1.45, cellSize: .25 },
    { tier: 2, file: 'clan-hall.glb', fireAnchor: { x: -1.25, z: 4.9 }, scale: .9,
        fireScale: .495, movementHeight: 1.9, cellSize: .125,
        enclosedRear: { minX: -7, minZ: -6.375, maxX: 7, maxZ: .75 } },
];

async function trianglesFrom(file) {
    const root = (await io.read(file)).getRoot();
    const triangles = [];
    for (const node of root.listNodes()) {
        const matrix = new Matrix4().fromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const position = primitive.getAttribute('POSITION');
            const vertices = Array.from({ length: position.getCount() }, (_, index) =>
                new Vector3(...position.getElement(index, [])).applyMatrix4(matrix).toArray());
            const indices = primitive.getIndices().getArray();
            for (let i = 0; i < indices.length; i += 3) {
                triangles.push([vertices[indices[i]], vertices[indices[i + 1]], vertices[indices[i + 2]]]);
            }
        }
    }
    return triangles;
}

function clip(poly, axis, cut, keepAbove) {
    const keep = vertex => keepAbove ? vertex[axis] >= cut : vertex[axis] <= cut;
    return poly.flatMap((point, index) => {
        const next = poly[(index + 1) % poly.length];
        const ratio = (cut - point[axis]) / (next[axis] - point[axis]);
        return [...(keep(point) ? [point] : []), ...(keep(point) !== keep(next)
            ? [point.map((value, i) => value + (next[i] - value) * ratio)] : [])];
    });
}

/** Mark only cells intersecting the clipped lower surfaces, never a decorative envelope. */
function rasterize(triangles, size, low, high, minZ = -Infinity) {
    const cells = new Set();
    for (const triangle of triangles) {
        const band = clip(clip(triangle, 1, low, true), 1, high, false);
        const poly = Number.isFinite(minZ) ? clip(band, 2, minZ, true) : band;
        if (!poly.length) continue;
        const xs = poly.map(point => point[0]), zs = poly.map(point => point[2]);
        for (let x = Math.floor(Math.min(...xs) / size); x <= Math.floor(Math.max(...xs) / size); x++) {
            const column = clip(clip(poly, 0, x * size, true), 0, (x + 1) * size, false);
            if (!column.length) continue;
            for (let z = Math.floor(Math.min(...zs) / size); z <= Math.floor(Math.max(...zs) / size); z++) {
                if (clip(clip(column, 2, z * size, true), 2, (z + 1) * size, false).length)
                    cells.add(x + ',' + z);
            }
        }
    }
    return cells;
}

function distance(point, bounds) {
    return Math.hypot(Math.max(0, bounds.minX - point.x, point.x - bounds.maxX),
        Math.max(0, bounds.minZ - point.z, point.z - bounds.maxZ));
}

/** Coalesce touched pads away from the narrow court, retaining the finer grid beside the ring. */
function combinePads(cells, size, anchor) {
    const result = new Set(cells), coarseSize = .25, ratio = coarseSize / size;
    if (ratio === 1) return result;
    for (const cell of cells) {
        const [x, z] = cell.split(',').map(Number);
        const col = Math.floor(x / ratio), row = Math.floor(z / ratio);
        const region = { minX: col * coarseSize, minZ: row * coarseSize,
            maxX: (col + 1) * coarseSize, maxZ: (row + 1) * coarseSize };
        if (distance(anchor, region) < 1.3) continue;
        for (let cz = row * ratio; cz < (row + 1) * ratio; cz++)
            for (let cx = col * ratio; cx < (col + 1) * ratio; cx++) result.add(cx + ',' + cz);
    }
    return result;
}

/** Merge marked cells exactly, without filling gaps around benches, screens or fence corners. */
function merge(cells, size) {
    const ordered = [...cells].map(cell => cell.split(',').map(Number))
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const rectangles = [];
    while (cells.size) {
        let best = { x: 0, z: 0, width: 0, height: 0 };
        for (const [x, z] of ordered) {
            if (!cells.has(x + ',' + z)) continue;
            let maxWidth = Infinity;
            for (let height = 1; cells.has(x + ',' + (z + height - 1)); height++) {
                let width = 1;
                while (width < maxWidth && cells.has((x + width) + ',' + (z + height - 1))) width++;
                maxWidth = width;
                if (width * height > best.width * best.height) best = { x, z, width, height };
            }
        }
        const { x, z, width, height } = best;
        rectangles.push({ minX: x * size, minZ: z * size,
            maxX: (x + width) * size, maxZ: (z + height) * size });
        for (let row = z; row < z + height; row++)
            for (let col = x; col < x + width; col++) cells.delete(col + ',' + row);
    }
    return rectangles.sort((a, b) => a.minZ - b.minZ || a.minX - b.minX);
}

const fire = await trianglesFrom('public/scenery/meshy-campfire-v1/campfire.glb');
const fireRadius = Math.max(...fire.flat().map(point => Math.hypot(point[0], point[2])));
const output = ['// Generated by scripts/prepare-community-hearth-profiles.mjs.',
    'export const communityHearthProfiles = {'];
for (const profile of profiles) {
    const { tier, file, fireAnchor, scale, fireScale, movementHeight, cellSize, enclosedRear } = profile;
    const triangles = await trianglesFrom(modelRoot + file);
    const occupancy = merge(rasterize(triangles, cellSize, .03, movementHeight, enclosedRear?.maxZ), cellSize);
    if (enclosedRear) occupancy.unshift(enclosedRear);
    const supports = merge(combinePads(rasterize(triangles, cellSize, -.002, .15, undefined),
        cellSize, fireAnchor), cellSize);
    for (const rectangles of [occupancy, supports]) {
        const clearance = Math.min(...rectangles.map(rectangle => distance(fireAnchor, rectangle))) * scale;
        assert.ok(clearance > fireRadius * fireScale + .045, file + ' no longer fits its fire socket');
    }
    assert.ok(occupancy.length <= 64 && supports.length <= 128, file + ' exceeds profile budget');

    output.push('    ' + tier + ': {',
        '        fireAnchor: ' + JSON.stringify(fireAnchor) + ',',
        '        scale: ' + scale + ',',
        '        fireScale: ' + fireScale + ',');
    for (const [key, rectangles] of Object.entries({ occupancy, supports })) {
        output.push('        ' + key + ': [',
            ...rectangles.map(rectangle => '            ' + JSON.stringify(rectangle) + ','),
            '        ],');
    }
    output.push('    },');
    console.log(JSON.stringify({ tier, occupancy: occupancy.length, supports: supports.length }));
}
output.push('} as const;', '');
await writeFile('src/fjord-play/CommunityHearthProfiles.ts', output.join('\n'));
