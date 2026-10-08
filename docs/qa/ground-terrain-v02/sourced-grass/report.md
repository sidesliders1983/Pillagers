# Sourced GrassField and ground review — #57

2026-10-08. The lab now uses **both GrassField and WaterPlane** from boona13/threejs-grass-water-shaders. The initial native-ground implementation used that repository only for water. Its real ambientCG normal/roughness maps and authored color fields did not provide enough visible structure, as the user correctly observed.

## Current implementation and provenance

The grass geometry, vertex/fragment shader and wind lattice come from the public MIT source, pinned to 97fb7ea3135362dbb1ba80cdfa8fb27ec8d0b159. Both grass GLSL modules match upstream SHA-256 exactly. [Vendor provenance](../../../../src/vendor/boona13-grass/README.md) records hashes, license and the small class ownership fixes. No original grass/terrain GLSL or onBeforeCompile is authored.

SettlementGrass filters the source's seeded tufts around shore sand, paths, building clearings and rocky slopes, then places roots using surfaceHeightAt. Source lighting uniforms follow WorldLighting day/night. Four-segment, three-blade Standard tufts are 0.4 m tall with 0.03 m width; Low/Compatibility use two-segment, two-blade geometry with wider spacing. The base terrain still uses one native standard material with the named CC0 normal/roughness atlas.

Ground colors are deeper green/brown than the initial palette. Normal scale is 0.4, source repeat scale 3 m. Derived PNG delivery is now 1,667,006 bytes; exact hashes and sources remain in the texture manifest. Grass is additional physical geometry; these maps do not create grass blades or substitute for the sourced renderer.

## Validation

PASS: 14 public terrain/navigation/lighting/water tests; TypeScript and production build (existing bundle-size advisory). The new public Grass control test was observed failing before integration.

Final browser QA passes: Grass defaults on and visibly changes pixels when hidden; the published grass wind visibly moves **while water is hidden**; shared pause remains stable; day/night and near/far presets work; Low reduces geometry; quality fallback, water visibility and wave resume work. No HTTP, console or runtime errors. The historical full-suite character failures remain unchanged from #61; this follow-up does not repair or weaken those assets/tests.

Run node scripts/qa/check-ground-terrain-browser.mjs with a Playwright module path. The default output is this directory; GROUND_QA_DIR can select another capture directory.

## Fixed-seed visual evidence

Seed 1983, 1024 x 768 viewport, existing presets. Pause is selected before loading completes, at environment time zero; grown grass has birthTime -1. Before views are the rejected initial native-ground result. New Grass controls wrap at this viewport, moving the canvas down without changing its dimensions/preset. Water phase differs in older Pass 1 captures; compare ground structure rather than individual ripples.

| View | Initial native treatment | Current sourced grass |
| --- | --- | --- |
| Shore / day | [before](../ground-day.png) | [after](ground-day.png) |
| Shore / night | [before](../ground-night.png) | [after](ground-night.png) |
| Overview | [before](../ground-overview.png) | [after](ground-overview.png) |
| Water level | [before](../ground-water.png) | [after](ground-water.png) |

Visible blades add silhouette, local shading and motion on vegetated land. Source-seeded thinning keeps the sandy edge and existing roads/clearings readable. Existing placeholder trees and the large flattened empty building pads remain; the grass renderer does not replace those models/layouts. User aesthetic review remains open before #60.

## Indicative rendering cost

[Samples](measurements.json): Edge headless, forced SwiftShader software, ten-second samples, same viewport and phase; whole scene, not isolated GPU timings. Software timings fluctuate and a production build ran during the broader capture session. These are functional/resource observations, not a clean target-device benchmark or hardware budget approval.

| Tier | Median / p95 frame | Draw calls | Triangles | Textures |
| --- | ---: | ---: | ---: | ---: |
| Standard | 949.9 / 1049.9 ms | 17 | 360,144 | 10 |
| Low | 599.9 / 600.1 ms | 17 | 70,408 | 10 |
| Compatibility | 216.7 / 233.4 ms | 18 | 54,320 | 7 |

Compared with the native-ground scene, Standard grass adds one draw call, one tiny flat-height texture and 280,848 triangles (11,702 tufts). Low adds 39,712 triangles (4,964 tufts). The square source field is compacted before rendering rather than hiding rejected instances in a custom shader. Target-device GPU profiling is still required before #60.

[Implementation/configuration](../../../GROUND-TERRAIN-V02.md) describes the separate CC0 base-ground and MIT grass components.
