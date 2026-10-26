import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const candidateRoot = resolve(project, 'scratch/culture-audio');
const directory = resolve(process.argv[2] ?? candidateRoot);
assert.equal(directory, candidateRoot, 'Prepare only the fixed private cultural-audio staging directory.');
assert.equal(realpathSync(directory), directory, 'The staging path must not traverse a junction or symlink.');
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const rate = 24000;
const byteCap = 2 * 1024 * 1024;
const receiptBytes = readFileSync(join(directory, 'download-receipt.json'));
const receipt = JSON.parse(receiptBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const preparerHash = hash(Buffer.from(source));
const output = join(directory, 'prepared-' + hash(receiptBytes).slice(0, 12) + '-' + preparerHash.slice(0, 8));
const version = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split(/\r?\n/)[0];
const run = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60000,
    windowsHide: true,
});

function statistics(bytes, sampleBytes = 4) {
    assert.equal(bytes.length % sampleBytes, 0, 'Truncated PCM');
    let maximum = 0, squares = 0, clipped = 0;
    for (let offset = 0; offset < bytes.length; offset += sampleBytes) {
        const sample = sampleBytes === 4 ? bytes.readFloatLE(offset) : bytes.readInt16LE(offset) / 32768;
        assert.ok(Number.isFinite(sample), 'Invalid sample');
        maximum = Math.max(maximum, Math.abs(sample));
        squares += sample * sample;
        if (Math.abs(sample) >= 1) clipped++;
    }
    const frames = bytes.length / sampleBytes;
    assert.ok(frames > 0 && maximum > 0, 'Silent or empty candidate');
    return {
        frames,
        seconds: frames / rate,
        peakDbFS: 20 * Math.log10(maximum),
        rmsDbFS: 10 * Math.log10(squares / frames),
        clippedSamples: clipped,
    };
}

function readWav(bytes) {
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
    let format, data;
    for (let offset = 12; offset + 8 <= bytes.length;) {
        const length = bytes.readUInt32LE(offset + 4);
        assert.ok(offset + 8 + length <= bytes.length, 'Truncated WAV chunk');
        const id = bytes.toString('ascii', offset, offset + 4);
        if (id === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + length);
        if (id === 'data') data = bytes.subarray(offset + 8, offset + 8 + length);
        offset += 8 + length + length % 2;
    }
    assert.ok(format && data, 'Missing WAV chunks');
    assert.equal(format.readUInt16LE(0), 1, 'PCM format');
    assert.equal(format.readUInt16LE(2), 1, 'Mono only');
    assert.equal(format.readUInt32LE(4), rate);
    assert.equal(format.readUInt16LE(14), 16);
    return statistics(data, 2);
}

assert.equal(receipt.status, 'completed-and-downloaded');
assert.equal(receipt.generations.length, 8);
assert.equal(new Set(receipt.generations.map(entry => entry.id)).size, 8);
mkdirSync(output, { recursive: true });
const entries = [];
for (const generation of receipt.generations) {
    assert.ok(['culture-murmur', 'culture-applause'].includes(generation.label));
    assert.match(generation.file, /^[A-Za-z0-9-]+\.mp3$/);
    const input = join(directory, 'originals', generation.file);
    const original = readFileSync(input);
    assert.equal(hash(original), generation.sha256, 'Original identity changed');
    assert.equal(original.length, generation.bytes);
    const decoded = run(['-i', input, '-vn', '-ar', String(rate), '-ac', '1', '-f', 'f32le', '-']);
    const originalStats = statistics(decoded);
    assert.ok(originalStats.seconds <= 4.5, 'Unexpected provider duration');
    const duration = Math.min(generation.duration, originalStats.seconds);
    const trimDb = Math.min(0, -6 - originalStats.peakDbFS);
    const file = generation.label + '-' + generation.sha256.slice(0, 8) + '-' + preparerHash.slice(0, 8) + '.wav';
    const target = join(output, file);
    const filter = 'aresample=' + rate + ',aformat=channel_layouts=mono,' +
        'atrim=duration=' + duration + ',asetpts=PTS-STARTPTS,highpass=f=25,' +
        'volume=' + trimDb + 'dB,afade=t=in:st=0:d=0.012,' +
        'afade=t=out:st=' + Math.max(0, duration - .04) + ':d=0.04';
    run(['-y', '-i', input, '-vn', '-af', filter, '-ar', String(rate), '-ac', '1',
        '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', target]);
    const prepared = readFileSync(target);
    const measured = readWav(prepared);
    const measurement = spawnSync(ffmpeg,
        ['-hide_banner', '-i', target, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
            encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000, windowsHide: true,
        });
    assert.equal(measurement.status, 0, 'Loudness meter failed');
    const summary = measurement.stderr.slice(measurement.stderr.lastIndexOf('Summary:'));
    const truePeakDbFS = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
    const integratedLUFS = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
    assert.ok(Number.isFinite(truePeakDbFS) && truePeakDbFS < -1, 'True-peak headroom failed');
    assert.ok(Number.isFinite(integratedLUFS), 'Missing loudness measurement');
    assert.equal(measured.clippedSamples, 0, 'Prepared samples clip');
    assert.ok(measured.seconds <= generation.duration + 1 / rate);
    entries.push({
        generationId: generation.id, label: generation.label, nodeId: generation.nodeId,
        sessionId: generation.sessionId, reportedPrice: generation.price,
        source: { file: generation.file, sha256: generation.sha256, bytes: original.length,
            reportedSeconds: generation.duration, decodedAtPreparationRate: originalStats },
        prepared: { file, sha256: hash(prepared), bytes: prepared.length, sampleRate: rate,
            channels: 1, bits: 16, ...measured, truePeakDbFS, integratedLUFS, trimDb },
        status: { technical: 'prepared', listening: 'not-assessed', distribution: 'not-assessed' },
    });
}

