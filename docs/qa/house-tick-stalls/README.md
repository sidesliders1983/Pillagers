# Recurring stalls after building a house

Recorded 18 October 2026 against merged main `6e26ff6fdcf259d220bf6662c4fbd827e9751a29`, including the public runtime asset publication from #201. The owner reported smooth motion before construction and repeated interruptions between updates once a house existed.

## Cause and change

`FjordCampaign.project()` projects the home settlement and the living rival on the same immutable island. `projectFjordGround()` previously retained one path result per world. Each clan's projection overwrote the other's result. Tents skipped the expensive path pass; a permanent home introduced a full terrain-grid walkability scan and path search on every new presentation revision.

`src/fjord-play/FjordGround.ts` now retains the latest geometric signature and owned path result for each settlement nucleus. Each world holds at most eight entries and remains weakly referenced. Changes to plots, tents, entrances or campfires invalidate that site's result. Returned path data stays independently owned. No simulation rules, RNG, house costs, discovery masks, model pipeline, save format, shaders or dependencies change.

The three regression tests first reproduced two failures on the original code. They verify alternating clans without redundant terrain queries, independent ownership, local invalidation against an uncached reference, bounded eviction and separation of world instances. They use actual terrain interpolation and pathfinding, with a counted terrain accessor instead of timing assertions.

## Paired measurements

[measurement.json](measurement.json) contains source byte hashes, local browser measurements and all 44 matching snapshot hashes. Seeds 17 and 32 exercise the two current curated terrains, 7 and 18. Each real campaign uses normal stocks, salvages the founding longship and pays for two homes. Every command, Core result, home/rival ground result and projected entity/layout result matches the control. The eight recurring updates per house count are separate from the initial construction pass.

| Campaign seed / terrain | Homes | Control projection p50 | Fixed projection p50 | Control p95 | Fixed p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 17 / 7 | 1 | 229.7 ms | 3.0 ms | 274.7 ms | 3.4 ms |
| 17 / 7 | 2 | 228.4 ms | 3.1 ms | 243.0 ms | 6.4 ms |
| 32 / 18 | 1 | 260.9 ms | 2.0 ms | 272.7 ms | 3.5 ms |
| 32 / 18 | 2 | 268.2 ms | 2.6 ms | 296.5 ms | 2.7 ms |

Native desktop Edge at a 390 × 844 viewport, using the same normal rendering settings and the QA-only observer, measured 20 foreground updates with one house. Mean `campaign.project` CPU time fell from **218.5 ms to 1.5 ms**, and p95 from **230.9 ms to 2.6 ms**. The 10-second sample contained **19 long tasks before and zero after**; frame interval p95 changed from **233.5 ms to 83.5 ms**. Browser script errors were absent in both samples.

These measurements isolate recurring presentation work. Initial construction still performs real geometry/path work once. Overall rendering remains expensive on the Intel HD 630 and this change makes no general FPS or GPU-performance claim. Touch viewport emulation does not certify a physical iPhone or iPad.

## Reproduce

Run the regression tests:

```sh
node --test tests/fjord-ground-cache.test.mjs
```

Measure the control and current implementation in separate Node processes, sequentially, with the same checkout and no other active profiling workload:

```sh
QA_GROUND_REF=6e26ff6fdcf259d220bf6662c4fbd827e9751a29 QA_OUTPUT=artifacts/house-updates/control.json node scripts/qa/profile-house-updates.mjs
QA_OUTPUT=artifacts/house-updates/candidate.json node scripts/qa/profile-house-updates.mjs
```

The commands above use POSIX environment syntax; PowerShell users can assign `$env:QA_GROUND_REF` and `$env:QA_OUTPUT` before each invocation, clearing `QA_GROUND_REF` for the candidate. `QA_SEEDS` accepts a comma-separated campaign seed list. `GIT_EXECUTABLE` can select an explicit Git binary. Timing is informational; compare each ordered sample's `coreSha256`, `groundSha256` and `layoutSha256` for exact equality. `sourceSha256` hashes actual file bytes, so line endings affect that source hash.

For browser reproduction, run `node scripts/qa/fjord-runtime-server.mjs`, open `/fjord-play?seed=32`, pause, salvage the longship and build a home. Resume for at least ten seconds and compare a Performance trace with the original version. The observer exists only on this loopback QA server. The LAN build uses ordinary production files.

Formatting was reviewed manually because the repository has no configured formatter; `git diff --check` and the QA script syntax check passed. Public asset validation and the normal TypeScript/Vite build passed, retaining the existing large-chunk advisory. Explicit character/Lab validation passed for 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped modules. Full-suite and final production UI results are recorded in the pull request's validation notes.
