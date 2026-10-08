# Ground Materials v0.4 — review candidate

Render implementation: 5dfd1324f6d5a96923b8168fd77494160554e3dc. Developer Lab only; #63 stays open until owner visual review. This report does not grant #59 integration-ready status or #60 activation.

Actual CC0 albedo/diffuse, OpenGL normal and roughness maps come from ambientCG Ground037/Ground054 and Poly Haven grass_path_2/mossy_rock. The full source/output hashes and repeat scales are in the [delivery manifest](../../../public/ground-materials/v04/manifest.json); [implementation notes](../../ground-materials-v04.md) explain the band-limited offline bake and native materials. No generated texture substitute or new GLSL. The path candidate was retained after the bounded [pilot](path-pilot.png).

Twelve regions preserve every original canonical triangle and height query. Source maps are filtered to the measured local footprint, with a second rotated source sample and shared world masks/gutters. The [pre-filter diagnostic](pre-filter-shore.webp) records the initial regular/aliased ground rhythm; it was not accepted as the final candidate. Standard retains source normals; Low loads only colour/roughness to reduce shader and texture cost. Standard has 32–34.29 texels/m and 18,864,090 runtime bytes; Low has 16–17.14 texels/m and 598,386 bytes. RGBA8+mip upper bounds are 192 MiB and 32 MiB respectively, not measured VRAM.

## Same-frame review

There are 72 captures, 36 paired before/after fixtures: seed 1983, 1280×800, DPR 1, phase zero, Optional GrassField OFF. Every pair matches camera, lighting, pixel ratio, tone mapping and time exactly. Village paths, shore and forest clearing are recorded, ground-only and composed, Standard/Low, day/night, normal/close/far where supported. Dusk is unavailable. Captures are WebP quality 92; file hashes and complete fixtures are in [capture-manifest.json](capture-manifest.json), with [paired proof](paired-fixture-proof.json).

| View | Previous ground | Regional source detail |
| --- | --- | --- |
| Village | [Before](baseline-village-standard-day-composed.webp) | [After](regional-village-standard-day-composed.webp) |
| Village close | [Before](baseline-village-standard-day-near-composed.webp) | [After](regional-village-standard-day-near-composed.webp) |
| Shore, ground only | [Before](baseline-shore-standard-day-ground.webp) | [After](regional-shore-standard-day-ground.webp) |
| Forest clearing close | [Before](baseline-forest-standard-day-near-ground.webp) | [After](regional-forest-standard-day-near-ground.webp) |

The candidate adds visible sourced surface variation and narrower textured worn paths. Owner review is still required for palette, residual repetition in bare far views and cohesion with the brighter KayKit foliage. Terrain height/faceting and existing lighting are deliberately fixed. The references' fjord backdrop, distant cliffs/mountains, geometry reflections, snow and warm night atmosphere are not solved by this material slice; see the existing #59 findings.

## Actual desktop measurement

ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11); Edge 154, Windows 10; canvas 1024×768, DPR 1. Whole composed scene, 3s warmup plus 8s rAF samples, three runs per case. Display/host cadence quantizes intervals; these are not isolated GPU timers or a long-duration mobile gate. All outliers are retained.

| View | Material / quality | Median ms, all three runs | p95 ms, all three runs | Draw calls |
| --- | --- | --- | --- | --- |
| village | baseline standard | 18.0 / 18.0 / 18.0 | 18.1 / 18.1 / 18.1 | 26 |
| village | regional standard | 18.0 / 35.9 / 35.7 | 18.1 / 36.2 / 36.1 | 33 |
| village | regional low | 18.0 / 18.1 / 35.9 | 36.0 / 36.1 / 36.3 | 33 |
| shore | baseline standard | 36.0 / 36.0 / 36.0 | 37.1 / 36.2 / 54.0 | 26 |
| shore | regional standard | 36.0 / 49.1 / 33.6 | 54.0 / 66.7 / 67.1 | 35 |
| shore | regional low | 33.3 / 19.6 / 16.8 | 50.8 / 34.1 / 34.4 | 35 |

The prior [pre-Low optimisation](before-low-optimisation.json) and [redundant-control-load diagnostic](redundant-control-loads-diagnostic.json) remain records. Early QA repeatedly selected unchanged controls, causing extra asynchronous decode/rebuild work; final action sequencing performs actual setting changes only. Do not infer a guaranteed hardware gain from those earlier timing differences. Low's reduction in loaded layers, bytes and memory is explicit and testable. Proposed #59 thresholds are not owner-approved; any misses must be evaluated against an agreed device/cadence budget. The candidate does not pass the proposed 33.3 ms p95 gate in these runs, including Low. PR #67 remains draft for performance and visual acceptance. Actual mobile hardware and VRAM consumption remain untested.

Ten complete Low/baseline/Standard quality cycles have stable geometry and texture counts within each mode: regional low = 35 geometries / 56 textures; baseline standard = 26 geometries / 34 textures; regional standard = 35 geometries / 67 textures. The passed lifecycle proof is retained from the same runtime revision; only subsequent QA action sequencing changed, so it was not repeated. See [hardware measurements](hardware-measurements.json) and [summary](hardware-summary.json).

## Verification and remaining acceptance

Public terrain TDD first failed for missing regional rendering, then passed canonical triangle/raycast/padded-UV invariance. The Low policy test first failed for its retained normal layer, then passed with colour/roughness preserved. Browser TDD first failed for the absent material control, then passed material/quality/baseline switching. TypeScript/build and terrain/navigation checks pass. The full local suite passed 417 tests with zero failures and one existing optional skip before the additional Low test; current-head GitHub re-runs the complete suite and character audit. Exact source/output hashes pass, and a second complete bake repeats all 72 output hashes. Blended normals use lossless encoding; sampled normal-map boundaries match exactly; colour/roughness boundary differences from WebP compression are recorded in [material audit](material-audit.json). No hard chunk boundary was found in the inspected near/normal/far frames; this is not proof for every possible orbit.

An initial capture attempt hit an actionability timeout; another parallel test/capture run was interrupted with about 0.8 GiB free host memory. The first timeout's precise cause is unconfirmed. Final captures completed serially, and the full local suite passed at concurrency 2. This does not change production validation thresholds or exclude tests.

Open: owner visual approval, agreed performance budget/longer controlled sampling, actual mobile hardware and GPU memory measurement. Fjordside remains on the previous production terrain; #60 integration is not performed.
