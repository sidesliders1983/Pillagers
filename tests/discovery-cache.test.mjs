import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';

const discovery = loadTypeScript(new URL('../src/simulation/ClanDiscovery.ts', import.meta.url));
const sightlines = loadTypeScript(new URL('../src/world-generation/SettlementVisibility.ts', import.meta.url));
const freeze = value => {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
};
const landscape = () => ({ waterLevel: -1, terrain: {
    bounds: { minX: 0, maxX: 256, minZ: 0, maxZ: 128 }, spacing: 8,
    columns: 33, rows: 17, heights: Array(561).fill(0),
} });
const home = { id: 'home', kind: 'settlement', x: 32, z: 64 };
const worldId = 'stationary-visibility-fixture';

function countSightlines(run) {
    let count = 0;
    const original = sightlines.traceTerrainSightline;
    sightlines.traceTerrainSightline = (...args) => { count++; return original(...args); };
    try { run({ count: () => count, reset: () => { count = 0; } }); }
    finally { sightlines.traceTerrainSightline = original; }
}

test('immutable stationary LOS is reused while moving observations and canonical masks stay exact', () => {
    const world = freeze(landscape()), mutable = structuredClone(world);
    countSightlines(counter => {
        const initial = discovery.createClanDiscovery(world, worldId, 'player', [home], 800000);
        assert.ok(counter.count() > 0);
        counter.reset();
        const repeated = discovery.commitClanObservation(initial, world, worldId, 'player', [home], 800001);
        assert.equal(counter.count(), 0, 'A stationary observer needs no repeated terrain rays.');
        const uncached = discovery.commitClanObservation(initial, mutable, worldId, 'player', [home], 800001);
        assert.deepEqual(repeated, uncached);
        const observers = [home, { id: 'scout', kind: 'expedition', x: 144, z: 64 }];
        counter.reset();
        const mixed = discovery.commitClanObservation(repeated, world, worldId, 'player', observers, 800002);
        const movingCalls = counter.count();
        assert.ok(movingCalls > 0, 'Moving parties always perform their actual sightline checks.');
        counter.reset();
        const mixedUncached = discovery.commitClanObservation(repeated, mutable, worldId, 'player', observers, 800002);
        assert.ok(counter.count() > movingCalls);
        assert.deepEqual(mixed, mixedUncached, 'Every visible/explored bit and timestamp must match.');
        const policy = { ...discovery.prototypeDiscoveryPolicy, cellSize: 16, eyeHeight: 2.5 };
        counter.reset();
        const changed = discovery.createClanDiscovery(world, worldId, 'player', [home], 800003, policy);
        assert.ok(counter.count() > 0);
        assert.deepEqual(changed, discovery.createClanDiscovery(mutable, worldId, 'player', [home], 800003, policy));
        assert.throws(() => discovery.commitClanObservation(repeated, world, worldId, 'player',
            [{ ...home, id: '' }], 800004), /observer/i, 'A cache hit never bypasses observer validation.');
    });
});

test('mutable surfaces are recomputed and stationary cache residency stays bounded', () => {
    const mutable = landscape();
    const before = discovery.createClanDiscovery(mutable, worldId, 'player', [home], 800000);
    for (let row = 0; row < mutable.terrain.rows; row++) mutable.terrain.heights[row * 33 + 8] = 50;
    const after = discovery.commitClanObservation(before, mutable, worldId, 'player', [home], 800001);
    assert.notEqual(after.clans.player.visible, before.clans.player.visible,
        'A mutable test/legacy surface cannot reuse stale terrain visibility.');
    const world = freeze(landscape());
    countSightlines(counter => {
        for (let index = 0; index < 9; index++) {
            counter.reset();
            discovery.createClanDiscovery(world, worldId, 'player', [{ ...home, x: 16 + index * 8 }], 800000);
            assert.ok(counter.count() > 0);
        }
        const first = { ...home, x: 16 };
        counter.reset();
        discovery.createClanDiscovery(world, worldId, 'player', [first], 800001);
        assert.ok(counter.count() > 0, 'Only eight stationary views may be retained per immutable world.');
        counter.reset();
        discovery.createClanDiscovery(world, worldId, 'player', [first], 800002);
        assert.equal(counter.count(), 0);
    });
});
