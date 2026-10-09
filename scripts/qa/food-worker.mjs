import { parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { runFoodScenario } from './food-scenario.mjs';
parentPort.on('message', job => {
    try {
        const runs = workerData.scenarios.map(scenario => runFoodScenario({ seed: job.seed, scenario, winters: job.winters }));
        assert.equal(new Set(runs.map(run => run.initialFingerprint)).size, 1);
        const verification = [];
        if (workerData.verificationSeeds.includes(job.seed) && job.kind === 'runs25') {
            for (const run of runs) {
                const repeated = runFoodScenario({ seed: job.seed, scenario: run.scenario, winters: job.winters,
                    resumeAt: job.winters > 1 ? Math.floor(job.winters / 2) : null });
                assert.deepEqual(repeated, run);
                verification.push({ kind: 'repeat-and-save', seed: job.seed, scenario: run.scenario, hash: run.finalStateHash });
            }
            for (const scenario of ['B', 'E10'].filter(scenario => workerData.scenarios.includes(scenario))) {
                const run = runs.find(run => run.scenario === scenario);
                const world = runFoodScenario({ seed: job.seed, scenario, winters: job.winters, fullWorld: true });
                assert.equal(world.finalDomesticHash, run.finalDomesticHash);
                assert.deepEqual(world.annual, run.annual);
                verification.push({ kind: 'full-world-equivalence', seed: job.seed, scenario, hash: run.finalStateHash });
            }
        }
        parentPort.postMessage({ ...job, runs, verification });
    } catch (error) {
        parentPort.postMessage({ ...job, error: error.stack });
    }
});
