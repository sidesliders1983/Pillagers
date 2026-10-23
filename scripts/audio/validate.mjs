import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const pointer = resolve(process.argv[2] ?? resolve(project, 'scratch/sound-assets-229/latest.json'));
const output = JSON.parse(readFileSync(pointer)).output;
const catalogue = JSON.parse(readFileSync(resolve(output, 'catalogue.json')));
const manifest = JSON.parse(readFileSync(resolve(output, 'manifest.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(catalogue.recipeSHA256, hash(readFileSync(new URL('./recipes.json', import.meta.url))), 'Recipe changed since preparation');
assert.equal(catalogue.preparationSHA256, hash(readFileSync(new URL('./prepare.mjs', import.meta.url))), 'Preparer changed since preparation');
assert.equal(manifest.assets.length, catalogue.entries.length);
assert.equal(manifest.cues.length, new Set(catalogue.entries.map(entry => entry.recipe.cue ?? entry.id)).size);
assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, manifest.assets.length);
for (const entry of catalogue.entries) {
    const asset = manifest.assets.find(asset => asset.id === entry.id);
    const cue = manifest.cues.find(cue => cue.id === (entry.recipe.cue ?? entry.id));
    assert.ok(asset && cue, 'Missing cue/asset: ' + entry.id);
    assert.ok(cue.variants.includes(entry.id));
    assert.equal(asset.path, 'game-assets/audio/' + entry.prepared.file);
    assert.match(entry.prepared.file, /^[a-z0-9-]+\.wav$/);
    const bytes = readFileSync(resolve(output, entry.prepared.file));
    assert.equal(bytes.length, entry.prepared.bytes);
    assert.equal(hash(bytes), entry.prepared.sha256, 'Prepared hash: ' + entry.id);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, 'WAV length: ' + entry.id);
    let format, pcm;
    for (let offset = 12; offset + 8 <= bytes.length;) {
        const length = bytes.readUInt32LE(offset + 4);
        assert.ok(offset + 8 + length <= bytes.length, 'Truncated WAV chunk');
        const name = bytes.toString('ascii', offset, offset + 4);
        if (name === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + length);
        if (name === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + length);
        offset += 8 + length + length % 2;
    }
    assert.ok(format && pcm, 'Missing WAV format/data');
    assert.equal(format.readUInt16LE(0), 1, 'PCM WAV only');
    assert.equal(format.readUInt16LE(2), asset.channels);
    assert.equal(format.readUInt32LE(4), entry.prepared.sampleRate);
    assert.equal(format.readUInt16LE(14), 16);
    assert.equal(pcm.length / (asset.channels * 2), entry.prepared.frames);
    assert.equal(asset.seconds, entry.prepared.seconds);
    assert.ok(bytes.length <= 4 * 1024 * 1024);
    assert.ok(asset.seconds * 96000 * asset.channels * 4 <= 8 * 1024 * 1024,
        'File exceeds decoded PCM budget at 96 kHz');
    assert.ok(entry.prepared.truePeakDbFS < -1);
    assert.equal(entry.prepared.clippedSamples, 0);
    if (cue.loop) {
        assert.ok(entry.id.startsWith('wind-'), 'Only wind loops in this candidate pack');
        assert.equal(cue.loopStart, 0);
        assert.equal(cue.loopEnd, asset.seconds);
    }
    if (process.argv.includes('--publication')) {
        assert.equal(entry.status.distribution, 'cleared', 'Distribution not cleared: ' + entry.id);
        assert.equal(entry.status.listening, 'accepted', 'Listening not accepted: ' + entry.id);
        assert.ok(entry.provenance.sourceUrl && entry.provenance.creator && entry.provenance.licenseEvidence,
            'Individual provenance missing: ' + entry.id);
    }
}
console.log(JSON.stringify({ candidates: manifest.assets.length, technical: 'passed',
    publication: process.argv.includes('--publication') ? 'passed' : 'not assessed; separate required gate',
    catalogueSHA256: hash(readFileSync(resolve(output, 'catalogue.json'))) }));
