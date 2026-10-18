# Settlement dressing QA — #203

Recorded 18 October 2026 on main `255ef2d34d611677844b6d89e2226659da3671a5` plus
the production source fingerprints in [measurement-summary.json](measurement-summary.json).
This validates the local props/edge-cover slice, not completion of the visual epic.

Open [the before/after gallery](index.html). The same game states and cameras are used on
both sides: only the independent dressing root is hidden/shown. Fourteen pairs assert
identical canonical Core, complete blueprint, actor pose, camera, calendar and lighting.
No placeholders or page errors were observed. Seed 17 and 32 exercise both curated island
geographies (7 and 18), not fourteen independently generated islands.

## Visual coverage

Landing scenes use normal Summer-800 stock. Paid villages salvage the real founding
longship and pay for one farmer's house and one ordinary household's house. Developed
scenes are **QA fixtures**: the runner explicitly increases stock, builds all households,
specializes houses before upgrading them and exercises mixed resident occupations/levels.
They are not presented as a normally earned progression. Winter advances through actual
Core ticks. Ordinary roof/log/well snow keeps upward coverage; low plants frost on all faces.

| Scene | Quality | Dressing instances | Extra all-pass draws | Extra all-pass triangles |
| --- | --- | ---: | ---: | ---: |
| Seed 17 landing / Summer | Standard | 212 | 8 | 119,336 |
| Seed 17 paid village / Summer | Standard | 210 | 12 | 120,156 |
| Seed 17 paid village / Summer | Low | 176 | 8 | 94,734 |
| Seed 17 paid village / Winter | Standard | 210 | 12 | 120,156 |
| Seed 17 developed QA / Summer | Standard | 206 | 12 | 120,687 |
| Seed 17 developed QA / Summer | Low | 181 | 7 | 96,689 |
| Seed 32 landing / Summer | Standard | 258 | 8 | 144,190 |
| Seed 32 paid village / Summer | Standard | 241 | 14 | 136,150 |
| Seed 32 paid village / Summer | Low | 175 | 9 | 92,915 |
| Seed 32 paid village / Winter | Standard | 241 | 14 | 136,150 |
| Seed 32 developed QA / Summer | Standard | 245 | 14 | 144,946 |
| Seed 32 developed QA / Summer | Low | 182 | 9 | 97,211 |

Close views of the ordinary home are also captured for both seeds. These check wall
clearance, original source scale, footing and the fisher/woodworker prop groups. No source
images or GLBs were generated/replaced. Existing authored Farmyards keep their own dressing.

## CPU, GPU and retained resources

Native headless Edge 155, Windows, Intel HD Graphics 630 through ANGLE/D3D11, 1400×900,
DPR 1. Running Low-quality orbit windows use explicit one-tick commands at 500 ms intervals
and existing actor motion. In each seed, layer visibility alternates **off/on/on/off**.
The 96 warm tick updates produced **zero placement-plan or batch reconciliations**.
The independent ground/path caches and navigation remain unchanged.

| Sample | Dressing sync p50 / p95 / p99 | GPU p50 / p95 / p99 | Frame callback wall p50 / p95 / p99 |
| --- | --- | --- | --- |
| Seed 17 off A | 0.1 / 0.3 / 0.3 ms | 67.0 / 75.0 / 75.9 ms | 51.7 / 113.8 / 148.1 ms |
| Seed 17 on A | 0.1 / 0.7 / 0.7 ms | 68.6 / 74.9 / 77.9 ms | 33.3 / 100.1 / 222.6 ms |
| Seed 17 on B | 0.2 / 0.3 / 0.3 ms | 74.5 / 87.8 / 88.3 ms | 72.0 / 116.2 / 127.7 ms |
| Seed 17 off B | 0.2 / 1.4 / 1.4 ms | 88.5 / 118.9 / 120.4 ms | 76.7 / 140.6 / 255.1 ms |
| Seed 32 off A | 0.1 / 0.3 / 0.3 ms | 68.9 / 75.4 / 80.5 ms | 24.6 / 33.1 / 43.0 ms |
| Seed 32 on A | 0.3 / 0.4 / 0.4 ms | 74.3 / 86.3 / 88.5 ms | 34.3 / 47.9 / 178.7 ms |
| Seed 32 on B | 0.2 / 0.4 / 0.4 ms | 92.9 / 125.7 / 125.7 ms | 36.5 / 50.4 / 77.3 ms |
| Seed 32 off B | 0.3 / 0.4 / 0.4 ms | 110.5 / 137.4 / 137.4 ms | 32.8 / 48.5 / 62.2 ms |

CPU values are callback wall time, including driver waits, not isolated pure CPU compute.
RAF frame intervals are recorded separately in JSON. GPU queries returned 181 valid
samples and zero disjoint results. These short tails and substantial drift between both
**off** samples prevent a reliable percentage GPU regression claim. The disabled side
still runs the tiny presentation cache check; it isolates drawing cost, not all CPU cost.
The laptop's existing whole-scene rendering is already slow. This is not a universal FPS
acceptance result or a physical mobile/thermal measurement.

Whole-page long tasks were 63/37/76/82 and 0/3/5/4 respectively in those windows. The
dressing sync samples remain at or below 1.4 ms and make no plan/batch calls; none of those
whole-page tasks can be attributed to a dressing rebuild. The JSON retains callback,
render-submit, motion and dressing distributions for further attribution. It does not
claim all existing frame stalls have been fixed. Heavy full-suite/build jobs started only
after both GPU measurement sequences completed.

Ten Standard→Low cycles in each developed fixture retained identical reported resources:

| Seed | Reported geometries | Textures | Low dressing instances |
| --- | ---: | ---: | ---: |
| 17 | 114 → 114 | 84 → 84 | 181 → 181 |
| 32 | 116 → 116 | 84 → 84 | 182 → 182 |

These are renderer counters, not a complete driver-heap leak proof. Ownership tests also
observe disposal of instance buffers and seasonal copies while preserving source resources.

## Acceptance and limits

- Passed: deterministic slots and stable quality subsets; safe source-footprint/grade/water/
  path rejection; no extra props inside authored Farmyards; no fake gameplay inventory.
- Passed: unchanged Core/RNG/blueprint/discovery/navigation and save/load plans on both
  real campaign geographies; facts ignore stocks, ages, births and private rival changes.
- Passed: household moves/vacancy, asset/upgrade/removal cycles, seasonal coverage,
  source ownership, unknown/mapped visibility and zero warm rebuilds.
- Passed: fixed per-quality budgets (Low 40 props/160 cover, Standard 64/320), up to nine
  color draws plus five existing-map prop shadow draws, no new textures/passes/dependencies.
- Review required: owner visual acceptance across the included scenes and real play.
  A strict frame-time budget still needs a less variable target-machine profile and physical
  mobile QA. Large-tree redistribution, public-facts rival dressing, shore cargo reservations
  and the broader reference gap remain explicitly outside this first slice.

Reproduction commands and architecture are in
[the implementation note](../../SETTLEMENT-DRESSING-203.md).
