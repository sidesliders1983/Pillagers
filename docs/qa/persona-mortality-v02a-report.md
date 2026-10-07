# Persona mortality v0.2A — calibration and QA

Natural mortality now uses the saved RNG and birth-Winter-derived age at each incoming Winter boundary. Death preserves identity, DNA, Family membership, parentage and history; closes occupation participation; releases partners and caregivers; and removes active household membership. An empty household releases its residence, while its record and existing vacancy/debt/collapse rules remain intact. The last farmer’s death removes the home’s Farmyard function and unassigns cattle.

## Configuration and reproduction

Baseline: main commit `f392702a6b7d3b5bfac0786a00168e7a120918b0`, plus the #41 implementation. Seeds **0–99**, **50 Winters** (800 → 850), four workers. One passive policy: real Landing, unchanged Food baseline **10**, default assets/roles/couples, canonical careers/housing/births/care; no manual decisions or survival optimization. Every run saves and loads at its midpoint. A full second batch is byte-for-byte identical after canonical result serialization, including final state hashes.

```sh
node scripts/qa/run-mortality-calibration.mjs --seeds 100 --winters 50 --verify
```

| Age in Winters | Annual prototype mortality | Observed deaths |
|---|---:|---:|
| 0–15 | 0.1% | 19 |
| 16–49 | 0.05% | 21 |
| 50–59 | 0.5% | 40 |
| 60–69 | 2% | 170 |
| 70–79 | 5% | 228 |
| 80–89 | 10% | 78 |
| 90+ | 20% | 0 |

The final band remains probabilistic; no fixed terminal age is imposed. Productivity decline from age 50 remains separate. Rolls run in sorted resident-ID order before consumption, maintenance, partnerships and births, after the prior year’s work. Newly born children first face a roll at the next boundary. No disease, starvation, weather, raids or livestock mortality is modeled.

[Exact configuration, policy and fingerprints](persona-mortality-v02a-config.json) · [Annual per-seed CSV](persona-mortality-v02a-trajectory.csv) · [Per-death CSV](persona-mortality-v02a-deaths.csv) · [Full raw JSON, gzip](persona-mortality-v02a-results.json.gz) · [Aggregate JSON](persona-mortality-v02a-summary.json). The command regenerates uncompressed results under `artifacts/qa/persona-mortality/`.

Canonical results SHA-256: `a4cab98db3d6d8b406113d218079ac49ef30ccb484bfc8d1ff0401011d29d96e`. Runtime `v24.19.0`; exact source/harness hashes are recorded in the manifest.

## Population and observed lifespans

Across the 100 campaigns: **1,133 births**, **556 deaths** (**19 children under 16**, **537 adults**), and **1,577 living residents at 850**. Of the 1,000 founders, **527 died** and **473 remain alive**. The final population ranges from 3 to 32; surviving founders range from 1 to 8 per campaign.

| Winter | Population p10 / median / p90 | Median living founders | Total living founders | Median cumulative births | Median cumulative deaths |
|---:|---|---:|---:|---:|---:|
| 800 | 10 / 10 / 10 | 10 | 1000 | 0 | 0 |
| 810 | 12 / 14 / 17 | 10 | 993 | 4 | 0 |
| 820 | 12 / 16 / 19 | 10 | 978 | 6 | 0 |
| 830 | 11 / 16 / 20 | 9 | 891 | 7 | 1 |
| 840 | 11 / 17 / 22.1 | 7 | 723 | 10 | 3 |
| 850 | 8 / 16 / 23 | 5 | 473 | 11 | 6 |

| Observed age at death | Deaths | p10 | Median | p90 |
|---|---:|---:|---:|---:|
| All residents | 556 | 53 | 70 | 81 |
| Founders only | 527 | 60 | 71 | 81 |

Observed deaths span ages 1–89. These percentiles describe **only observed deaths**, not life expectancy: survivors are right-censored, founders enter aged 18–40, and the horizon is only 50 Winters. Zero observed deaths at 90+ does not validate that band; the cohort has little exposure there. Counts by age band also have different exposure durations and are not estimates of annual rates.

For manual inspection, seeds 90, 31 and 50 finish with 3, 5 and 5 living residents; seeds 8, 59 and 72 finish with 29, 31 and 32. Population increases overall despite founder turnover. This supports lifecycle integration under the current prototype, not historical realism or a final balance judgement.

## QA and compatibility

**84 tests pass**, TypeScript checking and production build pass. Both the existing Gameplay Lab browser QA and the new mortality browser QA pass without runtime errors. The build retains the existing Three.js chunk-size advisory.

Public-core scenarios cover the mortality boundary, absence of wall-clock/unseeded randomness, same-seed and split-tick determinism, save/load immediately before a roll, current age independent of DNA’s identity-age snapshot, stopped work/consumption, closed work history, partner release, retained kinship, vacancy/collapse, caregiver death/replacement, maternal death, child death and Farmyard deactivation. The mortality browser scenario checks the death Winter and age, disabled work actions, accessible lineage/history and save/load persistence; [browser results](persona-mortality-v02a-browser-report.json).

The long batch exposed an existing boundary combination at seed 79 / Winter 830: an expired caregiver resumed work, then a new birth renewed her former care group while retaining the now-invalid donor. A focused red/green regression now covers this; care resolution releases unavailable donors and uses the canonical replacement logic.

Mechanics version 2 saves the curve explicitly. Version-1 saves migrate with zero risk, preserving their original mortality setting and RNG stream; time/history-only saves remain unchanged. New default campaigns enable the prototype curve. Restarting with an explicit saved configuration preserves that configuration. Maternal death ends her care group and frees its donor; orphan-care transfer is deliberately deferred as agreed. Child death shortens care to the youngest surviving child’s endpoint or ends an empty group.

## Follow-up

Keep this curve as an initial prototype and revisit it with longer horizons and active-player scenarios. After merge, rerun the existing Food calibration harness: natural deaths now change consumption, worker availability and housing pressure. The proposed Food baseline 7 remains a separate configuration decision; this PR keeps the default at 10. Retest again when weather, starvation consequences or cattle reproduction alter the economy.
