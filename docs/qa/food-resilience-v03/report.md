# Food resilience v0.3 — measured experiment (#77)

This report measures reserve control and crisis resilience. Production defaults, regular campaign saves and the Gameplay Lab are unchanged. PR #83 was merged before this run.

## Cohort and reproduction

Source baseline: `4ca2db7aadeff39116ec7e5cfc0ed56a81450567`. Runtime: `v24.19.0` / win32. Seeds 0–99, 25 Winters per case: 1,300 primary campaigns. The predeclared 50-Winter subset uses seeds 0, 7, 8, 11, 15, 32, 34, 41, 55, 90: 130 additional campaigns. The published cohort contains 1430 campaigns and 39000 resolved domestic Winters. Replay and full-world validation runs are counted separately below. This fixed seed sample is a calibration cohort, not a demographic estimate or a hardware performance gate.

```powershell
pnpm install --frozen-lockfile
node scripts/qa/run-food-resilience.mjs --output artifacts/food-resilience-v03 --seeds 100 --winters 25 --workers 4
node scripts/qa/verify-food-study.mjs artifacts/food-resilience-v03
node scripts/qa/render-food-report.mjs artifacts/food-resilience-v03
node --test tests/food-resilience.test.mjs
```

Use fewer workers on a busy laptop. [Manifest](manifest.json) records exact saved mechanics/landing/weather configuration, source/recipe/harness fingerprints, artifact hashes, runtime and seeds. [Summary](summary.json) includes every case, annual distributions, paired seed deltas, episodes and replay records. [Audit](audit.json) independently checks 111 artifact hashes, all integer ledgers, fair role factors and unchanged configuration. 200 A/B campaigns match the historical #78 control hashes, initial fingerprints and public commands exactly. Historical reports and raw artifacts are preserved.

Each `runs25/seed-N.json.gz` contains all 13 cases with actual public command logs, annual resident/work inspections, per-role output, herds, stock flows, RNG state and final canonical hashes. `runs50/` contains the declared long-run subset. Read gzip JSON with Node's `gunzipSync`. Summary percentiles use linear interpolation; standard deviation divides by N. Fractional summary means/percentiles are statistical values; every campaign stock and actual output is an integer.

## Verified rules and experimental boundaries

The issue calls the production stop “Severe”. The merged implementation calls it **Harsh**. No modifier was replaced or applied twice:

| Weather | Draw probability | Human/cattle Food output | Materials output | Resident consumption | Adult cattle consumption |
| --- | --- | --- | --- | --- | --- |
| Mild | 20% | 110% | 100% | 100% | 1 Food |
| Normal | 55% | 100% | 100% | 100% | 1 Food |
| Harsh | 20% | 0% | 0% | +50%, group rounded up | +50%, group rounded up |
| Severe | 5% | 50% | 100% | 100% | 3 Food |

These are draw probabilities; realised weather frequency can differ, and experimental demographic changes can move the shared RNG stream. Weather exposure mortality, human mortality, cattle reproduction/mortality, normal Food baseline 10, woodworker Materials baseline 5, childcare, age, tent penalties and upgrades retain the exact source rules. Children under 16 consume 1 Food; residents 16+ consume 2. Cattle under 2 consume zero normally; adults consume 1.

**Spoilage:** after the entire domestic Winter resolves, including deaths, consumption, upkeep/collapse, autonomous careers, partnerships, births and the next weather draw; before CPU/world stepping. Therefore those same-boundary career and birth decisions see pre-spoilage Food. Then `floor(max(0, Food − protectedFood) × rateBps / 10000)` is removed, with a factual `FoodSpoiled` event for positive loss. Newly born dependants contribute to the protected threshold. The protected variant recalculates two normal Winters of consumption from current living residents and cattle. Protection exempts existing stock from spoilage; it creates no Food and consumption can take stocks below the threshold. No storage building or hard stock cap is introduced.

