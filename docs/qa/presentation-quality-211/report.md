# Coherent presentation quality — #211

Runtime: 54c266b8b03a37dea6406f39209a80dca7d6a090; baseline #210 is 11fc49d7cb8f7be52bf712206b6cc2ce02d19b5e. Stage A is independently reviewable in commit 54c266b. It consolidates the existing choices without changing defaults, save semantics, native detail or simulation. The [consumer/application map](../../gameplay/PRESENTATION-QUALITY.md) is the current policy documentation. #210's measured optimizations remain intact on the same branch/PR; #212 is the unmerged dependency. Main was ac3833d at inspection.

## One candidate and decision

**Decision: RETAIN the existing shipped values.** Five of six paired GPU means were lower, but first-contact repetition two worsened (frame p95 133.3 to 150.2 ms) and most other p95 pairs were similar. Shared-host variation is substantial; these runs do not establish a reliable end-to-end improvement that justifies softer imagery.

The QA-only candidate sets drawing-buffer pixel ratio from 1 to 0.85 at existing Low quality. No other quality axis changes: native models/rigs/modules, water profile, 1024 shadow map, terrain textures, particles, dressing, camera, CSS/UI and canonical schedules retain their settings. The candidate is explicit in the existing QA runner; it is not saved, automatically enabled by viewport, or exposed as another product preference. At equal CSS size it submits about 27.75% fewer main drawing-buffer pixels, with integer rounding; this is not a proportional FPS or VRAM result.

Any future adoption still requires owner visual/performance acceptance under #211. This delivery adds no new LOD switching, animation decimation, shader technology, culling or portrait renderer. #151 remains open for integrated density/device acceptance and #198 owns actual portrait requests and budgets.

## Default-preserving acceptance

Selected-resident Summer/Winter Standard desktop and Summer Low 390px captures exactly match #210's fixed-time world pixels, card markup, Core/RNG/history/discovery, geography, native actors/appearance, camera, lighting and render resources. The unchanged cold-start ratio 1 is retained even for a saved Standard campaign. Explicit Standard live switching still caps DPR at 1.5, and loaded ground tier still changes only on world replacement. Their intentionally different application times are documented rather than silently normalized.

The real DPR2 browser check performs three Low/Standard cycles, checks retained native root UUIDs, verifies live water/shadows/DPR and stabilized GPU resource counters, and preserves exact Core/book/blueprint. Off/Low/Normal effects, reduced motion, orientation resize, synthetic cached return, real WebGL context loss/recovery and genuine reload pass. Synthetic lifecycle and desktop touch emulation are not physical iOS tests. Ordinary and candidate-resolution actual touch Recon/map/paid-house/focused-edit flows pass with exact canonical command/charge semantics. Required final-head CI is recorded on the draft PR. Test-first RED outputs and focused test results are included; no owned modules were mocked.

The normal-server scene-owner check also passes delayed native/world loads, disposal, three world replacements and a campaign replacement during loading. Only current-campaign presentation is published; native resident instances and owned resource counts stabilize.

Local validation: 30 related tests, TypeScript, production build, all 465 committed public files / 47 decoded terrain models, and explicit character/Lab-preview validation (20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules) pass. The first Vite invocation could not write to the existing linked dependency cache outside the workspace; the same build passed with cache access. Both logs are retained. Existing chunk-size warnings are unchanged.

## Measurement protocol and limits

Windows Edge 155.0.4283.62, actual renderer ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11). Device-scale factor 1; village-17 is a 1280×800 desktop inhabited village, visited-800 a 390×844 desktop-emulated touch layout with the observed independent rival. Both reuse published #151/#203 fixtures verbatim, whose hashes appear in the raw output. visited-800 crosses an annual boundary during the 250-tick trace; native age fitting and CPU-clan work are retained.

Three alternating repetitions reverse scenario order on repetition two. Each starts with the same saved facts, warms ten seconds with canonical time held, then executes ninety public tick commands at the existing 500ms schedule (2/3/3/3/3/2/3/3/3), exactly 250 ticks over at least 45 seconds. Camera is stationary; the game and local effects run. Each run matches an independently restored headless campaign exactly, and each resolution pair has the same full canonical hash. No heavy local tests/captures ran alongside the timing windows. All samples, including unfavorable results, are retained.

