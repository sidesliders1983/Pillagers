import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
const directory = process.argv[2] || 'docs/qa/occupation-aptitude-v03';
const read = file => JSON.parse(readFileSync(join(directory, file), 'utf8'));
const summary = read('summary.json');
const manifest = read('manifest.json');
const founders = JSON.parse(gunzipSync(readFileSync(join(directory, 'founders.json.gz'))));
const models = Object.keys(summary.founders);
const percent = bps => (bps / 100).toFixed(2);
const number = value => value.toFixed(2);
const table = (headers, rows) => [
    '| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...rows.map(row => '| ' + row.join(' | ') + ' |'), '',
].join('\n');
const controlRows = founders.filter(row => row.model === 'control');
const bestProductive = row => ['farmer', 'fisher', 'hunter', 'woodworker'].sort((a, b) => row.aptitudes[b] - row.aptitudes[a])[0];
const productiveMatches = controlRows.filter(row => row.aptitudes[row.assignedOccupation] === row.aptitudes[bestProductive(row)]).length;
const changedRanks = model => founders.filter(row => row.model === model).filter(row => {
    const control = summary.founders.control.people.find(person => person.campaignSeed === row.campaignSeed && person.personaId === row.personaId);
    const current = summary.founders[model].people.find(person => person.campaignSeed === row.campaignSeed && person.personaId === row.personaId);
    return current.ranking[0] !== control.ranking[0];
}).length;
const sections = [];
sections.push(`# Occupation aptitude v0.3 — measured calibration experiment (#78)

Production scoring, canonical CharacterDNA, saved configuration and defaults remain unchanged. This is a headless measurement slice; it adds no Gameplay Lab controls.

## Reproduce and inspect

Source baseline: \`${manifest.baseRevision}\`. Node: \`${manifest.runtime.node}\`. Seeds ${manifest.seeds.start}–${manifest.seeds.start + manifest.seeds.count - 1}; ${manifest.seeds.count * 10} actual generated founders; ${manifest.winters} Winters per economy run. Four mappings × two prepared policies plus passive control = ${summary.economy.reduce((n, row) => n + row.seeds, 0)} matched campaigns. All ten occupations are scored, including six inactive roles.

\`\`\`powershell
pnpm install --frozen-lockfile
node scripts/qa/run-aptitude-calibration.mjs --output artifacts/occupation-aptitude-v03 --workers 4
node scripts/qa/aptitude-replay.mjs artifacts/occupation-aptitude-v03
node scripts/qa/render-aptitude-report.mjs artifacts/occupation-aptitude-v03
node --test tests/aptitude-calibration.test.mjs
\`\`\`

Use fewer workers on a busy laptop; worker count changes execution scheduling, not measurements. Measurement runtime is not a gameplay performance gate.

[Manifest](manifest.json) records source, mapping, harness and compressed artifact SHA-256 fingerprints, exact mechanics/landing/weather configuration, runtime, seeds and replay coverage. [Summary](summary.json) contains all percentiles, rank orders, correlations, paired seed deltas and annual stock/population trajectories. [Founders](founders.json.gz) and [descendants](descendants.json.gz) contain raw traits, cultural names, IDs and all ten integer aptitude values. Each \`runs/seed-N.json.gz\` contains all nine scenarios, accepted/rejected public commands, annual stocks/flows, real work inspections, final state hashes and verification records. Gzip JSON can be read with Node's built-in \`gunzipSync\`; no external data service is required.

All aptitude distribution values in JSON are **basis points** (100 = one percentage point), not resource units. Percentiles use linear interpolation between sorted observations; standard deviation divides by N. No confidence interval or population-wide demographic claim is implied by this fixed seed cohort.

## Why the current scores cluster

The issue's weighted closeness expression is followed by a **15% floor + 85% slope** in Mechanics.ts: \`round((0.15 + 0.85 × Σ wᵢ(1 − |tᵢ − pᵢ|)) × 10000)\`. The weights sum to one. The nominal 15% floor is not reachable for current preference vectors: every closeness term has a positive worst case. Analytic reachable minima are 33.91–46.45%, depending on role.

Founders use the real rounded-uniform trait generator (hundredths, with half-probability endpoints), not Character Lab's default DNA or its separate six-role display. Theoretical role means under that generator are about 71.49–77.14%. Weighted averaging, the extra floor and mostly overlapping preference vectors compress scores. Default DNA is near many preferred values and would bias a sample upward.

Innate scores are solely derived from the five existing traits. Heritage, sex, appearance and a person's name are excluded from scoring. There are no new aptitude genes or gender-based allocation restrictions. Effective productivity additionally includes tents, age, childcare, career switching, specialisation/upgrades, apprenticeship and weather. Inactive roles can have excellent aptitude and still produce zero.
`);
sections.push('## Founder distributions\n\nEach table reports percentages; σ measures across-Persona variation within that role.\n');
for (const model of models) {
    const value = summary.founders[model];
    sections.push('### ' + model + '\n\n' + manifest.models[model].description + '\n');
    sections.push(table(['Occupation', 'Min', 'Max', 'Mean', 'Median', 'P10', 'P25', 'P75', 'P90', 'σ'],
        Object.entries(value.roles).map(([role, stats]) => [role, ...['min', 'max', 'mean', 'median', 'p10', 'p25', 'p75', 'p90', 'standardDeviation'].map(key => percent(stats[key]))])));
}
sections.push(`## Within-Persona identity and exceptional generalists

Exploratory labels: **high ≥90%**, **low ≤60%**, **exceptional ≥110%**; generalist has minimum ≥70% and best–worst gap ≤15 points; specialist has maximum ≥90%, minimum ≤60% and gap ≥25 points; poor fit has maximum <70%; all others are mixed. These disjoint labels are comparison tools, not proposed gameplay thresholds. Per-person high/low counts, ordered roles and all gap percentiles remain in the raw summary.
`);
sections.push(table(['Model', 'Median best–worst gap (points)', 'Median top-two gap (points)', 'Generalists', 'Specialists', 'Poor fit', 'All ten ≥90%', 'Upper/lower cap scores', 'Best role differs from control'],
    models.map(model => {
        const s = summary.founders[model];
        return [model, percent(s.gaps.bestWorst.median), percent(s.gaps.topTwo.median), s.counts.generalist, s.counts.specialist,
            s.counts.poorFit, s.universalHigh, s.upperCapScores + '/' + s.lowerCapScores, changedRanks(model)];
    })));
