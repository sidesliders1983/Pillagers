# Occupation aptitude v0.3 — measured calibration experiment (#78)

Production scoring, canonical CharacterDNA, saved configuration and defaults remain unchanged. This is a headless measurement slice; it adds no Gameplay Lab controls.

## Reproduce and inspect

Source baseline: `9fbf85074053160611a15077030c9b98bb25cc23`. Node: `v24.19.0`. Seeds 0–99; 1000 actual generated founders; 25 Winters per economy run. Four mappings × two prepared policies plus passive control = 900 matched campaigns. All ten occupations are scored, including six inactive roles.

```powershell
pnpm install --frozen-lockfile
node scripts/qa/run-aptitude-calibration.mjs --output artifacts/occupation-aptitude-v03 --workers 4
node scripts/qa/aptitude-replay.mjs artifacts/occupation-aptitude-v03
node scripts/qa/render-aptitude-report.mjs artifacts/occupation-aptitude-v03
node --test tests/aptitude-calibration.test.mjs
```

Use fewer workers on a busy laptop; worker count changes execution scheduling, not measurements. Measurement runtime is not a gameplay performance gate.

[Manifest](manifest.json) records source, mapping, harness and compressed artifact SHA-256 fingerprints, exact mechanics/landing/weather configuration, runtime, seeds and replay coverage. [Summary](summary.json) contains all percentiles, rank orders, correlations, paired seed deltas and annual stock/population trajectories. [Founders](founders.json.gz) and [descendants](descendants.json.gz) contain raw traits, cultural names, IDs and all ten integer aptitude values. Each `runs/seed-N.json.gz` contains all nine scenarios, accepted/rejected public commands, annual stocks/flows, real work inspections, final state hashes and verification records. Gzip JSON can be read with Node's built-in `gunzipSync`; no external data service is required.

All aptitude distribution values in JSON are **basis points** (100 = one percentage point), not resource units. Percentiles use linear interpolation between sorted observations; standard deviation divides by N. No confidence interval or population-wide demographic claim is implied by this fixed seed cohort.

## Why the current scores cluster

The issue's weighted closeness expression is followed by a **15% floor + 85% slope** in Mechanics.ts: `round((0.15 + 0.85 × Σ wᵢ(1 − |tᵢ − pᵢ|)) × 10000)`. The weights sum to one. The nominal 15% floor is not reachable for current preference vectors: every closeness term has a positive worst case. Analytic reachable minima are 33.91–46.45%, depending on role.

Founders use the real rounded-uniform trait generator (hundredths, with half-probability endpoints), not Character Lab's default DNA or its separate six-role display. Theoretical role means under that generator are about 71.49–77.14%. Weighted averaging, the extra floor and mostly overlapping preference vectors compress scores. Default DNA is near many preferred values and would bias a sample upward.

Innate scores are solely derived from the five existing traits. Heritage, sex, appearance and a person's name are excluded from scoring. There are no new aptitude genes or gender-based allocation restrictions. Effective productivity additionally includes tents, age, childcare, career switching, specialisation/upgrades, apprenticeship and weather. Inactive roles can have excellent aptitude and still produce zero.

## Founder distributions

Each table reports percentages; σ measures across-Persona variation within that role.

### control

Canonical 15% floor + 85% weighted closeness