**Capacity:** one domestic region, separate farmer/fisher/hunter pools. Structurally available workers count, including workers blocked economically by Harsh weather, but excluding underage, childcare and other canonical ineligibility. First N slots contribute 100% each, then 75%, 50%, 25%, 10%, 10%…; the total is shared equally across that role. For eight workers with N=2, each receives 47.5%. The factor multiplies canonical productivity before fixed-point work accumulation, with deterministic flooring. DNA, housing, career penalty and remaining real work progress are preserved. Woodworkers and cattle output have no regional capacity penalty. Slot sharing treats a part-productive worker as one structurally available worker; it is not an aptitude-weighted allocation.

Capacity loss is recorded as **discarded integer work**, with cumulative whole-Food work equivalents carried between years separately per role. It is not Food removed from stocks, and it is not the actual output of a separate counterfactual campaign. `nominalFoodEquivalent` is actual emitted Food plus that work equivalent. The stock ledger is `openingFood + actualProduced − actualConsumed − spoiled`; unmet demand is not subtracted a second time. Both Food and Materials ledgers were checked at every row.

Experiments are compiled in a QA compartment with two exact, fail-closed source hooks. No `src/` gameplay source is edited. The experimental envelope keeps recipe/source identity and the loss ledger around a real validated Simulation Core save; mismatched recipes are rejected. CPU regions retain canonical rules. 52 full runs repeat identically with midpoint save/load; 8 B/E10 runs match the full world's domestic annual output and final domestic hash. A separate test resumes partial integer work within a Winter. This supports the domestic measurement only; no expedition result is claimed.

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

| Case | Food median | P10 | P90 | Min | Max | Reserves median | Any shortage /100 | ≥3 consecutive /100 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | 17.5 | 0 | 86.3 | 0 | 185 | 0.4 | 89 | 39 |
| B | 345.5 | 127.7 | 519.2 | 0 | 892 | 10.6 | 36 | 4 |
| C05 | 214.5 | 67.8 | 342.7 | 0 | 540 | 6.8 | 40 | 7 |
| C10 | 146.5 | 55.4 | 248.8 | 0 | 355 | 4.6 | 55 | 7 |
| C15 | 122 | 34 | 188.8 | 0 | 278 | 3.7 | 70 | 7 |
| D2 | 194.5 | 44 | 401.1 | 0 | 552 | 6.1 | 47 | 4 |
| D4 | 324 | 100.9 | 502.7 | 11 | 764 | 9.1 | 34 | 4 |
| E05 | 124 | 24.9 | 247.1 | 0 | 348 | 4 | 55 | 5 |
| E10 | 90 | 19.2 | 156 | 0 | 238 | 2.8 | 71 | 6 |
| E15 | 74 | 11.6 | 131.9 | 0 | 225 | 2.4 | 81 | 8 |
| C10-safe | 197.5 | 77.3 | 305.1 | 1 | 417 | 6.5 | 40 | 6 |
| E10-safe | 115 | 37.6 | 217.2 | 0 | 302 | 3.9 | 55 | 3 |
| E10-N4 | 129.5 | 44.7 | 206.5 | 0 | 322 | 4 | 61 | 6 |

Prepared B has 36/100 campaigns with any actual unmet consumption versus 89/100 in passive A. Median final Food is 345.5 versus 17.5. Any shortage is **not** a lost campaign: compare the sustained-shortage, low-reserve and population tables separately.

Food checkpoints: median [P10–P90].

