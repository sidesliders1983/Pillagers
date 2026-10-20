import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { summarizeLivestockStudy } from './summarize-livestock-study.mjs';

const directory = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ??
    'docs/qa/livestock-founding-219');
const measurement = join(directory, 'measurement-soft-v2-final');
const summary = summarizeLivestockStudy(measurement, {
    allowPartial: process.argv.includes('--partial'),
});
const manifest = JSON.parse(readFileSync(join(measurement, 'manifest.json'), 'utf8'));
const proposals = JSON.parse(readFileSync(join(directory, 'proposed-rules.json'), 'utf8'));
const names = { control: 'Current cattle control', cattle: 'Seeded cattle', chicken: 'Chicken',
    pig: 'Pig', sheep: 'Sheep', goat: 'Goat', goose: 'Goose' };
const value = number => Number.isFinite(number) ? String(number) : '—';
const range = stats => `${value(stats.median)} (${value(stats.min)}–${value(stats.max)})`;
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
    .map(row => '| ' + row.join(' | ') + ' |').join('\n');
const percentage = (count, total) => `${count}/${total}`;
const complete = summary.finishedAt && !summary.missingCases;
const lines = [
    '# Livestock v0.1B — founding and balance review',
    '',
    complete ? '**Matrix complete. Balance and default activation await owner approval.**' :
        '**Work in progress. Partial observations are not an activation recommendation.**',
    '',
    'The implementation supports one real seeded founding species per clan, independent of human DNA and terrain. Exactly two adult females and one adult male arrive; a single physical CPU rival chooses from the other five species. Shipping New campaign still uses the existing cattle contract. No new models are included; those remain #220.',
    '',
    '## Evidence and reproducibility',
    '',
    `Generated from verified raw evidence: ${summary.completedCases}/${summary.expectedCases} complete, ` +
        `${summary.limitedCases} resource-limited, ${summary.failedCases} failed, ${summary.missingCases} missing. ` +
        `Maximum annual Food/Materials/herd accounting residual: ${summary.maxResidual}.`,
    '',
    `The matrix is seeds 1–30 × current cattle control plus six species × three policies × 40 years, ` +
        `starting in Summer 800 (tick 500), with 1,000 ticks per year. ` +
        `The original frozen measurement revision is \`${manifest.revision}\`. ` +
        'Each raw observation contains the actual source, adapter, policy, scenario and candidate hashes, saved rule configuration, founder fingerprint and final state hash. The resumed runner records its own revision separately and rejects changed protocols or corrupted evidence. Completed observations are never overwritten.',
    '',
    'Player starts with 15 Food and five Materials. The actual CPU starts with its saved 30 Food and five Materials. Weather and social mechanics are enabled, using the existing annual birthday mode. Individual birthday timing is a separate opt-in and is not claimed to have been measured here. The dry QA island changes no economic rates; there are no expeditions or purchases.',
    '',
    'Species are contrasted before the real founding event through a QA-only player-selection adapter. Production does not import it. CPU selection and economics use unchanged Core. Identical configurations and seeds do not guarantee identical realized weather: subsequent domestic RNG calls differ with species. Treat these as paired seed comparisons, not an isolated causal estimate of one coefficient.',
    '',
    'Annual observations end at Summer tick 500; peaks below are observed year-end peaks, not claims about every intermediate tick. Human descendants reaching adulthood include those who later died. Young livestock feeding counts and base costs are recorded separately; their configured young Food need is zero. Canonical Core has no spoilage rule, so spoilage is explicitly zero.',
    '',
    'Human Food shortfalls are recorded by the existing economy and affect its established reserve/fertility constraints. This slice adds no starvation-death rule. Low clan-extinction counts therefore cannot, by themselves, establish that Food balance is comfortable.',
    '',
    '[Raw matrix and provenance](measurement-soft-v2-final/manifest.json) · ' +
        '[Derived full totals](measurement-soft-v2-final/summary.json) · ' +
        '[Complete proposed rules](proposed-rules.json) · [Interactive review](review.html)',
];
if (complete) {
    const prepared = summary.player.filter(row => row.policy === 'prepared' && row.species !== 'control');
    const managed = species => summary.player.find(row => row.policy === 'herd' && row.species === species);
    lines.push('', '## Reading the completed matrix', '',
        `All six seeded-species cohorts completed 30/30 cases under each policy. ` +
        `Prepared play lost ${prepared.reduce((total, row) => total + row.clanExtinctions, 0)} clans; ` +
        `species medians ranged from ${Math.min(...prepared.map(row => row.finalFood.median))} to ` +
        `${Math.max(...prepared.map(row => row.finalFood.median))} final Food and ` +
        `${Math.min(...prepared.map(row => row.adultDescendantsReached.median))} to ` +
        `${Math.max(...prepared.map(row => row.adultDescendantsReached.median))} human descendants reaching adulthood. ` +
        'This supports a workable 15-Food start under the measured preparation policy, not a promise of shortage-free play.', '',
        `Long-term herd continuity is weaker. Under the fixed herd policy, pigs remain in ` +
        `${managed('pig').complete - managed('pig').herdExtinctions}/30 cases at year 40, compared with ` +
        `${managed('control').complete - managed('control').herdExtinctions}/30 current cattle controls. ` +
        `The proposed cattle guards reduce the observed unmanaged herd peak from ` +
        `${summary.player.find(row => row.species === 'control' && row.policy === 'passive').peakHerd} to ` +
        `${summary.player.find(row => row.species === 'cattle' && row.policy === 'passive').peakHerd}. ` +
        'Do not treat reduced crowding growth as proof of a self-sustaining breeding herd.');
}