sections.push(`A shared increasing expansion preserves strict role ordering. Any changed top label in expanded comes from a new clamp/rounding tie and the documented role-list tie breaker. It increases the visible gap without creating new underlying occupational preferences. Its fixed 75% center also moves role means unequally; it is not mean-neutral.

Quadratic squares each individual closeness, then centers the score around the canonical role's exact rounded-uniform expectation with gain 1.7. Contrast squares/normalizes role weights, stretches preferences 2× around 0.5 with 0–1 bounds, then uses the canonical expected role mean and 0.85 slope. Both candidates have explicit 15–125% bounds. Centering preserves the theoretical mean **before rounding/clamping for that generator**, not necessarily production, offspring means or a finite cohort's mean.
`);
sections.push('### Role overlap and dominant profiles\n');
sections.push(table(['Model', 'Textile/leather correlation', 'Woodworker/boatbuilder correlation', 'Smith/trader correlation', 'Most frequent best role'],
    models.map(model => {
        const s = summary.founders[model];
        const best = Object.entries(s.bestRoles).sort((a, b) => b[1] - a[1])[0];
        return [model, number(s.correlations.textileWorker.leatherAndJewelleryMaker), number(s.correlations.woodworker.boatbuilder),
            number(s.correlations.smith.trader), best[0] + ' (' + best[1] + ')'];
    })));
