import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { studyEngine } from './aptitude-engine.mjs';
import { hash } from './aptitude-economy.mjs';

/** Exercise a candidate save with real partial unit progress, outside annual stepping. */
export function proveAptitudeReplay({ seed = 32, model = 'control', readAsModel = model } = {}) {
    const experiment = studyEngine(model);
    const core = experiment.core;
    let state = core.createCampaign(seed);
    state = core.applyCommand(state, { type: 'AssignOccupation', personaId: 'founder-1', occupation: 'woodworker' });
    state = core.applyCommand(state, { type: 'AdvanceTicks', ticks: 500 });
    const savedWorkProgress = state.personas['founder-1'].workProgress;
    const restored = studyEngine(readAsModel).reconstruct(experiment.serialize(state));
    const finish = input => core.applyCommand(input, { type: 'AdvanceTicks', ticks: 500 });
    return { seed, model, savedAtTick: state.time.tick, savedWorkProgress,
        continuousHash: hash(core.serializeState(finish(state))),
        resumedHash: hash(core.serializeState(finish(restored))) };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const output = process.argv[2] || 'artifacts/occupation-aptitude-v03';
    const proofs = ['control', 'expanded', 'quadratic', 'contrast'].map(model =>
        proveAptitudeReplay({ seed: 32, model }));
    const harnessHash = hash(readFileSync(new URL('./aptitude-replay.mjs', import.meta.url), 'utf8')
        .replace(/\r\n/g, '\n'));
    writeFileSync(join(output, 'partial-replay.json'), JSON.stringify({ harnessHash, proofs }, null, 2) + '\n');
    console.log('Partial replay proof written: ' + output);
}
