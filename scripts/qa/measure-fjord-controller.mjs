import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';
import { createCrowdScenario, core } from './fjord-stability-scenario.mjs';
const { generateWorld } = loadTypeScript(new URL('../../src/world-generation/GenerateWorld.ts', import.meta.url));
const { createFjordLayout, projectFjordSettlement } = loadTypeScript(new URL('../../src/fjord-play/FjordProjection.ts', import.meta.url));
const { LivingWorldController } = loadTypeScript(new URL('../../src/fjord-play/LivingWorldController.ts', import.meta.url));
const trees = JSON.parse(await readFile('tests/fixtures/fjord-mixed-standing-trees.json', 'utf8'));
const samples = [], results = [];
for (const count of [10, 25, 50]) {
    const state = createCrowdScenario(count), saved = core.serializeState(state);
    const world = generateWorld({ seed: 17 });
    const projectionTimes = [];
    let view = projectFjordSettlement(state, world, createFjordLayout(world));
    for (let i = 0; i < 30; i++) {
        const started = performance.now();
        view = projectFjordSettlement(state, world, view.layout);
        projectionTimes.push(performance.now() - started);
    }
    const motion = new LivingWorldController(world);
    motion.reconcile(view.entities, view.ground);
    motion.setStandingTrees(trees);
    for (const a of motion.inspect()) {
        motion.setOccupationClips(a.key, { Farm: 8, Attack: 2, Doze: 16 });
        motion.setActivityClips(a.key, { Graze: 12, HumanInteraction: 6 });
    }
    const states = new Set(), phases = new Set(), updateTimes = [];
    for (let frame = 0; frame < 1200; frame++) {
        motion.advance(.1, true, true);
        const metrics = motion.inspectMetrics();
        updateTimes.push(metrics.lastUpdateMs);
        if (frame % 20 === 0) {
            const agents = motion.inspect();
            for (const a of agents) { states.add(a.state); if (a.visit) phases.add(a.visit.phase); }
            samples.push({ count, seconds: (frame + 1) / 10, ...metrics });
        }
    }
    assert.equal(core.serializeState(state), saved);
    const summarize = values => {
        const sorted = [...values].sort((a, b) => a - b);
        return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * .95)],
            max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length };
    };
    results.push({ count, cattle: Object.keys(state.landing.cattle).length,
        projectionMs: summarize(projectionTimes), controllerMs: summarize(updateTimes),
        states: [...states], visitPhases: [...phases], metrics: motion.inspectMetrics(),
        input: 'Controlled validated crowd; generous reserves; no fertility/mortality/weather. Clip durations are controller capabilities, not source-render evidence.' });
    console.log(JSON.stringify(results.at(-1)));
}
const output = process.env.QA_OUTPUT || 'docs/qa/living-fjord-stability';
await mkdir(output, { recursive: true });
await writeFile(output + '/' + (process.env.QA_PREFIX || 'controller') + '.json', JSON.stringify({ results, samples }, null, 2));
