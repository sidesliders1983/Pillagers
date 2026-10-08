# Procedural Fjordside v0.1 · acceptance report

## Result and remaining gate

The Environment Lab proposal passes its measured data/browser checks. All ten explicitly requested review seeds are accepted, with six connected authored building approaches and a dry harbor route; all repeat hashes match. The scene preserves original Meshy/KayKit sources and the pinned water implementation. This report does **not** grant Northstar visual approval. Owner art-direction review remains required before live Fjordside adoption, and #60 / production migration is a separate follow-up.

Open [the interactive review](review.html), [the two-seed proof](proof.md), or /environment-lab. Original owner mock-ups are real repository files: [REF-A](../../references/environment/REF-A.png), [REF-B](../../references/environment/REF-B.png). The proof contains nine reference/17/91 views; the final acceptance capture has 24 images (reference high overlook, ten seeds × two views, two diagnostic overlays and night).

## Traceability and sources

Final browser run parent commit: 734793d2bd6f311f00ba0248911fd4dc1f73bccb. Exact tested runtime-file hashes, capture hashes, camera/light settings, browser version, hardware inventory and renderer figures are in [browser-review.json](browser-review.json). Source SHA256 checks remain in the unchanged KayKit manifest/source lock; generated footprints conservatively include off-centre authored bounds. New ground tile delivery hashes and original CC0 map hashes are in public/ground-materials/world-v01/manifest.json. No models, vendor shader GLSL or original texture sources changed. Pinned simplex-noise 4.0.3 has a recorded MIT notice.

The approved source saturation/tints, normals, roughness and physical repeat are retained. Different geography uses source tiles and native alphaMap layers with an independent world UV channel instead of copying the previous geometry-specific atlas. No custom terrain shader is introduced. Quality changes reuse the stored blueprint; a near-zero generation time during that action represents loading/rebuilding, not a new terrain computation.

## Data and suitability

| Seed | Preset | Result | Score | Final connected clearing m² | Nature placements | Maximum height m |
| --- | --- | --- | --- | --- | --- | --- |
| 17 | fjord | PASS | 94 | 2829 | 406 | 35.5 |
| 91 | fjord | PASS | 93 | 2777 | 426 | 39.6 |
| 1983 | coastal-valley | PASS | 96 | 2870 | 460 | 27.0 |
| 42 | rocky-inlet | PASS | 92 | 2755 | 446 | 44.1 |
| 73 | fjord | PASS | 94 | 2810 | 431 | 36.4 |
| 104 | coastal-valley | PASS | 96 | 2894 | 456 | 29.9 |
| 211 | rocky-inlet | PASS | 93 | 2792 | 415 | 42.2 |
| 512 | fjord | PASS | 96 | 2883 | 433 | 41.2 |
| 819 | coastal-valley | PASS | 96 | 2885 | 460 | 28.9 |
| 1337 | rocky-inlet | PASS | 89 | 2662 | 413 | 46.8 |

The blueprint stores 180 × 180m terrain, 8281 Float32-rounded height samples, actual water-level contour intersections, biome/moisture/wear masks, six reference parcels, cardinal routes, final scenery-aware navigation and locked source transforms. Maximum foundation slope and elevation margin, configuration, bounds and replay/placement hashes are in [batch-validation.json](batch-validation.json). No seed is replaced on failure. The search is bounded to twelve candidates; unsuitable worlds retain rejection reasons and receive no village/residents.

Public tests cover replay identity, actual Three.js terrain raycasts versus physical height/water queries, buildability/coastal access, final connected area after scenery, full source clearance, steep shore rock assignment, full blueprint save/load and unknown/corrupt version rejection. Browser export/import reproduces the Node-generated blueprint; unknown future-version import preserves the active world and reports an error. Loading never regenerates saved geometry.

## Browser and movement

Visible seed/preset controls, generated rendering, Standard/Low rebuilds, overlays, night, reference fallback, export/import and unknown-version rejection passed without console, page or HTTP errors. The reference preview is restored from its original scene, rather than a generated approximation claimed to be identical.

