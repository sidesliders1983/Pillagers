import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
const read = file => JSON.parse(readFileSync(join(directory, file), 'utf8'));
const summary = read('summary.json');
const manifest = read('manifest.json');
const audit = read('audit.json');
const rows = summary.scenarios;
if (manifest.seeds.start !== 0 || manifest.seeds.count !== 100 || manifest.winters !== 25 || rows.length !== 13) {
    throw new Error('This report template requires the complete 100-seed, 25-Winter, 13-case matrix');
}
const number = value => value === null || value === undefined ? '—' : Number(value.toFixed(1)).toString();
const table = (headers, values) => [
    '| ' + headers.join(' | ') + ' |',
    '| ' + headers.map(() => '---').join(' | ') + ' |',
    ...values.map(row => '| ' + row.join(' | ') + ' |'),
].join('\n');
const bounds = distribution => distribution
    ? number(distribution.median) + ' [' + number(distribution.p10) + '–' + number(distribution.p90) + ']'
    : '—';
const find = scenario => rows.find(row => row.scenario === scenario);
const controls = ['A', 'B', 'C10', 'D2', 'E10', 'C10-safe', 'E10-safe', 'E10-N4'].map(find);
const runs = manifest.artifacts.filter(file => file.path.startsWith('runs25/')).flatMap(file =>
    JSON.parse(gunzipSync(readFileSync(join(directory, file.path)))).runs);
const details = rows.map(row => {
    const group = runs.filter(run => run.scenario === row.scenario);
    return { scenario: row.scenario,
        arrivalShortageCampaigns: group.filter(run => run.annual[1].shortfall > 0).length,
        laterShortageCampaigns: group.filter(run => run.annual.slice(2).some(year => year.shortfall > 0)).length,
        healthyEntryShortageCampaigns: Object.fromEntries(['Normal', 'Harsh', 'Severe'].map(weather => [weather,
            group.filter(run => run.annual.some(year => year.weather === weather && year.shortfall > 0 &&
                year.previousFood >= 2 * year.openingNormalNeed)).length])),
        roles: Object.fromEntries(['farmer', 'fisher', 'hunter'].map(role => [role, {
            meanAvailableWorkerWinters: group.reduce((sum, run) => sum + run.annual.slice(1)
                .reduce((total, year) => total + year.availableByRole[role], 0), 0) / group.length,
            meanCapacityLostEquivalent: group.reduce((sum, run) => sum + run.annual.slice(1)
                .reduce((total, year) => total + year.lostByRole[role], 0), 0) / group.length,
        }])),
    };
});
writeFileSync(join(directory, 'resilience-details.json'), JSON.stringify(details, null, 2) + '\n');
const capacityTable = table(['Case', 'Farmer available/lost', 'Fisher available/lost', 'Hunter available/lost',
    'Healthy-entry shortage campaigns: Normal/Harsh/Severe', 'Arrival/later shortage campaigns'], details.map(row => [row.scenario,
    ...['farmer', 'fisher', 'hunter'].map(role => number(row.roles[role].meanAvailableWorkerWinters) + '/' +
        number(row.roles[role].meanCapacityLostEquivalent)),
    ['Normal', 'Harsh', 'Severe'].map(weather => row.healthyEntryShortageCampaigns[weather]).join('/'),
    row.arrivalShortageCampaigns + '/' + row.laterShortageCampaigns]));
const prepared = find('B');
const passive = find('A');
const stockTable = table(['Case', 'Food median', 'P10', 'P90', 'Min', 'Max', 'Reserves median', 'Any shortage /100', '≥3 consecutive /100'],
    rows.map(row => [row.scenario, number(row.finalFood.median), number(row.finalFood.p10), number(row.finalFood.p90),
        number(row.finalFood.min), number(row.finalFood.max), number(row.finalReserves?.median), row.seedsWithShortage, row.sustainedShortageSeeds]));
const checkpointTable = field => table(['Case', '805', '810', '815', '820', '825'],
    rows.map(row => [row.scenario, ...[805, 810, 815, 820, 825].map(winter => bounds(row.checkpoints[winter]?.[field]))]));
