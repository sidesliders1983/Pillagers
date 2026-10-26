import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScript } from '../scripts/load-typescript.mjs';
import { createFamilyFixture } from '../scripts/qa/family-tree-fixture.mjs';

const { projectFamilyTree } = loadTypeScript(new URL('../src/lore/FamilyTree.ts', import.meta.url));
const { layoutFamilyTree, familyCard } = loadTypeScript(new URL('../src/lore/FamilyTreeLayout.ts', import.meta.url));

test('a real 50+ person Core family reads from all actual founders to the newest generation at the right', () => {
    const state = createFamilyFixture();
    const tree = projectFamilyTree(state);
    const before = JSON.stringify(tree);
    const layout = layoutFamilyTree(tree);
    assert.ok(tree.nodes.length >= 50);
    assert.ok(layout.newest >= 2);
    for (const node of tree.nodes) {
        const position = layout.points.get(node.id);
        assert.equal(position.generation, node.row, 'Generation comes from canonical parentage, never age/status');
        if (node.founder) assert.equal(position.x, familyCard.inset);
    }
    for (const edge of tree.edges.filter(edge => edge.kind === 'parent')) {
        assert.ok(layout.points.get(edge.to).x > layout.points.get(edge.from).x);
    }
    for (const generation of layout.generations) {
        const same = [...layout.points.values()].filter(point => point.generation === generation);
        assert.equal(new Set(same.map(point => point.y)).size, same.length);
    }
    assert.equal(JSON.stringify(tree), before, 'Layout never rewrites the genealogy');
    assert.equal(layout.points.size, tree.nodes.length);
    assert.deepEqual(layoutFamilyTree(tree), layout, 'Save/load reconstruction is deterministic');
});

test('age, work and selection updates keep anchors; a birth extends its actual family without moving existing cards', () => {
    const tree = projectFamilyTree(createFamilyFixture());
    const initial = layoutFamilyTree(tree);
    const changed = structuredClone(tree);
    for (const node of changed.nodes) { node.age++; node.occupation = 'Changed display label'; }
    assert.deepEqual(layoutFamilyTree(changed, initial.points).points, initial.points);
    const parent = tree.nodes.find(node => node.row === initial.newest);
    changed.nodes.push({ ...parent, id: 'newborn-layout-only', founder: false, age: 0,
        row: parent.row + 1, column: 0, parentIds: [parent.id], childIds: [], children: [] });
    const extended = layoutFamilyTree(changed, initial.points);
    for (const [id, point] of initial.points) assert.deepEqual(extended.points.get(id), point);
    assert.equal(extended.newest, initial.newest + 1);
    assert.ok(extended.points.get('newborn-layout-only').x > initial.points.get(parent.id).x);
});

test('single, deceased and departed founders stay left; independent branches are not given invented founder connections', () => {
    const tree = projectFamilyTree(createFamilyFixture());
    tree.nodes[0].status = 'Deceased';
    tree.nodes[1].status = 'Departed · last known';
    const root = { ...tree.nodes[0], id: 'independent-root', founder: false, row: 1, column: 100,
        branch: 'Independent family', parentIds: [], parents: [], childIds: [], children: [] };
    tree.nodes.push(root);
    const before = JSON.stringify(tree.edges);
    const layout = layoutFamilyTree(tree);
    for (const node of tree.nodes.filter(node => node.founder))
        assert.equal(layout.points.get(node.id).generation, 0);
    assert.equal(layout.points.get(root.id).generation, 1);
    assert.equal(JSON.stringify(tree.edges), before);
    const fresh = layoutFamilyTree(projectFamilyTree(createFamilyFixture()));
    assert.equal(fresh.points.has(root.id), false, 'Rebuilds do not retain an abandoned campaign anchor');
});
