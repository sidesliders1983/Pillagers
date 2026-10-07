# Economy Calibration v0.2 — mortality, cattle lifecycle and weather

**Prototype recommendation: retain the current 10 Food/Winter baseline for now.** Reassess deliberate shelter and workforce preparation before reducing worker output. This measurement changes no gameplay defaults.

## Reproduction and policy

Run on merged main commit `f74ff402475829bf98a0ea07e8a069dea3689292` after PRs #45 and #46. Seeds 0–99, 15 Winters (800 to boundary 815), Food baselines 4, 5, 6, 7 and 10; four workers. All 500 campaigns were repeated completely with identical raw output and final state hashes.

```sh
node scripts/qa/run-economy-calibration.mjs --seed-start 0 --seeds 100 --winters 15 --baselines 4,5,6,7,10 --workers 4 --verify
```

The same real-core no-command policy as #39 retains seeded founders, DNA, roles, couples, tents, founding cattle, 30 Food and 5 Materials. Canonical autonomy handles career changes, partnerships, housing, births and care. There is no manual ship salvage, occupation locking, shelter construction, cattle assignment or slaughter. New campaign defaults enable persona mortality, cattle lifecycle and weather. Only farmer/fisher/hunter output rates vary; all other saved configuration is identical across variants. All 100 founder fingerprints match across the five baselines.

[Exact configuration and provenance](economy-calibration-v02-config.json) · [Per-run CSV](economy-calibration-v02-results.csv) · [Full raw JSON, gzip](economy-calibration-v02-results.json.gz) · [Aggregate/cohort JSON](economy-calibration-v02-summary.json) · [Original report](economy-calibration-v01-report.md).

Canonical results SHA-256: `ea7cfd4e03dd0f633b9bc73e82f968db30c41ca2001d80e5b4dcb61b7576bbd3`. Runtime `v24.19.0`. The manifest includes the measured source/harness fingerprints and all enabled profiles. No harness or simulation source changed during this run. Source, harness and result hashes were verified after completion; all three features are enabled in every saved scenario configuration. The 14 targeted weather/session/calibration tests also passed after the rebase.

## Outcomes

Each row represents 100 campaigns. Shortage means any unmet resident/cattle consumption event over 15 Winters; zero means stocks reached zero, even if the requirement was met exactly. Medians below are at boundary 815, except Min Food, which is the median of each campaign’s lowest stock.

| Baseline | Any shortage | Hit zero | Food @815 | Min Food | Population | Materials @815 | Active Food share @815 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 100% | 100% | 0 | 0 | 10 | 64.5 | 70% |
| 5 | 98% | 98% | 0 | 0 | 10 | 64.5 | 70% |
| 6 | 93% | 93% | 0 | 0 | 10 | 63.5 | 70% |
| 7 | 80% | 81% | 2 | 0 | 11 | 62 | 70% |
| 10 | 40% | 41% | 42.5 | 10 | 14 | 52 | 70% |

| Baseline | Food 805 / 810 / 815 medians | Food @815 P10–P90 | Food range | Births median | Childcare person-Winters median |
|---:|---|---|---|---:|---:|
| 4 | 0 / 0 / 0 | 0–0 | 0–2 | 0 | 0 |
| 5 | 0 / 0 / 0 | 0–5 | 0–29 | 0 | 0 |
| 6 | 5 / 0 / 0 | 0–20.1 | 0–48 | 1 | 3.5 |
| 7 | 12 / 4 / 2 | 0–48.1 | 0–87 | 2 | 8 |
| 10 | 42 / 32 / 42.5 | 1–123 | 0–196 | 4 | 19 |

## Change from the original #39 measurement

