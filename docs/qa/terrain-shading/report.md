# Terrain shading pilot — #173

The owner selected B from the paired images on 2026-10-16. A remains the default in this pilot; B is an explicit Environment Lab and full-campaign preview. Physical iPhone/iPad gameplay has not yet been reviewed, and the separate default pass remains open.

## Visual diagnosis

The neutral, texture-free pass shows that shared normals reduce the regular triangular lighting pattern on grassy rolling slopes. Fully exposed bedrock retains deliberate face definition. Broad already-flat parcels show little difference. Source texture detail and zoning bands remain visible; this pilot does not claim to erase the heightfield silhouette or every material transition.

The grass-only UV diagnostic holds normals fixed against the full material pass. B is the visually selected variant. C is omitted: the evidence does not establish a need for adding UV distortion to this focused normal correction. Source UVs and mask UVs remain byte-identical.

[Open the paired gallery](review.html). Lab diagnostics use a regular seed-18 blueprint without decorations; full-scene pairs use the actual seed-32 campaign on canonical island 18. The blueprints differ between those two cohorts; each A/B pair has identical geometry, state and camera.

## Method and limits

Pinned source: `cbcf59746f0ac9f71dc3aafd8de02715de53a196`. Browser: 155.0.4283.45. GPU: ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11).

Three alternating-order trials per variant, quality and viewport; DPR 1; real houses, cattle and residents; fixed camera orbit; frozen campaign and presentation clock. Each sample follows 3000 ms warm-up and lasts approximately 10000 ms. Measurements use the existing QA-only bridge in Vite development modules, not an optimized production performance guarantee. Shader compilation occurs before sampling. No repository tests run concurrently with the timed matrix.

Mobile is 390 × 844 desktop Edge viewport emulation. Physical Safari/iPhone remains untested. p50/p95/p99 below are medians of the three per-run percentiles; p95 range exposes repeat variance. GPU duration uses EXT_disjoint_timer_query_webgl2 where samples are returned; unavailable values are unknown. The Render CPU column is synchronous renderer-call wall time; it can include driver/GPU waits and is not exclusive CPU utilisation.

## Frame and loading measurements

| Viewport | Quality | Variant | p50 ms | p95 ms | p99 ms | p95 run range | GPU p50 ms | Render CPU p50 ms | Ready ms |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| 1280px desktop | low | A | 116.6 | 133.2 | 150.0 | 116.9–133.4 | 103.9 | 4.6 | 32088.0 |
| 1280px desktop | low | B | 116.6 | 133.3 | 133.5 | 116.8–133.3 | 107.9 | 4.8 | 34575.1 |
| 1280px desktop | standard | A | 116.7 | 133.5 | 150.1 | 133.4–150.0 | 117.9 | 4.9 | 33068.0 |
| 1280px desktop | standard | B | 116.7 | 133.4 | 149.8 | 133.4–133.5 | 112.1 | 4.4 | 34375.9 |
| 390px simulated | low | A | 83.5 | 100.1 | 116.7 | 100.1–116.8 | 88.4 | 4.1 | 32609.1 |
| 390px simulated | low | B | 83.4 | 100.2 | 116.7 | 100.1–116.7 | 87.1 | 4.4 | 34649.1 |
| 390px simulated | standard | A | 99.9 | 116.6 | 116.8 | 100.2–116.7 | 87.7 | 4.7 | 32252.5 |
| 390px simulated | standard | B | 99.8 | 100.2 | 116.7 | 100.1–116.7 | 86.9 | 4.3 | 34702.5 |

- 1280px low: median 0.0%, p95 0.1% — within proposed bound; noise remains.
- 1280px standard: median 0.0%, p95 -0.1% — within proposed bound; noise remains.
- 390px low: median -0.1%, p95 0.1% — within proposed bound; noise remains.
- 390px standard: median -0.1%, p95 -14.1% — within proposed bound; noise remains.

