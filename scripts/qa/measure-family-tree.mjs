import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createFamilyFixture } from './family-tree-fixture.mjs';
import { loadTypeScript } from '../load-typescript.mjs';
const state = createFamilyFixture();
const core = loadTypeScript(new URL('../../src/simulation/SimulationCore.ts', import.meta.url));
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { projectFamilyTree } = loadTypeScript(new URL('../../src/lore/FamilyTree.ts', import.meta.url));
const started = performance.now(), view = projectFamilyTree(state), firstMs = performance.now() - started;
assert.ok(view.nodes.length >= 50);
assert.ok(Math.max(...view.nodes.map(node => node.row)) >= 2);
const owner = new SharedSettlement(32, 1, false);
owner.importJSON(core.serializeState(state));
owner.session.familyTree();
const before = owner.session.saveJSON(), samples = [];
for (let i = 0; i < 100; i++) {
    const start = performance.now();
    owner.session.familyTree();
    samples.push(performance.now() - start);
}
assert.equal(owner.session.saveJSON(), before);
const positions = owner.session.familyTree().nodes.map(node => [node.id, node.row, node.column]);
const id = state.landing.founderIds[0];
owner.command({ type: 'AssignOccupation', personaId: id, occupation: 'woodworker' });
const changeStart = performance.now(), changed = owner.session.familyTree(), cardUpdateMs = performance.now() - changeStart;
assert.deepEqual(changed.nodes.map(node => [node.id, node.row, node.column]), positions);
const sorted = [...samples].sort((a, b) => a - b);
const report = { passed: true, fixture: { source: 'actual public Simulation Core Winter commands; forced lifecycle values only in the labelled test fixture',
        canonicalResidents: Object.keys(state.personas).length, treeNodes: view.nodes.length, originalFounders: state.landing.founderIds.length,
        generations: Math.max(...view.nodes.map(node => node.row)) + 1, winter: state.time.winter, sourceEvents: state.events.length },
    measurement: { firstProjectionMs: firstMs, cardUpdateMs, cachedQueries: { count: samples.length, medianMs: sorted[50], p95Ms: sorted[95], samplesMs: samples } },
    scope: 'Projection/cached query timing on this development laptop; no GPU FPS or physical iPad claim and no acceptance time threshold.' };
writeFileSync('docs/qa/family-tree/measurements.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync('docs/qa/family-tree/fixture.json', core.serializeState(state));
console.log(JSON.stringify({ ...report, measurement: { ...report.measurement, cachedQueries: { ...report.measurement.cachedQueries, samplesMs: 'stored' } } }));
