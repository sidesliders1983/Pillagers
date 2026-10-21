import { createHash } from 'node:crypto';
import { readFile, writeFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const output = 'docs/qa/island-seed-expansion';
const result = JSON.parse(await readFile(output + '/results.json', 'utf8'));
const manifest = JSON.parse(await readFile(output + '/manifest.json', 'utf8'));
for (const [path, expected] of Object.entries(manifest.sourceHashes)) {
    const actual = createHash('sha256').update(await readFile(path)).digest('hex');
    if (actual !== expected) throw new Error('Frozen survey source changed: ' + path);
}
await mkdir(output + '/inspections', { recursive: true });
for (const row of result.rows.filter(row => row.inspection?.version === 'v4'))
    await copyFile('scratch/island-seed-expansion/inspections-v4/' + row.seed + '.json',
        output + '/inspections/' + row.seed + '.json');
for (const name of ['manifest.json', 'completeness.json'])
    await copyFile('scratch/island-seed-expansion/inspections-v4/' + name,
        output + '/inspections/' + name);
let baseline;
try { baseline = JSON.parse(await readFile('scratch/baseline.json', 'utf8')); }
catch (error) {
    if (error.code !== 'ENOENT') throw error;
    baseline = JSON.parse(await readFile(output + '/original-control-fingerprints.json', 'utf8'));
}
await writeFile(output + '/original-control-fingerprints.json', JSON.stringify(baseline, null, 2));
const prepared = result.rows.filter(row => row.preparationPassed);
const shortlist = result.rows.filter(row => row.shortlisted);
const quantile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
const metrics = { surveyComplete: result.completed === result.expected, sourceHashesUnchanged: true,
    sourceAccepted: result.rows.filter(row => row.sourcePassed).length,
    counts: result.counts, newPrepared: result.newPreparedCandidates, shortlist: result.shortlist,
    maximumRSSMiB: Math.max(...result.rows.map(row => row.resourceUsage?.maxRSS ?? 0)) / 1024,
    elapsedMs: { median: quantile(result.rows.map(row => row.elapsedMs), .5),
        p95: quantile(result.rows.map(row => row.elapsedMs), .95), max: Math.max(...result.rows.map(row => row.elapsedMs)) },
    earliestStart: manifest.startedAt, latestFinish: result.rows.map(row => row.finishedAt).sort().at(-1),
    uniquePreparedTerrainHashes: new Set(prepared.map(row => row.sourceTerrainSha256)).size,
    inspected: result.rows.filter(row => row.inspection?.version === 'v4').length,
    exactRepeats: result.rows.filter(row => row.inspection?.version === 'v4' &&
        row.inspection.report.repeatedBlueprintIdentical && row.inspection.report.repeatedPlanIdentical).length,
    pending: ['Owner visual acceptance', 'Full-house scenery-aware home/shore navigation acceptance',
        'New version registry plus candidate compact save/restart/worker admission tests',
        'Normal Fjord loading and Low/Standard/phone viewport checks on the expanded version',
        'Physical iPhone/iPad playtest'] };
await writeFile(output + '/measurements.json', JSON.stringify(metrics, null, 2));
const table = shortlist.map(row => {
    const inspection = row.inspection.report;
    return `| ${row.seed} | ${row.plan.plots.length} | ${row.plan.maximumAdjustment.toFixed(4)} | ` +
        `${row.plan.access.minimumDepth.toFixed(3)} | ${row.plan.access.centerDistance.toFixed(1)} | ` +
        `${row.plan.access.rivalRoute} | ${inspection.checks.physicalRoutes.outboundMetres.toFixed(1)} |`;
}).join('\n');
const report = `# New island seed survey — #240, phase 1

## Outcome and honest boundary

The bounded run measured **${result.completed}/${result.expected} explicit geography seeds**.
It found **${result.newPreparedCandidates.length} new preparation candidates** outside the five historical controls.
**${shortlist.length}** additionally pass the current authored pier and direct eight-Food out-and-back probe:
**${result.shortlist.join(', ')}**. These are a provisional owner-review shortlist, not approved shipping recipes.
The target of ten additional accepted islands is not met. No generator, suitability threshold, provision,
speed, refund, livestock coefficient or shipping pool was changed to meet that target.

The active pool is still **18, 7**, for both existing v1/v2 mappings. No v3 pool/default activation,
unapproved compact save, historical save migration, publication or merge is part of this phase.
The pending gates in [measurements](measurements.json) must finish before promotion.

## Sources and frozen execution

- Integration parent: \`${manifest.sourceCommit}\` (PR #239 campaign start menu); surveyed branch \`${manifest.branch}\`.
- Current remote main inspected before editing: \`584a5ee5510407fdb79989b55c205aa882668f6a\`.
- Generator \`${manifest.generatorVersion}\`; shared preparation semantics \`${manifest.preparationVersion}\`.
- Ordered candidates: controls 18, 7, 42, 256, 1983, then 0–255 excluding duplicate controls.
  Each is a **geography seed**; there is no campaign-seed hashing back into the two-entry pool.
- Protocol SHA-256: \`${manifest.protocolSha256}\`.
- Exact source/lockfile/runner hashes and local changes: [frozen manifest](manifest.json).
  The report generator rechecked every listed byte hash after the run; all match.
- Two child processes maximum, 768 MiB V8 heap per source candidate, 120 s timeout per seed,
  40 minute coordinator budget. Each candidate exits; preparation candidates do not enter the production cache.
  Each completed case was written separately and can be resumed under the identical protocol.
- ${JSON.stringify(result.counts)}. No seed timed out or had a tool/runtime failure.
  Invalid geography, insufficient household capacity and other preparation/access failures remain distinct.
- ${metrics.sourceAccepted} source/Lab passes became ${prepared.length} shared-preparation passes, including the two controls.
  The latter have ${metrics.uniquePreparedTerrainHashes} distinct source-terrain fingerprints.

The narrow shared function is the production preparation body extracted from CampaignIsland.ts.
It still restores natural terrain, grades local foundations, re-zones with existing fields, composes v2 village nature
and recomputes final navigation. Normal creation, import and worker adoption retain strict approved-pool validation.
The survey neither edits the pool for each trial nor forges a saved recipe.

## Historical comparison

This follows [PR #145](https://github.com/sidesliders1983/Pillagers/pull/145), merged at
\`bec776515326f8c406e9e1a9f12a2dd4da87ef3d\`:
[original report](https://github.com/sidesliders1983/Pillagers/blob/bec776515326f8c406e9e1a9f12a2dd4da87ef3d/docs/qa/fjord-island/report.md),
[original measurements](https://github.com/sidesliders1983/Pillagers/blob/bec776515326f8c406e9e1a9f12a2dd4da87ef3d/docs/qa/fjord-island/measurements.json).
Those historical files are unchanged. The old six-parcel source passes for 42, 256 and 1983 still reproduce,
but all three fail the actual ten-household preparation. They are controls, never new discoveries in this report.

The four pre-extraction control fingerprints for campaign 32→18 and 33→7, under v1 and v2,
are retained in [original-control-fingerprints](original-control-fingerprints.json).
The existing regression suite confirmed old v1 fingerprints, v2 terrain/nature, save/restart and worker coexistence.
V2’s scenery-aware route for island 18 is 822 m here versus the historical v1 776 m; these are different pinned preparations.

## Provisional shortlist

| Geography | Home capacity | Maximum cut/fill, m | Hull depth, m | Centers, m | Landing→rival grid route, m | Actual eight-way outbound, m |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${table}

Every inspection repeated the complete source generation and shared preparation and matched both blueprint and plan hashes.
All 23 had ten independent founding households converted using real Core commands, a farmer/Farmyard with assigned cattle,
a Longhouse upgrade, ten projected home paths, and authored house footprints fitting their reserved plots.
The Longhouse check includes the existing uniform scale to Homestead height; assets are not resized to make a seed pass.
The construction fixture alone grants 10000 Materials to exercise all houses, and assigns occupations identically for every seed.
It does not alter terrain or the separate travel probe’s stocks/rules.

Each candidate also exercised three independent human/Core seeds (geography seed, +10000, +20000),
the current PR #239 four-species new-scenario rules and actual independently founded rival layout.
Those three samples all place the rival and keep it initially hidden without changing player founders.
This is representative sampling, not a proof for every possible founding cohort.

The actual published Draco pier is decoded through the existing terrain IO and measured as grounded vertex geometry.
The unchanged production dock planner accepts 22/23; seed 55 fails its supported parallel landing gate.
For the ${shortlist.length} shortlisted entries the full-hull berth and actual pier both pass existing limits.

Travel uses a separate ordinary Summer founding campaign with 15 Food, a one-member group and the current 8-Food pack,
using real CreateExplorationGroup, SetExplorationMember, StartExpedition, ExploreArea, AdvanceTicks and RecallExpedition commands.
Nine candidates complete the direct out-and-back; 55 is excluded by its pier failure, leaving eight.
Mid-trip Core serialization/reconstruction is exact for those completed probes. No travel speed, risk or provisions override is used.
The probe knows the rival point as a QA observer; it is **not** an information-limited exploration-policy/economy study.
Fourteen other prepared candidates hit the current 40000-node direct-route search bound before a paid start is attempted.
That is not evidence that no multi-waypoint land route exists. Their grid connections are retained in the raw results.

## Visual evidence and remaining acceptance

[Review gallery](review.html) separates the eight shortlisted new islands, other prepared landscapes with limitations,
and the two active controls. Top-down maps show the prepared canonical heightfield with a common elevation/shading scale.
Interactive terrain uses the existing BlueprintTerrain builder with the full canonical surface, fixed light, no fog and no decoration.
Region views reuse actual FjordModels dwellings, tents, campfire, Longship and the accepted sourced pier.
These are QA-only developer views; they do not alter the player loading preview, minimap or known places.
Archived captures and browser observations are alongside this report. They are desktop observations, not physical iOS acceptance.

The eight are proposed for visual comparison because they pass the additional mechanical gates, not because they were the first passing numbers.
Coastline/fjord shape, ridge/valley arrangement, buildable capacity and expedition distance should inform the owner’s selection.
Do not describe them as owner-approved before that review.
Different terrain hashes do not establish eight different visual archetypes: 15/101 share a broad horseshoe family,
and 79/227 share a compact hooked-coast family. A visually conservative first selection would compare 15, 79, 88,
112 and 168 first, with 101, 195 and 227 retained as alternatives. This is an owner art-direction choice,
not a new generator classifier or an automatic promotion rule.

Home paths are projected and the real expedition route includes final nature, reserved house plots and campfires as exclusions.
The full built-house home/shore traversal matrix, compact candidate recipe/save/restart admission and expanded campaign-worker transport
remain promotion gates. The existing two-island regression tests do not substitute for those new-version checks.

## Runtime and storage observations

Median per-candidate elapsed time: ${(metrics.elapsedMs.median / 1000).toFixed(2)} s;
p95 ${(metrics.elapsedMs.p95 / 1000).toFixed(2)} s; maximum ${(metrics.elapsedMs.max / 1000).toFixed(2)} s.
These child timings include generation/preparation plus hashing/preview work, exclude module startup, and run under bounded concurrency.
They are not isolated CPU or mobile frame-time benchmarks. Per-stage timings are retained for every case.
Maximum observed per-child peak RSS: ${metrics.maximumRSSMiB.toFixed(1)} MiB; process maxRSS is not aggregate memory or GPU use.
Only compact case results, hashes, maps and captures are published. Full derived terrain/render payloads stay in ignored scratch.

## Reproduction

\`\`\`powershell
node scripts/qa/sweep-island-seeds.mjs --output=scratch/island-seed-expansion/run-1
node scripts/qa/inspect-island-survey.mjs scratch/island-seed-expansion/run-1 scratch/island-seed-expansion/inspections-v4
node scripts/qa/publish-island-seed-survey.mjs
node scripts/qa/report-island-seed-survey.mjs
node scripts/qa/campaign-start-server.mjs
\`\`\`

Open /docs/qa/island-seed-expansion/review.html on port 5196. A fresh checkout reproduces ignored render data with the commands above.
The committed elevation maps and archived captures remain available without those derived files.
The coordinator preserves cases on resume and refuses changed source/protocol hashes in an existing sweep directory.
Source hashes describe the actual measured workspace bytes. A checkout that converts CRLF/LF must use a fresh output
directory and record its own source/protocol hashes; it must not relabel or resume cases from different byte hashes.

Local validation: 16 existing island/village-nature/async-generation tests passed; TypeScript --noEmit passed;
Vite production build passed with the existing chunk-size warning; 496 public assets and 47 decoded Terrain models validated.
No full current-head GitHub CI result or physical-device acceptance is claimed by these local checks.

Preflight inspection mistakes (incorrect Core helper export, and a fixture that unintentionally requested unsupported upgraded Farmyard art)
were corrected before the frozen v4 inspection. Earlier scratch outputs remain separate. A coordinator bookkeeping fix keeps the immutable
seed list in the completeness manifest; it resumed the identical completed child results without rerunning or changing their inputs.
The original 258-case survey protocol/source hashes never changed.
`;
await writeFile(output + '/report.md', report);

const width = 1000, cellWidth = 250, imageHeight = 250, cellHeight = 310;
const tiles = [];
for (let index = 0; index < shortlist.length; index++) {
    const row = shortlist[index];
    const picture = await sharp(output + '/maps/' + row.seed + '.png').resize(cellWidth, imageHeight).toBuffer();
    const label = Buffer.from(`<svg width="250" height="60"><rect width="250" height="60" fill="#172f35"/><text x="14" y="24" fill="#f0e9d9" font-family="Arial" font-size="19">Geography ${row.seed}</text><text x="14" y="47" fill="#c8d6cd" font-family="Arial" font-size="13">${row.plan.plots.length} plots · ${row.plan.access.rivalRoute} m rival route</text></svg>`);
    const left = index % 4 * cellWidth, top = Math.floor(index / 4) * cellHeight;
    tiles.push({ input: picture, left, top }, { input: label, left, top: top + imageHeight });
}
await sharp({ create: { width, height: Math.ceil(shortlist.length / 4) * cellHeight, channels: 3, background: '#11272d' } })
    .composite(tiles).png().toFile(output + '/shortlist.png');
const files = await readdir(output + '/captures');
console.log(JSON.stringify({ shortlist: result.shortlist, metrics, archivedCaptures: files.length }));
