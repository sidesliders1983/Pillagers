import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTypeScript } from '../load-typescript.mjs';

const directory = 'output/island-loading-259';
const target = 'docs/qa/island-loading-259/prepared-campaigns';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const trials = (name, keep) => [1, 2, 3].map(trial => {
    const path = `${directory}/${name}-${trial}.json`, run = read(path);
    return { path, sha256: sha256(path), ...Object.fromEntries(keep.map(key => [key, run[key]])) };
});
const islandFields = ['seed', 'recipe', 'prepared', 'httpDigest', 'preparationMs', 'cloneMs', 'adoptMs',
    'requestedBytes', 'requests', 'canonicalSha256', 'timings', 'memoryBefore', 'memoryAfter'];
const characterFields = ['seed', 'scenario', 'verifiedSources', 'legacySourceBytes', 'httpDigest',
    'requestedSourceBytes', 'elapsedMs', 'preparationElapsedMs', 'operations', 'residents', 'diagnostics',
    'retainedFactorySources', 'nodeMemory', 'sourceSha256'];
const islands = { generated: trials('prepared-island-generated', islandFields),
    loaded: trials('prepared-island-loaded', islandFields) };
const characters = { original: trials('settlement-source-raw', characterFields),
    prepared: trials('settlement-source-prepared', characterFields) };
const { campaignIslandCatalog } = loadTypeScript(new URL('../../src/fjord-play/BakedIslandCatalog.ts', import.meta.url));
const { preparedCharacterCatalog } = loadTypeScript(new URL('../../src/characters/PreparedCharacterCatalog.ts', import.meta.url));
const input = target + '/fjordside-loading-run-mvjvof4f-1.json', device = read(input);
const total = (entries, field) => entries.reduce((sum, value) => sum + value[field], 0);
const report = {
    scope: 'Three serial matched Node CPU/disk pairs for campaign 2935851268, geography 101. Native images are stubbed in the character harness. SHA uses the same HTTP-LAN JS fallback in both arms. These are not measured iPhone/browser/network/GPU gains.',
    deviceBaseline: { path: input, sha256: sha256(input), build: device.loading.build ?? device.loading.metadata?.build,
        seed: 2935851268, geography: 101, outcome: device.outcome, elapsedMs: device.elapsedMs,
        note: 'The preceding device run used campaign 3055065912/geography 7. Comparing those totals would not be a matched A/B.' },
    medians: {
        islandPreparationMs: { generated: median(islands.generated.map(run => run.preparationMs)),
            loaded: median(islands.loaded.map(run => run.preparationMs)) },
        residentPreparationMs: { original: median(characters.original.map(run => run.preparationElapsedMs)),
            prepared: median(characters.prepared.map(run => run.preparationElapsedMs)) },
        characterHarnessElapsedMs: { original: median(characters.original.map(run => run.elapsedMs)),
            prepared: median(characters.prepared.map(run => run.elapsedMs)) },
    },
    publications: {
        islands: { entries: campaignIslandCatalog.entries.length,
            totalCompressedBytes: total(campaignIslandCatalog.entries, 'bytes'),
            selectedBytes: campaignIslandCatalog.entries.find(value => value.version === 'island-pool-v3' && value.seed === 101).bytes },
        characters: { entries: preparedCharacterCatalog.entries.length,
            originalBytes: total(preparedCharacterCatalog.entries, 'originalBytes'),
            preparedBytes: total(preparedCharacterCatalog.entries, 'bytes'),
            selectedOriginalBytes: characters.original[0].requestedSourceBytes,
            selectedPreparedBytes: characters.prepared[0].requestedSourceBytes },
    },
    islands, characters,
    validationLimits: [
        'Canonical full world/plan hashes match; resident native body/module/morph buffers, selected assets, pace and sampled Idle/Walk/Run bone matrices match.',
        'Checkpoint Node memory is not peak browser/GPU memory. Resident instances are released after each measurement, so this is not the full ten-live-resident scene peak.',
        'New compressed assets require a first download and temporary inflation buffers; no whole-pool preload or persistent application cache is introduced.',
        'Terrain render buffers/masks, per-DNA body/face/wardrobe fits, texture decoding, compilation and GPU uploads still occur on device.',
        'Physical iPhone matched diagnostic, full WebGL startup, new/restart/resume/import, playing animation and cancellation review remain pending.',
    ],
};
mkdirSync(target, { recursive: true });
writeFileSync(target + '/comparison.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ medians: report.medians, publications: report.publications,
    baselineSha256: report.deviceBaseline.sha256 }, null, 2));