for (const policy of ['passive', 'prepared', 'herd']) {
    const cohorts = Object.keys(names).map(species => summary.player.find(row =>
        row.species === species && row.policy === policy)).filter(Boolean);
    lines.push('', '## Player policy: ' + policy, '',
        policy === 'passive' ? 'No player commands; existing social/economic autonomy continues.' :
            policy === 'prepared' ? 'The frozen #78 Food/housing policy, with livestock assignments disabled.' :
                'The same preparation plus real herd assignment and slaughter. Compatible sexes remain together in one actual Farmyard where available. Mature breeders and young replacements take priority over surplus adults. This fixed strategy is not an optimal breeder or new automatic gameplay.',
        '', table(['Species', 'Complete', 'Clan lost', 'Human shortage observed', 'First shortage year, median (range)',
            'Final Food, median (range)', 'Descendants reached adulthood, median', 'Herd lost', 'Peak herd'],
        cohorts.map(row => [names[row.species], percentage(row.complete, summary.seedsPerCohort),
            percentage(row.clanExtinctions, row.complete), percentage(row.humanShortageCases, row.cases),
            range(row.firstHumanShortage), range(row.finalFood), value(row.adultDescendantsReached.median),
            percentage(row.herdExtinctions, row.complete), row.peakHerd])), '',
        table(['Species', 'Food produced / animal share', 'Human / animal Food consumed',
            'Animal Food required / shortfall', 'Slaughter Food', 'Materials produced', 'Hides received',
            'Human births / deaths', 'Animal births / deaths / slaughters', 'Crowded animal-years'],
        cohorts.map(row => [names[row.species], `${row.foodProduced} / ${row.animalFoodProduced}`,
            `${row.humanConsumed} / ${row.animalConsumed}`, `${row.animalRequired} / ${row.animalShortfall}`,
            row.slaughterFood, row.materialsProduced, row.hidesReceived,
            `${row.births} / ${row.deaths}`, `${row.animalBirths} / ${row.animalDeaths} / ${row.slaughters}`,
            row.overcrowdedAnimalYears])));
}