// A deterministic technical preview pair, never an inferred listening selection.
const selection = ['culture-murmur', 'culture-applause'].map(label => entries.find(entry => entry.label === label));
assert.ok(selection.every(Boolean));
const manifest = {
    assets: selection.map(entry => ({ id: entry.label + '-candidate',
        path: 'game-assets/audio/culture/' + entry.prepared.file,
        seconds: entry.prepared.seconds, channels: 1 })),
    cues: selection.map(entry => ({ id: entry.label, bus: 'world', variants: [entry.label + '-candidate'],
        gain: entry.label === 'culture-murmur' ? .16 : .2, loop: false, cooldown: [0, 0],
        range: 36, priority: 2, limit: 1, pitch: [1, 1] })),
};
const decodedAt = sampleRate => manifest.assets.reduce((sum, asset) =>
    sum + Math.ceil(asset.seconds * sampleRate) * asset.channels * 4, 0);
const catalogue = {
    version: 1, preparedAt: new Date().toISOString(), ffmpeg: version,
    sourceReceiptSHA256: hash(receiptBytes), preparationSHA256: preparerHash,
    preparationHashMode: 'UTF-8 normalized LF', entries,
    candidateSelection: { reason: 'First generated variation per category for technical preview only; not listening accepted.',
        generationIds: selection.map(entry => entry.generationId) },
    decodedBudget: { maximumBytes: byteCap, examples: [44100, 48000, 96000, 192000].map(sampleRate =>
        ({ sampleRate, bytes: decodedAt(sampleRate), admitted: decodedAt(sampleRate) <= byteCap })),
        admission: 'Check actual AudioContext rate before loading and actual decoded bytes afterward; skip cultural cues if the pair cannot fit. Never load all eight review variants as the runtime pack.' },
};
writeFileSync(join(output, 'catalogue.json'), JSON.stringify(catalogue, null, 2) + '\n');
writeFileSync(join(output, 'manifest.candidate.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(output, 'CulturalSoundPack.candidate.ts'),
    "import type { SoundManifest } from '../../../src/audio/FjordAudio';\n\n" +
    '/** Technical preview only. No listening or distribution acceptance; not imported by runtime. */\n' +
    'export const culturalSoundPackCandidate: SoundManifest = ' + JSON.stringify(manifest, null, 4) + ';\n');
writeFileSync(join(directory, 'latest-prepared.json'), JSON.stringify({ output }, null, 2) + '\n');
console.log(JSON.stringify({ output, prepared: entries.length, bytes: entries.reduce((sum, entry) =>
    sum + entry.prepared.bytes, 0), previewPairBytesAt96k: decodedAt(96000),
    previewPairBytesAt192k: decodedAt(192000), listening: 'not-assessed' }));
