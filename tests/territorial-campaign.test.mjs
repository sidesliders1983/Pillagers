import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { SharedSettlement } = load('../src/play/SharedSettlement.ts');
const { inspectTerritory } = load('../src/simulation/SimulationCore.ts');

test('a physical Fjord campaign adopts real home presence and restores its exact saved territory', () => {
    const shared = new SharedSettlement(7, 123, true, 'island-pool-v1', 'summer-800-v1');
    shared.fjord.enableDiscovery();
    const before = shared.session.snapshot();
    assert.equal(inspectTerritory(before).enabled, false);
    shared.fjord.enableTerritorialAwareness();
    const state = shared.session.snapshot();
    assert.equal(inspectTerritory(state).enabled, true);
    assert.deepEqual(state.time, before.time);
    assert.deepEqual(state.stocks, before.stocks);
    assert.equal(state.rngState, before.rngState);
    const rival = state.world.targetClans[state.world.island.clanId];
    assert.ok(Object.keys(state.residentPresence.residents).length >= 3);
    assert.ok(Object.keys(rival.residentPresence.residents).length >= 3);
    const saved = shared.persist();
    const restored = SharedSettlement.restore(saved, 'fjord');
    assert.deepEqual(restored.session.snapshot(), state);
    restored.session.command({ type: 'AdvanceTicks', ticks: 30 });
    assert.equal(inspectTerritory(restored.session.readSnapshot()).enabled, true);
});
