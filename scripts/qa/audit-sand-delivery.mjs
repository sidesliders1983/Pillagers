import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const output = process.env.QA_OUTPUT || 'docs/qa/generated-sand-resolution';
await mkdir(output, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = 'public/ground-materials/world-v01';
const baseline = JSON.parse(await readFile(root + '/manifest.json', 'utf8'));
const preserved = [];
for (const row of baseline.delivery) {
    const bytes = await readFile(root + '/' + row.file);
    assert.equal(hash(bytes), row.sha256, 'Original delivery remains exact: ' + row.file);
    preserved.push({ file: row.file, sha256: hash(bytes), bytes: bytes.length });
}
const candidate = root + '/sand-standard-512';
const files = ['manifest.json', 'Ground054-colour.webp', 'Ground054-normal.webp', 'Ground054-roughness.webp'];
const snapshot = async () => Promise.all(files.map(async file => ({ file,
    sha256: hash(await readFile(candidate + '/' + file)) })));
const replays = [];
for (let run = 1; run <= 2; run++) {
    execFileSync(process.execPath, ['scripts/prepare-world-sand.mjs'], { stdio: 'pipe' });
    replays.push({ run, files: await snapshot() });
}
assert.deepEqual(replays[0].files, replays[1].files);
const manifest = JSON.parse(await readFile(candidate + '/manifest.json', 'utf8'));
for (const row of manifest.delivery) {
    const bytes = await readFile(candidate + '/' + row.file);
    assert.equal(hash(bytes), row.sha256);
    const image = await sharp(bytes).metadata();
    assert.equal(image.width, 512); assert.equal(image.height, 512);
}
const bytesAt = pixels => pixels === 512 ? manifest.delivery.reduce((sum, row) => sum + row.bytes, 0) :
    baseline.delivery.filter(row => row.file.startsWith(pixels === 128 ? 'low/Ground054-' : 'standard/Ground054-'))
        .reduce((sum, row) => sum + row.bytes, 0);
await writeFile(output + '/delivery-audit.json', JSON.stringify({
    preserved, deterministicReplays: replays, source: manifest.source, manifest,
    deliveryBytes: { low128: bytesAt(128), standard256: bytesAt(256), standard512: bytesAt(512) },
    estimates: { method: 'RGBA8 full mip-chain estimate; driver format/allocation may differ. Not measured VRAM.',
        low128TwoMaps: 2 * 128 * 128 * 4 * 4 / 3,
        standard256ThreeMaps: 3 * 256 * 256 * 4 * 4 / 3,
        standard512ThreeMaps: 3 * 512 * 512 * 4 * 4 / 3 },
}, null, 2) + '\n');
console.log('PASS: all 20 baseline maps unchanged, actual 512px maps and two identical full candidate replays.');
