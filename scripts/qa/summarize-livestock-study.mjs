import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const hash = value => createHash('sha256').update(
    Buffer.isBuffer(value) ? value : JSON.stringify(value),
).digest('hex');
const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
const stats = values => {
    if (!values.length) return { count: 0, min: null, median: null, max: null };
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return { count: sorted.length, min: sorted[0],
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        max: sorted.at(-1) };
};

function cohort(species, policy, cases) {
    const complete = cases.filter(entry => entry.status === 'complete');
    const final = complete.map(entry => entry.annual.at(-1) ?? entry.initial);
    const rows = cases.flatMap(entry => entry.annual);
    const shortage = (entry, key) => entry.annual.find(row => row[key] > 0)?.year ?? null;
    return { species, policy, cases: cases.length, complete: complete.length,
        limited: cases.filter(entry => entry.status === 'resource-limit').length,
        failed: cases.filter(entry => entry.status === 'failed').length,
        observedYears: rows.length,
        clanExtinctions: final.filter(row => row.population === 0).length,
        herdExtinctions: final.filter(row => row.herd === 0).length,
        humanShortageCases: cases.filter(entry => shortage(entry, 'humanShortfall') !== null).length,
        animalShortageCases: cases.filter(entry => shortage(entry, 'animalShortfall') !== null).length,
        firstHumanShortage: stats(cases.map(entry => shortage(entry, 'humanShortfall')).filter(year => year !== null)),
        finalFood: stats(final.map(row => row.food)), finalPopulation: stats(final.map(row => row.population)),
        finalHerd: stats(final.map(row => row.herd)),
        peakHerd: Math.max(0, ...cases.map(entry => Math.max(entry.initial?.herd ?? 0,
            ...entry.annual.map(row => row.herd)))),
        adultDescendantsReached: stats(final.map(row => row.adultDescendantsReached).filter(Number.isFinite)),
        births: sum(rows, 'humanBirths'), deaths: sum(rows, 'humanDeaths'),
        animalBirths: sum(rows, 'animalBirths'), animalDeaths: sum(rows, 'animalDeaths'),
        slaughters: sum(rows, 'slaughters'), foodProduced: sum(rows, 'foodProduced'),
        animalFoodProduced: sum(rows, 'animalFoodProduced'), humanConsumed: sum(rows, 'humanConsumed'),
        animalConsumed: sum(rows, 'animalConsumed'), animalRequired: sum(rows, 'animalRequired'),
        animalShortfall: sum(rows, 'animalShortfall'), humanShortfall: sum(rows, 'humanShortfall'),
        slaughterFood: sum(rows, 'slaughterFood'), foodSpoiled: sum(rows, 'foodSpoiled'),
        materialsProduced: sum(rows, 'materialsProduced'), hidesReceived: sum(rows, 'hidesReceived'),
        youngAnimalFeedings: sum(rows, 'youngAnimalFeedings'),
        youngFoodRequiredBeforeWeather: sum(rows, 'youngFoodRequiredBeforeWeather'),
        overcrowdedAnimalYears: sum(rows, 'overcrowded'),
        extinctClanSeeds: complete.filter(entry => entry.annual.at(-1)?.population === 0).map(entry => entry.seed),
        extinctHerdSeeds: complete.filter(entry => entry.annual.at(-1)?.herd === 0).map(entry => entry.seed),
    };
}

