# Economy Calibration v0.1

**Recommendation: trial 7 Food/Winter for farmer, fisher and hunter in the next Gameplay Lab iteration.** This batch measures the current simulator; it does not change its defaults or establish final balance.

## Reproduction and policy

Run against main commit `3313069f360c8d71d3b4b777f05a934fb9ebc3ef`, plus this harness. Seeds **0–99**, **15 Winters** (800 → 815), baselines **4, 5, 6, 7, 10**, four workers: **500 campaigns**, followed by a full repeat. All 500 repeated result records, including final state hashes, were identical.

```sh
node scripts/qa/run-economy-calibration.mjs --seed-start 0 --seeds 100 --winters 15 --baselines 4,5,6,7,10 --workers 4 --verify
```

Policy: start from real `createCampaign(seed)`; retain seeded founders, DNA, occupations, founding couples, tents, three cattle, 30 Food and 5 Materials. Perform no manual commands: no occupation locks, ship salvage, construction, cattle assignment or slaughter. Reuse canonical career autonomy, partnerships, housing, births and childcare. Only the three Food occupation rates change; aptitude profiles and all other configuration stay identical. The same policy can react differently to different resulting stocks; it is not optimized per baseline. All 100 initial founder fingerprints match across the five variants.

The longship remains present without an explicit Keep command. All three cattle remain alive and unassigned. Housing comes from existing autonomous partnership logic; the median is one permanent house at 815 for every baseline. Tents retain their productivity penalty. Career reviews occur every five Winters and are constrained by aptitude gain and experience; the policy does not guarantee a survival-oriented workforce allocation.

[Saved configuration and fingerprints](economy-calibration-v01-config.json) · [Per-run CSV](economy-calibration-v01-results.csv) · [Complete raw JSON, gzip](economy-calibration-v01-results.json.gz) · [Aggregate JSON with cohorts/outliers](economy-calibration-v01-summary.json). The command writes uncompressed JSON/CSV and manifest/summary under `artifacts/qa/economy-calibration/`. The checked-in gzip preserves the complete JSON, including annual snapshots and individual role counts.

Result SHA-256 (canonical result-array JSON): `6abf01995b1f96db564cb550809ba5f53540b3be14f9cf6c7331e6c6ad8b4a2a`. Runtime: `v24.19.0`; source and harness hashes are in the saved manifest.

Validation: 74 tests pass, including public harness tests for canonical Landing/configuration, Food conservation, repeatability, worker-independent ordering and aggregates. TypeScript checking passes. No gameplay source files are changed.

## Outcomes

Each baseline has 100 runs. Percentages mean runs with at least one shortage/zero checkpoint over the full 15 Winters. Stocks and population are medians at 815; minimum is the median of each run’s lowest stock.

| Food baseline | Any shortage | Hit zero | Food @815 | Min Food | Population | Materials @815 | Active Food share @815 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 100% | 100% | 0 | 0 | 10 | 62.5 | 70% |
| 5 | 70% | 72% | 0 | 0 | 10 | 65 | 70% |
| 6 | 47% | 48% | 8 | 3 | 11 | 63 | 70% |
| 7 | 29% | 31% | 21.5 | 10.5 | 13 | 63.5 | 70% |
| 10 | 5% | 5% | 69 | 30 | 16 | 56.5 | 60% |

| Baseline | Median Food 805 / 810 / 815 | Food @815 p10–p90 | Food @815 range | Median births | Median childcare person-Winters |
|---:|---|---|---|---:|---:|
| 4 | 0 / 0 / 0 | 0–0 | 0–6 | 0 | 0 |
| 5 | 3 / 0 / 0 | 0–19.1 | 0–42 | 0 | 0 |
| 6 | 12 / 7.5 / 8 | 0–30.1 | 0–54 | 1 | 5 |
| 7 | 19 / 20 / 21.5 | 0–58 | 0–93 | 3 | 13.5 |
| 10 | 53 / 55.5 / 69 | 9–191.1 | 0–251 | 6 | 23 |

At 7, median Food remains near 20 rather than accumulating into a large surplus. Nevertheless 29 seeds experience a shortage and 31 hit zero; seeds 39 and 75 reach exactly zero without an unmet consumption event. At 6, almost half the runs experience shortages. At 4 every run does. The 10 control is much more generous, yet five seeds still have shortages.