| Case | 805 | 810 | 815 | 820 | 825 |
| --- | --- | --- | --- | --- | --- |
| A | 28.5 [0–73.1] | 12 [0–73.4] | 17 [0–78] | 15 [0–85.4] | 17.5 [0–86.3] |
| B | 73 [17.9–131.3] | 114 [22.7–210.6] | 139 [21.9–312.4] | 211.5 [41.8–400.6] | 345.5 [127.7–519.2] |
| C05 | 62 [15.9–114] | 87.5 [10.9–165.3] | 99 [24.9–212.4] | 129 [24.9–280.1] | 214.5 [67.8–342.7] |
| C10 | 51.5 [10.5–97] | 67 [7.9–127] | 75 [22.8–154.6] | 98 [14.2–207.5] | 146.5 [55.4–248.8] |
| C15 | 43.5 [11.9–81.2] | 55 [7–99.2] | 63 [9–115.2] | 76 [17.6–150.9] | 122 [34–188.8] |
| D2 | 53 [9.9–103.2] | 80.5 [10.8–155.1] | 112.5 [27.3–248.4] | 141 [20.5–340.2] | 194.5 [44–401.1] |
| D4 | 72 [17.9–131] | 105 [24.7–210.6] | 137 [25.5–307] | 212 [36.8–392.5] | 324 [100.9–502.7] |
| E05 | 46.5 [6.9–91] | 66 [17.7–123.5] | 72.5 [16.1–181.1] | 99.5 [24–209.3] | 124 [24.9–247.1] |
| E10 | 38.5 [3.7–77.1] | 55.5 [6.9–96.5] | 54.5 [6.6–113.7] | 64.5 [2.7–146] | 90 [19.2–156] |
| E15 | 30.5 [0–64.1] | 47 [4.8–77.4] | 49 [0–98.3] | 64 [11.4–109.9] | 74 [11.6–131.9] |
| C10-safe | 69 [16.8–116.1] | 94 [21.8–161.2] | 103 [20.7–190.5] | 140.5 [23.3–244.1] | 197.5 [77.3–305.1] |
| E10-safe | 53 [9–97] | 70 [6–127.2] | 90 [20.7–165.3] | 105.5 [14.3–207.3] | 115 [37.6–217.2] |
| E10-N4 | 52.5 [11.9–93.2] | 63.5 [17.8–125] | 78 [21–153.7] | 86.5 [5.9–198] | 129.5 [44.7–206.5] |

Materials checkpoints: median [P10–P90].

| Case | 805 | 810 | 815 | 820 | 825 |
| --- | --- | --- | --- | --- | --- |
| A | 13 [1–30] | 24 [4.8–60.2] | 38 [5–99] | 57.5 [5–133.5] | 72.5 [5.9–159.9] |
| B | 10 [4–16] | 10 [5–18.1] | 11 [3.9–19] | 14 [6–21] | 17 [5.9–24] |
| C05 | 10 [4–16] | 10 [5–18.1] | 11.5 [4–19.1] | 13 [5.8–20.1] | 16 [5–24] |
| C10 | 10 [4–16] | 10 [5–17] | 12.5 [4.9–19.1] | 14 [4–21] | 16 [5.8–24.1] |
| C15 | 11 [3.9–16] | 11 [5–17] | 12 [5.9–20] | 14 [4.9–21.1] | 15.5 [4.9–24] |
| D2 | 11 [4–16] | 10 [5–18.1] | 11 [3.9–18.1] | 14 [4–20.1] | 17 [5–24] |
| D4 | 10.5 [4–16] | 10 [5–18.1] | 11 [3–19] | 14 [6–21] | 17 [6–24] |
| E05 | 10.5 [3.9–16] | 11 [5–18.1] | 11 [4.9–20] | 15 [4–21] | 15.5 [6–24] |
| E10 | 10 [3.9–15.1] | 12 [5–18] | 12 [6.9–20.1] | 15 [5.9–21] | 16 [5.9–24.1] |
| E15 | 11 [2.9–16] | 12 [5–19] | 12 [6.9–20.1] | 16 [5.9–22] | 16 [4.9–24] |
| C10-safe | 10 [4–16] | 10 [5–18.1] | 11 [3–19] | 14 [4.9–21] | 17 [5–24] |
| E10-safe | 11 [4–16] | 10.5 [5–18.1] | 11 [4–19] | 14.5 [3–21] | 16 [6–24] |
| E10-N4 | 11 [4–16] | 10.5 [5–17.2] | 12.5 [5–19.1] | 14 [4–21] | 16 [4–24] |

## Food flows, losses and work

All following flow and opportunity-cost values are means per campaign over 25 Winters, unless labelled otherwise. Capacity-equivalent loss measures discarded work, not a hypothetical alternate campaign's production.