const flowsTable = table(['Case', 'Produced', 'Consumed', 'Spoiled', 'Capacity equivalent lost', 'Unmet', 'Unmet events', 'Low-reserve Winters'],
    rows.map(row => [row.scenario, ...['foodProduced', 'foodConsumed', 'spoiled', 'capacityLostEquivalent', 'unmetFood',
        'unmetConsumptionEvents', 'lowReserveWinters'].map(field => number(row[field].mean))]));
const rolesTable = table(['Case', 'Farmer', 'Fisher', 'Hunter', 'Cattle output', 'Cattle consumption', 'Woodworker Materials'],
    controls.map(row => [row.scenario, ...['farmer', 'fisher', 'hunter'].map(role => number(row.roleProduction[role].mean)),
        number(row.cattleProduced.mean), number(row.cattleConsumed.mean), number(row.roleProduction.woodworker.mean)]));
const recoveryTable = table(['Case', 'Shortage Winters mean', 'Longest streak max', 'Episodes', 'Recovered', 'Censored', 'Recovery median [P10–P90]'],
    rows.map(row => [row.scenario, number(row.shortageWinters.mean), row.longestStreak.max, row.recovery.episodes.length,
        row.recovery.resolved, row.recovery.unresolved, bounds(row.recovery.recoveredDelay)]));
const costsTable = table(['Case', 'Food available/effective worker Winters', 'Materials available/effective', 'Materials spent/upkeep',
    'Houses/upgrades at 825', 'Farmyards/cattle/exposed at 825', 'Commands accepted/rejected'],
    controls.map(row => [row.scenario,
        number(row.activeFoodPersonWinters.mean) + '/' + number(row.productiveFoodPersonWinters.mean),
        number(row.activeMaterialsPersonWinters.mean) + '/' + number(row.productiveMaterialsPersonWinters.mean),
        number(row.materialsSpent.mean) + '/' + number(row.upkeep.mean),
        number(row.finalHouses.mean) + '/' + number(row.finalUpgrades.mean),
        number(row.finalFarmyards.mean) + '/' + number(row.finalCattle.mean) + '/' + number(row.finalExposedCattle.mean),
        number(row.commandAccepted.mean) + '/' + number(row.commandRejected.mean)]));
const populationTable = table(['Case', 'Population at 825 median [P10–P90]', 'Births/deaths mean', 'Below 10 residents /100',
    'Care/age-reduced worker Winters mean', 'Occupation/specialisation changes mean', 'Overcrowded cattle Winters mean'],
    controls.map(row => [row.scenario, bounds(row.finalPopulation), number(row.births.mean) + '/' + number(row.deaths.mean),
        row.populationDeclineSeeds, number(row.childcarePersonWinters.mean) + '/' + number(row.ageReducedPersonWinters.mean),
        number(row.occupationChanges.mean) + '/' + number(row.specializationChanges.mean), number(row.overcrowdingCattleWinters.mean)]));
const weatherTable = table(['Case/weather', 'Observed', 'Shortage Winters', 'Healthy entry but shortage', 'Food delta median',
    'Next-boundary Food median', 'Production mean'], controls.flatMap(row => ['Normal', 'Harsh', 'Severe'].map(weather => {
        const data = row.weather[weather];
        return [row.scenario + '/' + weather, data.observedWinters, data.shortageWinters, data.healthyEnteringButShortage,
            number(data.foodDelta?.median), number(data.nextBoundaryFood?.median), number(data.production?.mean)];
    })));
const pairedTable = table(['Case minus B', 'Food delta median [P10–P90]', 'Unmet delta mean', 'Population delta mean', 'RNG diverged /100'],
    summary.paired.map(row => [row.scenario, bounds(row.finalFoodDelta), number(row.unmetFoodDelta.mean),
        number(row.populationDelta.mean), row.divergedSeeds]));
const extendedTable = table(['Case', 'Food at 850 median [P10–P90]', 'Min/max', 'Reserves median', 'Any shortage /10', '≥3 consecutive /10', 'Population median'],
    summary.extended.map(row => [row.scenario, bounds(row.finalFood), number(row.finalFood.min) + '/' + number(row.finalFood.max),
        number(row.finalReserves?.median), row.seedsWithShortage, row.sustainedShortageSeeds, number(row.finalPopulation.median)]));
