import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
const { IslandMapProjection, mapPoint, worldPoint, expeditionMapDestinations } = loadTypeScript(new URL('../src/fjord-play/IslandMapProjection.ts', import.meta.url));
const bounds = { minX: -100, maxX: 300, minZ: -50, maxZ: 150 };

test('the island map preserves north, east and rectangular world proportions without revealing unknown destinations', () => {
    assert.deepEqual(mapPoint(bounds, { x: -100, z: -50 }), { x: 0, y: 0 });
    assert.deepEqual(mapPoint(bounds, { x: 300, z: 150 }), { x: 1, y: 1 });
    assert.deepEqual(worldPoint(bounds, { x: .75, y: .25 }), { x: 200, z: 0 });
    const preview = { bounds, columns: 3, rows: 3, waterLevel: 0,
        heights: new Float32Array([0, 0, 0, 0, 4, 0, 0, 0, 0]), ground: new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 0]) };
    const discovery = { version: 1, worldId: 'map-fixture', cellSize: 100,
        grid: { bounds, columns: 4, rows: 2 }, explored: '02', visible: '02' };
    const map = new IslandMapProjection(preview, discovery);
    assert.equal(map.aspect, 2);
    assert.deepEqual(map.destination({ x: .375, y: .25 }), { x: 50, z: 0 });
    assert.equal(map.destination({ x: .75, y: .25 }), null);
    assert.equal(map.destination({ x: -1, y: 0 }), null);
    assert.equal(map.destination({ x: 1, y: 1 }), null);
    assert.equal(map.pixels.length, 36);
    assert.equal(map.setKnowledge(structuredClone(discovery)), false, 'An unchanged mask does not repaint');
    assert.equal(map.setKnowledge({ ...discovery, explored: '0a', visible: '00' }), true);
    assert.deepEqual(map.destination({ x: .75, y: .25 }), { x: 200, z: 0 });
    assert.deepEqual(discovery, { version: 1, worldId: 'map-fixture', cellSize: 100,
        grid: { bounds, columns: 4, rows: 2 }, explored: '02', visible: '02' });
});

test('the map shows one ordered destination per active group, points returning groups home and omits individual residents', () => {
    const missions = [
        { groupId: 'group-1', groupName: 'Group 1', status: 'Traveling', target: { x: 120, z: -20 } },
        { groupId: 'group-2', groupName: 'Group 2', status: 'Returning', target: { x: 240, z: 80 } },
        { groupId: 'group-3', groupName: 'Group 3', status: 'Returned', target: { x: 20, z: 80 } },
    ];
    assert.deepEqual(expeditionMapDestinations(missions, { x: 50, z: 0 }), [
        { groupId: 'group-1', label: 'Group 1', status: 'Traveling', x: 120, z: -20 },
        { groupId: 'group-2', label: 'Group 2', status: 'Returning', x: 50, z: 0 },
    ]);
});

test('unknown land and water are identical opaque pixels, revealing no island outline or terrain', () => {
    const preview = { bounds, columns: 4, rows: 2, waterLevel: 0,
        heights: new Float32Array([-4, 12, -3, 35, 1, 75, -7, 2]),
        ground: new Uint8Array([0, 1, 0, 4, 2, 3, 0, 1]) };
    const knowledge = { version: 1, worldId: 'map-fixture', cellSize: 100,
        grid: { bounds, columns: 4, rows: 2 }, explored: '01', visible: '01' };
    const saved = structuredClone(knowledge), map = new IslandMapProjection(preview, knowledge);
    const pixel = index => [...map.pixels.slice(index * 4, index * 4 + 4)];
    const hidden = pixel(1);
    assert.equal(hidden[3], 255);
    for (let index = 2; index < 8; index++) assert.deepEqual(pixel(index), hidden);
    const observed = pixel(0);
    assert.notDeepEqual(observed, hidden);
    map.setKnowledge({ ...knowledge, visible: '00' });
    assert.notDeepEqual(pixel(0), hidden, 'Explored terrain remains on the map after observers leave');
    assert.notDeepEqual(pixel(0), observed, 'Previously mapped terrain is dimmer than current observations');
    map.setKnowledge({ ...knowledge, explored: '11', visible: '10' });
    assert.notDeepEqual(pixel(4), hidden, 'New discoveries reveal their real terrain color');
    assert.deepEqual(pixel(5), hidden, 'The neighboring unknown high ground stays masked');
    assert.deepEqual(knowledge, saved, 'Rendering must not reveal cells in the canonical mask');
    map.setKnowledge(undefined);
    for (let index = 0; index < 8; index++) assert.deepEqual(pixel(index), hidden);
    assert.equal(map.destination({ x: .1, y: .1 }), null, 'Missing knowledge fails closed');
});
