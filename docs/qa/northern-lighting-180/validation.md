# Validation · Northern light refinement

Native visual capture, camera and gallery checks passed. The implementation bytes match the
source hashes in both the visual matrix and rendering measurement. The capture parent is the
foundation commit; uncommitted implementation bytes were explicitly hashed before capture.

- **PASS:** all 10 fixture/quality pairs: 20 settlement images and 16 paired detail images.
- **PASS:** canonical state, geography, actor transforms/animation, camera, materials, draw
  calls, triangles, geometries and textures match within every settlement comparison pair.
- **PASS:** consecutive frozen raw pixels match; no placeholders or page errors.
- **PASS:** all 22 native camera/quality poses keep visible entity bases inside finite shadow
  coverage. Side-angle resident captures show the contact shadow separately from the original
  close-up looking almost along the sunlight.
- **PASS:** all 18 gallery pairs at both endpoints and midpoint. Pixel endpoint tests use
  native image dimensions and integer placement to avoid browser edge interpolation differences.
  Normal responsive layout is separately checked at 390px without horizontal overflow.
- **PASS:** 893 existing/new tests (892 passed, 0 failed, 1 skipped),
  run serially to bound memory; 24 focused lighting/season/water cases also passed.
  The existing r3 frozen-export evidence test is opt-in via RUN_R3_EVIDENCE=1 and was not enabled.
- **PASS:** Character validation passed (including explicit Lab preview audits; visual approval pending): 20 assets / 36 GLBs, 12 Golden Characters, 19 equipped modules, Idle/Walk/Run + World.
- **PASS:** TypeScript and normal Vite production build. The existing >500kB chunk advisory remains.
- **PASS:** QA script syntax, manual source formatting and diff whitespace checks. No formatter is configured.

## Native animated rendering

Twelve measured runs on **ANGLE (Intel, Intel(R) HD Graphics 630 (0x0000591B) Direct3D11 vs_5_0 ps_5_0, D3D11)**. Browser: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0.
The viewport is 1440×900 at DPR 1; the native canvas is 1424×753. Each run has 10s warmup,
then 30s of retained rAF intervals. The saved campaign is paused, with water/wind animated and
particles Off. Heavy regression/character/build work finished before these measurements.
All three selected runs precede all three refined runs per quality, so order/thermal drift
remains a limitation. This is one winter fixture on one device, not a broad hardware guarantee.

The target is ≤5% regression in both median and p95. Values below are the median of three run
medians and the median of three run p95s. A >10% spread within either treatment marks a result
inconclusive rather than certifying that target. All individual intervals/runs remain in
[performance.json](performance.json).

| Quality | Selected median / p95 ms | Refined median / p95 ms | Change median / p95 | Timing acceptance |
| --- | --- | --- | --- | --- |
| standard | 83.3 / 100.0 | 83.3 / 100.0 | 0.0% / 0.0% | PASS |
| low | 83.3 / 83.5 | 83.3 / 83.5 | 0.0% / 0.0% | PASS |

Run ranges:

- standard: selected median 83.3–83.4ms, p95 100.0–100.0ms; refined median 83.3–83.4ms, p95 100.0–100.0ms.
- low: selected median 83.3–83.3ms, p95 83.5–83.5ms; refined median 83.3–83.3ms, p95 83.5–83.5ms.

Both treatments keep one directional map: 2048px on Standard, 1024px on Low. The matched
settlement coverage is 256×88m refined versus 260×260m selected. That spends existing map
pixels more usefully; it adds no map resolution, scene pass, geometry, texture or material.
The visual matrix's first-fit observations range from 0.3–0.7ms. Static coverage is cached;
animated-run coverage counters are retained in the timing evidence.

## Limits and remaining checks

rAF intervals are presentation cadence, not isolated GPU execution time; GPU time and VRAM are
unavailable, not zero. No long-campaign simulation CPU improvement is claimed. Mobile, broader
seeds/seasons, discovery fades, active VFX and combat need separate qualification. Low/far views
retain coarse oblique shadow edges. Quantized coverage changes still need wider temporal review.
The PR remains draft for human review and required checks on its current head.
