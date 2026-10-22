import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = 'docs/qa/island-loading-259/iphone-follow-up';
const baselinePath = directory + '/fjordside-loading-run-mvjtlle8-1.json';
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const read = path => JSON.parse(readFileSync('output/island-loading-259/' + path + '.json', 'utf8'));
const runs = prefix => [1, 2, 3].map(index => read(prefix + index));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const compare = (before, after, value) => ({
    before: before.map(value), after: after.map(value),
    beforeMedian: median(before.map(value)), afterMedian: median(after.map(value)),
    reductionPercent: (1 - median(after.map(value)) / median(before.map(value))) * 100,
});
const personasBefore = runs('settlement-priority1-legacy'), personasAfter = runs('settlement-priority1-stripfinal');
const geographyBefore = runs('geography-before'), geographyAfter = runs('geography-after');
const terrainBefore = runs('terrain-before'), terrainAfter = runs('terrain-after');
const compactPersona = ({ preparation, ...run }) => run;
const sourceFiles = ['src/characters/MeshyHuman.ts', 'src/characters/MeshyModuleRuntime.ts',
    'src/characters/NativeHairRig.ts', 'src/fjord-play/CampaignIsland.ts', 'src/world-generation/GenerateWorld.ts',
    'src/fjord-play/FjordScene.ts', 'src/world/WorldFactory.ts'];
const report = {
    baseline: { file: baselinePath.split('/').at(-1),
        sha256: createHash('sha256').update(readFileSync(baselinePath)).digest('hex'),
        sourceComment: 'https://github.com/sidesliders1983/Pillagers/pull/261#issuecomment-6347426190',
        attempt: baseline.loading.attempt, build: baseline.loading.build, seed: baseline.loading.seed,
        recipe: baseline.loading.recipe, quality: baseline.loading.quality, environment: baseline.loading.environment,
        outcome: baseline.outcome, loadingMs: baseline.loading.elapsedMs, runMs: baseline.elapsedMs,
        firstFrameMs: baseline.loading.firstFrameMs, maxObservationGapMs: baseline.loading.maxObservationGapMs,
        cache: baseline.loading.cache, recording: baseline.loading.screenRecording,
        personasMs: baseline.settlementModels.filter(model => model.kind === 'persona').reduce((sum, model) => sum + model.durationMs, 0),
        support: baseline.support, resources: baseline.loading.resources },
    sourceSha256: Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])),
    persona: { preparationMs: compare(personasBefore, personasAfter, run => run.preparationElapsedMs),
        clearanceMs: compare(personasBefore, personasAfter, run => run.operations['span/synchronous/hair-garment-clearance'].milliseconds),
        maxTemporaryCandidateBytes: Math.max(...personasAfter.flatMap(run => run.clearance.map(work => work.temporaryCandidateBytes))),
        before: personasBefore.map(compactPersona), after: personasAfter.map(compactPersona) },
    geography: { elapsedMs: compare(geographyBefore, geographyAfter, run => run.elapsedMs),
        before: geographyBefore, after: geographyAfter },
    terrain: { elapsedMs: compare(terrainBefore, terrainAfter, run => run.elapsedMs),
        before: terrainBefore, after: terrainAfter },
    rejectedExperiment: { description: 'Per-fragment clipping-plane membership/normal precomputation; reverted because this first comparison showed no gain.',
        baseline: read('settlement-priority1-before3').elapsedMs,
        candidate: read('settlement-priority1-after1').elapsedMs,
        candidateSourceSha256: read('settlement-priority1-after1').sourceSha256 },
    limits: [
        'Local Node CPU A/B runs are separate from the physical iPhone baseline. They do not predict a mobile end-to-end reduction.',
        'All three pairs use seed 3055065912 and the actual new scenario. Persona images are stubbed; terrain materials are placeholders.',
        'Parent/child spans overlap. Node memory observations are checkpoints, not true peaks or browser/GPU memory.',
        'Terrain uses Node setImmediate yields, not mobile browser timers. First-frame/playable time and observation gaps need a fresh device run.',
    ],
};
writeFileSync(directory + '/comparison.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ persona: report.persona.preparationMs, clearance: report.persona.clearanceMs,
    geography: report.geography.elapsedMs, terrain: report.terrain.elapsedMs,
    maxTemporaryCandidateBytes: report.persona.maxTemporaryCandidateBytes }, null, 2));
