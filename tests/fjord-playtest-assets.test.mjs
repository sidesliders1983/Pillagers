import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createPlaytestHandler } from '../scripts/qa/fjord-playtest-server.mjs';
import { load } from './load-source.mjs';

const { generatedHouseFiles } = load('../src/config/HousingAssets.ts');
const models = Buffer.from('glTF' + 'availability-only-fixture');

async function withBuild(missing, run) {
    const root = await mkdtemp(join(tmpdir(), 'fjord-playtest-assets-'));
    try {
        const houses = join(root, 'dist/game-assets/houses');
        const fixtures = join(root, 'docs/qa/integrated-playtest-180');
        await mkdir(houses, { recursive: true });
        await mkdir(fixtures, { recursive: true });
        await writeFile(join(root, 'dist/index.html'), '<title>Playtest fixture</title>');
        await writeFile(join(fixtures, 'launcher.html'), '<title>Playtest launcher fixture</title>');
        const assets = {};
        for (const [key, file] of Object.entries(generatedHouseFiles)) {
            assets[key] = { file, bytes: models.length };
            if (missing !== file) await writeFile(join(houses, file), models);
        }
        if (missing !== 'manifest.json')
            await writeFile(join(houses, 'manifest.json'), JSON.stringify({ schemaVersion: 1, assets }));
        for (const name of ['funded-800', 'developed-810', 'snow-811', 'summer-17', 'exploration-800'])
            await writeFile(join(fixtures, name + '.json'), '{}');
        await run(root);
    } finally {
        assert.equal(dirname(resolve(root)), resolve(tmpdir()));
        assert.ok(basename(root).startsWith('fjord-playtest-assets-'));
        await rm(root, { recursive: true, force: true });
    }
}

test('a playable host serves the complete prepared housing pack through its read-only allowlist', async () => {
    await withBuild(null, async root => {
        const handle = await createPlaytestHandler(root);
        const server = createServer(async (request, response) => {
            if (!await handle(request, response)) { response.writeHead(404); response.end(); }
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = 'http://127.0.0.1:' + server.address().port;
        try {
            assert.equal((await fetch(origin + '/fjord-play')).status, 200);
            for (const file of Object.values(generatedHouseFiles)) {
                const response = await fetch(origin + '/game-assets/houses/' + file);
                assert.equal(response.status, 200);
                assert.deepEqual(Buffer.from(await response.arrayBuffer()), models);
            }
            assert.equal((await fetch(origin + '/game-assets/houses/house-hut.glb', { method: 'POST' })).status, 405);
        } finally {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
    });
});

test('a fresh build without the house manifest or a referenced model cannot start a playable host', async () => {
    for (const missing of ['manifest.json', generatedHouseFiles.hut]) {
        await withBuild(missing, async root => {
            await assert.rejects(createPlaytestHandler(root), /Housing assets missing or incomplete/);
        });
    }
});
