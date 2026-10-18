import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const coreDigest = state => digest(JSON.parse(core.serializeState(state)));

/** Plain world data and public Core commands are sufficient; no presentation modules are loaded. */
export function replayExplorationTrace(trace, world) {
    assert.equal(trace.version, 1);
    if (trace.worldSha256) assert.equal(digest(world), trace.worldSha256);
    let state = core.reconstructState(JSON.stringify(trace.initial));
    for (const [index, row] of trace.commands.entries()) {
        assert.equal(coreDigest(state), row.before, 'Replay input at command ' + index);
        const context = row.context && { ...row.context, world };
        if (row.rejected) {
            assert.throws(() => core.applyCommand(state, row.command, context),
                error => String(error) === row.rejected);
            assert.equal(coreDigest(state), row.after);
        } else {
            state = core.applyCommand(state, row.command, context);
            assert.equal(coreDigest(state), row.after, 'Replay output at command ' + index);
        }
        if (trace.checkpoints.some(checkpoint => checkpoint.afterCommand === index + 1))
            state = core.reconstructState(core.serializeState(state));
    }
    assert.equal(coreDigest(state), trace.final);
    if (trace.worldSha256) assert.equal(digest(world), trace.worldSha256);
    return state;
}