| Occupation | Min | Max | Mean | Median | P10 | P25 | P75 | P90 | σ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 53.00 | 95.67 | 76.33 | 76.69 | 66.13 | 71.05 | 82.24 | 86.23 | 7.82 |
| herder | 56.40 | 97.45 | 77.40 | 77.82 | 68.21 | 72.72 | 82.15 | 86.06 | 6.80 |
| fisher | 47.94 | 94.65 | 74.55 | 75.05 | 62.05 | 68.16 | 81.01 | 86.23 | 9.05 |
| hunter | 45.77 | 96.98 | 73.39 | 73.57 | 60.01 | 66.45 | 81.15 | 85.98 | 9.83 |
| textileWorker | 46.83 | 94.39 | 73.50 | 73.71 | 60.86 | 66.93 | 80.33 | 85.34 | 9.35 |
| smith | 44.83 | 96.90 | 72.76 | 73.18 | 58.28 | 65.10 | 81.09 | 86.61 | 10.43 |
| woodworker | 47.77 | 97.58 | 74.04 | 74.33 | 62.30 | 67.95 | 80.75 | 85.17 | 8.82 |
| boatbuilder | 42.75 | 95.41 | 71.66 | 71.66 | 57.58 | 63.79 | 79.95 | 85.72 | 10.70 |
| trader | 42.28 | 97.28 | 71.53 | 71.63 | 57.31 | 64.30 | 79.47 | 85.04 | 10.41 |
| leatherAndJewelleryMaker | 45.56 | 95.71 | 72.12 | 72.33 | 59.37 | 65.44 | 79.36 | 85.04 | 9.87 |

### expanded

Common 2.5x expansion around 75%, bounded to 15–125%

| Occupation | Min | Max | Mean | Median | P10 | P25 | P75 | P90 | σ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 20.00 | 125.00 | 78.34 | 79.23 | 52.82 | 65.13 | 93.10 | 103.09 | 19.55 |
| herder | 28.50 | 125.00 | 80.99 | 82.05 | 58.03 | 69.30 | 92.88 | 102.65 | 16.98 |
| fisher | 15.00 | 124.13 | 73.91 | 75.13 | 42.63 | 57.91 | 90.03 | 103.08 | 22.55 |
| hunter | 15.00 | 125.00 | 71.04 | 71.43 | 37.53 | 53.62 | 90.38 | 102.46 | 24.43 |
| textileWorker | 15.00 | 123.48 | 71.28 | 71.78 | 39.65 | 54.82 | 88.33 | 100.86 | 23.28 |
| smith | 15.00 | 125.00 | 69.47 | 70.45 | 33.22 | 50.26 | 90.23 | 104.04 | 25.89 |
| woodworker | 15.00 | 125.00 | 72.62 | 73.33 | 43.25 | 57.37 | 89.38 | 100.43 | 21.97 |
| boatbuilder | 15.00 | 125.00 | 66.83 | 66.64 | 31.45 | 46.98 | 87.38 | 101.80 | 26.38 |
| trader | 15.00 | 125.00 | 66.48 | 66.58 | 30.79 | 48.25 | 86.18 | 100.11 | 25.65 |
| leatherAndJewelleryMaker | 15.00 | 125.00 | 67.89 | 68.33 | 35.92 | 51.10 | 85.91 | 100.11 | 24.45 |

### quadratic

Squared per-trait closeness, gain 1.7; centered at canonical expected role mean

| Occupation | Min | Max | Mean | Median | P10 | P25 | P75 | P90 | σ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 20.03 | 125.00 | 76.99 | 77.39 | 49.40 | 61.87 | 92.02 | 105.10 | 21.22 |
| herder | 24.71 | 125.00 | 77.83 | 78.06 | 53.22 | 64.43 | 90.78 | 102.80 | 18.92 |
| fisher | 15.00 | 125.00 | 74.92 | 75.19 | 44.21 | 57.76 | 91.40 | 105.75 | 23.40 |
| hunter | 15.00 | 125.00 | 73.48 | 72.47 | 40.64 | 55.60 | 92.26 | 106.22 | 24.71 |
| textileWorker | 15.00 | 125.00 | 73.19 | 73.09 | 41.45 | 57.23 | 90.22 | 105.40 | 23.85 |
| smith | 16.90 | 125.00 | 73.12 | 72.32 | 39.01 | 53.83 | 94.18 | 109.38 | 25.82 |
| woodworker | 15.00 | 125.00 | 74.30 | 74.00 | 45.33 | 58.11 | 91.08 | 103.47 | 22.67 |
| boatbuilder | 15.00 | 125.00 | 71.96 | 70.64 | 39.24 | 52.61 | 90.91 | 107.99 | 25.73 |
| trader | 15.00 | 125.00 | 71.15 | 71.35 | 36.20 | 52.49 | 90.31 | 105.62 | 25.66 |
| leatherAndJewelleryMaker | 15.00 | 125.00 | 71.82 | 71.77 | 39.79 | 53.68 | 88.56 | 104.92 | 24.34 |