| Case | Produced | Consumed | Spoiled | Capacity equivalent lost | Unmet | Unmet events | Low-reserve Winters |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 829.6 | 824.4 | 0 | 0 | 156.5 | 7.9 | 15.1 |
| B | 1097.4 | 782.4 | 0 | 0 | 23.5 | 1.3 | 2.5 |
| C05 | 1098.2 | 780.2 | 131.9 | 0 | 28 | 1.5 | 3.3 |
| C10 | 1111.2 | 767.5 | 219.1 | 0 | 26.9 | 1.5 | 3.9 |
| C15 | 1118.6 | 759.1 | 272.4 | 0 | 35.1 | 2 | 5.3 |
| D2 | 946.9 | 765 | 0 | 162.8 | 23.9 | 1.5 | 3.7 |
| D4 | 1073.4 | 784.7 | 0 | 34.5 | 20.7 | 1.2 | 2.6 |
| E05 | 949.1 | 755.6 | 92.8 | 164.4 | 31.4 | 1.8 | 4.8 |
| E10 | 949.9 | 745.1 | 147.6 | 165.4 | 43.5 | 2.5 | 6.5 |
| E15 | 978.7 | 734.3 | 200.3 | 165.7 | 52.2 | 3 | 7.5 |
| C10-safe | 1100.5 | 781.2 | 149.7 | 0 | 26.2 | 1.4 | 2.8 |
| E10-safe | 947.5 | 761 | 91.1 | 163.7 | 26.4 | 1.6 | 4.2 |
| E10-N4 | 1074.9 | 763.2 | 206.7 | 35.2 | 27.7 | 1.6 | 4.3 |

| Case | Farmer | Fisher | Hunter | Cattle output | Cattle consumption | Woodworker Materials |
| --- | --- | --- | --- | --- | --- | --- |
| A | 215.6 | 177.9 | 205.9 | 230.3 | 319.7 | 121.1 |
| B | 553.6 | 118.6 | 238.3 | 186.9 | 137 | 136.8 |
| C10 | 561.1 | 119 | 241.3 | 189.9 | 133.9 | 139 |
| D2 | 424.7 | 114.7 | 214.9 | 192.7 | 134.1 | 138.3 |
| E10 | 421.8 | 112.6 | 219.2 | 196.3 | 133.7 | 140.3 |
| C10-safe | 556.3 | 118.7 | 237.9 | 187.6 | 136.3 | 136.5 |
| E10-safe | 424.9 | 114.7 | 216.5 | 191.5 | 133.7 | 138.4 |
| E10-N4 | 530.8 | 117.7 | 239.6 | 186.8 | 132 | 139 |

Separate role capacity: mean available worker-Winters / discarded whole-Food work equivalents per campaign. The last columns count distinct campaigns (each out of 100), not weather episodes. Arrival means the first resolved Winter, 800→801; later means any subsequent Winter, and a campaign can appear in both columns. Exact derived values are in [resilience details](resilience-details.json).

| Case | Farmer available/lost | Fisher available/lost | Hunter available/lost | Healthy-entry shortage campaigns: Normal/Harsh/Severe | Arrival/later shortage campaigns |
| --- | --- | --- | --- | --- | --- |
| A | 58.3/0 | 50.6/0 | 59.2/0 | 0/0/0 | 0/89 |
| B | 97.2/0 | 24.1/0 | 48.5/0 | 0/0/0 | 0/36 |
| C05 | 97.3/0 | 24.5/0 | 48.3/0 | 0/0/0 | 0/40 |
| C10 | 97.3/0 | 24.1/0 | 48.7/0 | 0/0/0 | 0/55 |
| C15 | 97.6/0 | 24.4/0 | 48.4/0 | 0/0/0 | 0/70 |
| D2 | 97.6/139.6 | 24.1/3.5 | 47.8/19.7 | 0/0/0 | 0/47 |
| D4 | 97.1/32.4 | 24.2/0.2 | 48.6/2 | 0/0/0 | 0/34 |
| E05 | 98/140.2 | 24.1/3.7 | 48.4/20.5 | 0/0/0 | 0/55 |
| E10 | 98/140.8 | 24.3/3.8 | 48.6/20.8 | 0/0/0 | 0/71 |
| E15 | 97.8/141.5 | 24.9/4.5 | 48.1/19.7 | 0/0/0 | 0/81 |
| C10-safe | 97.2/0 | 24.1/0 | 48.5/0 | 0/0/0 | 0/40 |
| E10-safe | 97.8/140.3 | 24.1/3.4 | 48.1/20.1 | 0/0/0 | 0/55 |
| E10-N4 | 97.4/33.6 | 24/0.1 | 48.5/1.4 | 0/0/0 | 0/61 |

