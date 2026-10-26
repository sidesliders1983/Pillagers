import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../../', import.meta.url));
const privateRoot = resolve(project, 'scratch/culture-audio');
const { output } = JSON.parse(readFileSync(join(privateRoot, 'latest-prepared.json')));
assert.ok(resolve(output).startsWith(privateRoot + '\\') || resolve(output).startsWith(privateRoot + '/'));
const catalogue = JSON.parse(readFileSync(join(output, 'catalogue.json')));
const selectedIds = ['Uba21h6cTZNVaO7eM8P5', '5wzWo0JLiRv62M3wBVzM'];
const selected = selectedIds.map(id => catalogue.entries.find(entry => entry.generationId === id));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const destination = join(project, 'public/game-assets/audio/culture');
for (const entry of selected) {
    assert.ok(entry && entry.status.technical === 'prepared');
    assert.match(entry.prepared.file, /^[a-z0-9-]+\.wav$/);
    const bytes = readFileSync(join(output, entry.prepared.file));
    assert.equal(hash(bytes), entry.prepared.sha256);
    assert.equal(bytes.length, entry.prepared.bytes);
    assert.equal(entry.prepared.channels, 1);
    assert.equal(entry.prepared.sampleRate, 24000);
    assert.equal(entry.prepared.clippedSamples, 0);
    assert.ok(entry.prepared.truePeakDbFS < -1);
}
const manifest = {
    assets: selected.map(entry => ({ id: entry.label,
        path: 'game-assets/audio/culture/' + entry.prepared.file,
        seconds: entry.prepared.seconds, channels: 1 })),
    cues: selected.map(entry => ({ id: entry.label, bus: 'world', variants: [entry.label],
        gain: .4, loop: false, cooldown: [0, 0], range: 36, priority: 2, limit: 1, pitch: [1, 1] })),
    decodedBudget: { assetIds: selected.map(entry => entry.label), maximumBytes: 2 * 1024 * 1024 },
};
const publicCatalogue = {
    version: 1, role: 'Experimental cultural gathering sound candidates; not a standalone sample library.',
    status: { technical: 'prepared', listening: 'pending', generalRelease: 'not-approved' },
    selectionReason: 'One technical pair with comparable measured levels; no listening or wordlessness acceptance is inferred.',
    preparationSHA256: catalogue.preparationSHA256, preparationHashMode: catalogue.preparationHashMode,
    tool: catalogue.ffmpeg,
    entries: selected.map(entry => ({ id: entry.label, generationId: entry.generationId,
        provider: 'ElevenLabs', model: 'eleven_text_to_sound_v2', generatedDate: '2026-10-26',
        sourceUrl: 'https://elevenlabs.io/sound-effects',
        licenseEvidence: ['https://elevenlabs.io/creative-terms'],
        source: { sha256: entry.source.sha256, bytes: entry.source.bytes },
        prepared: entry.prepared })),
    decodedBudget: { ...manifest.decodedBudget,
        note: 'Admission uses the actual AudioContext rate and verifies actual decoded buffers; unsupported budgets skip these cues.' },
};
mkdirSync(destination, { recursive: true });
for (const entry of selected) copyFileSync(join(output, entry.prepared.file), join(destination, entry.prepared.file));
writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(destination, 'catalogue.json'), JSON.stringify(publicCatalogue, null, 2) + '\n');
writeFileSync(join(project, 'src/audio/CulturalSoundPack.ts'),
    "import type { SoundManifest } from './FjordAudio';\n\n" +
    '/** Generated technical pair for the experimental cultural flow; listening selection remains pending. */\n' +
    'export const culturalSoundPack: SoundManifest = ' + JSON.stringify(manifest, null, 4) + ';\n\n' +
    '/** Compose optional culture audio without changing the accepted base release or its validators. */\n' +
    'export function withCulturalSoundPack(base: SoundManifest): SoundManifest {\n' +
    '    if (base.decodedBudget || culturalSoundPack.assets.some(asset => base.assets.some(existing => existing.id === asset.id)))\n' +
    "        throw new Error('The base sound pack already has cultural assets or a decoded-family budget.');\n" +
    '    return { assets: [...base.assets, ...culturalSoundPack.assets],\n' +
    '        cues: [...base.cues, ...culturalSoundPack.cues], decodedBudget: culturalSoundPack.decodedBudget };\n' +
    '}\n');
console.log(JSON.stringify({ candidates: selectedIds, preparedBytes: selected.reduce((sum, entry) => sum + entry.prepared.bytes, 0),
    listening: 'pending', frozenReleaseChanged: false }));