### contrast

Squared normalized weights; preferences stretched 2x around 0.5; centered at canonical expected role mean

| Occupation | Min | Max | Mean | Median | P10 | P25 | P75 | P90 | σ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| farmer | 45.55 | 105.09 | 76.29 | 76.42 | 60.52 | 67.94 | 85.12 | 91.56 | 11.71 |
| herder | 50.71 | 101.21 | 77.46 | 77.52 | 63.09 | 69.28 | 86.14 | 91.93 | 10.73 |
| fisher | 38.72 | 106.93 | 74.32 | 74.56 | 55.83 | 64.17 | 84.45 | 92.66 | 13.78 |
| hunter | 38.09 | 107.74 | 73.10 | 72.48 | 54.59 | 62.91 | 83.61 | 92.38 | 14.16 |
| textileWorker | 40.00 | 110.46 | 73.38 | 72.86 | 55.46 | 63.66 | 83.48 | 92.72 | 14.06 |
| smith | 37.49 | 106.48 | 72.73 | 72.41 | 52.14 | 60.26 | 85.19 | 93.42 | 15.24 |
| woodworker | 40.54 | 109.10 | 73.90 | 73.56 | 57.59 | 65.14 | 82.39 | 91.29 | 12.78 |
| boatbuilder | 35.89 | 108.17 | 71.49 | 71.24 | 51.30 | 58.73 | 83.71 | 91.82 | 15.67 |
| trader | 34.43 | 105.85 | 71.50 | 71.64 | 52.24 | 61.06 | 81.63 | 91.30 | 14.32 |
| leatherAndJewelleryMaker | 38.95 | 108.87 | 72.00 | 71.31 | 53.01 | 61.93 | 82.30 | 91.65 | 14.36 |

## Within-Persona identity and exceptional generalists

Exploratory labels: **high ≥90%**, **low ≤60%**, **exceptional ≥110%**; generalist has minimum ≥70% and best–worst gap ≤15 points; specialist has maximum ≥90%, minimum ≤60% and gap ≥25 points; poor fit has maximum <70%; all others are mixed. These disjoint labels are comparison tools, not proposed gameplay thresholds. Per-person high/low counts, ordered roles and all gap percentiles remain in the raw summary.

| Model | Median best–worst gap (points) | Median top-two gap (points) | Generalists | Specialists | Poor fit | All ten ≥90% | Upper/lower cap scores | Best role differs from control |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| control | 19.76 | 2.34 | 109 | 1 | 43 | 0 | 0/0 | 0 |
| expanded | 49.00 | 5.85 | 1 | 402 | 84 | 24 | 14/103 | 1 |
| quadratic | 49.18 | 6.91 | 0 | 425 | 80 | 21 | 135/19 | 153 |
| contrast | 29.54 | 3.69 | 24 | 157 | 55 | 3 | 0/0 | 302 |

A shared increasing expansion preserves strict role ordering. Any changed top label in expanded comes from a new clamp/rounding tie and the documented role-list tie breaker. It increases the visible gap without creating new underlying occupational preferences. Its fixed 75% center also moves role means unequally; it is not mean-neutral.

Quadratic squares each individual closeness, then centers the score around the canonical role's exact rounded-uniform expectation with gain 1.7. Contrast squares/normalizes role weights, stretches preferences 2× around 0.5 with 0–1 bounds, then uses the canonical expected role mean and 0.85 slope. Both candidates have explicit 15–125% bounds. Centering preserves the theoretical mean **before rounding/clamping for that generator**, not necessarily production, offspring means or a finite cohort's mean.