Median active Food share averaged over Winter-start observations is 70%, 70%, 70%, 65.7% and 58% for baselines 4, 5, 6, 7 and 10. All founders begin as adults; no newborn reaches 16 within this horizon. Median children at 815 are therefore 0, 0, 1, 3 and 6. Childcare suppresses active output as births rise, which helps explain why increasing the baseline does not simply scale final stock.

## Starting occupations and distribution

Every founder starts in a currently productive role. Initial farmer counts range 0–6, fisher 0–7, hunter 0–6, and Materials producers 0–6. Materials production is exclusively woodworker. Forty seeds have eight or more Food workers; five have ten Food workers and no initial Materials worker (seeds 1, 48, 56, 59, 66). The per-run data preserves each initial role count.

| Initial Food founders | Seeds | Shortage at 7 | Median Food at 7 | Median Food at 10 | Median Materials at 10 |
|---:|---:|---:|---:|---:|---:|
| 4 | 4 | 75% | 0 | 13.5 | 161.5 |
| 5 | 7 | 42.9% | 11 | 30 | 119 |
| 6 | 20 | 35% | 14.5 | 37 | 96 |
| 7 | 29 | 34.5% | 21 | 67 | 62 |
| 8 | 18 | 11.1% | 27.5 | 130 | 38 |
| 9 | 17 | 23.5% | 30 | 112 | 11 |
| 10 | 5 | 0% | 50 | 194 | 5 |

Both the baseline and founding mix matter. At 10, Food medians broadly rise with Food concentration while Materials medians fall: a visible opportunity cost. Pearson correlation between initial Food count and final Food is 0.37 at 7 and 0.60 at 10. These are associations across seeds, not isolated causal effects: aptitude, housing and childcare also vary. Small cohorts (especially four or ten Food founders) warrant caution. At 4 the floor at zero hides most composition differences.

Inspect seed 73 for prolonged pressure: four initial Food workers, 12 shortage Winters at baseline 7 and 10 shortage Winters at baseline 10. Seed 90 illustrates surplus: eight initial Food workers, 93 Food at 7 and 251 at 10, with no shortage. Seed 48 has ten initial Food workers, 225 Food at 10 but starts without Materials production. Seed 32 reaches 157 Food and 17 residents at 10 under this policy, versus the reported manual 243 Food; those are different decision histories. Its Food at 6/7 is 31/30, showing birth/care feedback can offset a rate increase.

## Cattle and measurement limits

In every run the two exposed cows produce 60 Food in total and all three cattle consume 45: **net +15 Food over 15 Winters**. This is a modest recorded buffer compared with the 10-control surplus range. It cannot avert the measured low-baseline shortages. No cattle-removal counterfactual was run, so this does not measure how many campaigns cattle saved after demographic/policy feedback.

Food production/actual consumption and resident/cattle shortfalls are recorded separately. Stock conservation is asserted per campaign. Shortage means an unmet resident or cattle consumption event, not merely an empty stock. Minimum Food includes the initial stock and every post-Winter boundary; under this no-command policy Food only increases between boundaries, so this captures the true stock minimum. Active Food share divides available Food producers by living work-age residents (16+), including temporarily unavailable caregivers in the denominator; assigned farmer/fisher/hunter counts are separate. Child/adult counts use the consumption threshold 16, not partnership adulthood 18. Childcare person-Winters and mean worker shares use Winter-start samples.

This simulator has no starvation or natural mortality; population staying at ten does not demonstrate survival. The batch assesses food pressure under existing autonomy, not a player’s best sensible allocation. There is no weather, cattle reproduction, trade or additional automation.

## Prototype recommendation

**Trial 7 Food/Winter next.** It removes much of the current surplus (median 21.5 versus 69, p90 58 versus 191.1), allows median growth to 13 residents, and preserves pressure without the 100%/70% shortage rates at 4/5 or the 47% shortage rate at 6. The 29% shortage rate at 7 remains substantial: validate deliberate player allocation and permanent housing next before treating this as a safe default. Retest when mortality, weather or cattle reproduction are introduced. This issue leaves gameplay defaults and the founding generator unchanged.
