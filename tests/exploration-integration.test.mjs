import test from 'node:test';
import assert from 'node:assert/strict';
import { runExplorationScenario, replayExplorationTrace, coreDigest } from '../scripts/qa/exploration-integration.mjs';

for (const seed of [17, 32]) {
    test('real island ' + seed + ': concurrent exploration, save/reload, CPU and headless replay agree', () => {
        const result = runExplorationScenario(seed, { encounter: seed === 17 });
        const replay = replayExplorationTrace(result.trace, result.world);
        assert.equal(coreDigest(replay), result.summary.coreSha256);
        assert.equal(result.summary.groupsReturned, 2);
        assert.ok(result.summary.checkpoints.some(item => item.name === 'two-groups-traveling'));
        assert.ok(result.summary.checkpoints.some(item => item.name === 'both-groups-returned'));
        if (seed === 17) assert.equal(result.summary.encounter, 'observed-then-mapped');
    });
}
