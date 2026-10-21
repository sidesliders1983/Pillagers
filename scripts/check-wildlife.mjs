import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from './load-typescript.mjs';
const { createCampaignIsland, islandRecipe, campaignIslandPlan } = loadTypeScript(new URL('../src/fjord-play/CampaignIsland.ts', import.meta.url));
const { WildlifePopulation } = loadTypeScript(new URL('../src/wildlife/WildlifePopulation.ts', import.meta.url));
const { wildlifeSpecies, wildlifeTerritoryGap } = loadTypeScript(new URL('../src/wildlife/WildlifeSpecies.ts', import.meta.url));
const expected = wildlifeSpecies.flatMap(species => species.variants)
    .filter(variant => !variant.encounter).reduce((count, variant) => count + variant.count, 0);
const hash = world => createHash('sha256').update(JSON.stringify(world)).digest('hex');
const directory = 'output/wildlife-213';
await mkdir(directory, { recursive: true });
const seeds = [0, Array.from({ length: 100 }, (_, seed) => seed).find(seed => islandRecipe(seed).seed === 7)];
for (const seed of seeds) {
    const world = createCampaignIsland(seed);
    const original = hash(world);
    const started = performance.now();
    const population = new WildlifePopulation(world);
    const planningMs = performance.now() - started;
    assert.equal(population.actors.filter(actor => !actor.marine).length, expected, JSON.stringify(population.diagnostics));
    assert.deepEqual(population.diagnostics.filter(message => !message.includes('visits disabled')), []);
    const mammals = population.actors.filter(actor => actor.variant.movement === 'ground'
        && wildlifeSpecies.find(species => species.id === actor.species).group === 'solo');
    let minimumTerritoryGap = Infinity;
    for (let i = 0; i < mammals.length; i++)
        for (let j = i + 1; j < mammals.length; j++) {
            const a = mammals[i], b = mammals[j];
            const gap = Math.hypot(a.anchor.x - b.anchor.x, a.anchor.z - b.anchor.z) - a.variant.radius - b.variant.radius;
            assert.ok(gap >= wildlifeTerritoryGap);
            minimumTerritoryGap = Math.min(minimumTerritoryGap, gap);
        }
    const moved = new Set();
    for (let frame = 0; frame < 600; frame++) {
        population.advance(.1, true);
        for (const actor of population.actors) {
            if (actor.state === 'roam')
                moved.add(actor.species);
            assert.ok(population.habitats.inBounds(actor.position));
            if (actor.variant.movement !== 'air') {
                assert.ok(population.habitats.valid(actor.position, actor.variant), actor.id);
            }
            else {
                assert.ok(actor.position.y >= Math.max(world.waterLevel, population.habitats.surface.surfaceHeightAt(actor.position.x, actor.position.z)) + 12);
            }
        }
    }
    assert.equal(hash(world), original, 'Wildlife mutated campaign geography');
    const result = { seed, recipe: islandRecipe(seed), count: population.actors.length, planningMs, minimumTerritoryGap,
        diagnostics: population.diagnostics, moved: [...moved], actors: population.inspect() };
    await writeFile(directory + '/planning-' + seed + '.json', JSON.stringify(result, null, 2) + '\n');
    if (process.argv.includes('--browser-fixture') && seed === 1) {
        await writeFile(directory + '/campaign-fixture.json', JSON.stringify({ world, plan: campaignIslandPlan(world) }));
    }
    console.log(JSON.stringify({ ...result, actors: undefined }));
}
