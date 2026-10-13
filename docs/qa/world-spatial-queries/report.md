# Gameplay spatial queries — #136 QA

Date: 2026-10-13T14:32:36.132Z. Base: a4b7df3 (#135 / PR #142). Query contract: [WORLD-SPATIAL-QUERIES-V1](../../WORLD-SPATIAL-QUERIES-V1.md).

## Verified outcome

All ten seeds preserve saves, terrain/coast/visibility evidence and resident movement. The derived query reads #135 zoning; it has no biome classification formula or extra serialized terrain arrays. Seven public regression cases were developed red-first, covering exact triangles/flat aspect, reservations, old/zoned saves, movement parity, shoreline ties, harbor/rival reserves, saved navigation exclusions and narrow ridges. No production rules or material source maps changed.

The seed sweep queries every 37th navigation node: **173410 sampled points**, not every cell. It compares repeated queries after save/load and every sampled traversability result against the existing public resident adapter. It also checks every reserved route point and foundation centre, sampled canonical coast vertices, and the full-grid existing connectivity validator. Analytical tests cover coastal ties, flat terraces and cliffs independently of generated data.

Accepted seeds remain 42, 1983, 18, 7, 256, 65537. Rejected seeds remain 17, 91, 1337, 73; the rejection evidence is preserved, not waived. No new sites, visibility tests or terrain alterations are introduced.

| Seed | Existing site status | Sampled points | Traversable | Unreserved building points | Coarse zone/water mismatches |
| --- | --- | ---: | ---: | ---: | ---: |
| 17 | rejected (inherited) | 17341 | 2638 | 772 | 51 |
| 42 | accepted | 17341 | 3109 | 657 | 87 |
| 91 | rejected (inherited) | 17341 | 2811 | 833 | 66 |
| 1983 | accepted | 17341 | 2748 | 680 | 59 |
| 1337 | rejected (inherited) | 17341 | 2865 | 1104 | 68 |
| 18 | accepted | 17341 | 3198 | 797 | 81 |
| 7 | accepted | 17341 | 2445 | 538 | 51 |
| 73 | rejected (inherited) | 17341 | 2629 | 845 | 79 |
| 256 | accepted | 17341 | 2866 | 951 | 68 |
| 65537 | accepted | 17341 | 2358 | 464 | 60 |

Coarse zoning/water mismatches are expected near the 4 m field's coastal edges. The API explicitly exposes them and retains the original primary label. Exact height, not this label, determines physical water and clearance. Old unzoned saves return null zoning; they are never regenerated.

## Cost and storage

Hardware: Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz; 8 logical processors; Node v24.19.0. This is the development laptop, with other validation running. These are observations, not universal performance targets.

- Sparse query-index initialization: 0.29–2.76 ms across ten worlds.
- Two query passes plus JSON hashing and resident-adapter comparison of 17,341 points: 679.89–878.71 ms per world. This includes comparison work; it is not a single-query latency benchmark.
- Explicit full-grid navigation validation: 27.34–44.48 ms.
- Extra save storage: **0 bytes**. Sparse index counts are in batch.json. Process heap deltas are retained only as noisy observations; garbage collection of earlier worlds can make them negative and they are not an isolated allocation measurement.
- One active native RGBA debug texture: **2,566,404 bytes CPU pixel data**, plus its GPU copy. No mipmaps, extra terrain UV buffer or persistent raster cache. Previous textures are disposed on overlay replacement.
- Full debug-overlay construction: 3.23–3.99 seconds on this laptop. Construction happens on selection and can briefly block the Lab. It is not per-frame work.
- Settled bare-terrain renderer windows: 16.65–16.74 ms/frame; 1 draw call, 320,008 triangles for this fixture. These are six summary windows after a 1.8-second settling period, not raw frame samples or a cross-device benchmark. The build/selection time is reported separately.

## Browser and visual review

Headless Edge, 1440×1000 and touch-enabled 1024×768. Verified point query, bounds feedback, route validation, all six cell overlays, unchanged export/import data, legacy import and reference cleanup. No page errors. [Gallery](review.html) includes undecorated overhead overlays and a tablet-sized player view. Native nearest filtering preserves 1 m cell edges instead of interpolating cells over 2 m triangles. Physical iPad testing was not performed in this slice.

## Validation

TypeScript and production build passed; the existing large Three.js bundle warning remains. Required character validation passed (20 assets / 36 GLBs). No formatter is configured; formatting was reviewed manually and git diff --check was used.

```text
ℹ tests 724
ℹ suites 0
ℹ pass 723
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 591271.9538
```

The one skipped case is the pre-existing opt-in r3 frozen-GLB evidence test (RUN_R3_EVIDENCE is unset). No required check was skipped because of a failure, and validation was not weakened.

## Reproduce

1. node --test tests/world-spatial-queries.test.mjs
2. node --expose-gc scripts/qa/measure-world-spatial-queries.mjs
3. With Vite on 5180: node scripts/qa/check-world-spatial-queries.mjs
4. node scripts/qa/publish-world-spatial-queries.mjs

The measurement script uses ignored #135 save fixtures when available, or deterministically generates the same ten requests. Browser QA uses local #135 fixtures (generate them with scripts/qa/measure-environment-zoning.mjs on a fresh checkout). Large saves are not duplicated in this report.

## #137 boundary

This is spatial data and diagnostics only. Repeating ground/rock textures remain for the material slice: reuse canonical zoning, repair material mapping/repetition within approved native Three.js composition, and do not add geometric noise as a substitute.
