# Macro-geography refinement — issue #133 / PR #138

Date: 13 October 2026. Generator: `fjordside-island-v0.3b-r2`.

The refinement changes accumulation geometry, glacial basin organisation and coastal elevation shaping. It stays within macro geography. The renderer, ground textures, biome rules and final settlement selection are unchanged. Owner visual acceptance remains pending; this report does not authorize a merge.

## Review evidence

[Open the before/after gallery](review.html). It compares the same five requested seeds: **17, 42, 91, 1983 and 1337**. Each has an undecorated top-down elevation view and an oblique neutral-material view, both before and after. Both versions were rendered in the current Environment Lab with identical camera presets, 1440×1000 viewport, Day lighting, paused water, and fog, Nature and Meshy village disabled. The oblique camera was pulled back equally for both versions after a browser assertion detected cropped headlands. The full coastline now fits inside the frame with a margin.

The [first-pass report](../macro-island-v03b/report.md) and its original images remain unchanged. The `before-*` images in this folder are new captures of explicitly versioned first-pass worlds, not replacement historical evidence.

## What changed

- **Accumulation:** one to three rift zones, with wider variation in aspect, offset and heading. The old saturated plateau core is removed; overlapping lava fields and broad bedrock variation remain a single continuous terrain field.
- **Drainage:** outlet ranking considers contributing area and route length. The number/separation of major basins, tributary count, upland reach, floor depth, width and drowned proportion vary. Surviving ground forms the ridges; there are no independent mountain-cone placements.
- **Valley transitions:** all route segments contribute continuous erosion envelopes. This fixes abrupt floor jumps at bends. Eight bounded local smoothing passes reduce artifacts from the 8m routing grid on the 2m canonical terrain.
- **Coasts:** a spatially varying remap and basin-dependent deposition replace the universal low-elevation compression. Shelves have differing elevations, slopes and inland transitions, including gently raised benches; settlement candidates never write terrain.

## Measured comparison

| Seed | Land aspect, before → after | Coast area below 2m, before → after | Main valleys / tributaries | Natural pocket areas, m² |
| --- | --- | --- | --- | --- |
| 17 | 1.77 → 1.90 | 76.2% → 36.3% | 3 / 4 | 4780 / 3608 |
| 42 | 1.76 → 1.06 | 66.0% → 34.8% | 3 / 5 | 5948 / 3172 |
| 91 | 1.82 → 1.55 | 69.6% → 34.8% | 3 / 5 | 5400 / 3016 |
| 1983 | 1.83 → 1.94 | 71.0% → 41.2% | 4 / 5 | 6428 / 3932 |
| 1337 | 1.67 → 1.85 | 67.7% → 45.4% | 3 / 3 | 7808 / 3280 |

Aspect is measured from the dry-mask covariance and is independent of rotation. The coastal fraction measures dry samples within 40m of the actual coast and less than 2m above water. These are engineering diagnostics, **not geological-realism scores**: raising a shelf alone would improve the fraction, so the bare images and varying widths/slopes must also be reviewed. Outlet depth and flooding-proportion measurements are retained in [batch.json](batch.json).

## Physical and compatibility checks

All ten fixed seeds — 17, 91, 1983, 42, 18, 104, 211, 512, 819, 1337 — pass the unchanged shape and compartment screens. Each retains one landmass, a complete sea border, lowland/valley/highland relief, two measured natural pockets, a substantial intervening ridge, and terrain-only walking connections between the pockets and to the coast. Coast seams are closed; regeneration and save/load are identical. These are coarse feasibility regions, not final settlement sites or a line-of-sight guarantee (#134).

Explicit `fjordside-island-v0.3b` generation retains its original algorithm and pinned seed-17 blueprint hash. Existing `fjordside-v0.1` hashes remain unchanged. Imports of both earlier versions load stored geography intact. Only r2 permits deeper fjord floors down to −20m; old import bounds remain −10m. The historical rejected seed 73 / relief 1.5 remains tied to its first-pass version and is still rejected without reseeding.

Validation:

- Public island/legacy terrain suite: **26/26 passed**, including four new red→green regression tests for version preservation, structural spread, different incision profiles and coastal elevation diversity.
- Browser checks: **passed**. Five before/after comparisons, coastline framing, full export/import, old-world imports, repeated replacement, quality switch, rejected proposal, Reference fallback, and 1024px touch / 390px layouts. No browser errors. The framing regression was reproduced before the camera correction.
- Production build: **passed**, with the existing large-chunk advisory.
- Full suite: **696 tests, 695 passed, 0 failed, 1 existing opt-in evidence test skipped**.
- Required character validation: **passed**, including Lab previews, 20 assets / 36 GLBs, 12 Golden Characters and 19 equipped modules.
- Formatting: manually reviewed against repository style; `git diff --check` passed. No project formatter is configured.

## Visual assessment and limits

The five seeds now differ in overall proportions, basin direction and relative headland size. High ground ranges from longer narrow ridges to wider retained blocks. The outer coast is no longer confined to a uniform near-sea-level apron, and interior lowland shelves follow different eroded basins.

The result remains a stylised, settlement-scale approximation. Some outer shelves and highland shoulders are still broad and smooth; the neutral render makes this visible. Numerical acceptance does not establish that these forms meet the owner's Icelandic-basalt reference. Any further macro-form revision belongs to #133, not a promise that vegetation or ground textures will hide it. No new rendering technology or full physical geology simulation was introduced.

## Reproduction and measurement limits

```powershell
$env:QA_OUTPUT='scratch/macro-island-refinement'
node scripts/qa/measure-macro-island.mjs
$env:QA_SEEDS='17,42,91,1983,1337'
$env:QA_ORIGIN='http://127.0.0.1:5180'
node scripts/qa/check-macro-island.mjs
node --test tests/macro-island.test.mjs tests/world-generation.test.mjs
```

[batch.json](batch.json) records hashes, actual config, measurements and before/after metrics. [browser.json](browser.json) records capture settings and browser evidence. Generation times are observations on the development laptop while other local work could be active; they are not isolated performance benchmarks. Heap/RSS values are before/after observations, not peak or GPU memory. Tablet emulation does not establish physical iPad performance.
