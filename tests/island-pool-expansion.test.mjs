import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './load-source.mjs';

const { islandRecipe } = load('../src/fjord-play/CampaignIsland.ts');

test('new campaigns reach all ten approved geographies while old recipes retain their mapping', () => {
    const admitted = new Set();
    for (let seed = 0; seed < 100; seed++) {
        const recipe = islandRecipe(seed);
        assert.equal(recipe.version, 'island-pool-v3');
        admitted.add(recipe.seed);
    }
    assert.deepEqual([...admitted].sort((a, b) => a - b), [7, 15, 18, 79, 88, 101, 112, 168, 195, 227]);
    for (const version of ['island-pool-v1', 'island-pool-v2']) {
        assert.equal(islandRecipe(32, version).seed, 18);
        assert.equal(islandRecipe(33, version).seed, 7);
        assert.deepEqual([...new Set(Array.from({ length: 100 }, (_, seed) =>
            islandRecipe(seed, version).seed))].sort((a, b) => a - b), [7, 18]);
    }
});
