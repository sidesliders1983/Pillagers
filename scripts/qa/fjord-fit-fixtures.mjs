import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';
const { SharedSettlement } = loadTypeScript(new URL('../../src/play/SharedSettlement.ts', import.meta.url));
const source = 'docs/qa/fjord-runtime-performance/fixtures';
const output = 'docs/qa/fjord-runtime-improvements/170/fixtures';
await mkdir(output, { recursive: true });
const records = [];
for (const name of ['boundary-810', 'developed-810']) {
    const bytes = await readFile(source + '/' + name + '.json');
    await writeFile(output + '/' + name + '.json', bytes);
    records.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), copiedFrozenInput: true });
}
const shared = SharedSettlement.restore(await readFile(source + '/boundary-810.json', 'utf8'), 'fjord');
shared.command({ type: 'AdvanceTicks', ticks: 1000 });
const later = shared.persist() + '\n';
assert.deepEqual(shared.session.snapshot().time, { winter: 811, tick: 990 });
await writeFile(output + '/later-boundary-811.json', later);
records.push({ name: 'later-boundary-811', sha256: createHash('sha256').update(later).digest('hex'),
    derivedFrom: 'boundary-810', commands: [{ type: 'AdvanceTicks', ticks: 1000 }],
    note: 'Restored complete frozen campaign/narrative identity and applied authoritative commands through SharedSettlement before persisting.' });
await writeFile(output + '/manifest.json', JSON.stringify({ records }, null, 2) + '\n');
