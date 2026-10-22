import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { load } from './load-source.mjs';
const { generateWorld, takeNaturalIslandTerrain } = load('../src/world-generation/GenerateWorld.ts');
const { islandRecipe, prepareCampaignIsland, campaignIslandPlan } = load('../src/fjord-play/CampaignIsland.ts');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('the single-use natural terrain handoff preserves complete campaign geography and falls back for imported sources', () => {
    const recipe = islandRecipe(3055065912);
    const source = generateWorld({ seed: recipe.seed, preset: 'island', generatorVersion: recipe.generatorVersion,
        conifers: 'ez-tree', environment: { version: 1 } }, undefined, { retainNaturalIslandTerrain: true });
    const imported = structuredClone(source), sourceHash = hash(source);
    assert.equal(takeNaturalIslandTerrain(imported), undefined, 'Clones/imports cannot manufacture a trusted handoff');
    const world = prepareCampaignIsland(source, recipe.version);
    assert.equal(takeNaturalIslandTerrain(source), undefined, 'The exact original field is consumed once');
    const regenerated = prepareCampaignIsland(imported, recipe.version);
    assert.equal(hash({ world, plan: campaignIslandPlan(world) }),
        hash({ world: regenerated, plan: campaignIslandPlan(regenerated) }),
        'Terrain, foundations, nature placements, zoning, validation, navigation and plan must remain exact');
    assert.equal(hash(source), sourceHash, 'Source geography stays immutable');
    assert.throws(() => prepareCampaignIsland(source, 'unsupported'), /Unsupported/);
});