“Available” counts structural eligibility at the opening of each work year; “effective” additionally requires positive actual productivity, so Harsh years contribute zero effective workers. These snapshots do not estimate fractional full-time-equivalent labour. Houses, upgrades and herd counts are final means. Upkeep is actually paid upkeep; spending includes house construction and upgrades. Full annual details retain activation, exposure, crowding and accepted/rejected commands.

| Case | Food available/effective worker Winters | Materials available/effective | Materials spent/upkeep | Houses/upgrades at 825 | Farmyards/cattle/exposed at 825 | Commands accepted/rejected |
| --- | --- | --- | --- | --- | --- | --- |
| A | 168.1/136.3 | 64.2/52.2 | 18.7/28.9 | 1.8/0 | 0.9/33.4/33.4 | 0/0 |
| B | 169.8/138.8 | 60/49 | 57.3/89.4 | 5/1 | 3.5/5/0.6 | 36.1/0 |
| C10 | 170/140.2 | 60.2/49.6 | 58/91.1 | 5.1/1 | 3.5/4.6/0.1 | 36/0 |
| D2 | 169.5/139.2 | 60.1/49.5 | 57.1/91.4 | 5/1.2 | 3.4/4.6/0.3 | 35.3/0 |
| E10 | 170.9/139.3 | 60.4/49.4 | 58.2/92.5 | 5.1/1.2 | 3.5/4.5/0 | 35.4/0 |
| C10-safe | 169.8/139.1 | 60/49 | 57.1/89.5 | 5/1 | 3.5/5/0.6 | 36.2/0 |
| E10-safe | 169.9/139.5 | 60.1/49.5 | 57.4/91.6 | 5/1.2 | 3.5/4.6/0.3 | 35.4/0 |
| E10-N4 | 169.8/140.4 | 60.1/49.7 | 58.1/91.3 | 5.1/1 | 3.5/4.5/0.1 | 35.9/0 |

| Case | Population at 825 median [P10–P90] | Births/deaths mean | Below 10 residents /100 | Care/age-reduced worker Winters mean | Occupation/specialisation changes mean | Overcrowded cattle Winters mean |
| --- | --- | --- | --- | --- | --- | --- |
| A | 12 [10–15] | 3.7/1.1 | 5 | 17.3/47.1 | 2.7/0 | 0 |
| B | 15 [12–19] | 6.5/1.1 | 1 | 29.2/47.7 | 15.7/8.3 | 36.6 |
| C10 | 15 [12–19] | 6.4/1 | 1 | 28.3/47.9 | 15.6/8.3 | 37.8 |
| D2 | 15 [11–19] | 6.2/1 | 1 | 27.6/47.5 | 15.1/8.1 | 37 |
| E10 | 15 [11.9–18] | 5.8/0.9 | 2 | 26.3/47.5 | 15.2/8 | 40.5 |
| C10-safe | 15.5 [12–19] | 6.7/1.1 | 1 | 29.6/48.1 | 15.8/8.3 | 37 |
| E10-safe | 15 [11–19] | 6/0.9 | 1 | 27.2/47.6 | 15.1/8.1 | 36.3 |
| E10-N4 | 15 [12–19] | 6.3/1 | 1 | 28.2/47.8 | 15.5/8.2 | 36.6 |

Deaths are from existing mortality mechanics; unmet Food itself has no starvation-death rule. Care and age effects are measured as worker-Winter counts, not claimed counterfactual causation.

## Crisis and recovery

An unmet-consumption event is an actual resident or cattle demand event with positive shortfall. A low-reserve Winter has less than one normal Winter of stock. A sustained episode means at least three consecutive shortage Winters. Population decline means fewer than the initial 10 living residents at the final boundary. These are different risk proxies; none is labelled campaign failure.

Recovery is the first later boundary after an episode ends with at least two normal Winters of Food. Episodes without such recovery by the horizon are censored, not assigned zero delay. Delays exclude the duration of the shortage itself. Episodes can share a later recovery boundary; they are not independent trials. The reserve ratio can also improve when demand falls, so recovery does not imply that production alone rebuilt the buffer.

