import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../../', import.meta.url));
const input = resolve(process.argv[2] ?? resolve(project, 'Assets/SoundFX'));
const destination = resolve(process.argv[3] ?? resolve(project, 'scratch/sound-assets-229'));
const privateRoot = resolve(project, 'scratch') + sep;
assert.ok(destination.startsWith(privateRoot), 'Candidate audio must stay under ignored scratch/, outside public/ and Git.');
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const recipeBytes = readFileSync(new URL('./recipes.json', import.meta.url));
const recipes = JSON.parse(recipeBytes);
const sourceReview = JSON.parse(readFileSync(new URL('./source-review.json', import.meta.url)));
const trace = existsSync(resolve(input, 'trace.json')) ? JSON.parse(readFileSync(resolve(input, 'trace.json'))) : undefined;
const generation = existsSync(resolve(input, 'generation-receipt.json')) ?
    JSON.parse(readFileSync(resolve(input, 'generation-receipt.json'))) : undefined;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = recipes.entries.map(entry => ({ file: entry.file, sha256: hash(readFileSync(resolve(input, entry.file))) }));
const recipeHash = hash(recipeBytes);
const sourceHash = hash(JSON.stringify(hashes));
const preparationHash = hash(readFileSync(fileURLToPath(import.meta.url)));
const provenanceHash = hash(JSON.stringify({ trace, generation, sourceReview }));
const output = resolve(destination, sourceHash.slice(0, 12) + '-' + recipeHash.slice(0, 12) + '-' +
    preparationHash.slice(0, 8) + '-' + provenanceHash.slice(0, 8));
mkdirSync(output, { recursive: true });
const version = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split(/\r?\n/)[0];
const run = args => execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60000,
});

function pcm(file, channels, rate = recipes.sampleRate) {
    return run(['-i', file, '-vn', '-ar', String(rate), '-ac', String(channels), '-f', 'f32le', '-']);
}

function statistics(bytes, channels, rate) {
    assert.equal(bytes.length % (channels * 4), 0, 'Truncated float PCM');
    const frames = bytes.length / (channels * 4);
    let square = 0, sum = 0, peak = 0, peakFrame = 0, monoSquare = 0, channelSquare = 0, clips = 0;
    const means = Array(channels).fill(0);
    const boundary = Array(channels).fill(0);
    for (let frame = 0; frame < frames; frame++) {
        let mono = 0;
        for (let channel = 0; channel < channels; channel++) {
            const sample = bytes.readFloatLE((frame * channels + channel) * 4);
            assert.ok(Number.isFinite(sample), 'Non-finite PCM');
            sum += sample;
            means[channel] += sample;
            square += sample * sample;
            if (Math.abs(sample) > peak) {
                peak = Math.abs(sample);
                peakFrame = frame;
            }
            if (Math.abs(sample) >= .9999) clips++;
            mono += sample / channels;
            channelSquare += sample * sample / channels;
        }
        monoSquare += mono * mono;
    }
    for (let channel = 0; channel < channels; channel++) {
        means[channel] /= frames;
        boundary[channel] = Math.abs(bytes.readFloatLE(channel * 4) -
            bytes.readFloatLE(((frames - 1) * channels + channel) * 4));
    }
    const db = amplitude => amplitude > 0 ? 20 * Math.log10(amplitude) : null;
    let onsetFrame = 0;
    for (let sample = 0; sample < frames * channels; sample++) {
        if (Math.abs(bytes.readFloatLE(sample * 4)) >= peak * .15) {
            onsetFrame = Math.floor(sample / channels);
            break;
        }
    }
    return {
        sampleRate: rate, channels, frames, seconds: frames / rate,
        peakDbFS: db(peak), rmsDbFS: db(Math.sqrt(square / (frames * channels))),
        dc: sum / (frames * channels), channelDc: means, clippedSamples: clips,
        monoFoldDownRelativeDb: db(Math.sqrt(monoSquare / Math.max(Number.EPSILON, channelSquare))),
        boundaryStep: Math.max(...boundary),
        peakAtSeconds: peakFrame / rate, amplitudeOnsetSeconds: onsetFrame / rate,
        onsetMethod: 'First sample at 15% of absolute peak; not a verified animation contact marker.',
    };
}

function probeMetadata(file) {
    let text = '';
    try { execFileSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: 'pipe' }); }
    catch (error) { text = String(error.stderr); }
    const audio = text.match(/Audio: ([^,]+), (\d+) Hz, ([^,\r\n]+)/);
    return { codec: audio?.[1] ?? null, sampleRate: audio ? Number(audio[2]) : null,
        layout: audio?.[3] ?? null, lossyInput: true };
}