These are bounded prototype checks on one older Intel laptop. Similar results within run variance are inconclusive evidence of cost, not proof of free GPU work. Ready time measures navigation to scene readiness in fresh contexts; network, decoding, normal baking and native setup overlap. See individual runs for ranges and loading long tasks; differences cannot be attributed solely to the normal bake.

B increases the measured median time to scene readiness by about 1.3–2.5 seconds (roughly 4–8%) on this host. The bake itself uses about 0.57–0.60 seconds of active CPU plus awaited preparation yields and 4.29 MiB of temporary storage. This pilot therefore does not claim free loading; physical iPhone input responsiveness and loading cost still need review.

## Resource and bake costs

| Viewport | Quality | Variant | Calls with shadows | Triangles with shadows | GPU geometries | GPU textures | Scene materials | Estimated MiB | Heap MiB | Bake CPU ms | Max bake batch ms | Scratch MiB |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1280px | low | A | 89 | 3784565 | 72 | 69 | 69 | 529.6 | 283.1 | 0.0 | 0.0 | 0.00 |
| 1280px | low | B | 89 | 3784565 | 72 | 69 | 69 | 529.6 | 288.8 | 573.3 | 22.4 | 4.29 |
| 1280px | standard | A | 89 | 3790709 | 72 | 73 | 69 | 621.8 | 266.7 | 0.0 | 0.0 | 0.00 |
| 1280px | standard | B | 89 | 3790709 | 72 | 73 | 69 | 621.8 | 267.1 | 569.4 | 19.0 | 4.29 |
| 390px | low | A | 75 | 3728118 | 72 | 60 | 69 | 529.6 | 311.7 | 0.0 | 0.0 | 0.00 |
| 390px | low | B | 75 | 3728118 | 72 | 60 | 69 | 529.6 | 272.3 | 597.2 | 28.7 | 4.29 |
| 390px | standard | A | 75 | 3734262 | 72 | 64 | 69 | 621.8 | 271.6 | 0.0 | 0.0 | 0.00 |
| 390px | standard | B | 75 | 3734262 | 72 | 64 | 69 | 621.8 | 315.7 | 577.7 | 27.2 | 4.29 |

Calls/triangles and GPU resource counts are the matched starting view, including shadow passes; the full moving-path inspections remain in the raw result. Heap is the median usedJSHeapSize at the end of sampling. Estimated memory counts referenced geometry and RGBA8 texture images with a mip allowance plus shadow texels; it is a partial inventory estimate, not measured VRAM. It omits shader-uniform textures, render targets, bone buffers and driver/program/framebuffer overhead; shared decoded texture images may also be counted more than once. Bake CPU excludes awaited yields and common preparation. Scratch is temporary and released; retained attribute-byte delta is zero. No UV bake or extra textures are added. Heap differences across fresh contexts are noisy and are not a retained-leak or physical mobile memory proof.

## Correctness and reproduction

The browser runner asserts identical A/B position, UV0/1/2/3, colour and index hashes, restored time, Core and canonical world exports. The Lab runner asserts unchanged exports after variant and quality changes and checks latest-request behavior. The public mesh tests cover shared normals, rock definition, deep-sea join, all material flags including climate snow, identical masks/geometry/UVs and asynchronous output. Existing navigation, loading, seasons and deterministic campaign regressions remain in the repository suite.

See [implementation contract](../../TERRAIN-SHADING-STUDY.md), [Lab data](lab/results.json), [full-scene distributions](full-scene/results.json) and [summary](summary.json) and [local asset hashes](asset-manifest.json). The gallery was captured at commit `374948fbe5db16485a77c5de740b9ac17ab65e2b`; later source changes before timing affect QA hashing/resume only, not terrain runtime. Histograms and run summaries are retained; individual frame samples are not. Fixture files are the existing `docs/qa/fjord-runtime-performance/fixtures` sources, identified by SHA-256 in every result.

No default change is included. Visual choice B is recorded. The owner has reviewed the comparison images only; use `/fjord-play?terrain-study=smooth` for the physical-device gameplay check before the separate integration/default pass.
