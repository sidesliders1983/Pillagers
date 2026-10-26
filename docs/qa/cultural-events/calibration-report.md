# Cultural gathering and weather-resilience calibration

Status: completed headless prototype measurement for #275/#276; no ordinary default activation.
The Core effect is real and bounded, but strategy superiority and player enjoyment are not established.

## Frozen source and protocol

Measurement HEAD: `85301306b57b26656f36df72badd6dec846e0a75`, with the recorded local implementation changes.
The source freeze covers 64 actual dependency/config/runner files, with identical bytes before and after every phase.
Fingerprint: `8ae7e8e7e0d5990fc597d6cb1bfbc64fdc8b2ee4e5ac30bdbf6d9986f73042f3`.

- [Protocol](calibration-protocol.json): fixed before matrix execution; experimental 3 Food cost, 3-8 real adults, cap 2, 25% exposure-relative reduction.
- [Manifest](calibration-cultural-events-275-276-v1/manifest.json): actual source/rule/policy/runner hashes, dirty working-tree context, phase completion and raw hashes.
- [Summary](calibration-cultural-events-275-276-v1/summary.json): all arms, paired deltas and uncertainty.
- [Report data](calibration-report-data.json): independent artifact/hash/accounting checks and real event timelines.
- [Controlled raw JSONL, gzip](calibration-cultural-events-275-276-v1/controlled.jsonl.gz).
- [Strategy raw JSONL, gzip](calibration-cultural-events-275-276-v1/strategies.jsonl.gz).

All 6096 unique cases completed. There were no technical failures, resource-limited cases or excluded adverse biological outcomes.
The 32-seed, ten-year strategy cohort contains 96 campaigns. Controlled cases resolve only one real annual boundary and must not be described as multi-decade campaigns.

## Controlled one-boundary results

The initial 100 seeds per adverse class produced 1 changed Harsh pair and 8 changed Severe pairs.
Both were below the predeclared 10 changed-pair precision threshold, so both expanded to seeds 1-1000 without coefficient, policy or seed selection changes.

| Weather | Seeds | Deaths none / one / two | Food paid none / one / two | One-minus-none deaths per campaign (95% interval) |
| --- | ---: | ---: | ---: | ---: |
| Harsh | 1000 | 66 / 55 / 55 | 0 / 3000 / 6000 | -0.0110 [-0.0175, -0.0045] |
| Severe | 1000 | 213 / 146 / 146 | 0 / 3000 / 6000 | -0.0670 [-0.0832, -0.0508] |

These fixtures use real campaign creation, normal natural-mortality bands, actual quoted sponsorship commands and real annual resolution.
Only the weather distribution is forced and family/career changes are explicitly quiet. No Food is added to compensate sponsorship.
One gathering costs 3 Food; two cost 6. All paired cases share their actual initial state, outgoing weather, shelter and premortality RNG.
Support changes default Harsh exposure 50→38 bps and Severe 200→150 bps; natural age risk is unchanged.
All 2000 one-versus-two risk-input comparisons were identical: banking another contribution does not amplify the current assessment.

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
| none | 0 | 0 | 0 | 0 | 8 | 1188 | 364 |
| one | 216 | 72 | 49 | 23 | 5 | 1008 | 361 |
| two | 306 | 102 | 51 | 51 | 5 | 1133 | 363 |

One-minus-none death difference: -0.0938 per campaign, approximate 95% paired interval [-0.2551, 0.0676], which includes zero.
The modest policy had 3 seeds with fewer deaths, 1 with more and 28 unchanged. The heavy policy had 3, 1 and 28, respectively.
Those directions do not establish an isolated cohesion effect: realized weather diverged in 22/32 and 26/32 comparisons against no spending.
Real Food opportunity costs can alter fertility/career draw consumption even before a prevented death; later deaths/families further diverge the shared RNG.
The mean-death improvement is therefore an exploratory complete-strategy result, not proof of causal superiority or universally lower mortality.

Heavy sponsorship paid 90 extra Food for only 2 extra used assessments, leaving 51 prepared versus 23 under modest sponsorship.
It produced no additional observed mortality improvement in this cohort. Do not infer zero uncertainty from that equality; the summary retains Wilson intervals for rare outcome changes.
Final population, shortages and reserves remain separate outcomes, not substitutes for one another.

## CPU and factual event evidence

CPU trajectories were byte-identical across all matched strategy arms for every seed, and no CPU received free sponsorship.
The headless factory contains independently stepped graph targets: this is not a physical-reachability or one-island-rival mission study.
Across the 87 replicated CPU-clan instances, final population summed 996; final Food 3158, final Materials 2643.
Their annual stocks/economy/weather and canonical state hashes remain in raw records.

A controlled regression in the predeclared seed 1 Severe case records Aodhín (founder-7), age 33: baseline total 205 bps and an actual death; a real 3 Food sponsorship yields 155 bps and survival in its paired run.
No Saved/Averted event is created. This is an observer comparison, not a claim made by the clan's history.

The first qualifying strategy timeline is seed 1, arm one: actual gathering `event-6` at Winter 800, tick 500, paid 3 Food;
actual support assessment `event-95` at Winter 803, tick 0, citing that genuine source event.
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

Raw gzip delivery files total 2.56 MiB. Expanded bytes, SHA-256, gzip SHA-256 and record counts are in the report data.
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
