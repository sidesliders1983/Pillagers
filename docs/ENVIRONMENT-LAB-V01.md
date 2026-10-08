# Environment Lab v0.1 — Water (#56)

Open `/environment-lab`. The lab opens calm, matte fjord water directly with the existing Terrain height field, authored house/scenery, seed 1983, WorldLighting and orbit camera. The live World continues to instantiate the unchanged legacy Water. This pass adds no gameplay or placement changes.

Controls: fixed seed readout, shore/overview/water-level camera, day/night, water visibility, pause waves and Standard/Low/Compatibility fallback. There is no comparison control. Quality changes preserve the camera and scene. The renderer readout shows indicative frame time, draw calls, triangles and geometry/texture counts; counts are not VRAM measurements.

All candidate parameters are in `src/config/FjordWaterConfig.ts`: water level -0.12 m, wave amplitude 0.025 m, wavelength 9 m, slow animation speed 0.18, foam width 0.45 m and intensity 0.18. Muted deep and shallow colors are configurable. Standard uses a 180-segment grid; Low uses 90. Legacy is an explicit fallback.

`FjordWater` samples `surfaceHeightAt` (the rendered terrain triangle interpolation) into a depth attribute once. The lit standard-material shader uses this depth for shallow colors and restrained shoreline foam. Displacement fades out near shore. The surface is opaque, depth tested and below the land; no separate foam strip or reflection/refraction render pass is used. Time is accumulated from bounded frame deltas; pausing retains the current wave phase.

Validation includes shared terrain-depth sampling, finite depth attributes, cheaper low-quality geometry and shader-time updates, plus navigation, social encounters, settlement projection, Chronicle and simulation tests. Historical prototype before/after captures and the current software-renderer indicative baseline are in `docs/qa/environment-lab/`.

The prerequisite rebase preserved the latest main simulation and `/play` and `/gameplay-lab` routes together with local Meshy/Fjordside integration. Backup branch: `codex/pre-main-rebase-backup`. Work branch: `codex/environment-lab`.

## Confirmed review and validation

The user approved tests through the visible lab controls and the public `waterDepthAt` query. Existing prototype tests on shader text were replaced with public-depth behavior checks. Removing the comparison control followed a red/green browser-test cycle; rejecting non-finite depth queries followed a separate red/green cycle. The design choices and test boundaries are recorded in `docs/qa/environment-lab/decisions.md`; the glossary now defines Environment Lab and Fjord water.

Run `node --test tests/fjord-water.test.mjs` for the depth-query seam. Run `node scripts/qa/check-environment-lab.mjs` with a local Playwright installation, or set `PLAYWRIGHT_MODULE` to its absolute module path. `PROTOTYPE_URL` selects the running server (default `http://127.0.0.1:5181`). The browser check observes the rendered surface and visible controls: direct opening, pause/resume, day/night, camera presets, quality/fallback and water visibility. It also checks that the main settlement route and Meshy Fjordside load after the rebase.

The current captures are `fjord-water-day.png`, `fjord-water-night.png` and the three camera presets. The earlier `legacy.png`, `candidate.png` and `candidate-night.png` remain historical prototype captures from before the user removed comparison mode. `baseline.json` contains warmed software-renderer samples; it is not a GPU hardware performance guarantee.
