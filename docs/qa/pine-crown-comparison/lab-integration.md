# Environment Lab — EZ-Tree Large at varied heights
2026-10-08. Extension of PR #69 after the owner's comparison feedback: “dat is wel een verbetering!” The owner requests the trees in Environment Lab at different heights, then authorizes merging the PR after validation.

## Delivered
Open `/environment-lab`. **Conifers → EZ-Tree Large · varied heights** is the Lab default. **KayKit FREE conifers** remains available at the same seed, camera, lighting and placement. Nature visibility hides/restores the active tree set together with its undergrowth.

The same pinned static **Large** source preset/seed (44166) supplies all 72 conifers. Its original crown proportions and materials are retained; uniform scaling maps it onto the existing three KayKit role heights, followed by the existing seeded 0.65–0.95 placement scales. Result: **3.5–10.2 m** actual tree height. This deliberately reuses the stronger Large crown instead of the more open Small/Medium shapes at small heights. No new tree geometry, leaf shader or wind effect is introduced.

Tree count, positions, rotations, masks, cluster centers and non-conifer placement keep the existing seeded policy. Houses, farmyards, resident, terrain collision/heights, selected ground maps, boona13 water and lighting are unchanged. The tree resolver and loader are confined to the Lab. Fjordside remains outside this integration; #60 is not activated.

Each tree set is constructed once and switches visibility, avoiding repeated model loads or buffer allocation on selection. Static native materials/geometry are shared across instanced trunks and leaves. Teardown disposes instance buffers as well as the scene's shared resources. The source export/texture lock and licenses from the original comparison still apply.

## Browser and visual evidence
[Recorded Lab viewer](lab/review.html) · [capture/control observations](lab/observations.json). Ten 1536 × 1024 time-zero captures use the existing native cameras and Day/Night presets, GrassField OFF:
- Both tree sets: village, forest edge and shore in Standard daylight.
- Both tree sets: village in Standard night.
- Both tree sets: forest edge in Low daylight.

The reviewed forest and village images visibly show smaller and taller pines grouped around the existing buildings, with finer crowns and darker natural foliage. The forest view also shows overlapping crowns around the roofs: this is a denser crown treatment within the old placement policy, not final approval of compact coast/backdrop composition. Bright KayKit shrubs and missing backdrop/geometry reflections remain separately recorded gaps. Night preserves the existing cool palette; warm evening/HDR is a later experiment.

Ten KayKit → EZ-Tree selection cycles stabilized at **38 geometries / 69 textures** for the warmed forest fixture. No browser errors or failed HTTP responses. Nature hide/show produced different rendered pixels. These observations support bounded switching behaviour; they are not VRAM/physical-mobile or whole-Fjordside acceptance.

Full-detail pines increase the recorded Standard forest draw from **338,131 to 1,688,563 triangles**. The low ground variant changes these totals to 289,531 / 1,639,963. Most of the difference is the 72 full-detail pine crowns. Instancing reduces calls, not the triangles drawn. Saved renderer frame-pacing numbers are indicative observations from capture/control sessions, not a matched performance protocol or a few-millisecond merge budget. Runtime pine LOD/density tuning remains a future performance decision.

## Validation
The previously agreed Environment Lab browser seam was used for the TDD tracer: before implementation the test failed because the Conifers control was absent; after implementation it passes through the public page, ready canvas and selected EZ-Tree default. The accessible Conifers label is explicit.

```
node scripts/qa/check-environment-pines.mjs
node scripts/qa/capture-environment-pines.mjs
```

Local build passed. Full character validation with the unchanged CI `--lab-previews` flag passed: 16 assets / 32 GLBs, 12 Golden Characters, 15 equipped modules, Idle/Walk/Run + World. The complete existing suite passed: 418 passed, 0 failed, 1 existing opt-in skip (419 total). Current-head GitHub CI must also pass before marking the PR ready and performing the authorized merge.

The original paired comparison, historical Pass 4 images and measurement reports remain as records of their original rules/configurations. This Lab extension is recorded separately.
