# Island map and Home — #194

The owner requested Map as one icon-and-label item in the existing navigation bar, collapsed by default, superseding both the issue's bottom-right desktop proposal and the first extra icon row. Camera Home is in Settlement → View settlement, with no standalone Home icon. There is one numbered destination flag per active group, never individual resident markers. Returning groups point Home. [Current contract](../../ISLAND-MAP-V01.md).

## Validation

24 related map/discovery/camera tests pass. Focused browser controls pass: Map is one icon-and-label item in the existing bar, starts closed, toggles; known points focus only and unknown points reject; Phone Map is a deliberate modal sheet; Escape closes; there is no extra row or standalone Home button. Geographic marks are explicitly checked inside the raster's SVG overlay, rather than inside toolbar icons.

Actual Fjord scene checks: campaign 32, terrain 18: Map is one item in the existing bar; Settlement → View settlement returns the camera without extra icons or Core changes; Three orbit/zoom changes retain camera footprint and leave Core unchanged; Phone portrait/landscape and tablet use a closable modal map and the existing navigation bar, without horizontal overflow; Reload preserves exact campaign and starts the map collapsed; A running expedition continues canonical ticks while the map is open. campaign 17, terrain 7: Map is one item in the existing bar; Settlement → View settlement returns the camera without extra icons or Core changes; Three orbit/zoom changes retain camera footprint and leave Core unchanged. campaign 1983, terrain 7: Map is one item in the existing bar; Settlement → View settlement returns the camera without extra icons or Core changes; Three orbit/zoom changes retain camera footprint and leave Core unchanged. No page errors. These are three campaign seeds on **two distinct production terrains**, not three island geometries.

Lifecycle checks: DPR 2 import replaces terrain 7 with terrain 18 and exact canonical state, with one map/control instance; Restart rebinds the founding map and removes old expedition flags without duplicate controls. Known places guidance: An away Explore group explains its blocked Recon action and can be recalled from Known places without another charge or elapsed time; Surveillance/Pillage still require a returned successful Recon; no at-site mission conversion is introduced; Actual homecoming enables Recon for the same group without prematurely unlocking Surveillance; The production Expeditions workspace displays the explanation and return action. Separate missions still depart from home; this UI follow-up changes no mission rules.

The paused campaign remains byte-equivalent through camera navigation, Home and orbit/zoom. Map clicks do not commit expedition orders or discovery. Existing UI uses the Horizon shell; physical iPhone/iPad testing remains open. Screenshots are from the actual game and were inspected visually. [Existing Horizon reference](../mobile-horizon-182/README.md).

## Measurements

Windows Edge on the development laptop. Each row retains all 120 consecutive frame intervals in [scene.json](scene.json); p50/p95 are frame intervals in milliseconds, not isolated map CPU timings. Closed/open is a same-build comparison, not a historical before/after claim. No millisecond threshold is used as a merge gate.

| Campaign / terrain | Quality | Map | Frame p50 ms | Frame p95 ms | Scene draw calls | Map generation ms | Maximum camera overlay ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 32 / 18 | low | Closed | 66.90 | 83.60 | 124 | 10.10 | 2.30 |
| 32 / 18 | low | Open | 66.90 | 100.10 | 124 | 10.10 | 2.30 |
| 32 / 18 | standard | Closed | 83.30 | 100.10 | 124 | 10.10 | 2.30 |
| 32 / 18 | standard | Open | 83.40 | 116.70 | 124 | 10.10 | 2.30 |
| 17 / 7 | low | Closed | 100.10 | 133.40 | 108 | 13.90 | 2.30 |
| 17 / 7 | low | Open | 83.40 | 100.20 | 108 | 13.90 | 2.30 |
| 17 / 7 | standard | Closed | 150.10 | 650.50 | 108 | 13.90 | 2.30 |
| 17 / 7 | standard | Open | 116.80 | 550.50 | 108 | 13.90 | 2.30 |
| 1983 / 7 | low | Closed | 150.20 | 217.00 | 109 | 11.20 | 7.50 |
| 1983 / 7 | low | Open | 150.20 | 1735.10 | 109 | 11.20 | 7.50 |
| 1983 / 7 | standard | Closed | 133.60 | 634.00 | 109 | 11.20 | 7.50 |
| 1983 / 7 | standard | Open | 133.50 | 567.20 | 109 | 11.20 | 7.50 |

The geographic preview is at most 128 × 128. Its typed preview/base/output caches total 212,992 bytes at that size; the Canvas backing is another 65,536 bytes. These are explicit buffer sizes, not a measured total browser heap. No additional WebGL map renderer, texture or draw pass is created. SVG/Canvas DOM compositing and browser overhead are not included in those byte counts. GPU time and isolated retained JS heap were unavailable in this run.

Camera overlays are bounded to at most 10 updates/second while open and only when their signature changes; closing the map skips camera work. Raster and mask work are separate. Recorded diagnostics expose generation time, mask updates, camera update count, maximum camera CPU time and backing bytes. Quality changes retain one geographic base build.

## Reproduce and review

Run `node --test tests/island-map.test.mjs tests/camera-clearance.test.mjs tests/clan-discovery.test.mjs tests/discovery-cache.test.mjs tests/settlement-discovery.test.mjs`, then `node scripts/qa/check-island-map.mjs` and `node scripts/qa/check-island-map-scene.mjs` against the current served checkout. Set `QA_ORIGIN` to override port 5180. Publish with `node scripts/qa/publish-island-map.mjs`.

TypeScript/build, full-suite and exact-head CI results are reported on the draft PR. Source formatting was reviewed manually; no formatter is configured. Owner usefulness/fit approval and physical-device acceptance remain open before merge. Historical reports are unchanged.
