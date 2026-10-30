import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import sharp from 'sharp';

// Archive one record/image at a time. Originals remain in scratch; the manifest
// proves that compression preserves every byte of the measured JSON.
const root = path.resolve('scratch/three-r187-323');
const destination = path.resolve('docs/qa/three-r187-323/evidence');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
sharp.cache(false);
sharp.concurrency(1);
const manifest = {
    schemaVersion: 1,
    archivedUtc: new Date().toISOString(),
    measuredCommits: {
        A: '01dc5f79c9b8ee4024c0fbed338af4778a5f4c97',
        B: '1c04d4b1a0213bc38ae1e4bbefc608af78f25bf4',
    },
    records: [],
    images: [],
    notes: [
        'Raw JSON is gzip-compressed losslessly; hashes refer to original and archived bytes separately.',
        'Images are display derivatives; original PNG hashes and dimensions are retained.',
        'Automatic phone uploads and owner attachments describe the same sessions and must not be counted twice.',
        'Chrome iOS is not the required physical Safari acceptance. No temperature/VRAM/unsupported API values are inferred.',
    ],
};
await mkdir(destination, { recursive: true });

async function archive(source, label, classification) {
    const bytes = await readFile(source);
    const parsed = JSON.parse(bytes.toString('utf8'));
    const compressed = gzipSync(bytes, { level: 9 });
    assert.deepEqual(gunzipSync(compressed), bytes);
    const relative = label + '.json.gz';
    await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
    await writeFile(path.join(destination, relative), compressed);
    manifest.records.push({
        file: relative,
        source: path.relative(path.resolve('.'), source).replaceAll('\\', '/'),
        classification,
        status: parsed.status ?? 'record',
        arm: parsed.arm,
        startedUtc: parsed.startedUtc,
        rawBytes: bytes.length,
        rawSHA256: hash(bytes),
        archiveBytes: compressed.length,
        archiveSHA256: hash(compressed),
        verifiedLossless: true,
    });
}

