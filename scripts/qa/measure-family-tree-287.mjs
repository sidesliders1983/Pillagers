import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { loadTypeScript } from '../load-typescript.mjs';

const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const { layoutFamilyTree } = loadTypeScript(new URL('../../src/lore/FamilyTreeLayout.ts', import.meta.url));
const owner = SharedSettlement.restore(readFileSync('docs/qa/family-tree-287/legacy-gameplay-save.json', 'utf8'), 'fjord');
const before = owner.session.saveJSON();
const tree = owner.session.familyTree();
assert.ok(tree.nodes.length >= 50);
const start = performance.now();
const first = layoutFamilyTree(tree);
const firstMs = performance.now() - start;
const samples = [];
for (let index = 0; index < 200; index++) {
    const now = performance.now();
    const layout = layoutFamilyTree(tree, first.points);
    samples.push(performance.now() - now);
    assert.deepEqual(layout.points, first.points);
}
const sorted = samples.toSorted((a, b) => a - b);
assert.equal(owner.session.saveJSON(), before);
const report = { passed: true, records: tree.nodes.length, generations: first.newest + 1,
    scope: 'Pure presentation layout on the development workstation, not frame rate or a GPU benchmark.',
    firstLayoutMs: firstMs, anchoredUpdates: { count: samples.length, medianMs: sorted[100], p95Ms: sorted[190] },
    source: 'legacy-gameplay-save.json; actual Core kinship', canonicalStateUnchanged: true };
writeFileSync('docs/qa/family-tree-287/performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