const horizons = new Map();
const pairedCases = new Map();
for (const observation of manifest.observations.filter(row => row.status === 'complete')) {
    const raw = JSON.parse(gunzipSync(readFileSync(join(measurement, observation.file))).toString('utf8'));
    const key = raw.species + '/' + raw.policy;
    const cohort = horizons.get(key) ?? { count: 0, ten: 0, twenty: 0, forty: 0 };
    cohort.count++;
    for (const [field, year] of [['ten', 10], ['twenty', 20], ['forty', 40]]) {
        if (raw.annual[year - 1]?.player.herd > 0) cohort[field]++;
    }
    horizons.set(key, cohort);
    pairedCases.set(`${raw.seed}/${raw.species}/${raw.policy}`, raw);
}
const median = values => {
    if (!values.length) return '—';
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const pairedRows = [];
for (const species of Object.keys(names).filter(species => species !== 'control')) {
    for (const policy of ['prepared', 'herd']) {
        const pairs = [];
        for (const seed of manifest.options.seeds.split(',')) {
            const candidate = pairedCases.get(`${seed}/${species}/${policy}`);
            const control = pairedCases.get(`${seed}/control/${policy}`);
            if (candidate && control) pairs.push([candidate, control]);
        }
        pairedRows.push([names[species], policy, pairs.length,
            median(pairs.map(([a, b]) => a.annual.at(-1).player.food - b.annual.at(-1).player.food)),
            median(pairs.map(([a, b]) => a.annual.at(-1).player.adultDescendantsReached -
                b.annual.at(-1).player.adultDescendantsReached)),
            median(pairs.map(([a, b]) => a.annual.reduce((total, row) => total + row.player.humanShortfall, 0) -
                b.annual.reduce((total, row) => total + row.player.humanShortfall, 0))),
        ]);
    }
}
lines.push('', '## Paired player differences from the current cattle control', '',
    'Each difference uses the same seed and policy, candidate minus current cattle control. Medians of paired differences can differ from differences of cohort medians. A negative shortfall difference means less unmet human Food need.', '',
    table(['Species', 'Policy', 'Paired seeds', 'Final Food difference, median',
        'Adult descendants difference, median', 'Cumulative human shortfall difference, median'], pairedRows));
lines.push('', '## Managed herd continuity', '',
    'Herd loss and clan loss are different outcomes. These counts include completed 40-year runs only.', '',
    table(['Species', 'Herd present after 10 years', 'After 20 years', 'After 40 years'],
        Object.keys(names).map(species => {
            const row = horizons.get(species + '/herd') ?? { count: 0, ten: 0, twenty: 0, forty: 0 };
            return [names[species], percentage(row.ten, row.count), percentage(row.twenty, row.count),
                percentage(row.forty, row.count)];
        })), '',
    '## CPU outcomes', '',
    `${summary.independentCpuCases} distinct completed CPU trajectories are represented below. ` +
        'The same autonomous trajectory reused across player policies is counted once. Its normalized initial state, source and annual trace must match; the real saved founding exclusion is retained in returned states. These are distinct initial states, not independent seed sets. No Food/housing/herd-management policy is applied to the CPU.', '',
    table(['CPU species', 'Saved rules', 'Distinct runs', 'Clan lost', 'Human shortage observed',
        'Final Food, median (range)', 'Herd lost', 'Peak herd'], summary.cpu.map(row => [
        names[row.species] ?? row.species, row.policy, row.complete, row.clanExtinctions,
        row.humanShortageCases, range(row.finalFood), row.herdExtinctions, row.peakHerd,
    ])), '',
    'The bounded CPU cache is a study optimization. Full-world oracle tests compare annual results and exact canonical serialization, including RNG, event history and save/load, against uncached world stepping.', '',
    '## Proposed coefficients and activation decision', '',
    'No coefficient below is an approved shipping default. Cattle retain the current LandingConfig. The proposed new-species profiles are saved in full, including mortality bands, fertility ages, both-sex Food/Materials rates, slaughter by stage and species weight.', '',
    table(['Species', 'Adult age / fertile ages', 'Birth chance / interval', 'Adult / young Food need',
        'Female Food / Materials per year', 'Male Food / Materials per year', 'Slaughter Food young / subadult / adult',
        'Cattle-equivalent space'], Object.entries(proposals.livestock.profiles).map(([species, profile]) => [
        names[species], `${profile.adultAge} / ${profile.fertileMinAge}–${profile.fertileMaxAge}`,
        `${profile.birthChanceBps / 100}% / ${profile.birthInterval} year(s)`,
        `${profile.adultFood} / ${profile.youngFood}`,
        `${profile.femaleFoodPerWinter} / ${profile.femaleMaterialsPerWinter}`,
        `${profile.maleFoodPerWinter} / ${profile.maleMaterialsPerWinter}`,
        `${profile.youngSlaughterFood} / ${profile.youngAdultSlaughterFood} / ${profile.slaughterFood}`,
        profile.capacityWeightBps / 10000,
    ])), '',
    'The current candidate keeps the feeding-shortfall birth guard and soft weighted crowding, including outside herds. It does **not** enable a hard birth-capacity gate. Outdoor capacity is four cattle-equivalent spaces. Actual adult slaughter proposes one Hide for cattle/pig/sheep/goat and none for poultry, young animals, natural death or wildlife. These specialist stocks do not add a third universal HUD resource.', '',
    'Recommended review thresholds, pending owner agreement: require all 30 paired seeds per cohort, zero accounting errors and no hidden resource grants; under reasonable prepared play, flag more than 2/30 clan extinctions or a median of fewer than one human descendant reaching adulthood. Independently flag herd continuity below 24/30 at year 10 or 15/30 at year 40 under the fixed herd policy. Flag any budget limit or continuing unmanaged growth. These are proposed interpretation criteria, not pre-registered acceptance rules or guarantees from a 30-seed sample.', '',
    '**Recommendation: keep default activation gated.** Review the clan results and the separate herd-continuity table before accepting these coefficients. Clan survival alone does not show that a three-animal herd remains self-sustaining. If longer herd continuity is required, run a separate, single-axis replacement study rather than silently increasing several rates or granting more animals/Food. This matrix remains the evidence for its exact saved candidate.', '',
    '[The strict-cap pilot was rejected](rejected-strict-cap.md). Its 36 completed observations remain historical, with an interrupted manifest; the later six-control protocol check is [also preserved separately](interrupted-protocol-check.md). Neither is counted in this 630-case candidate matrix.', '',
    '## Validation and remaining review', '',
    'The saved browser report records 10/10 passing checks across all six species on desktop and goat/chicken touch layouts at 1180×820 and 390×844, with zero browser errors. It covers real founding, stable Livestock N labels, species/sex details, weighted Farmyard space, cancel/confirm and actual Food/Hides slaughter receipts. Touch emulation is not physical iPad acceptance. These roster fixtures use extra Materials solely to create inspection yards; the economy matrix has no such grant.', '',
    '[Browser evidence](browser.json) · [Desktop](desktop-goat.png) · ' +
        '[Tablet](tablet-goat-roster.png) · [Phone](phone-chicken.png)', '',
    'Current build/test status is recorded separately in [validation.json](validation.json). Interrupted suites are not claimed as passes. GitHub CI is unavailable until an explicitly authorized public push; no PR is marked ready. Additional 3D meshes remain #220, and crafting/equipment remain #221.',
);
writeFileSync(join(measurement, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
writeFileSync(join(directory, 'report.md'), lines.join('\n') + '\n');
console.log(JSON.stringify({ complete: summary.completedCases, expected: summary.expectedCases,
    final: !!complete }));
