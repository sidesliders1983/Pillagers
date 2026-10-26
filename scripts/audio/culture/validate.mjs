import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTypeScript } from '../../load-typescript.mjs';

const defaultDirectory = fileURLToPath(new URL('../../../public/game-assets/audio/culture/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Check the separate culture publication without altering the frozen accepted sound release. */
export function validateCulturalAudio(directory = defaultDirectory) {
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')));
    const catalogue = JSON.parse(readFileSync(join(directory, 'catalogue.json')));
    const { culturalSoundPack } = loadTypeScript(new URL('../../../src/audio/CulturalSoundPack.ts', import.meta.url));
    assert.deepEqual(manifest, culturalSoundPack, 'Cultural runtime/public manifest identity differs');
    assert.equal(manifest.assets.length, 2);
    assert.equal(manifest.cues.length, 2);
    assert.equal(catalogue.entries.length, 2);
    assert.equal(new Set(manifest.assets.map(asset => asset.id)).size, 2);
    assert.equal(new Set(catalogue.entries.map(entry => entry.generationId)).size, 2);
    assert.ok(Number.isSafeInteger(manifest.decodedBudget.maximumBytes));
    assert.ok(manifest.decodedBudget.maximumBytes > 0 && manifest.decodedBudget.maximumBytes <= 2 * 1024 * 1024);
    assert.deepEqual([...manifest.decodedBudget.assetIds].sort(), manifest.assets.map(asset => asset.id).sort());
    let preparedBytes = 0;
    for (const asset of manifest.assets) {
        const entry = catalogue.entries.find(entry => entry.id === asset.id);
        const cue = manifest.cues.find(cue => cue.id === asset.id);
        assert.ok(entry && cue, 'Missing cultural source record');
        assert.equal(entry.provider, 'ElevenLabs');
        assert.equal(entry.model, 'eleven_text_to_sound_v2');
        assert.equal(entry.sourceUrl, 'https://elevenlabs.io/sound-effects');
        assert.ok(entry.licenseEvidence.includes('https://elevenlabs.io/creative-terms'));
        assert.equal(asset.path, 'game-assets/audio/culture/' + entry.prepared.file);
        assert.match(entry.prepared.file, /^[a-z0-9-]+\.wav$/);
        const bytes = readFileSync(join(directory, entry.prepared.file));
        assert.equal(hash(bytes), entry.prepared.sha256, 'Cultural WAV hash identity differs');
        assert.equal(bytes.length, entry.prepared.bytes);
        assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
        assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
        assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
        let format, pcm;
        for (let offset = 12; offset + 8 <= bytes.length;) {
            const length = bytes.readUInt32LE(offset + 4);
            assert.ok(offset + 8 + length <= bytes.length, 'Truncated cultural WAV chunk');
            const type = bytes.toString('ascii', offset, offset + 4);
            if (type === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + length);
            if (type === 'data') pcm = bytes.subarray(offset + 8, offset + 8 + length);
            offset += 8 + length + length % 2;
        }
        assert.ok(format && pcm, 'Missing cultural WAV format/data');
        assert.equal(format.readUInt16LE(0), 1);
        assert.equal(format.readUInt16LE(2), 1);
        assert.equal(format.readUInt32LE(4), 24000);
        assert.equal(format.readUInt16LE(14), 16);
        assert.equal(pcm.length % 2, 0);
        assert.equal(pcm.length / 2, entry.prepared.frames);
        assert.equal(entry.prepared.frames / 24000, asset.seconds);
        assert.equal(entry.prepared.seconds, asset.seconds);
        assert.equal(asset.channels, 1);
        assert.ok(asset.seconds > 0 && asset.seconds <= 4);
        for (let offset = 0; offset < pcm.length; offset += 2)
            assert.ok(Math.abs(pcm.readInt16LE(offset) / 32768) < 1, 'Cultural sample clips');
        assert.equal(entry.prepared.clippedSamples, 0);
        assert.ok(entry.prepared.truePeakDbFS < -1);
        assert.equal(cue.bus, 'world');
        assert.equal(cue.loop, false);
        assert.equal(cue.limit, 1);
        assert.deepEqual(cue.variants, [asset.id]);
        preparedBytes += bytes.length;
    }
    return { assets: 2, preparedBytes, listening: catalogue.status.listening,
        generalRelease: catalogue.status.generalRelease, technical: 'passed' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.ok(process.argv.length <= 3, 'Pass at most the candidate directory');
    console.log(JSON.stringify(validateCulturalAudio(process.argv[2])));
}