| Case | Shortage Winters mean | Longest streak max | Episodes | Recovered | Censored | Recovery median [P10–P90] |
| --- | --- | --- | --- | --- | --- | --- |
| A | 5.4 | 20 | 304 | 48 | 256 | 9 [4.7–16] |
| B | 0.9 | 4 | 65 | 58 | 7 | 4 [2–9.3] |
| C05 | 1.1 | 4 | 81 | 72 | 9 | 4 [2–9.9] |
| C10 | 1.2 | 5 | 85 | 81 | 4 | 4 [2–8] |
| C15 | 1.6 | 5 | 124 | 107 | 17 | 4 [3–11] |
| D2 | 1.2 | 4 | 95 | 78 | 17 | 4 [3–9] |
| D4 | 0.9 | 4 | 65 | 60 | 5 | 4 [2–8.1] |
| E05 | 1.5 | 4 | 119 | 105 | 14 | 5 [3–10] |
| E10 | 2 | 5 | 155 | 110 | 45 | 5 [3–10] |
| E15 | 2.5 | 4 | 193 | 146 | 47 | 6 [3–13] |
| C10-safe | 1 | 4 | 71 | 64 | 7 | 4 [2–9] |
| E10-safe | 1.3 | 4 | 104 | 84 | 20 | 4 [2–8] |
| E10-N4 | 1.3 | 5 | 94 | 83 | 11 | 4 [2–8] |

The weather label is the outgoing work year's weather; the row's boundary is the newly entered Winter. “Healthy entry” means at least two opening normal Winters of Food, not two crisis-adjusted Winters. The next-boundary column includes whatever weather followed, so it is descriptive and not a causal recovery estimate. Rows without a later boundary are omitted from that column.

| Case/weather | Observed | Shortage Winters | Healthy entry but shortage | Food delta median | Next-boundary Food median | Production mean |
| --- | --- | --- | --- | --- | --- | --- |
| A/Normal | 1417 | 101 | 0 | 6 | 28 | 41 |
| A/Harsh | 472 | 348 | 0 | -23.5 | 6 | 0 |
| A/Severe | 118 | 75 | 0 | -8.5 | 7 | 21 |
| B/Normal | 1413 | 0 | 0 | 24 | 137 | 54.5 |
| B/Harsh | 465 | 83 | 0 | -42 | 66.5 | 0 |
| B/Severe | 136 | 10 | 0 | -11 | 120 | 28.3 |
| C10/Normal | 1447 | 0 | 0 | 15 | 81 | 54.2 |
| C10/Harsh | 442 | 111 | 0 | -45 | 36 | 0 |
| C10/Severe | 134 | 12 | 0 | -16 | 57 | 27.6 |
| D2/Normal | 1442 | 0 | 0 | 18 | 93 | 46.6 |
| D2/Harsh | 452 | 110 | 0 | -41 | 40 | 0 |
| D2/Severe | 130 | 10 | 0 | -13 | 88 | 24 |
| E10/Normal | 1419 | 0 | 0 | 12 | 56 | 46.8 |
| E10/Harsh | 463 | 182 | 0 | -41 | 22 | 0 |
| E10/Severe | 128 | 15 | 0 | -18 | 35 | 23.8 |
| C10-safe/Normal | 1422 | 0 | 0 | 18 | 108 | 54.5 |
| C10-safe/Harsh | 461 | 92 | 0 | -44 | 52 | 0 |
| C10-safe/Severe | 135 | 11 | 0 | -15 | 90 | 28.1 |
| E10-safe/Normal | 1419 | 0 | 0 | 14 | 83 | 46.7 |
| E10-safe/Harsh | 453 | 121 | 0 | -41 | 32 | 0 |
| E10-safe/Severe | 133 | 9 | 0 | -16 | 72 | 24.2 |
| E10-N4/Normal | 1465 | 0 | 0 | 15 | 75 | 52.5 |
| E10-N4/Harsh | 439 | 117 | 0 | -45 | 33 | 0 |
| E10-N4/Severe | 132 | 12 | 0 | -17 | 57 | 26.8 |

## Paired differences and RNG divergence

Each candidate uses the same founding seed as B. These are paired final trajectories, not isolated loss accounting: fertility, mortality, childcare, role changes and cattle can feed back into production. RNG divergence is the first annual snapshot with a different persisted domestic RNG state; transient draw-history differences within a year are not claimed to be detected.

