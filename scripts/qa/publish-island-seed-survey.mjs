import { readdir, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const run = 'scratch/island-seed-expansion/run-1';
const output = 'docs/qa/island-seed-expansion';
await mkdir(output + '/maps', { recursive: true });
const manifest = JSON.parse(await readFile(run + '/manifest.json', 'utf8'));
const rows = (await Promise.all((await readdir(run + '/results')).filter(file => file.endsWith('.json'))
    .map(async file => JSON.parse(await readFile(run + '/results/' + file, 'utf8')))))
    .sort((a, b) => manifest.seeds.indexOf(a.seed) - manifest.seeds.indexOf(b.seed));
const counts = {};
for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.preparationPassed) await copyFile(run + '/previews/' + row.seed + '.png', output + '/maps/' + row.seed + '.png');
    for (const version of ['v4', 'v3']) {
        const directory = 'scratch/island-seed-expansion/inspections-' + version;
        try {
            row.inspection = { version, path: '/' + directory + '/' + row.seed + '-render.json.gz',
                report: JSON.parse(await readFile(directory + '/' + row.seed + '.json', 'utf8')) };
            break;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const checks = row.inspection?.report;
    row.shortlisted = !row.control && row.inspection?.version === 'v4' &&
        checks.repeatedBlueprintIdentical && checks.repeatedPlanIdentical &&
        checks.findings.length === 0 && checks.checks.authoredPier?.supported &&
        checks.checks.travel?.returned && checks.checks.travelSaveRoundTrip &&
        checks.checks.convertedHouses === 10 && checks.checks.groundPaths === 10 &&
        checks.checks.authoredFootprints.every(footprint => footprint.fits) &&
        checks.cohorts.every(cohort => cohort.allRivalEntitiesPlaced && cohort.rivalInitiallyHidden);
}
const report = { phase: 'survey; approval and activation pending', expected: manifest.seeds.length,
    completed: rows.length, protocolSha256: manifest.protocolSha256, counts,
    newPreparedCandidates: rows.filter(row => !row.control && row.preparationPassed).map(row => row.seed),
    shortlist: rows.filter(row => row.shortlisted).map(row => row.seed), rows };
await writeFile(output + '/results.json', JSON.stringify(report, null, 2));
await copyFile(run + '/manifest.json', output + '/manifest.json');
console.log(JSON.stringify({ completed: rows.length, counts, newPreparedCandidates: report.newPreparedCandidates }));
