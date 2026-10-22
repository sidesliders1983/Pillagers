import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { load } from './load-source.mjs';
import { validatePreparedAssets } from '../scripts/validate-prepared-assets.mjs';

const diskFetch = async url => new Response(await readFile(new URL('../public' + url.split('?')[0], import.meta.url)));

test('all prepared publications retain exact bytes, recipes, source lineage and current generator inputs', async () => {
    await validatePreparedAssets();
});

test('loading a prepared island matches the full generated proposal, without running the generator', async () => {
    const generator = load('../src/world-generation/GenerateWorld.ts');
    const original = generator.generateWorld;
    const { createCampaignIsland, campaignIslandPlan, islandRecipe } = load('../src/fjord-play/CampaignIsland.ts');
    const { loadBakedCampaignIsland } = load('../src/fjord-play/BakedCampaignIsland.ts');
    const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const cases = [
        { seed: 2935851268, version: 'island-pool-v3' },
        { seed: 3055065912, version: 'island-pool-v3' },
        { seed: 32, version: 'island-pool-v1' },
        { seed: 32, version: 'island-pool-v2' },
    ];
    for (const { seed, version } of cases) {
        const recipe = islandRecipe(seed, version), expected = createCampaignIsland(seed, recipe);
        const hash = digest({ world: expected, plan: campaignIslandPlan(expected) });
        const events = [], requested = [];
        try {
            generator.generateWorld = () => { throw new Error('Generation must stay offline'); };
            const result = await loadBakedCampaignIsland(seed,
                { seed: recipe.seed, generatorVersion: recipe.generatorVersion, version },
                event => events.push(event), async url => { requested.push(url); return diskFetch(url); });
            assert.equal(digest(result), hash, version + '/' + recipe.seed);
            assert.equal(requested.length, 1, 'Only the selected island is loaded');
            assert.equal(createCampaignIsland(seed, recipe), result.world);
            assert.deepEqual(campaignIslandPlan(result.world), result.plan);
            assert.ok(Object.isFrozen(result.world.terrain.heights));
            assert.equal(events.filter(event => event.type === 'preview').length, 1);
            assert.deepEqual(events.filter(event => event.type === 'timing').map(event => event.stage),
                ['island-download', 'island-unpack', 'island-verify']);
        } finally { generator.generateWorld = original; }
    }
});

test('missing, stale, corrupt or truncated prepared islands fail without silently generating replacements', async () => {
    const { islandRecipe } = load('../src/fjord-play/CampaignIsland.ts');
    const { loadBakedCampaignIsland } = load('../src/fjord-play/BakedCampaignIsland.ts');
    const recipe = islandRecipe(2935851268);
    await assert.rejects(loadBakedCampaignIsland(2935851268, { ...recipe, seed: 7 }, undefined, diskFetch), /recipe/);
    await assert.rejects(loadBakedCampaignIsland(2935851268, recipe, undefined,
        async () => new Response('', { status: 404 })), /Could not load/);
    await assert.rejects(loadBakedCampaignIsland(2935851268, recipe, undefined, async url => {
        const bytes = new Uint8Array(await (await diskFetch(url)).arrayBuffer());
        bytes[bytes.length - 1] ^= 1;
        return new Response(bytes);
    }), /differ/);
    await assert.rejects(loadBakedCampaignIsland(2935851268, recipe, undefined,
        async () => new Response(new Uint8Array(10))), /differ/);
});

test('the production worker routes campaign requests to the selected publication and keeps request ownership', async () => {
    const { Worker } = await import('node:worker_threads');
    const { campaignIslandCatalog } = load('../src/fjord-play/BakedIslandCatalog.ts');
    const worker = new Worker(new URL('./fixtures/prepared-generation-worker.mjs', import.meta.url));
    const messages = [];
    const result = await new Promise((resolve, reject) => {
        worker.on('message', message => {
            messages.push(message);
            if (message.type === 'result') resolve(message.result);
            if (message.type === 'error') reject(new Error(message.message));
        });
        worker.on('error', reject);
        worker.postMessage({ id: 73, task: { kind: 'campaign', seed: 2935851268 } });
    }).finally(() => worker.terminate());
    assert.ok(messages.every(message => message.id === 73));
    assert.deepEqual(messages.filter(message => message.type === 'phase').map(message => message.stage),
        ['island-download', 'island-unpack', 'island-verify']);
    const entry = campaignIslandCatalog.entries.find(value => value.version === 'island-pool-v3' && value.seed === 101);
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'), entry.canonicalSha256);
    assert.ok(messages.some(message => message.type === 'preview' && message.preview.heights.length <= 128 ** 2));
    assert.ok(messages.some(message => message.type === 'transport' && message.jsonBytes === null));
});

test('prepared character loading reconstructs the original source and binding bytes with strict identities', async () => {
    const { verifiedCharacterBytes } = load('../src/characters/PreparedCharacterBytes.ts');
    const { preparedCharacterCatalog } = load('../src/characters/PreparedCharacterCatalog.ts');
    for (const suffix of ['Human_LOD2.glb', 'long-2.binding.json', 'outfit.glb']) {
        const entry = preparedCharacterCatalog.entries.find(value => value.originalPath.endsWith(suffix));
        const urls = [], samples = [];
        const bytes = await verifiedCharacterBytes(entry.originalPath, entry.originalSha256,
            sample => samples.push(sample), entry.originalPath.endsWith('.json') ? 'binding' : 'source',
            async url => { urls.push(url); return diskFetch(url); });
        assert.deepEqual(Buffer.from(bytes), await readFile(new URL('../public' + entry.originalPath, import.meta.url)));
        assert.equal(urls.length, 1);
        assert.ok(urls[0].startsWith(entry.path));
        assert.ok(samples.some(sample => sample.stage.endsWith('-unpack')));
        await assert.rejects(verifiedCharacterBytes(entry.originalPath, '0'.repeat(64), undefined, 'source', diskFetch), /stale/);
        await assert.rejects(verifiedCharacterBytes(entry.originalPath, entry.originalSha256, undefined, 'source',
            async () => new Response(new Uint8Array(10))), /differ/);
    }
});

test('unpublished lab sources keep original byte verification; inflation enforces exact output bounds', async () => {
    const { verifiedCharacterBytes } = load('../src/characters/PreparedCharacterBytes.ts');
    const { unpackPreparedBytes } = load('../src/core/PreparedBytes.ts');
    const { gzipSync } = await import('node:zlib');
    const bytes = Buffer.from('Pillagers · Ægir'), hash = createHash('sha256').update(bytes).digest('hex');
    let requested;
    const restored = await verifiedCharacterBytes('/lab-only.glb?v=exact', hash, undefined, 'source', async url => {
        requested = url;
        return new Response(bytes);
    });
    assert.equal(requested, '/lab-only.glb?v=exact');
    assert.deepEqual(Buffer.from(restored), bytes);
    await assert.rejects(verifiedCharacterBytes('/lab-only.glb', '0'.repeat(64), undefined, 'source',
        async () => new Response(bytes)), /differ/);
    const compressed = Uint8Array.from(gzipSync(bytes)).buffer;
    await assert.rejects(unpackPreparedBytes(compressed, bytes.length - 1), /exceeds/);
    await assert.rejects(unpackPreparedBytes(compressed, bytes.length + 1), /incomplete/);
    assert.deepEqual(Buffer.from(await unpackPreparedBytes(compressed, bytes.length)), bytes);
});