### Role overlap and dominant profiles

| Model | Textile/leather correlation | Woodworker/boatbuilder correlation | Smith/trader correlation | Most frequent best role |
| --- | --- | --- | --- | --- |
| control | 0.98 | 0.93 | 0.22 | herder (215) |
| expanded | 0.98 | 0.93 | 0.22 | herder (214) |
| quadratic | 0.97 | 0.93 | 0.20 | herder (179) |
| contrast | 0.99 | 0.93 | 0.18 | herder (230) |

All off-diagonal baseline role correlations are positive. Contrast still leaves textile/leather almost interchangeable; squaring similar weights can even strengthen their correlation. Existing vector overlap remains a limitation, despite wider distributions. The full 10×10 matrices and five trait-to-role matrices are in summary.json. The strongest baseline trait/role associations are intelligence–boatbuilder (r=0.84) and physicality–smith (r=0.82). Contrast strengthens them to about 0.92; this is a role-specific dominant-trait risk, not evidence that every trait becomes equally informative. It also makes temperament–herder strongly negative (about −0.86). Preference stretching alone therefore does not resolve the single-trait safeguard. No single shared productivity gene was introduced.

Only 65/1000 original assignments match the best of all ten roles under the stable rank tie breaker. 250/1000 are tied for best among the **four productive roles**. Median missed aptitude vs all-role best is 8.27 points. Reassigning to a non-producing best role is not an economic gain. Even among productive roles, material quotas, childcare and household functions constrain allocation.

## Representative Personas and counterexamples

Examples below use observed real founders. Each row shows its own model; the complete score/rank vector is retained in raw data. A missing category is explicitly absent, not manufactured.

| Model | Label | Persona | Best | Worst | Top-two gap |
| --- | --- | --- | --- | --- | --- |
| control | generalist | Máhte (seed 0, founder-4) | boatbuilder 93.92% | textileWorker 84.06% | 3.48 points |
| control | specialist | Ingfrid Olafsdóttir (seed 45, founder-6) | smith 91.29% | hunter 58.18% | 12.67 points |
| control | poorFit | Máhte (seed 0, founder-3) | herder 69.23% | boatbuilder 51.76% | 4.38 points |
| expanded | generalist | Æthelburh (seed 39, founder-5) | textileWorker 104.15% | trader 90.65% | 0.12 points |
| expanded | specialist | Mingirdas (seed 0, founder-1) | trader 97.13% | fisher 59.20% | 12.33 points |
| expanded | poorFit | Máhte (seed 0, founder-3) | herder 60.58% | boatbuilder 16.90% | 10.95 points |
| expanded | universally high counterexample | Máhte (seed 0, founder-4) | 122.30% | 97.65% | 8.70 points |
| quadratic | generalist | none in this cohort | — | — | — |
| quadratic | specialist | Mingirdas (seed 0, founder-1) | trader 100.78% | fisher 55.98% | 10.80 points |
| quadratic | poorFit | Máhte (seed 0, founder-3) | herder 54.40% | boatbuilder 23.48% | 7.75 points |
| quadratic | universally high counterexample | Máhte (seed 0, founder-4) | 125.00% | 98.09% | 6.01 points |
| contrast | generalist | Mieli (seed 2, founder-10) | boatbuilder 88.91% | hunter 74.81% | 1.02 points |
| contrast | specialist | Áila (seed 3, founder-5) | hunter 93.51% | smith 59.45% | 0.64 points |
| contrast | poorFit | Máhte (seed 0, founder-3) | herder 63.46% | smith 45.86% | 0.67 points |
| contrast | universally high counterexample | Dervla (seed 27, founder-1) | 106.03% | 90.39% | 0.92 points |

## Descendants and inheritance

