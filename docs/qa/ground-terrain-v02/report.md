# Ground v0.2 QA — #57

2026-10-08. Environment Lab previews native terrain materials with sourced water. Live Fjordside's terrain and water remain unchanged.

## Test evidence

PASS: 14 targeted tests via public mesh/height functions, navigation, paths, lighting and water. Full position arrays match the original mesh; ray intersections match surfaceHeightAt. Shared vertices have identical colors and known shore/grass/path points have the expected color relationships. TypeScript and production build pass (existing bundle-size advisory).

The UV test failed before texture coordinates were added. The color-field test failed before material zones were implemented. The browser tracer failed on the prior lab status before Ground v0.2 was integrated. The final browser run passes: both published maps load, no comparison control, identical paused pixels, day/night, near/far camera presets, Low geometry budget, compatibility fallback, water visibility and wave resume. No HTTP, console or runtime errors. Rebaking twice produces identical PNG SHA-256 hashes.

The full repository suite was also run and is **not green**. Inherited character failures include attachment-contact-volume fixtures rejecting degenerate current body triangles, cream-tunic LOD2 non-manifold edges, garment ensemble budget and garment bind-frame mismatch. The contact fixture failure was independently reproduced with the unchanged contact test/source files. These files/assets are unchanged from merged #61. The previously reported character validator failure remains; no validator was weakened or character geometry modified in #57.

## Before / after

Both passes use seed 1983, 1024 x 768 viewport, the same camera presets and day/night modes. The after harness selects the visible Pause waves control before assets complete loading, fixing wave phase at zero. Pass 1 images have a different paused water phase; do not interpret ripple differences as terrain changes.

| View | Pass 1 | Ground v0.2 |
| --- | --- | --- |
| Day / shore | [before](../environment-lab/source-water-day.png) | [after](ground-day.png) |
| Night / shore | [before](../environment-lab/source-water-night.png) | [after](ground-night.png) |
| Overview / far | [before](../environment-lab/source-water-overview.png) | [after](ground-overview.png) |
| Water level / near | [before](../environment-lab/source-water-water.png) | [after](ground-water.png) |

Visual inspection: quieter green/moss fields, a lighter sandy coastline with a darker wet fringe, warmer clearings and conforming narrow routes, and muted grey/brown slopes. Source microdetail is intentionally subtle; silhouette/color fields dominate at distance. No obvious repeating color tiles, random face checkerboard or new floating scenery in the fixed views. Flattened rectangular building parcels remain visible because the existing height/layout is retained and the lab only displays one preview house. This is an existing landscape characteristic, not a new terrain discontinuity. Final aesthetic acceptance remains with the user.

## Whole-scene performance

[Recorded samples](measurements.json): Edge headless / forced SwiftShader software, 1024 x 768 viewport; warmed scene, paused waves; at least ten seconds per tier. The first run overlapped expensive character tests and was discarded. The final run follows completion of those tests. These are whole-scene CPU/software frame intervals, not isolated terrain GPU time or hardware performance approval.

| Tier | Pass 1 median / p95 | Ground median / p95 | Ground calls | Ground triangles | Ground textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard | 667.5 / 684.2 ms | 1050.0 / 1116.6 ms | 16 | 79,296 | 9 |
| Low | 517.2 / 533.9 ms | 500.0 / 583.4 ms | 16 | 30,696 | 9 |
| Compatibility | 100.2 / 116.9 ms | 250.1 / 333.5 ms | 17 | 14,608 | 6 |

The ground base mesh remains 4,640 triangles. Native normal/roughness maps add two textures and no draw call. Reusing the existing conforming path overlay adds one call and 3,640 triangles. No terrain render target, reflection pass or additional shader pipeline is introduced. PNG delivery adds 2,031,367 bytes.

Software timings vary materially; Standard and Compatibility are slower in this sample. Low lowers water geometry and had similar median cost to Pass 1, but its p95 increased. The result demonstrates bounded geometry/texture costs and a working compatibility route, **not** a target-device frame-budget pass. Profile hardware day/night at close/far distances before approving #60; retain the quality controls. No production terrain integration is included.

## Reproduction and limitations

See [implementation/source instructions](../../GROUND-TERRAIN-V02.md) and [source/license manifest](../../../public/ground-materials/v02/manifest.json). The atlases precompute transitions for the fixed height/layout; changed layouts require rebaking. Dynamic independently tiled material layers are outside this native static treatment. Source water GLSL remains unchanged.
