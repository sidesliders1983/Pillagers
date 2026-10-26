import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = join(root, 'docs/qa/cultural-events/calibration-cultural-events-275-276-v1');
const sha = value => createHash('sha256').update(value).digest('hex');
async function fileHash(file, unzip = false) {
    const hash = createHash('sha256');
    const source = unzip ? createReadStream(file).pipe(createGunzip()) : createReadStream(file);
    for await (const bytes of source) hash.update(bytes);
    return hash.digest('hex');
}
async function* rows(name) {
    const lines = createInterface({ input: createReadStream(join(directory, name)), crlfDelay: Infinity });
    for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}
const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')));
if (process.argv[2] === '--restore-raw') {
    for (const name of ['controlled.jsonl', 'strategies.jsonl']) {
        const plain = join(directory, name), compressed = plain + '.gz';
        if (existsSync(plain)) {
            assert.equal(await fileHash(plain), manifest.rawFiles[name]);
            continue;
        }
        assert.equal(await fileHash(compressed, true), manifest.rawFiles[name]);
        const temporary = plain + '.restoring';
        await pipeline(createReadStream(compressed), createGunzip(), createWriteStream(temporary, { flags: 'wx' }));
        assert.equal(await fileHash(temporary), manifest.rawFiles[name]);
        renameSync(temporary, plain);
    }
    console.log('Restored exact verified JSONL delivery copies; existing raw evidence was retained.');
    process.exit(0);
}
for (const phase of ['controlled', 'pilot', 'full', 'expand'])
    assert.equal(manifest.phases[phase]?.status, 'complete', 'Complete frozen phases required for final report');
for (const [file, expected] of Object.entries(manifest.fingerprint.sources))
    assert.equal(sha(readFileSync(join(root, file))), expected, 'Measured source changed: ' + file);
const summary = JSON.parse(readFileSync(join(directory, 'summary.json')));
assert.equal(summary.status, 'complete');
assert.equal(summary.counts['technically-failed'], 0);
const raw = [];
for (const name of ['controlled.jsonl', 'strategies.jsonl']) {
    const plain = join(directory, name), compressed = plain + '.gz', temporary = compressed + '.preparing';
    assert.equal(await fileHash(plain), manifest.rawFiles[name], 'Raw evidence hash');
    await pipeline(createReadStream(plain), createGzip({ level: 9 }), createWriteStream(temporary));
    assert.equal(await fileHash(temporary, true), manifest.rawFiles[name], 'Lossless compressed evidence');
    renameSync(temporary, compressed);
    raw.push({ name, uncompressedBytes: statSync(plain).size, sha256: manifest.rawFiles[name],
        gzipBytes: statSync(compressed).size, gzipSHA256: await fileHash(compressed), records: 0 });
}
const seen = new Set(), controlled = new Map(), strategies = new Map();
let timeline = null, regression = null;
const sourceCPU = { replicatedClanInstances: 0, finalPopulation: 0, finalFood: 0, finalMaterials: 0,
    foodProduced: 0, foodConsumed: 0, residentShortfall: 0, livestockShortfall: 0, culturalGatherings: 0 };
const offers = Object.fromEntries(['none', 'one', 'two'].map(arm => [arm,
    { initial15FoodCampaigns: 0, initialAllowed: 0, initialPayment: 0,
        submitted: 0, reserveSkips: 0, unavailableOffers: 0, finalUnusedSupport: 0, reasons: {} }]));
