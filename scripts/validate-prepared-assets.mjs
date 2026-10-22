import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { loadTypeScript } from './load-typescript.mjs';
import { campaignIslandInputs } from './campaign-island-inputs.mjs';
import { characterSourceInputs } from './character-source-inputs.mjs';

const load = path => loadTypeScript(new URL('../src/' + path + '.ts', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function validatePreparedAssets() {
    const { campaignIslandCatalog: islands } = load('fjord-play/BakedIslandCatalog');
    const { preparedCharacterCatalog: characters } = load('characters/PreparedCharacterCatalog');
    const { campaignIslandPools, islandRecipe } = load('fjord-play/CampaignIsland');
    assert.equal(islands.version, 1);
    assert.equal(islands.generatorVersion, islandRecipe(0).generatorVersion);
    assert.deepEqual(islands.inputs, campaignIslandInputs(),
        'Island generator inputs changed. Run pnpm assets:islands and retain the regenerated catalog.');
    const expectedIslands = Object.entries(campaignIslandPools).flatMap(([version, seeds]) =>
        seeds.map(seed => version + ':' + seed)).sort();
    assert.deepEqual(islands.entries.map(entry => entry.version + ':' + entry.seed).sort(), expectedIslands);
    const unpack = async (entry, outputBytes, pattern) => {
        assert.match(entry.path, pattern);
        const bytes = await readFile('public' + entry.path);
        assert.equal(bytes.length, entry.bytes, entry.path + ' compressed length');
        assert.equal(sha256(bytes), entry.sha256, entry.path + ' compressed identity');
        const output = gunzipSync(bytes, { maxOutputLength: outputBytes });
        assert.equal(output.length, outputBytes, entry.path + ' original length');
        return output;
    };
    for (const entry of islands.entries) {
        const bytes = await unpack(entry, entry.jsonBytes,
            /^\/game-assets\/islands\/island-pool-v[123]-\d+-[a-f0-9]{12}\.json\.gz$/);
        assert.equal(sha256(bytes), entry.canonicalSha256);
        const { world, plan } = JSON.parse(bytes.toString('utf8'));
        assert.deepEqual(plan.recipe, { version: entry.version, generatorVersion: islands.generatorVersion, seed: entry.seed });
        assert.equal(world.config.seed, entry.seed);
        assert.equal(world.config.generatorVersion, islands.generatorVersion);
        assert.equal(world.validation.accepted, true);
        assert.ok(plan.maximumAdjustment <= .600001 && plan.plots.length >= 10);
        assert.equal(world.terrain.heights.length, world.terrain.columns * world.terrain.rows);
        assert.equal(world.navigation.cells.length, world.navigation.columns * world.navigation.rows);
    }
    const expectedCharacters = Object.fromEntries(characterSourceInputs());
    assert.equal(characters.version, 1);
    assert.equal(new Set(characters.entries.map(entry => entry.originalPath)).size, characters.entries.length);
    assert.deepEqual(Object.fromEntries(characters.entries.map(entry =>
        [entry.originalPath, entry.originalSha256])), expectedCharacters,
    'World character sources changed. Run pnpm assets:character-sources.');
    for (const entry of characters.entries) {
        const bytes = await unpack(entry, entry.originalBytes,
            /^\/game-assets\/character-sources\/[a-f0-9]{20}\.gz$/);
        assert.equal(sha256(bytes), entry.originalSha256, entry.originalPath + ' exact original bytes');
        assert.deepEqual(bytes, await readFile('public' + entry.originalPath), entry.originalPath);
    }
    return { islands: islands.entries.length, characterSources: characters.entries.length };
}