Ten fixed source Meshy residents were observed for 20 seconds at 100ms intervals. Every sampled position remained within the public generated walkability domain, had a canonical terrain Y within 0.00001m, and maintained at least 0.9599m pairwise centre separation. Each actor moved more than 4m from its starting point during the observation. Full samples and displacement summaries are in [movement.json](movement.json); [movement-raw.json](movement-raw.json) preserves the raw frames. This bounded observation is not an exhaustive long-duration or every-seed movement proof.

The browser check caught a shortened turn-alignment step that could end outside the valid domain. MovementSystem now validates its actual endpoint as well as the original full-step proposal. Existing default movement compatibility remains covered by the normal test suite.

## Costs and lifetime

Hardware inventory: Intel Core i7-7700HQ @ 2.80GHz; NVIDIA GeForce GTX 1050 and Intel HD Graphics 630. These are reported adapters, not a claim about the active GPU. Browser: native headless Edge 154.0.4258.62. DPR 1, canvas 1536 × 1024, fixed high-overlook camera, fog off, HDR off, paused waves/actors, 20° front sun, sky fill 1, exposure 1.05 and PCF radius 4. Three four-second rAF intervals per fixture/tier follow settling. Individual intervals, including outliers, are retained in browser-review.json; the table shows means of the three run medians/P95 values. This short old-laptop measurement is diagnostic and no few-ms threshold is used as an approval gate.

Reference Environment Lab has **one** resident; generated worlds have **ten**. Therefore these figures measure total proposal cost including additional actors, not isolated terrain overhead. The source geometry of all actors is unchanged. A production same-population comparison belongs to the later integration PR.

| Fixture / tier | Mean median ms | Mean P95 ms | Draw calls incl. shadows | Triangles incl. shadows |
| --- | --- | --- | --- | --- |
| Reference Lab (one resident) / standard | 18.0 | 18.1 | 55 | 508532 |
| Reference Lab (one resident) / low | 18.0 | 18.1 | 55 | 459932 |
| Generated 17 (ten residents) / standard | 36.0 | 36.1 | 65 | 624602 |
| Generated 17 (ten residents) / low | 35.6 | 36.1 | 65 | 576002 |
| Generated 91 (ten residents) / standard | 36.1 | 54.1 | 65 | 651662 |
| Generated 91 (ten residents) / low | 42.0 | 60.1 | 65 | 603062 |

Generated ground has 48600 vertices and 2527200 bytes of vertex attributes. Four native terrain layers share the same physical geometry and add rendering work; the three 91 × 91 RGBA biome/wear masks add 99372 bytes before GPU bookkeeping. Initial pure generation durations and total preview preparation are recorded separately in the batch/capture records. They are not GPU timings or memory measurements.

Six settled repeated seed-17/Low regenerations retained exactly 42 renderer geometries, 99 textures, 25 visible materials and 65 draw calls. No resource or visible-instance growth was observed. Sources and the hidden reference scene are deliberately cached. The report does not claim measured GPU bytes, absence of every future leak or an unbounded listener stress test.

## Validation

- pnpm test: **427 passed, one existing skipped, zero failed** (428 total).
- pnpm build: passed; the existing large-bundle warning remains informational.
- pnpm run validate:characters --lab-previews: passed (16 assets / 32 GLBs plus Golden Characters and explicit previews).
- Public generated-world browser run: passed, 24 captures / 18 measured runs / six regeneration checks / zero errors.
- Reference lighting/HDR controls: passed (low-sun/day/night transitions; HDR OFF/ON, night suppression and day restoration). Interactive review page: ten seeds and six measurement rows, no script or HTTP errors.
- Formatting checked manually; the project has no configured automatic formatter. Generated footprints, locks and vendor code are not cosmetically rewritten.

## Human review and production plan

The new silhouettes, rocky coast and source-material transitions are inspectable; the native masks remove the earlier abrupt material assignment. Remaining visual limitations are the simple KayKit crown forms, bright green foliage, sparse forest belts, the bounded height-field edge and source water without scene-geometry reflections. Existing Meshy people have the current project appearance; clothing is not part of this environment slice. Season presets are not added. Review the actual gallery against the owner references before asserting the intended final art direction.

After approval, production integration should adopt the shared terrain/placement/nav/shore adapters together in a separate PR, preserve existing campaign geography or require explicit migration, retain full saved blueprints, bump generator versions for algorithm changes, and map geography to existing region facts without overwriting Simulation Core. No production adoption is included here.
