import { parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { runProfileScenario } from './profile-scenario.mjs';
parentPort.on('message', seed => {
    try {
        const runs = [];
        const verification = [];
        for (const model of ['A', 'B', 'C']) for (const policy of ['default', 'random', 'aware']) {
            for (const economy of ['base', 'protected']) {
                const options = { seed, model, policy, economy, winters: workerData.winters };
                const run = runProfileScenario(options);
                runs.push(run);
                if (workerData.verificationSeeds.includes(seed)) {
                    const repeat = runProfileScenario({ ...options,
                        resumeAt: workerData.winters > 1 ? Math.floor(workerData.winters / 2) : null });
                    assert.deepEqual(repeat, run);
                    verification.push({ seed, model, policy, economy, kind: 'repeat-and-save', hash: run.finalStateHash });
                    if (policy === 'aware') {
                        const world = runProfileScenario({ ...options, fullWorld: true });
                        assert.equal(world.finalDomesticHash, run.finalDomesticHash);
                        assert.deepEqual(world.annual, run.annual);
                        verification.push({ seed, model, policy, economy, kind: 'full-world-equivalence', hash: world.finalDomesticHash });
                    }
                }
            }
        }
        assert.equal(new Set(runs.map(run => run.initialFingerprint)).size, 1);
        parentPort.postMessage({ seed, runs, verification });
    } catch (error) {
        parentPort.postMessage({ error: error.stack });
    }
});