| Case minus B | Food delta median [P10–P90] | Unmet delta mean | Population delta mean | RNG diverged /100 |
| --- | --- | --- | --- | --- |
| A | -308.5 [-490.2–-62.9] | 133 | -2.9 | 100 |
| C05 | -134.5 [-246.2–-19.5] | 4.6 | 0.1 | 37 |
| C10 | -200.5 [-354.5–-29.2] | 3.4 | -0.1 | 60 |
| C15 | -212.5 [-417–-33.6] | 11.6 | -0.3 | 79 |
| D2 | -118 [-271.2–-12.7] | 0.4 | -0.3 | 50 |
| D4 | -13.5 [-98.2–0] | -2.8 | 0 | 12 |
| E05 | -222.5 [-386.3–-42.6] | 8 | -0.5 | 63 |
| E10 | -257.5 [-433.8–-77.5] | 20.1 | -0.6 | 83 |
| E15 | -252 [-485.4–-48.7] | 28.7 | -0.8 | 94 |
| C10-safe | -139 [-286.3–-25.6] | 2.8 | 0.1 | 13 |
| E10-safe | -226.5 [-382.4–-41.8] | 3 | -0.3 | 56 |
| E10-N4 | -213 [-394.9–-33.3] | 4.2 | -0.1 | 62 |

## Fifty-Winter sensitivity

130 extended campaigns exactly preserve their matched 25-Winter annual and command prefixes. Only the declared 10 seeds are extended; the table is exploratory and is not 100-seed evidence. It tests whether bounded early stocks conceal later accumulation or repeated shortage.

| Case | Food at 850 median [P10–P90] | Min/max | Reserves median | Any shortage /10 | ≥3 consecutive /10 | Population median |
| --- | --- | --- | --- | --- | --- | --- |
| A | 4 [0–48.1] | 0/49 | 0 | 10 | 6 | 8.5 |
| B | 754.5 [629.1–1059.4] | 549/1135 | 27.5 | 3 | 0 | 18.5 |
| C05 | 239.5 [197.9–370.1] | 152/407 | 8.1 | 4 | 0 | 19.5 |
| C10 | 131.5 [45–276.7] | 36/373 | 4.9 | 6 | 0 | 18 |
| C15 | 108 [26.8–177.9] | 7/231 | 4.2 | 6 | 0 | 15.5 |
| D2 | 352 [91.8–701.6] | 0/707 | 10.8 | 6 | 0 | 17.5 |
| D4 | 663 [382.2–980.9] | 204/1043 | 24.5 | 4 | 0 | 20.5 |
| E05 | 105.5 [32.5–192.7] | 19/217 | 3.3 | 8 | 1 | 14.5 |
| E10 | 49 [19.7–91.6] | 17/133 | 1.6 | 6 | 1 | 14 |
| E15 | 32.5 [18.9–65.3] | 0/68 | 0.9 | 9 | 0 | 14.5 |
| C10-safe | 165 [124.9–304.5] | 88/372 | 7 | 5 | 0 | 17 |
| E10-safe | 117 [52.2–171.3] | 0/183 | 4 | 6 | 0 | 16.5 |
| E10-N4 | 133.5 [41.3–239.6] | 17/254 | 4.9 | 7 | 0 | 18 |

For the same ten seeds, B's median Food grows from 301 at 825 to 754.5 at 850. C10-safe changes from 192 to 165. These paired subset values support the reserve-control direction while retaining zero Normal-Winter shortages in the prepared extended runs.

## Outliers and manual follow-up

