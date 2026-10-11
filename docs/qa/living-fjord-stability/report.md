# Living Fjord v0.6C stability review — 2026-10-11

The scene reconciles 25 real seeded Winters and controlled crowds of 10, 25 and 50 residents without changing Simulation Core replay. The selected resident has one gray name-and-line label; traits and expandable heritage appear in the management panel. Original Fjordside retains its profile card.

## Lifecycle and reconciliation

Seed 17 uses normal mortality, reproduction and weather rates. Initial reserves are deliberately 10,000 Food / 1,000 Materials and founding pairing is 100%; this is lifecycle coverage, not an unmodified economy measurement. Founding plus 25 public Winter advances produce 26 browser checkpoints: 8 child births, 1 resident death, 9 cattle births, 11 cattle deaths, 3 building collapses, one upgrade and one salvage, plus residence changes and a replacement house. Normal, Mild, Harsh and Severe weather occur.

Every checkpoint verifies actual model identities, cattle stages/parents/assignment/shelter, weather/fog, exact individual production totals and surviving instance continuity. There are zero stale agents, out-of-zone placements or overlapping body proxies. The final exported Core state deep-equals the independently replayed commands. Visual motion does not modify Core RNG, work progress, stocks or events. Ages 0–4 remain indoors and management retains their identities; outdoor children start at 5. Caregiver eligibility remains the saved Core rule, distinct from the two-Winter birth cooldown.

New cattle defaults follow the owner's correction: Young below 1, Young Adult from 1 to below 3, Adult from 3 Winters. Adult cow output/consumption/fertility starts at 3. Existing saves retain their explicit thresholds. Current gameplay documentation is updated; historical reports are retained.

The run exposed two regressions: a growing calf exhausted the remaining source-yard gaps, and a returning resident overlapped a survivor. Public red → green tests now preserve safe stage-change positions, use actual source floor/walls rather than a coarse house proxy, perform bounded herd recovery when needed, and separate returning agents. The FarmHut terrain instance expands horizontally within its existing 13 m parcel (2 cm footprint margin); fences/props follow that transform. Source GLBs, house dimensions, body sizes and vertical foundations are preserved. Canonical capacity remains four, with overflow outdoors.

[Lifecycle evidence](lifecycle/winters.json) · [Growth failure before correction](lifecycle/red-calf-growth.json) · [Resident-return failure before correction](lifecycle/red-resident-return.json).

## Running crowds and interruptions

Each case runs at least 120 active seconds in native Edge, Low quality, DPR 1. Adult crowd fixtures are validated canonical records with varied DNA; 25/50 residents share the original households and use 12 cattle. Two Farmyards split the herds, including inside/overflow distribution and young/adult bodies. Quiet lifecycle/weather settings and generous reserves isolate movement cost. These are controlled inputs, not naturally grown populations.

All cases observe Walk, Graze, Talk, Listen, Farm and Attack, with approach/activity/home phases. Dense cases also observe HumanInteraction. Pause freezes poses. Explicit save/load, visibility suspension and 2D → 3D handoff preserve the full Core state and return paused without catch-up. Tablet emulation checks drag rotation and spread zoom. A separate touch regression selects a moved resident and verifies one label plus expandable panel heritage. Agent/actor counts agree; no out-of-zone/body-proxy overlaps or browser errors occur.

The earlier 60-second 50-resident run did not yet observe Attack. The full cases were extended to 120 active seconds without weakening the assertion. These crowd runs do not observe every fisher's Doze visit. Existing #95 browser evidence demonstrates Sit_and_Doze_Off on dry shoreline support; an additional public controller regression gives each occupation up to 600 active seconds and verifies activity completion and physical home return. Farmers retain the existing exterior Farmyard terrain visit; this report does not certify walking inside the authored fence.