sections.push(`All off-diagonal baseline role correlations are positive. Contrast still leaves textile/leather almost interchangeable; squaring similar weights can even strengthen their correlation. Existing vector overlap remains a limitation, despite wider distributions. The full 10×10 matrices and five trait-to-role matrices are in summary.json. The strongest baseline trait/role associations are intelligence–boatbuilder (r=0.84) and physicality–smith (r=0.82). Contrast strengthens them to about 0.92; this is a role-specific dominant-trait risk, not evidence that every trait becomes equally informative. It also makes temperament–herder strongly negative (about −0.86). Preference stretching alone therefore does not resolve the single-trait safeguard. No single shared productivity gene was introduced.

Only ${summary.founders.control.originalAssignment.bestRoleMatches}/${controlRows.length} original assignments match the best of all ten roles under the stable rank tie breaker. ${productiveMatches}/${controlRows.length} are tied for best among the **four productive roles**. Median missed aptitude vs all-role best is ${percent(summary.founders.control.originalAssignment.missedFit.median)} points. Reassigning to a non-producing best role is not an economic gain. Even among productive roles, material quotas, childcare and household functions constrain allocation.

## Representative Personas and counterexamples

Examples below use observed real founders. Each row shows its own model; the complete score/rank vector is retained in raw data. A missing category is explicitly absent, not manufactured.
`);
const examples = [];
for (const model of models) {
    const people = summary.founders[model].people;
    for (const category of ['generalist', 'specialist', 'poorFit']) {
        const person = people.find(person => person.category === category);
        if (!person) { examples.push([model, category, 'none in this cohort', '—', '—', '—']); continue; }
        const row = founders.find(row => row.model === model && row.campaignSeed === person.campaignSeed && row.personaId === person.personaId);
        const best = person.ranking[0], worst = person.ranking.at(-1);
        examples.push([model, category, `${row.name} (seed ${row.campaignSeed}, ${row.personaId})`,
            best + ' ' + percent(row.aptitudes[best]) + '%', worst + ' ' + percent(row.aptitudes[worst]) + '%', percent(person.topTwo) + ' points']);
    }
    const universal = people.find(person => person.high === 10);
    if (universal) {
        const row = founders.find(row => row.model === model && row.campaignSeed === universal.campaignSeed && row.personaId === universal.personaId);
        examples.push([model, 'universally high counterexample', `${row.name} (seed ${row.campaignSeed}, ${row.personaId})`,
            percent(Math.max(...Object.values(row.aptitudes))) + '%', percent(Math.min(...Object.values(row.aptitudes))) + '%', percent(universal.topTwo) + ' points']);
    }
}
sections.push(table(['Model', 'Label', 'Persona', 'Best', 'Worst', 'Top-two gap'], examples));
sections.push(`## Descendants and inheritance

The descendant cohort consists of all actually born records, including later deaths, from **control/aware only** at Winter ${800 + manifest.winters}. It is frozen and rescored with each model; candidate-specific survivors are not mixed into the comparison. Founders and descendants have separate distributions. These children are related observations from a prepared economy and not independent uniform samples.

Canonical inheritance takes the parental mean per trait, with 25% chance to copy one parent's value instead; it adds no trait mutation. Under independent, equal-variance parents its one-generation variance ratio is 0.625. Real pairing and selection violate those assumptions, so the measured cohort is the evidence here. Mean-centered candidate formulas derived from founders can drift upward for offspring concentrating near common preferred values.
`);
sections.push(table(['Model', 'Observed descendants', 'Median best–worst gap', 'Median top-two gap', 'Generalists', 'Specialists', 'All ten ≥90%'],
    models.map(model => {
        const s = summary.descendants[model];
        return s ? [model, s.count, percent(s.gaps.bestWorst.median), percent(s.gaps.topTwo.median), s.counts.generalist, s.counts.specialist, s.universalHigh]
            : [model, 0, '—', '—', 0, 0, 0];
    })));
sections.push('Observed trait means and standard deviations:\n');
sections.push(table(['Trait', 'Founder mean', 'Founder σ', 'Descendant mean', 'Descendant σ'],
    Object.entries(summary.founders.control.traits).map(([trait, stats]) => {
        const child = summary.descendants.control?.traits[trait];
        return [trait, number(stats.mean), number(stats.standardDeviation), child ? number(child.mean) : '—', child ? number(child.standardDeviation) : '—'];
    })));
