# Hollow tent review - 10 October 2026

The owner approved the Meshy generation thumbnail. The production version preserves that mesh and its authored textures, with a grounded metre frame and compression. Visually inspected the actual running Fjord through its existing review controls; no isolated replacement render or mock world was used.

| Scene | Placement | Closest observed resident clearance | Resident progress during observation |
| --- | --- | --- | --- |
| Reference | x=9, z=17 | 2.98m | all ten moved, 4.43-6.64m displacement |
| Generated seed 17 | x=46, z=17 | 4.28m | all ten moved, 0.85-6.13m displacement |
| Generated seed 91 | x=46, z=17 | 1.52m | all ten moved, 2.00-5.83m displacement |

Each observation contains twenty snapshots with ten residents. All sampled residents remained on safe terrain, followed the rendered ground height and remained outside the complete tent box plus the 0.65m margin. These observations validate the sampled scenes; they are not an exhaustive proof of all approach angles or generated seeds.

## Visual inspection

- [Reference exterior](reference-tent-day.webp): light faceted canvas, dark crossed timbers, rope lashings and open front. Existing houses and clearing remain visible.
- [Reference interior](reference-tent-interior-day.webp): actual camera inside the shell; side walls, rear wall and floor remain visible. The dark irregular patches on the inner canvas are part of the approved Meshy output, also visible in its original thumbnail.
- [Generated exterior](generated-17-tent-day.webp) and [interior](generated-17-tent-interior-day.webp): same model on the dry settlement surface with no visible house or prop intersections.
- [Night](generated-91-tent-night.webp): the sourced tent participates in existing world lighting and shadows.
- Village views are also recorded for all three scenes. The tent adds one shared mesh/material to the loaded scenery set; there is no per-frame rebuild.

## Save and behavior checks

New v2 saves reload with identical geography and tent placement. Importing the corresponding v1 save retains all twenty original props and its version, then exports unchanged. Restoring the v2 file restores its tent. The existing Fjord browser regression also passes fresh generated startup/reload, Reference fallback, explicit generation, pause, save/load and invalid import rejection.

The GLB ray test passed after preparation: front rays at 0.6m, 1m and 1.4m reach the rear wall; inside rays reach the low floor, inner ridge and both inner walls. The first TDD run failed with the missing production asset. The visible integration test first failed because the Tent camera did not exist. The Node geometry check uses the real GLTFLoader; only image bitmap decoding is stubbed at the browser boundary, and the actual images are verified here in the running browser.

Raw snapshots, world descriptions and movement measurements are in [results.json](results.json). The performance label in these screenshots is incidental, not a frame-time benchmark.

## Repository checks

- Full suite: 485 tests, 484 passed, zero failures, one existing opt-in frozen-GLB check skipped.
- TypeScript and Vite production build passed. The existing large-chunk warning remains.
- Strict character validation with explicit Lab preview audits passed: 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run + World. Other character preview approvals remain governed by their existing contracts.
- Source formatting and the scoped diff were reviewed manually; no repository formatter is configured. `git diff --check` passed.