| Case | Active seconds | RAF interval median / p95 / max, ms | Controller median / p95 / global max, ms | Render CPU median / p95, ms |
|---|---:|---:|---:|---:|
| 10-desktop | 121.39 | 16.70 / 66.60 / 166.70 | 0.30 / 4.10 / 148.20 | 6.60 / 12.90 |
| 25-desktop | 121.80 | 16.70 / 116.60 / 600.00 | 1.50 / 15.40 / 485.30 | 13.70 / 24.60 |
| 50-desktop | 120.52 | 16.80 / 166.40 / 649.90 | 3.30 / 38.30 / 491.10 | 21.40 / 36.70 |
| 50-tablet | 120.93 | 33.30 / 150.10 / 716.60 | 3.30 / 22.70 / 509.80 | 22.80 / 41.30 |

[Browser summaries](browser.json). Corresponding *-samples.json files retain individual observed RAF intervals and diagnostics snapshots (about every 500 ms), including peaks. These are not GPU timings. Controller timing is sampled except for its cumulative maximum. Render callback CPU duration includes scene work and the renderer call. Body diagnostics use collision proxies; they do not certify that every skinned animation vertex is clip-free.

## Cost comparison and hardware

A separate public-controller run performs 1,200 updates of 0.1 seconds per crowd, without rendering/source-floor callbacks. The nature spatial index preserves the exact clearance predicate; immutable-world placement sorting is cached. Compact production anchors and throttled diagnostics avoid full per-frame descriptions.

| Residents / cattle | Projection median before → after, ms | Controller median before → after, ms | Controller p95 before → after, ms | Controller max before → after, ms |
|---|---:|---:|---:|---:|
| 10 / 3 | 8.40 → 0.66 | 0.41 → 0.18 | 1.86 → 0.77 | 126.80 → 17.54 |
| 25 / 12 | 7.72 → 0.81 | 1.18 → 0.68 | 20.14 → 2.69 | 621.90 → 105.07 |
| 50 / 12 | 7.40 → 1.52 | 3.48 → 1.75 | 31.20 → 4.48 | 1351.38 → 230.35 |

[Baseline](baseline-controller.json) · [Optimized measurement](controller.json). These retain timing summaries and periodic diagnostics, not every controller update timing. The comparison precedes later lifecycle recovery corrections; the native browser runs above include those corrections and actual models.

Hardware: Intel Core i7-7700HQ @ 2.80 GHz, Intel HD Graphics 630 through native Edge ANGLE/D3D11, about 16 GiB RAM, Windows 10.0.19045, Edge 155.0.4283.45. No software-renderer flags or concurrent build/test profiling workload. Large crowds still show controller peaks around half a second and frame-time outliers; tablet median is about 33 ms. These are recorded limitations, not a smooth-60-FPS claim. The owner chose not to block this prototype on a few-millisecond hardware threshold. Rejected-route searches remain useful future profiling work.

## Device and startup coverage

The owner confirmed movement, tapping, drag and pinch/spread on a physical iPad in Safari. That smoke test reported the duplicate profile. The subsequent gray-label/panel correction is verified with Edge touch emulation; it has not been re-confirmed on physical iPad. [Profile and moved-body touch proof](single-profile.json).

Eight delayed-load/startup cases pass in [startup evidence](startup/startup-races.json), covering hidden/import/pause/load before ready, hidden restart/new campaign and paused handoff behavior. Full Core hashes detect late asset completion incorrectly starting a paused campaign.

## Reproduction

Use one QA browser at a time against the worktree's local/LAN Vite server. Freeze runtime source and avoid simultaneous CPU builds/tests during browser measurements. Scripts: check-fjord-stability-winters.mjs, check-fjord-stability.mjs, check-fjord-single-profile.mjs and measure-fjord-controller.mjs under scripts/qa. For check-fjord-startup-races.mjs set QA_NATIVE=1 and QA_OUTPUT=docs/qa/living-fjord-stability/startup.

Local validation passes: 550 tests passed, 0 failed, 1 existing optional local authoring-fixture test skipped (551 total); TypeScript, Vite build and full character validation including explicit Lab previews pass (20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules). Current-head CI is recorded in the PR. No formatter is configured: changed source is reviewed manually and checked with git diff --check. Historical #95 evidence is unchanged.
