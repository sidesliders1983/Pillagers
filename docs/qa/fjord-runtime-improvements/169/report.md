# Issue 169 — failed route investigation and measured optimization

> Evidence archive: bulky generated captures are retained at the pinned merged commit. See [access and restore instructions](../../fjord-performance-evidence.md). Measurement results, source pins and limitations below are unchanged.

Pinned baseline: `5ef856fa336783f9045d5c9c1ded7baf7fb633e8` (measurement only). Queue/retry implementation: `9f01c0f1282f1d146803fdb12a22d82c65957794`. Final route implementation: `8860e53ad4883f3bdf9663d629a42fcc75338f49`, before the clothing optimization. Historical audit #166 is unchanged. All three issues share draft PR #167 at the owner's explicit request.

## Actual cause

The developed real-house fixture strands `persona:founder-6`, a fisher, after a valid outward trip to the shore near (78.72, 189.45). Its home is (35.8, 139). The bounded search cannot rediscover that long return corridor within the unchanged 2,000-node limit. Of 814 observed rejection rows, 751 node-cap failures and 42 occupied-endpoint failures share this agent/home goal: **97.4%** of rejects. These are repeated invalid goals, not completely identical world inputs: other residents move, so the full occupancy context matches zero times. The bounded observer records identity, goal, reason, navigation/reservation generations and steps; it allocates no rows when disabled. See [causes.json](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/169/investigation/causes.json) and [native-summary.json](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/169/investigation/native-summary.json).

The native investigation attributes about 41.6 sampled inclusive CPU seconds to route searches, 24.2 to static safety checks, and 13.2 self seconds to the old repeated open-set comparator; these call trees overlap. This supports optimizing both repeated failures and the sorted search queue, rather than attributing all Running cost to a single component.

## Implementation and behavior

A stable binary min-heap replaces repeated whole-open-set sorting for goal searches; wandering retains FIFO order. Neighbor order, clearance probes, route geometry and node limits remain unchanged. At most eight failed goals per actor are remembered for one active presentation second. Paused/hidden time does not expire retries or cause catch-up. Starts/goals, static geometry, house/source-yard changes, assignment, occupation, target removal, reservations and endpoint blockers invalidate appropriately; transient other traffic is retried within the bounded second. No goal is permanently blacklisted.

A worker retains its actual successful outward corridor as owned bounded waypoints. Its return revalidates every current static segment and the final connection to the current home; actual movement and passing still check body clearance. The previously stranded fisher visibly walks home rather than teleporting. Home arrival, canceled work, changed home and actor removal release retained corridors. The actual source-yard cache evicts one oldest point at capacity instead of clearing every entry at once, and rebuilding a moved house invalidates its sampler.

Only 3D presentation planning changes. Core/RNG, production, careers, births/deaths, age, commands, year pace, save schema and canonical path rules are unchanged.

## Controlled measurements

Three baseline five-minute Running trials and three final five-minute trials use the exact frozen `developed-810` campaign, actual eight owner-prepared house GLBs, no placeholders, Edge 155 / Intel HD 630, Low quality/effects, DPR 1 and fixed camera. The first pair includes identical native CPU sampling; the other pairs are unprofiled. Each trial commits the same **1,666 ticks** through matched 500 ms command deadlines and ten 30-second windows. Frame/heartbeat observation remains continuous across windows. The three worst late windows are selected from each baseline and those same indices compared after. Active presentation seconds and arrival rates are reported separately from canonical ticks.

