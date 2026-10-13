import assert from 'node:assert/strict';
import test from 'node:test';
import { load } from './load-source.mjs';

const request = {
    seed: 256,
    preset: 'island',
    generatorVersion: 'fjordside-island-v0.3e-r3',
};

let generated;
function world() {
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    return generated ??= generateWorld(request);
}

test('new settlement placement accepts visible rivals in separate natural compartments', () => {
    const result = world();
    assert.equal(result.validation.accepted, true, result.validation.reasons.join('; '));
    const { selected, candidates, visibility, connection, pairs } = result.siteSelection;
    const player = candidates.find(c => c.id === selected.playerId);
    const rival = candidates.find(c => c.id === selected.rivalId);
    assert.notEqual(player.compartmentId, rival.compartmentId);
    assert.equal(player.foundations.length, 6);
    assert.equal(rival.foundations.length, 6);
    assert.ok(selected.centerDistance >= 160);
    assert.ok(selected.bufferDistance >= 40);
    assert.ok(selected.routeLength >= 240);
    assert.equal(visibility.hidden, false, 'terrain occlusion is diagnostic, not a placement gate');
    assert.ok(visibility.exposedRays > 0);
    assert.equal(selected.exposedRays, visibility.exposedRays);
    assert.ok(visibility.rays.length > 100, 'keep the full diagnostic, not an early rejection sample');
    assert.ok(pairs.filter(pair => {
        const a = candidates.find(c => c.id === pair.playerId);
        const b = candidates.find(c => c.id === pair.rivalId);
        return a.compartmentId === b.compartmentId;
    }).every(pair => pair.reasons.includes('Sites share the same natural compartment.')));
    for (const point of connection) {
        const nav = result.navigation;
        const index = Math.round((point.z - nav.bounds.minZ) / nav.spacing) * nav.columns +
            Math.round((point.x - nav.bounds.minX) / nav.spacing);
        assert.equal(nav.cells[index], true, 'the final scenery-aware route stays traversable');
    }
});

test('visible-rival saves validate their evidence and regenerate without upgrading older rules', () => {
    const { parseWorld, serializeWorld } = load('../src/world-generation/WorldSave.ts');
    const { generateWorld } = load('../src/world-generation/GenerateWorld.ts');
    const current = world();
    assert.deepEqual(parseWorld(serializeWorld(current)), current);
    assert.deepEqual(generateWorld(current.config), current);

    const corrupted = JSON.parse(serializeWorld(current));
    corrupted.blueprint.siteSelection.visibility.exposedRays = 0;
    assert.throws(() => parseWorld(JSON.stringify(corrupted)), /Invalid world blueprint/);

    const legacy = generateWorld({ ...request, generatorVersion: 'fjordside-island-v0.3e-r2' });
    assert.equal(legacy.siteSelection.visibility.hidden, true);
    assert.deepEqual(parseWorld(serializeWorld(legacy)), legacy);
    assert.deepEqual(current.coast, legacy.coast, 'changing placement policy does not reshape the island');
    assert.deepEqual(current.geology, legacy.geology);
    assert.notDeepEqual(current.siteSelection.selected, legacy.siteSelection.selected);
    assert.equal(current.terrain.heights.length, legacy.terrain.heights.length);
    for (let i = 0; i < current.terrain.heights.length; i++) {
        assert.ok(Math.abs(current.terrain.heights[i] - legacy.terrain.heights[i]) <= 1.20001,
            'only approved local foundation grading can differ between placements');
    }

    const relabelled = JSON.parse(serializeWorld(current));
    relabelled.blueprint.config.generatorVersion = 'fjordside-island-v0.3e-r2';
    assert.throws(() => parseWorld(JSON.stringify(relabelled)), /Invalid world blueprint/,
        'older placement versions still require terrain occlusion');
});
