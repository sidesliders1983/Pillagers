import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const { planRoute } = loadTypeScript(new URL('../src/world-generation/LandRoutes.ts', import.meta.url));

const bounds = { minX: 0, maxX: 24, minZ: 0, maxZ: 24 };
const context = {
    world: {
        waterLevel: -1,
        terrain: { bounds, spacing: 8, columns: 4, rows: 4, heights: Array(16).fill(0) },
        navigation: { bounds, spacing: 8, columns: 4, rows: 4, cells: Array(16).fill(true) },
        settlement: { center: { x: 0, z: 0 } },
    },
    exclusions: [{ minX: 3, maxX: 5, minZ: 3, maxZ: 5 }],
};

test('opt-in land routes avoid a protected edge while legacy route geometry is preserved', () => {
    const origin = { x: 0, z: 0 }, target = { x: 8, z: 8 };
    assert.deepEqual(planRoute(context, target, origin, true).route, [origin, target]);
    const safe = planRoute(context, target, origin, true, { strictExclusions: true });
    assert.deepEqual(safe.route, [origin, { x: 8, z: 0 }, target]);
});