for (const artifact of raw) for await (const row of rows(artifact.name)) {
    artifact.records++;
    assert.equal(row.status, 'complete');
    assert.equal(row.fingerprint, manifest.fingerprint.id);
    const key = [row.phase, row.weather ?? '', row.seed, row.arm].join(':');
    assert.ok(!seen.has(key), 'Duplicate campaign result'); seen.add(key);
    assert.equal(row.accounting, 'passed');
    assert.equal(row.totals.foodPaid, row.totals.gatherings * 3, 'Actual quoted payment totals');
    assert.equal(row.totals.gatherings - row.totals.supportUsed, row.final.supportCount, 'Finite support accounting');
    assert.ok(row.final.supportCount >= 0 && row.final.supportCount <= 2);
    if (row.phase === 'controlled') {
        const key = row.weather + ':' + row.seed, group = controlled.get(key) ?? {};
        group[row.arm] = { deaths: row.totals.residentDeaths,
            riskHash: row.arm === 'none' ? null : sha(JSON.stringify(row.annual[0].supportApplied[0].riskInputs)) };
        controlled.set(key, group);
        if (row.seed === 1 && row.weather === 'Severe') {
            regression ??= { fixture: 'Controlled Severe, seed1; explicitly quiet family configuration', arms: {} };
            regression.arms[row.arm] = { paidFood: row.totals.foodPaid,
                actualDeaths: row.annual[0].residentDeaths.map(event => ({ id: event.id,
                    personaId: event.personaId, time: event.time, people: event.details.people, age: event.details.age,
                    weatherClass: event.details.weatherClass, mortalityRiskBps: event.details.mortalityRiskBps })),
                observedRisk: row.annual[0].supportApplied[0]?.riskInputs.find(risk => risk.personaId === 'founder-7') ?? null,
                supportRemaining: row.final.supportCount };
        }
    } else {
        const group = strategies.get(row.seed) ?? {};
        group[row.arm] = { deaths: row.totals.residentDeaths, weather: row.annual.map(annual => annual.assessedWeather.class) };
        strategies.set(row.seed, group);
        const data = offers[row.arm];
        data.initial15FoodCampaigns += Number(row.initial.stocks.food === 15);
        data.initialAllowed += Number(row.initial.offer.allowed);
        data.initialPayment += Number(row.annual[0].policy.some(decision => decision.submitted));
        data.submitted += row.totals.gatherings; data.reserveSkips += row.totals.reserveSkips;
        data.unavailableOffers += row.totals.unavailableOffers; data.finalUnusedSupport += row.final.supportCount;
        for (const annual of row.annual) for (const decision of annual.policy) if (decision.reason)
            data.reasons[decision.reason] = (data.reasons[decision.reason] ?? 0) + 1;
        if (row.arm === 'none') {
            for (const clan of Object.values(row.final.cpu)) {
                sourceCPU.replicatedClanInstances++; sourceCPU.finalPopulation += clan.population;
                sourceCPU.finalFood += clan.stocks.food; sourceCPU.finalMaterials += clan.stocks.materials;
                sourceCPU.culturalGatherings += clan.gatheringCount;
            }
            for (const annual of row.annual) for (const economy of Object.values(annual.cpuEconomy)) {
                sourceCPU.foodProduced += economy.foodProduced; sourceCPU.foodConsumed += economy.foodConsumed;
                sourceCPU.residentShortfall += economy.residentShortfall;
                sourceCPU.livestockShortfall += economy.livestockShortfall;
            }
        }
        if (!timeline && row.arm === 'one') {
            const annual = row.annual.find(annual => annual.supportApplied.length);
            if (annual) {
                const applied = annual.supportApplied[0], source = applied.sourceEventIds[0];
                timeline = { selection: 'First numeric-seed one-gathering-policy case with a real support assessment; not selected for a favourable death.',
                    seed: row.seed, arm: row.arm, held: row.timeline.find(event => event.id === source), applied,
                    actualDeathsInTheInterval: annual.residentDeaths,
                    noCounterfactualLore: 'These events record participation and risk application, not an averted death.' };
            }
        }
    }
}
for (const arms of controlled.values()) {
    assert.deepEqual(Object.keys(arms).sort(), ['none', 'one', 'two']);
    assert.equal(arms.one.riskHash, arms.two.riskHash, 'No strength stacking');
}
const strategyDirection = Object.fromEntries(['one', 'two'].map(arm => [arm, {
    fewerDeaths: [...strategies.values()].filter(group => group[arm].deaths < group.none.deaths).length,
    moreDeaths: [...strategies.values()].filter(group => group[arm].deaths > group.none.deaths).length,
    sameDeaths: [...strategies.values()].filter(group => group[arm].deaths === group.none.deaths).length,
}]));
const data = { checkedAt: new Date().toISOString(), measurementHead: manifest.head,
    checkedHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    fingerprint: manifest.fingerprint.id, runnerHash: manifest.fingerprint.runnerHash,
    reportRunnerHash: sha(readFileSync(fileURLToPath(import.meta.url))), protocolHash: manifest.fingerprint.protocolHash,
    sourceRuleAndPolicyHashes: { rules: manifest.fingerprint.rulesHash, policy: manifest.fingerprint.policyHash },
    dependencyFilesVerified: Object.keys(manifest.fingerprint.sources).length, raw,
    verifiedUniqueCompleteCampaigns: seen.size, controlledPairedSeeds: controlled.size,
    noStackingComparisons: controlled.size, strategyPairedSeeds: strategies.size,
    offers, strategyDirection, sourceCPU, regression, timeline, groups: summary.groups,
    invariants: { ...summary.invariants, completeUniqueRecords: 'passed', quotedPaymentAccounting: 'passed',
        finiteSupportAccounting: 'passed', sourceBytesBeforeAfter: 'identical', compressedRawIdentity: 'passed' } };