const outliers = table(['Case', 'Low Food seeds: stock (shortage years)', 'High Food seeds: stock'], controls.map(row => [row.scenario,
    row.outliers.slice(0, 3).map(seed => seed.seed + ': ' + seed.food + ' (' + (seed.shortages.join(', ') || 'none') + ')').join('; '),
    row.outliers.slice(-3).map(seed => seed.seed + ': ' + seed.food).join('; ')]));

const report = `# Food resilience v0.3 — measured experiment (#77)

This report measures reserve control and crisis resilience. Production defaults, regular campaign saves and the Gameplay Lab are unchanged. PR #83 was merged before this run.

## Cohort and reproduction

Source baseline: \`${manifest.sourceRevision}\`. Runtime: \`${manifest.runtime.node}\` / ${manifest.runtime.platform}. Seeds 0–99, 25 Winters per case: 1,300 primary campaigns. The predeclared 50-Winter subset uses seeds ${manifest.extendedSeeds.join(', ')}: 130 additional campaigns. The published cohort contains ${audit.campaigns} campaigns and ${audit.winterRows} resolved domestic Winters. Replay and full-world validation runs are counted separately below. This fixed seed sample is a calibration cohort, not a demographic estimate or a hardware performance gate.

\`\`\`powershell
pnpm install --frozen-lockfile
node scripts/qa/run-food-resilience.mjs --output artifacts/food-resilience-v03 --seeds 100 --winters 25 --workers 4
node scripts/qa/verify-food-study.mjs artifacts/food-resilience-v03
node scripts/qa/render-food-report.mjs artifacts/food-resilience-v03
node --test tests/food-resilience.test.mjs
\`\`\`

Use fewer workers on a busy laptop. [Manifest](manifest.json) records exact saved mechanics/landing/weather configuration, source/recipe/harness fingerprints, artifact hashes, runtime and seeds. [Summary](summary.json) includes every case, annual distributions, paired seed deltas, episodes and replay records. [Audit](audit.json) independently checks ${audit.checksumVerifiedArtifacts} artifact hashes, all integer ledgers, fair role factors and unchanged configuration. ${audit.unchangedHistoricalControls} A/B campaigns match the historical #78 control hashes, initial fingerprints and public commands exactly. Historical reports and raw artifacts are preserved.

Each \`runs25/seed-N.json.gz\` contains all 13 cases with actual public command logs, annual resident/work inspections, per-role output, herds, stock flows, RNG state and final canonical hashes. \`runs50/\` contains the declared long-run subset. Read gzip JSON with Node's \`gunzipSync\`. Summary percentiles use linear interpolation; standard deviation divides by N. Fractional summary means/percentiles are statistical values; every campaign stock and actual output is an integer.

## Verified rules and experimental boundaries

The issue calls the production stop “Severe”. The merged implementation calls it **Harsh**. No modifier was replaced or applied twice:

| Weather | Draw probability | Human/cattle Food output | Materials output | Resident consumption | Adult cattle consumption |
| --- | --- | --- | --- | --- | --- |
| Mild | 20% | 110% | 100% | 100% | 1 Food |
| Normal | 55% | 100% | 100% | 100% | 1 Food |
| Harsh | 20% | 0% | 0% | +50%, group rounded up | +50%, group rounded up |
| Severe | 5% | 50% | 100% | 100% | 3 Food |

These are draw probabilities; realised weather frequency can differ, and experimental demographic changes can move the shared RNG stream. Weather exposure mortality, human mortality, cattle reproduction/mortality, normal Food baseline 10, woodworker Materials baseline 5, childcare, age, tent penalties and upgrades retain the exact source rules. Children under 16 consume 1 Food; residents 16+ consume 2. Cattle under 2 consume zero normally; adults consume 1.

**Spoilage:** after the entire domestic Winter resolves, including deaths, consumption, upkeep/collapse, autonomous careers, partnerships, births and the next weather draw; before CPU/world stepping. Therefore those same-boundary career and birth decisions see pre-spoilage Food. Then \`floor(max(0, Food − protectedFood) × rateBps / 10000)\` is removed, with a factual \`FoodSpoiled\` event for positive loss. Newly born dependants contribute to the protected threshold. The protected variant recalculates two normal Winters of consumption from current living residents and cattle. Protection exempts existing stock from spoilage; it creates no Food and consumption can take stocks below the threshold. No storage building or hard stock cap is introduced.

**Capacity:** one domestic region, separate farmer/fisher/hunter pools. Structurally available workers count, including workers blocked economically by Harsh weather, but excluding underage, childcare and other canonical ineligibility. First N slots contribute 100% each, then 75%, 50%, 25%, 10%, 10%…; the total is shared equally across that role. For eight workers with N=2, each receives 47.5%. The factor multiplies canonical productivity before fixed-point work accumulation, with deterministic flooring. DNA, housing, career penalty and remaining real work progress are preserved. Woodworkers and cattle output have no regional capacity penalty. Slot sharing treats a part-productive worker as one structurally available worker; it is not an aptitude-weighted allocation.

Capacity loss is recorded as **discarded integer work**, with cumulative whole-Food work equivalents carried between years separately per role. It is not Food removed from stocks, and it is not the actual output of a separate counterfactual campaign. \`nominalFoodEquivalent\` is actual emitted Food plus that work equivalent. The stock ledger is \`openingFood + actualProduced − actualConsumed − spoiled\`; unmet demand is not subtracted a second time. Both Food and Materials ledgers were checked at every row.

Experiments are compiled in a QA compartment with two exact, fail-closed source hooks. No \`src/\` gameplay source is edited. The experimental envelope keeps recipe/source identity and the loss ledger around a real validated Simulation Core save; mismatched recipes are rejected. CPU regions retain canonical rules. ${audit.repeatAndSaveChecks} full runs repeat identically with midpoint save/load; ${audit.fullWorldChecks} B/E10 runs match the full world's domestic annual output and final domestic hash. A separate test resumes partial integer work within a Winter. This supports the domestic measurement only; no expedition result is claimed.

## Matrix and fixed player policy

| Case | Prepared policy | Spoilage | Protected stock | Full slots before role capacity taper |
| --- | --- | --- | --- | --- |
| A | No commands | None | None | No limit |
| B | Yes | None | None | No limit |
| C05 / C10 / C15 | Yes | 5% / 10% / 15% | None | No limit |
| D2 / D4 | Yes | None | None | 2 / 4 |
| E05 / E10 / E15 | Yes | 5% / 10% / 15% | None | 2 |
| C10-safe | Yes | 10% | Two normal Winters | No limit |
| E10-safe | Yes | 10% | Two normal Winters | 2 |
| E10-N4 | Yes | 10% | None | 4 |

B–E reuse the frozen #78 aptitude-aware policy through real eligibility/affordability-checked commands. Each Winter, eligible adults outside childcare are ranked by woodworker fit minus their best Food fit; approximately a quarter become woodworkers. One Food worker is reserved as farmer, selected by farmer fit relative to their best Food fit; the remainder use their best farmer/fisher/hunter aptitude, with stable role/ID ties. Player choices are locked; canonical switching penalties still apply. Cultural names and sex do not constrain allocation.

At arrival, salvage the longship. Build houses for farmer households, then other Food households, then other households when affordable; require Materials to cover the purchase cost plus two Winters of currently occupied house upkeep and 2 Materials. This threshold uses upkeep before that purchase; new upkeep enters the next affordability check. Specialise homes to an eligible household worker, preferring Food roles. Assign exposed cattle to active Farmyards below the soft cap of four. Upgrade only once all living households are housed and that same purchase threshold is affordable. Farmers activate permanent-house Farmyards for free. There are no Food purchases, discretionary expeditions, manual culling, housing salvages or experiment-specific rescue choices.

The initial 30 Food cannot cover an intact group of 10 adults plus three adult cattle during Harsh weather: 30 + 5 Food is required before any mortality. Slaughter could supply Food, but is deliberately excluded by this policy. Early crises therefore measure this particular non-culling policy, not an unavoidable failure of every active-player strategy.

This is reserve-oriented shelter preparation, **not an optimal forecast response**: the policy has no special Harsh/Severe quota or capacity-aware reallocation. The same policy runs in every prepared case. Command sequences can diverge when the resulting population/Materials change; a shared decision rule does not guarantee identical later actions. Shared initial seeds also do not guarantee identical later weather. Both facts are recorded rather than hidden.

## Reserve distributions and agency

Final stocks at Winter 825. Reserves are normal-Winter demand estimates after that boundary; zero-demand extinct campaigns have no reserve ratio.

${stockTable}

Prepared B has ${prepared.seedsWithShortage}/100 campaigns with any actual unmet consumption versus ${passive.seedsWithShortage}/100 in passive A. Median final Food is ${number(prepared.finalFood.median)} versus ${number(passive.finalFood.median)}. Any shortage is **not** a lost campaign: compare the sustained-shortage, low-reserve and population tables separately.

Food checkpoints: median [P10–P90].

${checkpointTable('food')}

Materials checkpoints: median [P10–P90].

${checkpointTable('materials')}

## Food flows, losses and work

All following flow and opportunity-cost values are means per campaign over 25 Winters, unless labelled otherwise. Capacity-equivalent loss measures discarded work, not a hypothetical alternate campaign's production.

${flowsTable}

${rolesTable}

Separate role capacity: mean available worker-Winters / discarded whole-Food work equivalents per campaign. The last columns count distinct campaigns (each out of 100), not weather episodes. Arrival means the first resolved Winter, 800→801; later means any subsequent Winter, and a campaign can appear in both columns. Exact derived values are in [resilience details](resilience-details.json).

${capacityTable}

“Available” counts structural eligibility at the opening of each work year; “effective” additionally requires positive actual productivity, so Harsh years contribute zero effective workers. These snapshots do not estimate fractional full-time-equivalent labour. Houses, upgrades and herd counts are final means. Upkeep is actually paid upkeep; spending includes house construction and upgrades. Full annual details retain activation, exposure, crowding and accepted/rejected commands.

${costsTable}

${populationTable}

Deaths are from existing mortality mechanics; unmet Food itself has no starvation-death rule. Care and age effects are measured as worker-Winter counts, not claimed counterfactual causation.

## Crisis and recovery

An unmet-consumption event is an actual resident or cattle demand event with positive shortfall. A low-reserve Winter has less than one normal Winter of stock. A sustained episode means at least three consecutive shortage Winters. Population decline means fewer than the initial 10 living residents at the final boundary. These are different risk proxies; none is labelled campaign failure.

Recovery is the first later boundary after an episode ends with at least two normal Winters of Food. Episodes without such recovery by the horizon are censored, not assigned zero delay. Delays exclude the duration of the shortage itself. Episodes can share a later recovery boundary; they are not independent trials. The reserve ratio can also improve when demand falls, so recovery does not imply that production alone rebuilt the buffer.

${recoveryTable}

The weather label is the outgoing work year's weather; the row's boundary is the newly entered Winter. “Healthy entry” means at least two opening normal Winters of Food, not two crisis-adjusted Winters. The next-boundary column includes whatever weather followed, so it is descriptive and not a causal recovery estimate. Rows without a later boundary are omitted from that column.

${weatherTable}

## Paired differences and RNG divergence

Each candidate uses the same founding seed as B. These are paired final trajectories, not isolated loss accounting: fertility, mortality, childcare, role changes and cattle can feed back into production. RNG divergence is the first annual snapshot with a different persisted domestic RNG state; transient draw-history differences within a year are not claimed to be detected.

${pairedTable}

## Fifty-Winter sensitivity

${audit.extendedPrefixChecks} extended campaigns exactly preserve their matched 25-Winter annual and command prefixes. Only the declared 10 seeds are extended; the table is exploratory and is not 100-seed evidence. It tests whether bounded early stocks conceal later accumulation or repeated shortage.

${extendedTable}

For the same ten seeds, B's median Food grows from ${number(summary.extended.find(row => row.scenario === 'B').checkpoints[825].food.median)} at 825 to ${number(summary.extended.find(row => row.scenario === 'B').finalFood.median)} at 850. C10-safe changes from ${number(summary.extended.find(row => row.scenario === 'C10-safe').checkpoints[825].food.median)} to ${number(summary.extended.find(row => row.scenario === 'C10-safe').finalFood.median)}. These paired subset values support the reserve-control direction while retaining zero Normal-Winter shortages in the prepared extended runs.

## Outliers and manual follow-up

${outliers}

For control B, start the listed seed in Gameplay Lab and reproduce the command policy in \`food-policy.mjs\`. Exact command logs in the raw archive are preferable to hand timing. C/D/E are harness-only experiments: opening an ordinary Gameplay Lab campaign does not enable them. Inspect a single experimental seed with \`runFoodScenario({seed, scenario, winters:25})\` from the public harness; inspect its annual rows and commands. Do not import an experimental envelope as a regular campaign save.

## Validation

The build and character validation with explicit Lab previews pass. The complete local suite reports 477 tests: 466 passed and 11 existing optional-fixture skips. All nine new public-harness tests pass, including recipe rejection, partial-work resume, actual capacity effects and corrupted-archive detection. Source formatting was reviewed manually; this repository has no configured automatic formatter. PR readiness is gated separately on all required GitHub checks passing for the current head.

## Recommendation and limits

**Use C10-safe as the next prototype candidate: 10% annual spoilage only above two normal Winters of current demand.** It lowers median Food at 825 from ${number(prepared.finalFood.median)} to ${number(find('C10-safe').finalFood.median)}, while any-shortage incidence changes from ${prepared.seedsWithShortage}/100 to ${find('C10-safe').seedsWithShortage}/100. Mean low-reserve Winters change from ${number(prepared.lowReserveWinters.mean)} to ${number(find('C10-safe').lowReserveWinters.mean)}, and sustained-shortage campaigns from ${prepared.sustainedShortageSeeds} to ${find('C10-safe').sustainedShortageSeeds}. Its P10 stock is ${number(find('C10-safe').finalFood.p10)}, compared with ${number(find('C05').finalFood.p10)} for unprotected 5% spoilage. All prepared primary cases have zero unmet consumption in Normal Winters. This is a measured trade-off, not a guarantee against repeated bad weather.

Unprotected 10–15% takes too much from thin reserves: any-shortage incidence is ${find('C10').seedsWithShortage}–${find('C15').seedsWithShortage}/100. Unprotected 5% is a reasonable simpler comparator (${find('C05').seedsWithShortage}/100); the protected 10% candidate gives a better low-stock tail in this cohort.

**Defer regional capacity as a default.** N=2 alone records ${number(find('D2').capacityLostEquivalent.mean)} lost Food work equivalents per campaign and ${find('D2').seedsWithShortage}/100 campaigns with a shortage. Combining it with unprotected 10% raises incidence to ${find('E10').seedsWithShortage}/100 and leaves ${find('E10').recovery.unresolved} episodes unrecovered by 825, versus ${prepared.recovery.unresolved} in B. Protection helps E10-safe, but it still has ${find('E10-safe').seedsWithShortage}/100 campaigns with a shortage. N=4 alone is gentler (${number(find('D4').capacityLostEquivalent.mean)} mean work-equivalent loss), but its smaller shortage count than B does not prove capacity helps: realised demographic/RNG trajectories diverge.

A useful next experiment is **N=4 plus protected spoilage with a capacity-aware allocation policy**. That particular combination and policy were not measured here. Do not adopt either diminishing returns or the combined settings as canonical from this run. Protected spoilage is the strongest measured prototype direction; canonical adoption should follow targeted player-policy and expedition stress validation.

The 50-Winter convenience subset is shown above to expose later dynamics, without claiming it represents all 100 seeds. It strengthens a direction check, not a statistical balance decision.

No standard balance change is approved by this report. Before adopting a candidate, test a capacity-aware prepared policy and explicit forecast preparation, then a paired expedition stress policy. This run does not establish expedition resilience, different founding cohorts, climate-off balance, nutrition, starvation or a storage-building design. Percentage spoilage with a positive rate reduces stock growth in a fixed-surplus economy; it does not prove a strict global bound when population/output can grow. Current demographic and cattle feedback remains part of the result.
`;
writeFileSync(join(directory, 'report.md'), report);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const provenance = {
    manifestSha256: digest(readFileSync(join(directory, 'manifest.json'))),
    scripts: Object.fromEntries(['render-food-report.mjs', 'verify-food-study.mjs'].map(file => [file,
        digest(readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n'))])),
    files: Object.fromEntries(['report.md', 'audit.json', 'resilience-details.json'].map(file => [file,
        digest(readFileSync(join(directory, file)))])),
};
writeFileSync(join(directory, 'report-provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log('Wrote report.md and report-provenance.json');
