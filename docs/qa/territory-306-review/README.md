# Territorial awareness review follow-up (#306)

Date: 2026-11-12. Tested runtime: `e78658217023a048c06449f2e35310c140229fbb`.
This addresses the [review of PR #328](https://github.com/sidesliders1983/Pillagers/pull/328#issuecomment-6819324623).
The [initial validation record](../territory-306/README.md) remains a historical measurement.

## Reproduced failures and resulting behavior

- A real dispersed party could stay Suspicious when its first seen member was outside and another seen member was inside. All actual sightings now contribute; observed interior evidence takes priority in stable identity order. An unseen interior member cannot escalate an outside-only sighting. Four roster/ID permutations, warning provenance, engagement identity and save/replay are tested.
- Real births could exhaust a household's bounded exterior search and abort advancement. Saved indoor placement now preserves the person, age, family and history while the campaign continues. Retries occur every 25 canonical ticks. Outdoor visibility, work, observation and assignments wait for a distinct connected home and a genuinely clear exit; ordinary care remains available indoors. Tests cover multiple births, age five, occupied exits, real caregiver reassignment, both clans, exact save/split continuation and invalid imports.
- A transferred resident without a prior household could wait at the blocked campfire. Its transfer receipt and actually returned crew now supply the factual arrival reference. Public People Pillage, natural vacancy and actual crew departure prove recovery without a new building or an obstacle-crossing jump. Existing homecoming outcome rules remain intact.
- The populated pre-fix source wrote an off-grid connector across an unsupported navigation cell, then rejected it on the next command. Canonical residents now use the existing router's optional strict-navigation mode and validate routes before saving them. Legacy four-argument routes retain their behavior. The actual 72/51-resident checkpoint advances 300 individual ticks past its former failure with continued movement and exact restore; see [the replay record](populated-route-replay.json).
- A scheduled birth at a working mine could create conflicting indoor ownership during the mother's real return. The home-ownership guard preserves the exact delivery tick and visible mining return; childcare placement starts only at home. Batched/split return, save/load and the single MinerReturned receipt are tested.

The current [gameplay contract](../../gameplay/TERRITORIAL-AWARENESS-V01.md) documents placement, eligibility, routing and the unchanged encounter boundaries.

## Final verification

Production build and **110/110 focused tests across 17 files** pass, with no skipped tests. Additional targeted mechanics, birthdays, mining and cultural regressions pass. TypeScript and diff checks pass; formatting was reviewed manually because the project has no configured formatter.

The required island preparation ran the full generator for all 14 versioned catalog entries. All compressed bytes and canonical geometry hashes remain identical; only the generated LandRoutes source fingerprint changes. See [the regeneration proof](island-regeneration.json). Validation was retained.

## Bounded Core performance

These are public Core command wall times, including state cloning, validation and one tick for both clans. Each of eight fresh Node processes used 20 warmup ticks and 250 measured ordinary ticks, without a Winter transition or competing build/test/browser work. Actual 72/51 and 126/102 populations exceed the requested 50/100 per-clan thresholds. One/two visiting groups reached Alerted → Hostile with two/four real responders.

The same progressed save is forked into disabled/adopted variants on the same source. Both bind one immutable physical exclusion set from actual adopted public projection before dispatch. This controls two lazily materialized cosmetic house plots at the larger population. Context hashes, domestic RNG, biological cohorts, accepted member routes, reached progress and save/load must match. Core/persona/event/body state is not inserted.

Every paired value below is **disabled → adopted**. Heap/RSS are post-GC fresh-process observations; negative deltas do not establish memory savings. Serialized Core sizes are exact bytes at the measured window's end.

| Living residents, player / rival | Visiting groups | p95 Core ms | Heap MiB | RSS MiB | Serialized Core bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 72 / 51 | 1 | 43.63 → 121.57 | 60.16 → 58.88 | 336.35 → 336.20 | 713,595 → 773,574 |
| 72 / 51 | 2 | 53.81 → 123.06 | 60.38 → 59.17 | 336.29 → 337.20 | 728,471 → 793,103 |
| 126 / 102 | 1 | 66.86 → 191.74 | 61.75 → 60.67 | 337.09 → 337.89 | 1,400,699 → 1,503,396 |
| 126 / 102 | 2 | 78.89 → 145.83 | 61.92 → 60.89 | 338.80 → 337.87 | 1,415,401 → 1,520,901 |

**Material CPU overhead remains.** These results establish neither an FPS target nor mobile thermal/device acceptance. Hardware: Windows x64, Intel Core i7-7700HQ, 16 GiB RAM, Node 24.22.1. The normal workstation is not dedicated benchmark hardware; one sampled run per variant does not establish causal timing changes between revisions.

See the [compact results and cohorts](performance-summary.json), [measurement protocol](benchmark-protocol.json), [complete raw results](performance-raw.json.gz) and [scenario provenance](scenario-report.json). The exact sources and executed script hashes are recorded in [source-pin.json](source-pin.json) and [executed-script-hashes.json](executed-script-hashes.json).

An untimed earlier V8 profile identified routing as the main added hot path: roughly 31% inclusive samples, primarily ordinary resident routing. Requests whose adjusted destinations would already be discarded now stop before the search. All 271 serialized Core states match exactly before/after that optimization; all eight final benchmark end states also match the preceding runtime. See [trace parity](optimization-parity.json), [final end-state parity](end-state-parity.json), [profile summary](historical-cpu-summary.json), [routing callers](historical-routing-callers.json) and [raw sampled profile](historical-routing.cpuprofile.gz). The pre-fix route failure is preserved in [the original blocker record](historical-pilot-blocker.json); no completed pre-fix enabled timing comparison is claimed.

## Genuine progression and reproduction

The [50-threshold](population-50.shared.json.gz) and [100-threshold](population-100.shared.json.gz) input campaigns grew through public commands and real births, with individual birthdays and preserved names/kinship/history. Their accelerated birth/partnership chances, zero care/cooldown, controlled mortality and funding are explicit stress setup, not production balance evidence. Actual age, outdoor, work-age and care cohorts are in the results.

The separate [ordinary 25-year input](default-care-25.shared.json.gz) retains normal fertility ages/chance, birth interval, childcare and aging; only funding, mortality and weather are controlled. It includes genuine second-generation residents. Public continuation also produced a 24/18-resident family review save and an explicitly accelerated 145/129-resident stress review save, both paused and exactly restorable on the final runtime.

To reproduce, copy the `.mjs` files in [reproduce/](reproduce/) into `scratch/territory-review-306` under a clean source checkout with locked dependencies. Run the population/default-care generators, then prepare scenarios with `PROFILE_COMMON_CONTEXT=1`, and run the measurement orchestrator. `PROFILE_SOURCE_ROOT` selects the clean checkout; `GIT_EXE` optionally selects Git. [usage.json](reproduce/usage.json) gives commands and limits; [manifest.json](reproduce/manifest.json) records original and portable script hashes. Portable copies change only host paths/output setup, not timing loops. Measurements use the exact original executed scripts.

## Browser evidence and acceptance

Native Chrome 157.0.8103.52 passes all three final scenarios with zero page errors: actual historical-file import → Withdraw → Closed/Returned → linked Activity → normal Continue/reload on desktop and touch landscape, plus the real progressed family scene and resident card. The family has 24 local residents and exactly 22 rendered local bodies; indoor references remain mesh-free while identity, age and childcare availability stay inspectable.

- [Desktop warning](desktop-imported-warning.jpg)
- [Touch warning](touch-landscape-imported-warning.jpg)
- [Linked incident history](desktop-withdrawn-linked-history.jpg)
- [Indoor resident details](desktop-family-indoor-resident-details.jpg)
- [Raw native browser record](native-browser.json)

Touch landscape is Chrome emulation. **Physical iPhone Safari UAT remains pending.** The PR stays draft for exact-head CI and the review's requested owner visual/behavior acceptance before merge. On-site damage/loot, equipment fitting and combat clips remain the later epic slices.