writeFileSync(join(root, 'docs/qa/cultural-events/calibration-report-data.json'), JSON.stringify(data, null, 2) + '\n');
const show = value => Number.isInteger(value) ? String(value) : value.toFixed(4);
const groups = summary.groups.filter(group => group.phase === 'controlled');
const strategiesSummary = summary.groups.find(group => group.phase === 'strategy');
const heading = '| Weather | Seeds | Deaths none / one / two | Food paid none / one / two | One-minus-none deaths per campaign (95% interval) |';
const controlledRows = groups.map(group => {
    const effect = group.comparisons[0].deltas.residentDeaths;
    return `| ${group.weather} | ${group.pairedSeeds} | ${['none', 'one', 'two'].map(arm => group.arms[arm].totals.residentDeaths).join(' / ')} | ${['none', 'one', 'two'].map(arm => group.arms[arm].totals.foodPaid).join(' / ')} | ${show(effect.mean)} [${show(effect.lower95)}, ${show(effect.upper95)}] |`;
});
const strategyRows = ['none', 'one', 'two'].map(arm => {
    const totals = strategiesSummary.arms[arm].totals;
    return `| ${arm} | ${totals.foodPaid} | ${totals.gatherings} | ${totals.supportUsed} | ${offers[arm].finalUnusedSupport} | ${totals.residentDeaths} | ${totals.residentShortfall} | ${totals.population} |`;
});
const effect = strategiesSummary.comparisons[0].deltas.residentDeaths;
const weatherDifferent = strategiesSummary.comparisons.slice(0, 2).map(comparison => comparison.weatherDivergences);
const compressedBytes = raw.reduce((sum, artifact) => sum + artifact.gzipBytes, 0);
const markdown = `# Cultural gathering and weather-resilience calibration

Status: completed headless prototype measurement for #275/#276; no ordinary default activation.
The Core effect is real and bounded, but strategy superiority and player enjoyment are not established.

## Frozen source and protocol

Measurement HEAD: \`${manifest.head}\`, with the recorded local implementation changes.
The source freeze covers ${Object.keys(manifest.fingerprint.sources).length} actual dependency/config/runner files, with identical bytes before and after every phase.
Fingerprint: \`${manifest.fingerprint.id}\`.

- [Protocol](calibration-protocol.json): fixed before matrix execution; experimental 3 Food cost, 3-8 real adults, cap 2, 25% exposure-relative reduction.
- [Manifest](calibration-cultural-events-275-276-v1/manifest.json): actual source/rule/policy/runner hashes, dirty working-tree context, phase completion and raw hashes.
- [Summary](calibration-cultural-events-275-276-v1/summary.json): all arms, paired deltas and uncertainty.
- [Report data](calibration-report-data.json): independent artifact/hash/accounting checks and real event timelines.
- [Controlled raw JSONL, gzip](calibration-cultural-events-275-276-v1/controlled.jsonl.gz).
- [Strategy raw JSONL, gzip](calibration-cultural-events-275-276-v1/strategies.jsonl.gz).

All ${seen.size} unique cases completed. There were no technical failures, resource-limited cases or excluded adverse biological outcomes.
The 32-seed, ten-year strategy cohort contains 96 campaigns. Controlled cases resolve only one real annual boundary and must not be described as multi-decade campaigns.

## Controlled one-boundary results

The initial 100 seeds per adverse class produced 1 changed Harsh pair and 8 changed Severe pairs.
Both were below the predeclared 10 changed-pair precision threshold, so both expanded to seeds 1-1000 without coefficient, policy or seed selection changes.

${heading}
| --- | ---: | ---: | ---: | ---: |
${controlledRows.join('\n')}

These fixtures use real campaign creation, normal natural-mortality bands, actual quoted sponsorship commands and real annual resolution.
Only the weather distribution is forced and family/career changes are explicitly quiet. No Food is added to compensate sponsorship.
One gathering costs 3 Food; two cost 6. All paired cases share their actual initial state, outgoing weather, shelter and premortality RNG.
Support changes default Harsh exposure 50→38 bps and Severe 200→150 bps; natural age risk is unchanged.
All ${controlled.size} one-versus-two risk-input comparisons were identical: banking another contribution does not amplify the current assessment.

Harsh/Severe food production and consumption remain real. At 15 Food, forced Harsh starts already face shortages; paying for support increases unmet consumption.
This is an opportunity cost, not a new penalty for declining culture. A finite risk reduction does not provide shelter, Food or immunity.
Intervals describe the predeclared sequential-seed cohort and are exploratory; forced weather, shared generator structure and the passive management policy limit generalization.

## Complete-strategy results

The frozen QA domestic policy issues no occupation/building/slaughter/expedition/purchase commands.
Existing autonomous careers, family, care, social events, weather and CPU progression continue.
All arms start Summer 800 tick 500, use the current four-species Fjord livestock rules, and run ten canonical years.
The modest arm buys one only when its bank is empty; the heavy arm refills to cap, both retaining at least 12 Food after payment.
That reserve is QA policy, not a gameplay eligibility restriction. All 32 starts in both intervention arms could make one actual 3 Food purchase from 15 Food.

| Strategy | Food paid | Gatherings | Assessments used | Still prepared at end | Resident deaths | Resident Food shortfall | Final population sum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${strategyRows.join('\n')}

One-minus-none death difference: ${show(effect.mean)} per campaign, approximate 95% paired interval [${show(effect.lower95)}, ${show(effect.upper95)}], which includes zero.
The modest policy had ${strategyDirection.one.fewerDeaths} seeds with fewer deaths, ${strategyDirection.one.moreDeaths} with more and ${strategyDirection.one.sameDeaths} unchanged. The heavy policy had ${strategyDirection.two.fewerDeaths}, ${strategyDirection.two.moreDeaths} and ${strategyDirection.two.sameDeaths}, respectively.
Those directions do not establish an isolated cohesion effect: realized weather diverged in ${weatherDifferent[0]}/32 and ${weatherDifferent[1]}/32 comparisons against no spending.
Real Food opportunity costs can alter fertility/career draw consumption even before a prevented death; later deaths/families further diverge the shared RNG.
The mean-death improvement is therefore an exploratory complete-strategy result, not proof of causal superiority or universally lower mortality.

Heavy sponsorship paid 90 extra Food for only 2 extra used assessments, leaving 51 prepared versus 23 under modest sponsorship.
It produced no additional observed mortality improvement in this cohort. Do not infer zero uncertainty from that equality; the summary retains Wilson intervals for rare outcome changes.
Final population, shortages and reserves remain separate outcomes, not substitutes for one another.

## CPU and factual event evidence

CPU trajectories were byte-identical across all matched strategy arms for every seed, and no CPU received free sponsorship.
The headless factory contains independently stepped graph targets: this is not a physical-reachability or one-island-rival mission study.
Across the ${sourceCPU.replicatedClanInstances} replicated CPU-clan instances, final population summed ${sourceCPU.finalPopulation}; final Food ${sourceCPU.finalFood}, final Materials ${sourceCPU.finalMaterials}.
Their annual stocks/economy/weather and canonical state hashes remain in raw records.

A controlled regression in the predeclared seed 1 Severe case records Aodhín (founder-7), age 33: baseline total 205 bps and an actual death; a real 3 Food sponsorship yields 155 bps and survival in its paired run.
No Saved/Averted event is created. This is an observer comparison, not a claim made by the clan's history.

The first qualifying strategy timeline is seed ${timeline.seed}, arm ${timeline.arm}: actual gathering \`${timeline.held.id}\` at Winter ${timeline.held.time.winter}, tick ${timeline.held.time.tick}, paid ${timeline.held.details.foodCost} Food;
actual support assessment \`${timeline.applied.id}\` at Winter ${timeline.applied.time.winter}, tick ${timeline.applied.time.tick}, citing that genuine source event.
The report data preserves actual attendees and risk inputs. Selection was by the first numeric seed with a real assessment, not a favourable death.

## Reproduction and retained evidence

Run from the pinned working source and locked Node 24/pnpm 10 dependencies:

~~~text
node --test tests/cultural-calibration.test.mjs
node scripts/qa/cultural-events-study.mjs freeze
node scripts/qa/cultural-events-study.mjs controlled
node scripts/qa/cultural-events-study.mjs pilot
node scripts/qa/cultural-events-study.mjs full
node scripts/qa/cultural-events-study.mjs expand
node scripts/qa/cultural-events-report.mjs
~~~

A fresh checkout of these delivery artifacts can restore exact JSONL first:

~~~text
node scripts/qa/cultural-events-report.mjs --restore-raw
node scripts/qa/cultural-events-study.mjs summary
~~~

Raw gzip delivery files total ${(compressedBytes / 1048576).toFixed(2)} MiB. Expanded bytes, SHA-256, gzip SHA-256 and record counts are in the report data.
Original plain JSONL remains intact locally on D: and is excluded from Git; decompression is verified against the original raw hashes.
Completed cases are checkpointed and skipped on resume with the identical fingerprint. The pilot includes a complete deterministic repeat and all cases include a canonical save/load roundtrip.
A different source/runner/protocol is rejected instead of mixing datasets; record a new study version if later changes are measured.
Hashes identify actual working bytes, including line endings. The [exact source snapshot](calibration-cultural-events-275-276-v1/sources.json.gz) preserves all 64 measured source/config/runner files without Git line-ending normalization; [snapshot metadata](calibration-cultural-events-275-276-v1/sources-metadata.json) records every file hash and both archive/expanded hashes.

Verify the archive without changing the working tree:

~~~text
node scripts/qa/cultural-events-sources.mjs
~~~

To reconstruct those exact bytes, explicitly extract into a new or empty absolute directory:

~~~text
node scripts/qa/cultural-events-sources.mjs --extract D:/CodexSites/Pillagers/scratch/cultural-events-reproduction-274
~~~

The helper validates all 64 paths, sizes and SHA-256 hashes before extraction; it bounds compressed/expanded memory, refuses nonempty targets, traversal, symlink ancestors and overwrites, then verifies the written files. Manual verification extracted 64/64 exact matches into an isolated D: scratch directory, independently rechecked with PowerShell Get-FileHash. Existing-directory and relative-target attempts were rejected without changing extracted bytes.
The snapshot contains measured headless inputs, not node_modules, source artwork or a second complete graphical game checkout. Install its locked dependencies with pnpm 10 on Node 24 before running the measurement commands from that extracted directory; this creates separate fresh evidence rather than modifying the delivered results. Use the delivery checkout for its report/raw restoration commands and tests. A different source, dependency or protocol still requires a separately recorded freeze.

## Recommendation and limits

Keep the mechanic as an explicitly labelled prototype. The controlled study proves an actual bounded exposure-risk benefit and correct non-stacking, not that three Food is always a good purchase at a 15 Food start.
The ten-year cohort does not justify making heavy sponsorship the default advice: its extra bank was mostly unused and the paired mortality interval does not establish strategy superiority.
Review the cost/clarity and owner-playtest the voluntary choice before ordinary rollout; do not silently change the approved experimental coefficients based on these data.

No new markets, Food grants, mortality/fertility buffs, weather rerolls, CPU bonuses or offensive raid effects were introduced for this study.
Browser rendering, listening, touch usability, sustained device memory/frame performance and play enjoyment remain unverified by this headless evidence.
`;
writeFileSync(join(root, 'docs/qa/cultural-events/calibration-report.md'), markdown);
console.log(JSON.stringify({ cases: seen.size, raw: raw.map(({ name, records, uncompressedBytes, gzipBytes }) =>
    ({ name, records, uncompressedBytes, gzipBytes })), dependencyFiles: data.dependencyFilesVerified,
    fingerprint: data.fingerprint }));
