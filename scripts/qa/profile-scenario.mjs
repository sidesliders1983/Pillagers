import { runFoodScenario } from './food-scenario.mjs';
import { profileEngine } from './profile-engine.mjs';

export function runProfileScenario({ model = 'A', policy = 'default', economy = 'base', ...options } = {}) {
    const experiment = profileEngine({ model, policy, economy });
    const result = runFoodScenario({ ...options, experiment });
    return { ...result, model, policy, economy };
}

export function proveProfileReplay({ seed = 32, model = 'A', economy = 'base',
    readAsModel = model, readAsEconomy = economy } = {}) {
    const experiment = profileEngine({ model, economy });
    const core = experiment.core;
    let state = experiment.create(seed);
    state = core.applyCommand(state, {
        type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker',
    });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    const workProgress = state.personas['founder-1'].workProgress;
    const restored = profileEngine({ model: readAsModel, economy: readAsEconomy })
        .reconstruct(experiment.serialize(state));
    const finish = input => core.applyCommand(input, { type: 'AdvanceTicks', ticks: 500 });
    return { seed, model, economy, workProgress,
        continuousHash: experiment.canonicalHash(finish(state)),
        resumedHash: experiment.canonicalHash(finish(restored)) };
}
