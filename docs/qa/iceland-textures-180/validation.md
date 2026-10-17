# Icelandic albedo study validation

This study adds QA scripts and review assets only. Production source and approved ground-map manifests are unchanged from parent `52cae9c7cb40aa78ffc7bf7c0ba17247c167b117` in #189.

## Native checks

Completed: **6 fixture/tier cases, 12 camera comparisons, 36 native renders; PASS**. Every camera restores the original pixels exactly. All paired invariant checks passed and the browser reported zero errors or placeholders. The viewport was 1440 × 900, with a 1424 × 752 game canvas at DPR 1.

The capture runner verifies these properties for every mode and camera:

- The canonical state matches reconstruction of the existing saved fixture.
- Canonical state, blueprint and actor hashes, exact camera, terrain attribute/index/group hashes, alpha-map hashes and lighting settings match within each comparison.
- Four candidate colour sources are shared across the existing six terrain layers. Colour maps retain the native UV channel, 0.125 repeat and quality-tier dimensions.
- Both controlled albedo modes disable terrain normal/roughness texture maps and use roughness 1. Native data maps restore when leaving the experiment.
- Draw calls, triangles, geometry and texture counts match between the warmed controlled modes. Draw calls and triangles also match native context.
- Returning to the native mode restores the exact uncompressed screenshot pixels for every view.
- Sources and delivery maps retain the SHA-256 values recorded before capture. There are no missing-model placeholders or browser errors.

The final results, camera values, hashes and rendering counts are in [observations.json](observations.json). A result is complete only when that file says `status: PASS` and contains all three fixtures at both tiers. Historical lighting and ground reports have not been rewritten.

Settlement overview counts below include the existing shadow draw calls. Each value matches across native, current-colour-only and candidate-colour-only modes after warming both sets. Texture counts include both cached colour sets.

| Fixture | Tier | Draw calls | Triangles | Geometries | Cached textures |
| --- | --- | ---: | ---: | ---: | ---: |
| developed-810 | Standard | 162 | 6,724,274 | 68 | 76 |
| developed-810 | Low | 162 | 6,718,130 | 68 | 72 |
| summer-17 | Standard | 179 | 7,969,915 | 80 | 61 |
| summer-17 | Low | 179 | 7,963,771 | 80 | 57 |
| snow-811 | Standard | 164 | 6,742,150 | 68 | 77 |
| snow-811 | Low | 164 | 6,736,006 | 68 | 73 |

The review gallery also passed all 12 paired image/hash checks, complete-image slider endpoints and the 50% midpoint. The 390 × 844 phone review fits without horizontal overflow. This checks review-page usability, not mobile gameplay acceptance. See [gallery-check.json](gallery-check.json) and [phone review screenshot](gallery-phone.jpg).

## Source and build checks

TypeScript (`tsc --noEmit`) and the Vite production build passed. The existing >500kB chunk-size advisory remains. The QA script modules pass `node --check`; formatting was reviewed manually because the repository has no configured formatter. No dependencies or lockfiles were added.

The parent #189 previously passed 892 tests with one existing opt-in frozen r3 evidence skip, and passed character contract validation. That is parent evidence, not a fresh full-suite result for this study. This change does not modify simulation, character contracts or the production renderer. Required checks for a new pull-request head must still be evaluated separately; keep it in draft.

## Reproduction

Use the repository's existing dependencies, local prepared model assets and Node runtime. The ordinary build needs none of the study hooks.

```powershell
node scripts/qa/prepare-iceland-albedo-180.mjs
$env:QA_GOLDEN = '1'
$env:QA_PORT = '5196'
$env:QA_CACHE_DIR = 'artifacts/iceland-textures/vite-cache'
node scripts/qa/fjord-runtime-server.mjs
```

In a second terminal:

```powershell
node scripts/qa/capture-iceland-textures-180.mjs
```

The capture runner defaults to the three documented frozen fixtures at Standard and Low and writes images and observations to this folder. `QA_FIXTURES`, `QA_TIERS`, `QA_OUTPUT`, `QA_ORIGIN` and `PLAYWRIGHT_MODULE` can select a smaller local experiment. Do not use a partial run as the complete evidence set. Restart the QA server with a fresh cache after changing QA instrumentation; file watching is deliberately disabled in golden mode.

The review gallery requires a static server for its JSON and images. The temporary remote origin exposes only explicitly allowlisted review assets, accepts GET/HEAD and exposes no Vite server, project source or mutation API.

## Limits

The images isolate colour-map choice under fixed presentation. They do not validate coherent PBR channels, true real-world scale, neutral-light reflectance, wet weather, a complete regional biome or historical vegetation. The research references are not redistribution licences for photographs; only generated sources are shipped here.

No animated performance timing, GPU-time, VRAM measurement, mobile gameplay or long-campaign CPU measurement was run for these QA-only map swaps. Draw-call and triangle parity is useful evidence but cannot establish runtime performance parity. Both colour sets remain cached while toggling. At RGBA8 with a complete mip chain, four extra cached 1024px maps represent approximately 21.3 MiB (512px: 5.3 MiB), before driver-specific overhead; this is a size estimate, not measured VRAM.