| Case | Low Food seeds: stock (shortage years) | High Food seeds: stock |
| --- | --- | --- |
| A | 9: 0 (802, 804, 806, 807, 810, 811, 820, 822, 823, 825); 10: 0 (814, 817, 820, 825); 14: 0 (802, 808, 809, 810, 812, 825) | 17: 156; 89: 178; 64: 185 |
| B | 33: 0 (815, 816, 824, 825); 75: 13 (803, 804, 810, 811, 812, 820, 821); 59: 71 (809, 811, 822, 824) | 97: 737; 91: 815; 47: 892 |
| C10 | 37: 0 (816, 823, 824, 825); 58: 9 (816); 23: 24 (808, 809) | 40: 311; 47: 353; 91: 355 |
| D2 | 75: 0 (803, 804, 810, 811, 812, 815, 825); 92: 0 (816, 820, 821, 822, 823, 825); 68: 18 (808, 819, 824) | 40: 517; 15: 541; 91: 552 |
| E10 | 12: 0 (802, 804, 807, 825); 41: 0 (815, 820, 823, 825); 43: 0 (802, 805, 806, 808, 825) | 90: 183; 10: 202; 91: 238 |
| C10-safe | 77: 1 (none); 75: 13 (803, 804, 810, 811, 812, 820, 821); 78: 30 (818, 819, 820, 823, 824) | 40: 369; 47: 400; 91: 417 |
| E10-safe | 75: 0 (803, 804, 810, 811, 812, 815, 825); 77: 0 (825); 18: 18 (804, 816, 818) | 40: 286; 89: 294; 91: 302 |
| E10-N4 | 37: 0 (816, 823, 824, 825); 58: 5 (816); 9: 17 (816) | 47: 280; 40: 296; 91: 322 |

For control B, start the listed seed in Gameplay Lab and reproduce the command policy in `food-policy.mjs`. Exact command logs in the raw archive are preferable to hand timing. C/D/E are harness-only experiments: opening an ordinary Gameplay Lab campaign does not enable them. Inspect a single experimental seed with `runFoodScenario({seed, scenario, winters:25})` from the public harness; inspect its annual rows and commands. Do not import an experimental envelope as a regular campaign save.

## Validation

The build and character validation with explicit Lab previews pass. The complete local suite reports 477 tests: 466 passed and 11 existing optional-fixture skips. All nine new public-harness tests pass, including recipe rejection, partial-work resume, actual capacity effects and corrupted-archive detection. Source formatting was reviewed manually; this repository has no configured automatic formatter. PR readiness is gated separately on all required GitHub checks passing for the current head.

## Recommendation and limits

**Use C10-safe as the next prototype candidate: 10% annual spoilage only above two normal Winters of current demand.** It lowers median Food at 825 from 345.5 to 197.5, while any-shortage incidence changes from 36/100 to 40/100. Mean low-reserve Winters change from 2.5 to 2.8, and sustained-shortage campaigns from 4 to 6. Its P10 stock is 77.3, compared with 67.8 for unprotected 5% spoilage. All prepared primary cases have zero unmet consumption in Normal Winters. This is a measured trade-off, not a guarantee against repeated bad weather.

Unprotected 10–15% takes too much from thin reserves: any-shortage incidence is 55–70/100. Unprotected 5% is a reasonable simpler comparator (40/100); the protected 10% candidate gives a better low-stock tail in this cohort.

**Defer regional capacity as a default.** N=2 alone records 162.8 lost Food work equivalents per campaign and 47/100 campaigns with a shortage. Combining it with unprotected 10% raises incidence to 71/100 and leaves 45 episodes unrecovered by 825, versus 7 in B. Protection helps E10-safe, but it still has 55/100 campaigns with a shortage. N=4 alone is gentler (34.5 mean work-equivalent loss), but its smaller shortage count than B does not prove capacity helps: realised demographic/RNG trajectories diverge.

A useful next experiment is **N=4 plus protected spoilage with a capacity-aware allocation policy**. That particular combination and policy were not measured here. Do not adopt either diminishing returns or the combined settings as canonical from this run. Protected spoilage is the strongest measured prototype direction; canonical adoption should follow targeted player-policy and expedition stress validation.

The 50-Winter convenience subset is shown above to expose later dynamics, without claiming it represents all 100 seeds. It strengthens a direction check, not a statistical balance decision.

No standard balance change is approved by this report. Before adopting a candidate, test a capacity-aware prepared policy and explicit forecast preparation, then a paired expedition stress policy. This run does not establish expedition resilience, different founding cohorts, climate-off balance, nutrition, starvation or a storage-building design. Percentage spoilage with a positive rate reduces stock growth in a fixed-surplus economy; it does not prove a strict global bound when population/output can grow. Current demographic and cattle feedback remains part of the result.