The descendant cohort consists of all actually born records, including later deaths, from **control/aware only** at Winter 825. It is frozen and rescored with each model; candidate-specific survivors are not mixed into the comparison. Founders and descendants have separate distributions. These children are related observations from a prepared economy and not independent uniform samples.

Canonical inheritance takes the parental mean per trait, with 25% chance to copy one parent's value instead; it adds no trait mutation. Under independent, equal-variance parents its one-generation variance ratio is 0.625. Real pairing and selection violate those assumptions, so the measured cohort is the evidence here. Mean-centered candidate formulas derived from founders can drift upward for offspring concentrating near common preferred values.

| Model | Observed descendants | Median best–worst gap | Median top-two gap | Generalists | Specialists | All ten ≥90% |
| --- | --- | --- | --- | --- | --- | --- |
| control | 655 | 17.28 | 1.83 | 134 | 0 | 0 |
| expanded | 655 | 43.15 | 4.58 | 1 | 215 | 27 |
| quadratic | 655 | 43.23 | 5.39 | 0 | 215 | 28 |
| contrast | 655 | 23.26 | 2.60 | 56 | 22 | 0 |

Observed trait means and standard deviations:

| Trait | Founder mean | Founder σ | Descendant mean | Descendant σ |
| --- | --- | --- | --- | --- |
| physicality | 0.51 | 0.28 | 0.50 | 0.22 |
| agility | 0.49 | 0.29 | 0.51 | 0.22 |
| intelligence | 0.50 | 0.29 | 0.49 | 0.23 |
| cunning | 0.50 | 0.29 | 0.48 | 0.23 |
| temperament | 0.49 | 0.29 | 0.50 | 0.23 |

## Matched economy policy

- **Default/control:** unchanged founder assignment, career autonomy, no player housing/cattle commands; no salvaging.
- **Random/prepared:** seed-stable person ordering, approximately one-quarter of eligible workers allocated to woodworker; one farmer guaranteed if there are Food workers, the rest receive a seeded farmer/fisher/hunter assignment. No preference-based worker selection.
- **Aware/prepared:** identical quotas and player actions, woodworkers chosen by woodworker aptitude minus best Food aptitude; guaranteed farmer chosen by farmer aptitude minus best Food aptitude; remaining workers take their best Food role. Ties use fixed role order and stable IDs. This is a deterministic greedy heuristic, not a proven globally optimal allocation.

Prepared policies are reviewed every Winter. Living people aged ≥16 and not currently providing childcare are considered, independent of sex. Assigned roles are player-locked; role changes trigger the canonical switch penalty. Identical shared preparation salvages the ship at Winter 800, prioritizes farmer/Food households for houses, keeps a reserve of two Winters of occupied upkeep + 2 Materials, specializes houses using working members, assigns exposed cattle into active Farmyards below the soft cap, and upgrades only once living households all have houses and reserve funds remain. Births, partnerships, farmyard conversion/deactivation, upkeep/collapse, mortality and weather use the current real engine. No forced slaughter or expeditions.

The full current world extension is omitted for the bulk domestic measurement to avoid simulating unrelated CPU settlements. Public Landing.createCampaign and Weather.initializeWeather generate the settlement; every intervention/time advance uses public Simulation Core commands. Full-world vs domestic equivalence is checked on 4 listed seeds over 25 Winters, including annual rows and final domestic state hashes. No result claims expedition or CPU-clan effects.

All nine scenarios per seed start with the same founder/configuration/stock/RNG fingerprint. Different decisions can subsequently change births, exposure, RNG consumption and weather histories. Paired outcomes therefore measure the whole policy+mapping trajectory, not a fixed-weather laboratory multiplier. Compare models within the same prepared policy; compare random/aware within the same model. Default vs prepared also changes investment and autonomy, so that difference cannot be attributed only to fit.