| Trial | Late route CPU before -> after (s) | Change | Worst window motion p99 before -> after (ms) | Worst route before -> after (ms) | GPU mean before -> after (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 (profiled) | 38.915 -> 1.995 | -94.9% | 253.2 -> 251.1 | 516.3 -> 1057.4 | 71.4 -> 79.4 |
| 2 | 31.658 -> 3.101 | -90.2% | 193.2 -> 213.1 | 586.9 -> 1449.5 | 71.3 -> 86.2 |
| 3 | 26.940 -> 1.070 | -96.0% | 349.4 -> 362.2 | 523.3 -> 1204.8 | 83.2 -> 82.4 |

Paired median late route CPU change: **-94.9%** (range -96.0% to -90.2%). All three pass the 80% reduction target. Paired median observed GPU change: **+11.2%** (range -0.9% to +20.9%). Rendering is unchanged; these host-dependent deltas do not establish a GPU improvement.

| Trial | Occupation arrivals before -> after | Home arrivals before -> after | Occupation arrivals/active minute before -> after | Home arrivals/active minute before -> after | Frames >50ms before -> after | Worst window frame p95 before -> after (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 -> 8 | 5 -> 6 | 1.576 -> 1.584 | 0.985 -> 1.188 | 3640 -> 3564 | 283.3 -> 166.8 |
| 2 | 9 -> 7 | 6 -> 5 | 1.781 -> 1.391 | 1.187 -> 0.994 | 3811 -> 3147 | 266.7 -> 316.7 |
| 3 | 9 -> 7 | 5 -> 5 | 1.782 -> 1.385 | 0.990 -> 0.989 | 3268 -> 2962 | 283.4 -> 266.6 |

The strict **motion p99 <25ms gate fails in every trial**. The **median occupation arrival-rate gate fails**; the median home arrival rate passes. The worst cold route also increases in these captures, so a claim of no worsened single-search latency is not supported. Raw counts above 50ms decline in every trial, while the fraction above 50ms changes 92.5%→97.0%, 93.8%→94.5% and 93.4%→83.9%; the first two worsen. Worst-window p95 worsens in trial 2. The no-worsened-hitch-frequency gate therefore is not demonstrated. Most frames exceed 50ms on this integrated GPU, so these raw counts depend on frame throughput and do not by themselves prove lower hitch frequency; total counts/fractions are retained alongside the timing distributions. Motion depends on wall-clock presentation and actor traffic, so these rate differences do not establish a canonical simulation regression; they do prevent claiming full behavior/performance acceptance. Raw individual windows and arrival counters remain in [results.json](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/169/results.json) and each final-r*.json.

The initial queue-only 24-run matrix is retained in [paired.json](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/169/paired.json) / [queue-only-results.json](https://github.com/sidesliders1983/Pillagers/blob/933deeaf13aa005a14564eaea4cc3c724981f446/docs/qa/fjord-runtime-improvements/169/queue-only-results.json): median late route CPU -95.3%; all 80% CPU reduction gates passed, but cold motion p99 and median occupation arrival rate gates missed. That incomplete result prompted the actual return-corridor fix; it has not been replaced or hidden.

Final Paused, alternate seed 17, founding seed 32, 25-person crowd and offscreen controls are in `final-controls.json`; the earlier matrix includes two matched before/after repetitions of each. These controls also expose large host-wide GPU shifts, including a Paused pair around 126 versus 74 ms with unchanged rendering. GPU timings are real non-disjoint command queries, not JS submission or utilization percentages. No causal GPU speedup is claimed.

All final and original scheduled pairs preserve exact canonical and full campaign/narrative/checkpoint hashes. Captures assert zero placeholders, zero new body overlaps and zero out-of-zone actors. The broad controls include different settlement geometry, populations and season transitions. Six targeted route regressions cover active-time expiration, static/assignment/occupation/stage/target/source-yard invalidation, moved endpoint blockers/reservations, bounded memory/removal, real walking after failure, complete outward/return movement and obstacle/changed-home corridor invalidation. Existing motion/social/cattle/occupation contracts remain green in the full local suite (804 passed, zero failed; one pre-existing opt-in r3 evidence test skipped). Character validation and TypeScript/production build pass; combined current-head CI and production isolation are recorded in the parent report.

## Limits and rollback

The strict motion p99 target and arrival-rate acceptance must be read from the final results, not inferred from the aggregate CPU reduction. Cold searches, physical source-yard probes and the still-unoptimized annual fitting in this isolated source can produce long individual frames. This draft does not claim every latency/behavior acceptance gate is met. Owner review of movement remains required before merge. GPU/heap observations on this shared laptop do not establish physical mobile performance or an allocation rate.

Source changes are separate commits and require no save migration; revert the route/yard source commits to restore the previous planner. Remove the opt-in QA transform to run the unchanged production entry point. The original audit data and unsuccessful intermediate captures remain intact.
