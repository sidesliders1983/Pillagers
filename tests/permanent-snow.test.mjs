import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { fjordSnowLine } = load('../src/config/FjordTerrain.ts');

test('permanent summit snow starts five metres below the previous 90-percent line', () => {
    const world = { waterLevel: 2, terrain: { heights: [-5, 10, 22] } };
    const original = JSON.stringify(world);
    assert.equal(fjordSnowLine(world), 15);
    assert.equal(JSON.stringify(world), original, 'Snow presentation cannot grade the landscape');
});