| Model / policy | Mean final Food | Mean final Materials | Mean final people | Mean total Food produced | Mean total Materials produced | Seeds with shortage | Mean shortage Winters | Mean total unmet Food | Mean role changes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| control/default | 35.22 | 78.69 | 12.60 | 829.64 | 121.11 | 89/100 | 5.42 | 156.49 | 2.67 |
| control/random | 251.99 | 14.35 | 15.76 | 1036.91 | 125.35 | 40/100 | 1.16 | 28.01 | 18.42 |
| control/aware | 344.95 | 15.79 | 15.45 | 1097.39 | 136.82 | 36/100 | 0.93 | 23.47 | 15.74 |
| expanded/random | 242.82 | 13.80 | 15.60 | 1030.06 | 124.15 | 43/100 | 1.17 | 25.88 | 18.63 |
| expanded/aware | 447.07 | 17.38 | 15.79 | 1208.18 | 154.97 | 31/100 | 0.83 | 21.03 | 16.01 |
| quadratic/random | 240.50 | 13.39 | 15.58 | 1020.12 | 125.63 | 44/100 | 1.41 | 32.01 | 18.77 |
| quadratic/aware | 463.70 | 16.95 | 16.05 | 1234.52 | 158.18 | 30/100 | 0.71 | 17.45 | 16.04 |
| contrast/random | 242.04 | 13.35 | 15.77 | 1027.24 | 127.68 | 41/100 | 1.27 | 30.33 | 18.50 |
| contrast/aware | 382.09 | 15.70 | 15.85 | 1149.50 | 142.33 | 27/100 | 0.61 | 14.10 | 15.84 |

Mean paired **aware minus random** differences for the same seed and model:

| Model | Final Food | Final Materials | Total Food production | Unmet Food |
| --- | --- | --- | --- | --- |
| control | 92.96 | 1.44 | 60.48 | -4.54 |
| expanded | 204.25 | 3.58 | 178.12 | -4.85 |
| quadratic | 223.20 | 3.56 | 214.40 | -14.56 |
| contrast | 140.05 | 2.35 | 122.26 | -16.23 |

Matched candidate minus control differences, with the same prepared policy (seed-level deltas and full distributions are preserved):

| Candidate / policy | Mean final Food Δ | P10 / P90 final Food Δ | Mean Materials Δ | Mean population Δ | Mean unmet Food Δ |
| --- | --- | --- | --- | --- | --- |
| expanded/random | -9.17 | -138.60 / 128.20 | -0.55 | -0.16 | -2.13 |
| expanded/aware | 102.12 | -64.30 / 248.60 | 1.59 | 0.34 | -2.44 |
| quadratic/random | -11.49 | -161.60 / 115.00 | -0.96 | -0.18 | 4.00 |
| quadratic/aware | 118.75 | -93.50 / 322.00 | 1.16 | 0.60 | -6.02 |
| contrast/random | -9.95 | -91.10 / 63.50 | -1.00 | 0.01 | 2.32 |
| contrast/aware | 37.14 | -115.60 / 226.40 | -0.09 | 0.40 | -9.37 |

Housing and family outcomes (means):

| Model / policy | Final houses | Final upgrade levels (sum) | Births | Deaths | Longest shortage streak |
| --- | --- | --- | --- | --- | --- |
| control/default | 1.83 | 0.00 | 3.73 | 1.13 | 2.65 |
| control/random | 4.76 | 0.71 | 6.66 | 0.90 | 0.69 |
| control/aware | 5.05 | 1.01 | 6.55 | 1.10 | 0.60 |
| expanded/random | 4.66 | 0.82 | 6.51 | 0.91 | 0.71 |
| expanded/aware | 5.15 | 1.95 | 6.81 | 1.02 | 0.52 |
| quadratic/random | 4.67 | 0.88 | 6.52 | 0.94 | 0.76 |
| quadratic/aware | 5.21 | 2.07 | 7.04 | 0.99 | 0.42 |
| contrast/random | 4.81 | 0.90 | 6.69 | 0.92 | 0.72 |
| contrast/aware | 5.11 | 1.36 | 6.86 | 1.01 | 0.38 |