for (const name of ['1-A', '2-B', '3-B', '4-A', '5-A', '6-B']) {
    await archive(path.join(root, 'matrix', name, 'run.json'), 'matrix/' + name, 'primary-paused');
}
await archive(path.join(root, 'matrix/manifest.json'), 'matrix/manifest', 'primary-completeness');
for (const arm of ['A', 'B']) {
    for (const kind of ['sustained', 'lifecycle', 'warm']) {
        await archive(path.join(root, `${kind}-${arm}/run.json`), `${kind}-${arm}`, kind);
    }
    await archive(path.join(root, `sustained-${arm}/checkpoint.json`), `sustained-${arm}-checkpoint`, 'canonical-state');
    await archive(path.join(root, `lifecycle-${arm}-cache/run.json`), `lifecycle-${arm}-cache`, 'bounded-cache-followup');
    await archive(path.join(root, `pilot-${arm}/run.json`), `pilot-${arm}`, 'excluded-runner-pilot');
    for (const view of ['winter', 'marsh']) {
        await archive(path.join(root, `visual-${view}-${arm}/run.json`), `visual-${view}-${arm}`, 'visual-only');
    }
    await archive(path.join(root, `device-results/user-attachments/${arm}.json`), `phone-owner-${arm}`, 'physical-Chrome-iOS');
    const geographyRoot = arm === 'A' ? path.resolve('../three-r187-spike-323-baseline') : path.resolve('.');
    await archive(path.join(geographyRoot, `output/island-loading-259/geography-three323-${arm}.json`),
        `geography-${arm}`, 'single-CPU-generation');
}
for (const entry of await readdir(path.join(root, 'device-results'), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const source = path.join(root, 'device-results', entry.name);
    const value = JSON.parse(await readFile(source, 'utf8'));
    const safari = /iPhone/.test(value.userAgent || '') && /Version\//.test(value.userAgent || '') && !/CriOS/.test(value.userAgent || '');
    const category = entry.name === 'thermal-observation.json' ? 'qualitative-owner-observation'
        : safari ? 'physical-Safari' : /iPhone/.test(value.userAgent || '') ? 'duplicate-phone-session' : 'excluded-wrapper-smoke';
    await archive(source, 'device-results/' + entry.name.replace('.json', ''), category);
}
for (const attempt of ['001', '002']) {
    await archive(path.join(root, `lifecycle-B-failed-${attempt}/run.json`),
        `excluded/lifecycle-B-${attempt}`, 'excluded-runner-wrong-file-envelope');
}
await archive(path.join(root, 'lifecycle-B-interrupted-003/reason.json'),
    'excluded/lifecycle-B-003', 'excluded-interrupted-known-runner-error');

const views = [
    ['settlement-A', 'matrix/1-A/after.png'],
    ['settlement-B', 'matrix/2-B/after.png'],
    ['winter-A', 'visual-winter-A/after.png'],
    ['winter-B', 'visual-winter-B/after.png'],
    ['marsh-A', 'visual-marsh-A/after.png'],
    ['marsh-B', 'visual-marsh-B/after.png'],
    ['hdr-A', 'lifecycle-A/standard-hdr.png'],
    ['hdr-B', 'lifecycle-B/standard-hdr.png'],
    ['portrait-A', 'lifecycle-A/portrait-founder-4.png'],
    ['portrait-B', 'lifecycle-B/portrait-founder-4.png'],
];
for (const [name, source] of views) {
    const original = await readFile(path.join(root, source));
    const metadata = await sharp(original).metadata();
    const encoded = await sharp(original).webp({ quality: 90, effort: 5 }).toBuffer();
    const file = `images/${name}.webp`;
    await mkdir(path.join(destination, 'images'), { recursive: true });
    await writeFile(path.join(destination, file), encoded);
    manifest.images.push({ file, source, originalSHA256: hash(original), originalBytes: original.length,
        width: metadata.width, height: metadata.height, derivativeSHA256: hash(encoded), derivativeBytes: encoded.length });
}
manifest.completeness = {
    primaryPaused: { expected: 6, complete: manifest.records.filter(r => r.classification === 'primary-paused' && r.status === 'complete').length },
    sustained: { expected: 2, complete: manifest.records.filter(r => r.classification === 'sustained' && r.status === 'complete').length },
    lifecycle: { expected: 2, complete: manifest.records.filter(r => r.classification === 'lifecycle' && r.status === 'complete').length },
    cacheFollowup: { expected: 2, complete: manifest.records.filter(r => r.classification === 'bounded-cache-followup' && r.status === 'complete').length },
    warm: { expected: 2, complete: manifest.records.filter(r => r.classification === 'warm' && r.status === 'complete').length },
    visuals: { expected: 4, complete: manifest.records.filter(r => r.classification === 'visual-only' && r.status === 'complete').length },
    physicalChromeIOS: { expected: 2, complete: manifest.records.filter(r => r.classification === 'physical-Chrome-iOS' && r.status === 'complete').length },
    physicalSafari: { expected: 2,
        complete: manifest.records.filter(r => r.classification === 'physical-Safari' && r.status === 'complete').length,
        status: manifest.records.some(r => r.classification === 'physical-Safari') ? 'inspect-new-device-evidence' : 'awaiting-device-evidence' },
    resourceLimited: 0,
    runnerTechnicalFailuresExcluded: 2,
    interruptedKnownRunnerErrorExcluded: 1,
};
manifest.totals = {
    rawJsonBytes: manifest.records.reduce((sum, row) => sum + row.rawBytes, 0),
    archivedJsonBytes: manifest.records.reduce((sum, row) => sum + row.archiveBytes, 0),
    displayImageBytes: manifest.images.reduce((sum, row) => sum + row.derivativeBytes, 0),
};
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ records: manifest.records.length, images: manifest.images.length, ...manifest.totals }));
