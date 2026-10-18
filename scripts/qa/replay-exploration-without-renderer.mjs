import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFile } from 'node:fs/promises';

const [tracePath, worldPath] = process.argv.slice(2);
if (!tracePath || !worldPath) throw new Error('Supply a trace JSON and its captured world JSON.');
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const world = JSON.parse(await readFile(worldPath, 'utf8'));
const originalLoad = Module._load;
const denied = [];
// This isolated QA process deliberately fails if a transitive contract starts requiring Three.js.
Module._load = function (name, ...args) {
    if (name === 'three' || name.startsWith('three/')) {
        denied.push(name);
        throw new Error('The headless replay must not import Three.js: ' + name);
    }
    return originalLoad.call(this, name, ...args);
};
try {
    const { replayExplorationTrace, coreDigest } = await import('./exploration-replay.mjs');
    const state = replayExplorationTrace(trace, world);
    assert.deepEqual(denied, []);
    console.log(JSON.stringify({ status: 'PASS', seed: trace.seed, commands: trace.commands.length,
        coreSha256: coreDigest(state), threeImports: 0, renderer: false }));
} finally { Module._load = originalLoad; }