sections.push(`## Matched economy policy

- **Default/control:** unchanged founder assignment, career autonomy, no player housing/cattle commands; no salvaging.
- **Random/prepared:** seed-stable person ordering, approximately one-quarter of eligible workers allocated to woodworker; one farmer guaranteed if there are Food workers, the rest receive a seeded farmer/fisher/hunter assignment. No preference-based worker selection.
- **Aware/prepared:** identical quotas and player actions, woodworkers chosen by woodworker aptitude minus best Food aptitude; guaranteed farmer chosen by farmer aptitude minus best Food aptitude; remaining workers take their best Food role. Ties use fixed role order and stable IDs. This is a deterministic greedy heuristic, not a proven globally optimal allocation.

Prepared policies are reviewed every Winter. Living people aged ≥16 and not currently providing childcare are considered, independent of sex. Assigned roles are player-locked; role changes trigger the canonical switch penalty. Identical shared preparation salvages the ship at Winter 800, prioritizes farmer/Food households for houses, keeps a reserve of two Winters of occupied upkeep + 2 Materials, specializes houses using working members, assigns exposed cattle into active Farmyards below the soft cap, and upgrades only once living households all have houses and reserve funds remain. Births, partnerships, farmyard conversion/deactivation, upkeep/collapse, mortality and weather use the current real engine. No forced slaughter or expeditions.

The full current world extension is omitted for the bulk domestic measurement to avoid simulating unrelated CPU settlements. Public Landing.createCampaign and Weather.initializeWeather generate the settlement; every intervention/time advance uses public Simulation Core commands. Full-world vs domestic equivalence is checked on ${manifest.verificationSeeds.length} listed seeds over ${manifest.winters} Winters, including annual rows and final domestic state hashes. No result claims expedition or CPU-clan effects.

All nine scenarios per seed start with the same founder/configuration/stock/RNG fingerprint. Different decisions can subsequently change births, exposure, RNG consumption and weather histories. Paired outcomes therefore measure the whole policy+mapping trajectory, not a fixed-weather laboratory multiplier. Compare models within the same prepared policy; compare random/aware within the same model. Default vs prepared also changes investment and autonomy, so that difference cannot be attributed only to fit.
`);
sections.push(table(['Model / policy', 'Mean final Food', 'Mean final Materials', 'Mean final people', 'Mean total Food produced', 'Mean total Materials produced', 'Seeds with shortage', 'Mean shortage Winters', 'Mean total unmet Food', 'Mean role changes'],
    summary.economy.map(row => [row.model + '/' + row.policy, number(row.finalFood.mean), number(row.finalMaterials.mean), number(row.finalPopulation.mean),
        number(row.foodProduced.mean), number(row.materialsProduced.mean), row.seedsWithShortfall + '/' + row.seeds,
        number(row.shortageWinters.mean), number(row.shortfall.mean), number(row.occupationChanges.mean)])));
sections.push('Mean paired **aware minus random** differences for the same seed and model:\n');
sections.push(table(['Model', 'Final Food', 'Final Materials', 'Total Food production', 'Unmet Food'], models.map(model => {
    const aware = summary.economy.find(row => row.model === model && row.policy === 'aware');
    const random = summary.economy.find(row => row.model === model && row.policy === 'random');
    return [model, number(aware.finalFood.mean - random.finalFood.mean), number(aware.finalMaterials.mean - random.finalMaterials.mean),
        number(aware.foodProduced.mean - random.foodProduced.mean), number(aware.shortfall.mean - random.shortfall.mean)];
})));
sections.push('Matched candidate minus control differences, with the same prepared policy (seed-level deltas and full distributions are preserved):\n');
sections.push(table(['Candidate / policy', 'Mean final Food Δ', 'P10 / P90 final Food Δ', 'Mean Materials Δ', 'Mean population Δ', 'Mean unmet Food Δ'],
    summary.paired.map(row => [row.key, number(row.food.mean), number(row.food.p10) + ' / ' + number(row.food.p90),
        number(row.materials.mean), number(row.population.mean), number(row.shortfall.mean)])));
sections.push('Housing and family outcomes (means):\n');
sections.push(table(['Model / policy', 'Final houses', 'Final upgrade levels (sum)', 'Births', 'Deaths', 'Longest shortage streak'],
    summary.economy.map(row => [row.model + '/' + row.policy, number(row.finalHouses.mean), number(row.finalUpgrades.mean),
        number(row.births.mean), number(row.deaths.mean), number(row.longestShortage.mean)])));