/** Verify saved evidence before summarizing it. Limited cases remain explicit and censored. */
export function summarizeLivestockStudy(directory, { allowPartial = false } = {}) {
    directory = resolve(directory);
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    if (!manifest.finishedAt && !allowPartial) throw new Error('Study is not finished');
    const expected = new Set(manifest.options.seeds.split(',').flatMap(seed =>
        manifest.options.species.split(',').flatMap(species => manifest.options.policies.split(',')
            .map(policy => `${Number(seed)}/${species}/${policy}`))));
    const observed = new Set(), protocols = new Set(), players = new Map(), cpus = new Map();
    let maxResidual = 0, observedYears = 0;
    const cases = [];
    for (const observation of manifest.observations) {
        const key = `${observation.seed}/${observation.species}/${observation.policy}`;
        if (!expected.has(key) || observed.has(key)) throw new Error('Unexpected or duplicate study case');
        observed.add(key);
        const file = resolve(directory, observation.file);
        if (!file.startsWith(directory + sep)) throw new Error('Study file is outside the measurement directory');
        const bytes = readFileSync(file);
        if (hash(bytes) !== observation.sha256) throw new Error('Raw study checksum mismatch: ' + observation.file);
        const raw = JSON.parse(gunzipSync(bytes).toString('utf8'));
        if (raw.seed !== observation.seed || raw.species !== observation.species || raw.policy !== observation.policy ||
            raw.status !== observation.status || raw.annual.length !== observation.completedYears ||
            raw.status === 'complete' && raw.annual.length !== Number(manifest.options.winters))
            throw new Error('Raw study metadata mismatch');
        if (raw.identity) protocols.add(hash(['sourceHash', 'adapterHash', 'scenarioHash', 'foodPolicyHash', 'candidateHash']
            .map(key => raw.identity[key] ?? null)));
        const playerKey = raw.species + '/' + raw.policy;
        if (!players.has(playerKey)) players.set(playerKey, []);
        const playerRows = raw.annual.map(row => ({ year: row.year, ...row.player }));
        players.get(playerKey).push({ seed: raw.seed, status: raw.status,
            initial: raw.initial?.player, annual: playerRows });
        for (const row of raw.annual) for (const side of ['player', 'cpu']) {
            for (const field of ['foodResidual', 'materialsResidual', 'herdResidual']) {
                if (!Number.isFinite(row[side][field])) throw new Error('Missing stock/herd accounting');
                maxResidual = Math.max(maxResidual, Math.abs(row[side][field]));
            }
        }
        observedYears += raw.annual.length;
        cases.push({ seed: raw.seed, species: raw.species, policy: raw.policy,
            status: raw.status, years: raw.annual.length, stopReason: raw.stopReason ?? null });
        if (raw.status !== 'complete' || !raw.initial?.cpu) continue;
        const rules = structuredClone(raw.ruleConfiguration.cpu);
        if (rules.livestock?.founding) delete rules.livestock.founding.excludedSpecies;
        const cpuKey = raw.seed + '/' + hash([rules, raw.initial.cpu, raw.identity?.sourceHash]);
        const annual = raw.annual.map(row => ({ year: row.year, ...row.cpu }));
        if (cpus.has(cpuKey)) {
            if (hash(cpus.get(cpuKey).annual) !== hash(annual)) throw new Error('CPU depends on player policy');
        } else cpus.set(cpuKey, { seed: raw.seed, species: raw.initial.cpu.species,
            policy: raw.species === 'control' ? 'control-autonomous' : 'seeded-autonomous',
            status: raw.status, initial: raw.initial.cpu, annual });
    }
    if (protocols.size > 1) throw new Error('Mixed source/candidate study protocols');
    if (maxResidual !== 0) throw new Error('Non-zero stock/herd accounting residual');
    const cpuGroups = new Map();
    for (const entry of cpus.values()) {
        const key = entry.species + '/' + entry.policy;
        if (!cpuGroups.has(key)) cpuGroups.set(key, []);
        cpuGroups.get(key).push(entry);
    }
    const groups = map => [...map].sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, entries]) => cohort(...key.split('/'), entries));
    return { version: 1, revision: manifest.revision, finishedAt: manifest.finishedAt,
        seedsPerCohort: manifest.options.seeds.split(',').length,
        expectedCases: expected.size, observedCases: observed.size, missingCases: expected.size - observed.size,
        completedCases: cases.filter(entry => entry.status === 'complete').length,
        limitedCases: cases.filter(entry => entry.status === 'resource-limit').length,
        failedCases: cases.filter(entry => entry.status === 'failed').length,
        observedYears, maxResidual, independentCpuCases: cpus.size,
        player: groups(players), cpu: groups(cpuGroups), cases };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const directory = resolve(process.argv[2] ?? 'docs/qa/livestock-founding-219/measurement-soft-v2-final');
    const report = summarizeLivestockStudy(directory, { allowPartial: process.argv.includes('--partial') });
    writeFileSync(join(directory, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ expected: report.expectedCases, complete: report.completedCases,
        limited: report.limitedCases, failed: report.failedCases, missing: report.missingCases,
        maxResidual: report.maxResidual, independentCpuCases: report.independentCpuCases }));
}
