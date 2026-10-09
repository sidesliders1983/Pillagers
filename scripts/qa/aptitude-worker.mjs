import { parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { runEconomyScenario } from './aptitude-economy.mjs';
parentPort.on('message', seed => {
    try {
        const runs = [runEconomyScenario({ seed, winters: workerData.winters })];
        for (const model of workerData.models) for (const policy of ['random', 'aware']) {
            runs.push(runEconomyScenario({ seed, model, policy, winters: workerData.winters }));
        }
        assert.equal(new Set(runs.map(run => run.initialFingerprint)).size, 1, 'Matched founders and initial RNG');
        const verification = [];
        if (workerData.verificationSeeds.includes(seed)) {
            for (const run of runs) {
                const replay = runEconomyScenario({ seed, model: run.model, policy: run.policy,
                    winters: workerData.winters, resumeAt: workerData.winters > 1 ? Math.floor(workerData.winters / 2) : null });
                assert.deepEqual(replay, run, 'Repeated run and canonical save/load must agree');
                verification.push({ seed, model: run.model, policy: run.policy, kind: 'repeat-and-save', hash: run.finalStateHash });
            }
            const domestic = runs.find(run => run.model === 'control' && run.policy === 'aware');
            const world = runEconomyScenario({ seed, policy: 'aware', winters: workerData.winters, fullWorld: true });
            assert.equal(world.finalDomesticHash, domestic.finalDomesticHash);
            assert.deepEqual(world.annual, domestic.annual);
            verification.push({ seed, kind: 'full-world-equivalence', hash: world.finalDomesticHash });
        }
        parentPort.postMessage({ seed, runs, verification });
    } catch (error) {
        parentPort.postMessage({ seed, error: error.stack });
    }
});