| Baseline | Shortage original → combined | Food median original → combined | Population original → combined | Materials original → combined |
|---:|---|---|---|---|
| 4 | 100% → 100% | 0 → 0 | 10 → 10 | 62.5 → 64.5 |
| 5 | 70% → 98% | 0 → 0 | 10 → 10 | 65 → 64.5 |
| 6 | 47% → 93% | 8 → 0 | 11 → 10 | 63 → 63.5 |
| 7 | 29% → 80% | 21.5 → 2 | 13 → 11 | 63.5 → 62 |
| 10 | 5% → 40% | 69 → 42.5 | 16 → 14 | 56.5 → 52 |

The earlier recommendation to trial 7 was made without these three systems. Compare its newly measured shortage rate against the current 10 control before adopting it. Natural mortality, cattle growth/death, weather-dependent production/consumption and altered RNG histories all contribute; this before/after comparison does not isolate one cause. The earlier v0.2C weather OFF control had 8% shortage at baseline 10 versus 40% ON. All 100 baseline-10 records from this fresh merged-main run exactly match the previous ON control, including final state hashes.

## Founding workforce and outliers

| Initial Food founders | Seeds | Shortage at 7 | Food median at 7 | Shortage at 10 | Food median at 10 |
|---:|---:|---:|---:|---:|---:|
| 4 | 4 | 100% | 0 | 100% | 7.5 |
| 5 | 7 | 85.7% | 0 | 71.4% | 16 |
| 6 | 20 | 90% | 0 | 60% | 18.5 |
| 7 | 29 | 75.9% | 3 | 41.4% | 44 |
| 8 | 18 | 77.8% | 8 | 22.2% | 66 |
| 9 | 17 | 70.6% | 13 | 17.6% | 62 |
| 10 | 5 | 80% | 0 | 0% | 88 |

Initial Food-worker count correlates with final Food (Pearson 0.397 at baseline 10). Baseline and founding composition both matter, but cohort differences are not causal effects: DNA, family trajectories and weather also differ. Small cohorts warrant caution. Assigned roles and active output are distinct, especially during childcare.

At baseline 10, inspect these low-Food outcomes: seed 8 (0 Food, 2 shortage Winters), seed 11 (0 Food, 4 shortage Winters), seed 15 (0 Food, 1 shortage Winters), seed 36 (0 Food, 1 shortage Winters), seed 41 (0 Food, 1 shortage Winters).

High-Food outcomes: seed 34 (196 Food), seed 90 (187 Food), seed 91 (180 Food), seed 55 (179 Food), seed 5 (165 Food).

## Cattle and measurement limits

| Baseline | Median cattle Food produced | Median cattle Food consumed | Median net cattle Food | Living cattle @815 median |
|---:|---:|---:|---:|---:|
| 4 | 97.5 | 129 | -24.5 | 16 |
| 5 | 94 | 133 | -28 | 15.5 |
| 6 | 104 | 138 | -35.5 | 16 |
| 7 | 97.5 | 140 | -34.5 | 16 |
| 10 | 100 | 141 | -33.5 | 16 |

Net Food is calculated within each campaign before taking its median. Exposed breeding cattle are no longer a fixed buffer: births increase later consumption, bad Winters multiply adult consumption, and mortality can remove producers. This is no cattle-removal counterfactual and does not measure animals saved/lost specifically because of shortages.

The core clamps Food at zero and reports shortfalls; starvation deaths are not implemented. Natural/exposure mortality is active, so reduced population is not proof of Food-caused death. Food conservation is asserted per scenario. Under this passive policy Food only rises between annual consumption boundaries; annual/initial samples therefore capture the true stock minimum. All newborns remain below working age during this horizon. These runs measure existing autonomy, not an optimally prepared player strategy.

## Prototype recommendation

**Keep baseline 10 for the next playable iteration.** It already exposes substantial shortage risk with all three systems active. Lower baselines should remain calibration scenarios until intentional player preparation has been measured. The old trial-7 recommendation is superseded for this combined ruleset; the default remains unchanged. Next compare a fixed documented preparation policy (housing, Farmyard assignments and work allocation) against the passive policy, then consider cattle consumption/output and weather values alongside worker output. Do not interpret this 15-Winter sample as final balance.