sections.push(`Raw annual records additionally include Materials upkeep, farmyard counts, cattle/exposure, separate resident/cattle Food, accepted specialization commands, workers' innate/effective BPS, stocks and RNG. Role-change counts exclude commands that merely lock the same existing role. Stocks remain nonnegative safe integers; each annual record asserts Food conservation against actual event output and actual consumption. Unmet consumption is recorded separately and is not subtracted a second time. Work progression and unit emission use unchanged integer/fixed-point engine calculations.

The current **Harsh** profile stops Food and Materials production and raises human/cattle consumption by 50%. **Severe** has its separate current 50% Food output / triple adult-cattle multiplier; it is not renamed or substituted. Natural mortality and cattle reproduction/mortality/soft-cap effects are enabled. Food shortage is not itself a lethal mechanic in this version, so positive population is not proof of food resilience.

## Recommendation and #77 interaction

Keep the canonical model unchanged. **Advance contrast as a limited profile-design follow-up**, with targeted differentiation of near-duplicate role vectors and a deliberate production calibration; do not approve it as balance from this run. It produces substantially more specialists with fewer universally high founders than the aggressive models, while measured role means stay close to control. It still creates a few universally high people, leaves major role correlations and barely gives woodworker unique best-role identity.

Expanded is useful as a percentage-sensitivity experiment, but cannot add strict role-ranking identity and creates excessive global highs/lows. Quadratic gives larger top-two choices but also saturation, globally excellent Personas and stronger output selection gains. Preserving a generator's mean does not preserve production: an aware allocation selects the upper tail, houses amplify it, and inherited traits change the distribution. The measured prepared stock and shortage tables must accompany any future balance proposal.

#77 has no completed spoilage/capacity evidence included here. The observed stocks have **no experimental spoilage or storage diminishing returns**. Larger aware surpluses could be reduced by #77's spoilage/capacity variants; earlier scarcity could also be intensified before housing or cattle shelter. A combined follow-up must run the same seeds/policies against #77's matrix, retain both paired deltas and shortage streaks, and avoid stacking a second Harsh-consumption modifier. The #77 proposal's Severe/Harsh wording should be reconciled against the explicit configuration above before its experiments. These are coordination requirements, not effects measured by this run.

## Saves, replay and validation

Current mechanics version 2 saves role vectors and work progress but do not store an aptitude-formula identifier. A global formula replacement would change continuation, production thresholds, autonomous switching and subsequent random draws for old saves despite unchanged DNA. It cannot be safely shipped as a silent code update.

Candidate executions use an isolated QA compiler compartment replacing only the reviewed scoring function body. It fails closed if that canonical body changes. No production file or schema is changed; control uses the existing unchanged loader. Candidate saves are canonical validated saves inside an explicit experiment envelope with model/source/mapping identity; loading through a different identity is rejected. These are experiment-only saves, never a new application save format. A separate [partial-work replay proof](partial-replay.json) checks all four models at tick 500 of seed 32, recording nonzero integer work progress and equal continued/restored final hashes. Its dedicated public harness also rejects restoring under a different model identity. Existing full work progress and RNG are serialized by the real core; no derived aptitudes are persisted as canonical truth.

${summary.verification.filter(row => row.kind === 'repeat-and-save').length} repeated scenario runs on seeds ${manifest.verificationSeeds.join(', ')} match the original complete outputs after mid-horizon save/load; ${summary.verification.filter(row => row.kind === 'full-world-equivalence').length} full-world comparisons agree. This is the exact verification subset; the other seeds are not claimed to have been repeated. Public harness tests independently compare real founders, mapped work, known percentile/correlation fixtures, matching allocation runs, save/load, generated artifacts and the actual CLI.

A future production change requires a separately reviewed versioned scoring identity/configuration, legacy formula retention for old saves, and explicit replay/migration coverage. Preserve unrelated DNA/naming and integer work history.
`);
writeFileSync(join(directory, 'report.md'), sections.join('\n'));
console.log('Report written: ' + join(directory, 'report.md'));