| Fixture · repetition | DPR | Window seconds | Frame p50 / p95 / p99 / max ms | GPU mean / p95 ms | Actual draws / triangles, all passes | Long tasks count / total ms | Used JS heap MiB |
| --- | ---: | ---: | --- | --- | --- | --- | ---: |
| village-17 · 1 | 1 | 45.0 | 83.3 / 100.0 / 100.3 / 183.3 | 80.6 / 89.0 | 235 / 5194155 | 4 / 227.0 | 434.6 |
| village-17 · 1 | 0.85 | 45.0 | 83.3 / 99.9 / 100.2 / 166.7 | 77.6 / 88.3 | 235 / 5194143 | 7 / 387.0 | 440.3 |
| visited-800 · 1 | 1 | 45.1 | 116.6 / 149.9 / 166.6 / 716.7 | 110.3 / 131.9 | 219 / 6326975 | 80 / 6301.0 | 449.9 |
| visited-800 · 1 | 0.85 | 45.1 | 116.6 / 133.6 / 166.8 / 666.5 | 109.8 / 128.2 | 219 / 6326975 | 73 / 5248.0 | 456.4 |
| visited-800 · 2 | 0.85 | 45.1 | 132.0 / 150.2 / 183.5 / 633.4 | 124.7 / 148.6 | 219 / 6326973 | 76 / 5363.0 | 470.1 |
| visited-800 · 2 | 1 | 45.1 | 100.1 / 133.3 / 133.6 / 500.0 | 104.5 / 124.6 | 219 / 6326979 | 21 / 1774.0 | 430.5 |
| village-17 · 2 | 0.85 | 45.0 | 100.1 / 133.3 / 133.4 / 216.7 | 101.6 / 117.8 | 235 / 5194115 | 2 / 117.0 | 460.5 |
| village-17 · 2 | 1 | 45.0 | 116.7 / 133.5 / 150.1 / 233.5 | 108.8 / 127.1 | 235 / 5194111 | 2 / 110.0 | 418.9 |
| village-17 · 3 | 1 | 45.1 | 116.7 / 133.5 / 150.0 / 200.0 | 113.0 / 133.0 | 235 / 5194109 | 8 / 427.0 | 431.7 |
| village-17 · 3 | 0.85 | 45.1 | 100.2 / 133.4 / 149.9 / 200.0 | 103.4 / 121.9 | 235 / 5194117 | 1 / 51.0 | 421.0 |
| visited-800 · 3 | 1 | 45.1 | 116.6 / 133.5 / 183.9 / 799.9 | 106.3 / 130.9 | 219 / 6326973 | 31 / 2737.0 | 495.4 |
| visited-800 · 3 | 0.85 | 45.0 | 100.1 / 133.3 / 150.0 / 566.6 | 102.0 / 118.6 | 219 / 6326961 | 9 / 1043.0 | 456.1 |

| Fixture · repetition · DPR | Frame scope total ms | Render-submit scope total ms | Canonical-command scope total ms | CDP script duration ms | GPU geometry / texture counts |
| --- | ---: | ---: | ---: | ---: | --- |
| village-17 · 1 · 1 | 11299.2 | 7512.0 | 784.8 | 11061.8 | 117 / 73 |
| village-17 · 1 · 0.85 | 11906.5 | 7873.4 | 793.0 | 11663.0 | 117 / 73 |
| visited-800 · 1 · 1 | 10212.3 | 6308.5 | 1342.3 | 10065.1 | 121 / 68 |
| visited-800 · 1 · 0.85 | 9361.3 | 5792.2 | 1224.0 | 9220.8 | 121 / 68 |
| visited-800 · 2 · 0.85 | 8321.2 | 5058.6 | 1159.7 | 8217.0 | 121 / 68 |
| visited-800 · 2 · 1 | 7451.7 | 4302.0 | 935.9 | 7368.0 | 121 / 68 |
| village-17 · 2 · 0.85 | 7962.1 | 4970.6 | 597.6 | 7767.2 | 117 / 73 |
| village-17 · 2 · 1 | 7735.3 | 4789.5 | 639.6 | 7545.9 | 117 / 73 |
| village-17 · 3 · 1 | 8476.0 | 5416.4 | 709.3 | 8270.6 | 117 / 73 |
| village-17 · 3 · 0.85 | 8226.5 | 5072.9 | 727.2 | 8030.9 | 117 / 73 |
| visited-800 · 3 · 1 | 7787.3 | 4608.9 | 1053.8 | 7694.5 | 121 / 68 |
| visited-800 · 3 · 0.85 | 7325.8 | 4238.4 | 930.7 | 7248.1 | 121 / 68 |

Scopes are attributed inclusive JS/driver wall time and must not be summed as independent CPU costs; CDP counters and native shadow/draw counters are retained separately. GPU times use the existing disjoint timer queries, with sample counts/disjoint data in the raw report; unavailable timing is reported as unavailable. Draw/triangle/resource counters are not GPU timing. JS heap is measured occupancy, not allocation rate or VRAM. Driver VRAM, temperatures, throttling and unrelated host load are unmeasured. This shared laptop and instrumented Vite build do not establish a universal device/FPS budget, physical iPhone/iPad Safari performance or thermal acceptance.

## Reproduce and review

Use the existing opt-in fjord-runtime-server on a fresh cache/port, then fjord-runtime-audit with QA_GROUP=resolution, QA_REPEATS=3, QA_WARMUP_MS=10000 and QA_SAMPLE_MS=45000. QA_SCENARIOS are recorded verbatim in measurements.json. Copy village-17-island-pool-v2.json from docs/qa/village-nature-203 and visited-review.json from docs/qa/rival-visibility into the recorded fixture names. The runner fingerprint is 73f15b7a8a033059498b177ba7ef07ec230a392681dbbbda867dd6df519ad1ad. Explicit QA pixel ratio is the sole candidate override; its native-asset and exact replay guards remain enabled.

capture-golden-fjord reuses frozen real scenes with QA_PIXEL_RATIO=1 or 0.85 and QA_SELECTED=persona:founder-1. Before/after images retain exact actor/camera/card/geography state; only drawing-buffer dimensions differ. check-presentation-quality covers the existing controls/lifecycle and check-scene-interactions retains its strict normal-server path plus an explicit opt-in QA-only resolution test. No new benchmark application or production test API is introduced.

The visual comparison is in review.html. Reverting stage-A commit 54c266b removes this policy consolidation; #210's separate commits can remain. There are no migrations or new dependencies. Formatting/whitespace were manually reviewed; no project formatter is configured. Existing optional-source skips and build warnings remain recorded on the PR. Publication follows validated main only; this feature branch does not update the public Site.
