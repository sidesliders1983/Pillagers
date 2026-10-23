import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const input = resolve(process.argv[2] ?? resolve(project, 'Assets/SoundFX'));
const generated = resolve(project, 'scratch/sound-assets-229/generated');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = readdirSync(input).filter(name => /^[a-z0-9-]+\.mp3$/.test(name) || name === 'Sound-trace.xlsx')
    .map(file => ({ file, source: resolve(input, file) }));
for (const file of ['axe-a.mp3', 'axe-b.mp3']) files.push({ file, source: resolve(generated, file) });
files.push({ file: 'generation-receipt.json', source: resolve(generated, 'receipt.json') });
files.sort((a, b) => a.file.localeCompare(b.file));
for (const entry of files) entry.sha256 = hash(readFileSync(entry.source));
const snapshotHash = hash(JSON.stringify(files.map(({ file, sha256 }) => ({ file, sha256 }))));
const output = resolve(project, 'scratch/sound-assets-229/inputs', snapshotHash.slice(0, 16));
mkdirSync(output, { recursive: true });
for (const entry of files) {
    copyFileSync(entry.source, resolve(output, entry.file));
    assert.equal(hash(readFileSync(resolve(output, entry.file))), entry.sha256, 'Snapshot copy changed');
    assert.equal(hash(readFileSync(entry.source)), entry.sha256, 'Source changed during snapshot');
}
writeFileSync(resolve(output, 'snapshot.json'), JSON.stringify({ snapshotHash, files }, null, 2) + '\n');
writeFileSync(resolve(project, 'scratch/sound-assets-229/input.json'), JSON.stringify({ output }, null, 2) + '\n');
console.log(JSON.stringify({ output, files: files.length, snapshotHash }));
