import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadTypeScript } from '../load-typescript.mjs';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:5230');
const load = path => loadTypeScript(new URL('../../src/' + path + '.ts', import.meta.url));
const { campaignIslandCatalog } = load('fjord-play/BakedIslandCatalog');
const { preparedCharacterCatalog } = load('characters/PreparedCharacterCatalog');
const entries = [...campaignIslandCatalog.entries, ...preparedCharacterCatalog.entries];
const started = performance.now();
const results = [];
for (const entry of entries) {
    const response = await fetch(new URL(entry.path, base));
    assert.equal(response.status, 200, entry.path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, entry.bytes, entry.path + ' fetch decoding/length');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    results.push({ path: entry.path, bytes: bytes.length,
        type: response.headers.get('content-type'), encoding: response.headers.get('content-encoding') });
}
const workerResponse = await fetch(new URL('/src/world-generation/GenerationWorker.ts', base));
assert.equal(workerResponse.status, 200);
assert.match(await workerResponse.text(), /await loadBakedCampaignIsland\(task.seed/);
const characterResponse = await fetch(new URL('/src/characters/MeshyHuman.ts', base));
assert.equal(characterResponse.status, 200);
assert.match(await characterResponse.text(), /verifiedCharacterBytes\(url, expected, observe\)/);
for (const path of ['/src/fjord-play/BakedIslandCatalog.ts', '/src/characters/PreparedCharacterCatalog.ts']) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200);
    const source = await response.text();
    assert.match(source, /\.bin/);
    assert.doesNotMatch(source, /\.gz["']/);
}
const report = { base: base.origin, elapsedMs: performance.now() - started,
    results, limit: 'HTTP delivery and current served-source checks only; no WebGL/browser/device acceptance.' };
await mkdir('output/island-loading-259', { recursive: true });
await writeFile('output/island-loading-259/prepared-http.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Verified ${results.length} prepared publications over HTTP and the current served worker/character path.`);