const entries = [], manifest = { assets: [], cues: [] };
for (const recipe of recipes.entries) {
    assert.match(recipe.id, /^[a-z][a-z0-9-]+$/);
    assert.equal(recipe.file, recipe.id + '.mp3');
    const source = resolve(input, recipe.file);
    const sourceMetadata = probeMetadata(source);
    const sourceChannels = sourceMetadata.layout === 'mono' ? 1 : 2;
    const sourcePCM = pcm(source, sourceChannels);
    const original = statistics(sourcePCM, sourceChannels, recipes.sampleRate);
    const seconds = recipe.duration ?? original.seconds;
    const start = recipe.start ?? 0;
    const crossfade = recipe.loop ? recipes.crossfadeSeconds : 0;
    assert.ok(seconds > .05 && seconds <= 20, 'Candidate exceeds bounded duration');
    assert.ok(start >= 0 && start + seconds + crossfade <= original.seconds + .001, 'Recipe exceeds source duration');
    const trim = `atrim=start=${start}:duration=${seconds + crossfade},asetpts=PTS-STARTPTS,highpass=f=25,volume=${recipe.trimDb}dB`;
    let filter;
    if (recipe.loop) {
        // Move the opening crossfade to the end: the final sample meets the same
        // underlying source position as the beginning, with no MP3 encoder padding.
        filter = `[0:a]${trim},asplit=3[a][b][c];` +
            `[a]atrim=end=${crossfade},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${crossfade}:curve=qsin[head];` +
            `[b]atrim=start=${crossfade}:end=${seconds},asetpts=PTS-STARTPTS[middle];` +
            `[c]atrim=start=${seconds},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${crossfade}:curve=qsin[tail];` +
            `[tail][head]amix=inputs=2:normalize=0[cross];[middle][cross]concat=n=2:v=0:a=1[out]`;
    } else {
        filter = `[0:a]${trim},afade=t=in:st=0:d=${recipe.fadeIn ?? .012},` +
            `afade=t=out:st=${Math.max(0, seconds - .035)}:d=0.035[out]`;
    }
    const sourceSHA = hashes.find(entry => entry.file === recipe.file).sha256;
    const file = `${recipe.id}-${sourceSHA.slice(0, 8)}-${recipeHash.slice(0, 8)}.wav`;
    const prepared = resolve(output, file);
    const args = ['-y', '-i', source, '-filter_complex', filter, '-map', '[out]', '-ar',
        String(recipes.sampleRate), '-ac', String(recipe.channels), '-c:a', 'pcm_s16le', '-map_metadata', '-1', prepared];
    run(args);
    const result = statistics(pcm(prepared, recipe.channels), recipe.channels, recipes.sampleRate);
    const bytes = readFileSync(prepared);
    const meter = spawnSync(ffmpeg, ['-hide_banner', '-i', prepared, '-af',
        'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 60000 });
    assert.equal(meter.status, 0, meter.error?.message ?? meter.stderr);
    const summary = meter.stderr.slice(meter.stderr.lastIndexOf('Summary:'));
    const truePeakDbFS = Number(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
    const integratedLUFS = Number(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
    assert.ok(Number.isFinite(truePeakDbFS) && Number.isFinite(integratedLUFS), 'Missing ebur128 summary');
    assert.ok(bytes.length <= 4 * 1024 * 1024, 'Encoded candidate exceeds #228 file budget');
    assert.ok(seconds * 96000 * recipe.channels * 4 <= 8 * 1024 * 1024,
        'Candidate exceeds #228 per-file PCM budget at 96 kHz context rate');
    assert.equal(result.clippedSamples, 0, 'Prepared candidate clips');
    assert.ok(result.peakDbFS !== null && result.peakDbFS < -1, 'Prepared candidate lacks peak headroom');
    assert.ok(truePeakDbFS < -1, 'Prepared candidate lacks true-peak headroom');
    const asset = { id: recipe.id, path: 'game-assets/audio/' + file,
        seconds: result.seconds, channels: recipe.channels };
    const cue = { id: recipe.cue ?? recipe.id, bus: recipe.bus, variants: [recipe.id], gain: recipe.gain,
        loop: recipe.loop, cooldown: recipe.cooldown, range: recipe.range,
        priority: recipe.bus === 'ambience' ? 0 : 1, limit: 1, pitch: [1, 1],
        ...(recipe.loop ? { loopStart: 0, loopEnd: result.seconds } : {}) };
    manifest.assets.push(asset);
    const family = manifest.cues.find(existing => existing.id === cue.id);
    if (family) family.variants.push(recipe.id);
    else manifest.cues.push(cue);
    const attributed = trace?.entries.find(entry => entry.file === recipe.file);
    if (attributed) assert.equal(attributed.sourceSHA256, sourceSHA, 'Trace/source mismatch: ' + recipe.file);
    const generated = generation?.generations.find(entry => entry.label === recipe.id);
    const reviewed = sourceReview.entries.find(entry => entry.file === recipe.file);
    if (reviewed && attributed) assert.equal(reviewed.id, attributed.assetId,
        'Source-page review is stale for ' + recipe.file + '; review the new trace ID first.');
    const provenance = generated ? {
        provider: 'ElevenLabs', sourceUrl: 'https://elevenlabs.io/app/flows/' + generation.flowId,
        creator: 'Custom Foley generated for FjordSide', recordingOrAI: 'AI-generated',
        model: generation.model, generationId: generated.id, prompt: generated.prompt,
        parameters: generation.parameters, acquiredDate: generation.date,
        licenseEvidence: generation.rightsSources,
        commercialAssessment: 'Paid plan verified; integrated use permitted, isolated public samples prohibited.',
    } : attributed ?? {
        provider: 'owner-supplied; individual source pending', sourceUrl: null,
        creator: null, recordingOrAI: 'unverified', acquisitionDate: null, licenseEvidence: null,
    };
    if (reviewed) Object.assign(provenance, {
        sourceUrl: reviewed.url, sourceTitle: reviewed.title,
        recordingOrAI: reviewed.aiLabel ? 'AI-generated (source label)' : 'unverified; not claimed as a field recording',
        reviewNotes: reviewed.notes, sourcePageChecked: sourceReview.checkedDate,
        generalTermsEvidence: [sourceReview.terms, sourceReview.licenseSummary],
    });
    entries.push({ id: recipe.id, label: recipe.label, trigger: recipe.trigger,
        source: { file: recipe.file, sha256: sourceSHA, bytes: readFileSync(source).length,
            ...sourceMetadata, decodedAtPreparationRate: original },
        prepared: { file, sha256: hash(bytes), bytes: bytes.length, codec: 'PCM signed 16-bit WAV',
            ...result, truePeakDbFS, integratedLUFS,
            loudnessCaution: result.seconds < 3 ? 'Short-call LUFS is not a matching target.' : null,
            estimatedPCMAt48kHz: seconds * 48000 * recipe.channels * 4 },
        recipe: { ...recipe, crossfadeSeconds: crossfade, ffmpegFilter: filter },
        provenance,
        status: { technical: 'prepared', listening: 'pending', distribution: 'quarantined' } });
    console.log(recipe.id + ': ' + bytes.length + ' bytes, ' + result.seconds.toFixed(3) + ' s, ' +
        result.peakDbFS.toFixed(1) + ' dBFS sample peak');
}
const json = (name, value) => writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
json('manifest.json', manifest);
json('catalogue.json', { version: 1, preparedUtc: new Date().toISOString(), ffmpeg: version,
    recipeSHA256: recipeHash, sourceSetSHA256: sourceHash, provenanceSHA256: provenanceHash,
    traceWorkbookSHA256: trace?.workbookSHA256 ?? null,
    duplicateTraceRowsMerged: trace?.duplicatesMerged ?? [],
    preparationSHA256: preparationHash, entries,
    missing: ['light-rain', 'standalone-leaf-rustle', 'tool-handling', 'interface-accents'],
    notes: ['Only the two recorded, owner-authorized ElevenLabs axe candidates were generated. No validation triggers provider calls.',
        'Lossy MP3 input converted for bounded delivery, not a recovered lossless master.',
        'Call labels and underwater/above-water context require source and listening review.',
        'Only five seasonal wind cues loop. Fire, waves and visible fauna use quiet intervals.',
        'No production files published. Runtime triggers belong to #230.'] });
assert.ok(hashes.every(entry => hash(readFileSync(resolve(input, entry.file))) === entry.sha256),
    'Sources changed during preparation; do not accept this run. Rerun after the source edits finish.');
json('readme.json', { output, candidates: entries.length,
    encodedBytes: entries.reduce((sum, entry) => sum + entry.prepared.bytes, 0),
    sourceHashesUnchanged: hashes.every(entry => hash(readFileSync(resolve(input, entry.file))) === entry.sha256) });
writeFileSync(resolve(destination, 'latest.json'), JSON.stringify({ output }, null, 2) + '\n');
console.log(JSON.stringify({ output, candidates: entries.length, distribution: 'quarantined' }));