Raw annual records additionally include Materials upkeep, farmyard counts, cattle/exposure, separate resident/cattle Food, accepted specialization commands, workers' innate/effective BPS, stocks and RNG. Role-change counts exclude commands that merely lock the same existing role. Stocks remain nonnegative safe integers; each annual record asserts Food conservation against actual event output and actual consumption. Unmet consumption is recorded separately and is not subtracted a second time. Work progression and unit emission use unchanged integer/fixed-point engine calculations.

The current **Harsh** profile stops Food and Materials production and raises human/cattle consumption by 50%. **Severe** has its separate current 50% Food output / triple adult-cattle multiplier; it is not renamed or substituted. Natural mortality and cattle reproduction/mortality/soft-cap effects are enabled. Food shortage is not itself a lethal mechanic in this version, so positive population is not proof of food resilience.

## Recommendation and #77 interaction

Keep the canonical model unchanged. **Advance contrast as a limited profile-design follow-up**, with targeted differentiation of near-duplicate role vectors and a deliberate production calibration; do not approve it as balance from this run. It produces substantially more specialists with fewer universally high founders than the aggressive models, while measured role means stay close to control. It still creates a few universally high people, leaves major role correlations and barely gives woodworker unique best-role identity.

Expanded is useful as a percentage-sensitivity experiment, but cannot add strict role-ranking identity and creates excessive global highs/lows. Quadratic gives larger top-two choices but also saturation, globally excellent Personas and stronger output selection gains. Preserving a generator's mean does not preserve production: an aware allocation selects the upper tail, houses amplify it, and inherited traits change the distribution. The measured prepared stock and shortage tables must accompany any future balance proposal.

#77 has no completed spoilage/capacity evidence included here. The observed stocks have **no experimental spoilage or storage diminishing returns**. Larger aware surpluses could be reduced by #77's spoilage/capacity variants; earlier scarcity could also be intensified before housing or cattle shelter. A combined follow-up must run the same seeds/policies against #77's matrix, retain both paired deltas and shortage streaks, and avoid stacking a second Harsh-consumption modifier. The #77 proposal's Severe/Harsh wording should be reconciled against the explicit configuration above before its experiments. These are coordination requirements, not effects measured by this run.

## Saves, replay and validation

Current mechanics version 2 saves role vectors and work progress but do not store an aptitude-formula identifier. A global formula replacement would change continuation, production thresholds, autonomous switching and subsequent random draws for old saves despite unchanged DNA. It cannot be safely shipped as a silent code update.

Candidate executions use an isolated QA compiler compartment replacing only the reviewed scoring function body. It fails closed if that canonical body changes. No production file or schema is changed; control uses the existing unchanged loader. Candidate saves are canonical validated saves inside an explicit experiment envelope with model/source/mapping identity; loading through a different identity is rejected. These are experiment-only saves, never a new application save format. A separate [partial-work replay proof](partial-replay.json) checks all four models at tick 500 of seed 32, recording nonzero integer work progress and equal continued/restored final hashes. Its dedicated public harness also rejects restoring under a different model identity. Existing full work progress and RNG are serialized by the real core; no derived aptitudes are persisted as canonical truth.

36 repeated scenario runs on seeds 0, 7, 32, 99 match the original complete outputs after mid-horizon save/load; 4 full-world comparisons agree. This is the exact verification subset; the other seeds are not claimed to have been repeated. Public harness tests independently compare real founders, mapped work, known percentile/correlation fixtures, matching allocation runs, save/load, generated artifacts and the actual CLI.

A future production change requires a separately reviewed versioned scoring identity/configuration, legacy formula retention for old saves, and explicit replay/migration coverage. Preserve unrelated DNA/naming and integer work history.
