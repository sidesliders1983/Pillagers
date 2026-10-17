# Fjordside 3D lighting and shading study — #180

Owner direction, 2026-10-17: **desktop UI option C, Context and focus, is preferred**.
The UI decision is also recorded in [draft PR #187](https://github.com/sidesliders1983/Pillagers/pull/187).
Production UI integration is a later change. Current visual work concerns the **3D world only**;
the 2D presentation is discontinued, and mobile UI remains [#182](https://github.com/sidesliders1983/Pillagers/issues/182).
Shared simulation code is still used by the canonical 3D campaign.

This is a disposable lighting study on `codex/lighting-shading-study-180`, based on
`eeba00d09c4ea0350a9cfc8dd2cde948fd41c66c` from draft foundation PR #186.
It does not promote a new production lighting default.

## Review

Open [the comparison gallery](review.html). Select a scene and render tier, then move the
slider across the same world position.

The slider moves from **Current** (fully left, 0% candidate) to the selected **Candidate**
(fully right, 100% candidate). At the midpoint the current image occupies the left half and
the candidate the right half. Endpoint labels and a live status identify the visible image.
The control direction was corrected after owner review; the original capture evidence and
gallery-check record are preserved. The visual target remains the original Viking settlement
reference; no final lighting preset has been selected.

The corrected controls passed nine endpoint/midpoint checks across all three choices, with
matching visible labels and status text. Both full-image endpoints were visually inspected at
390px. These follow-up checks are recorded in [wipe-check.json](wipe-check.json).

The three treatments are:

| Treatment | Purpose | Settings relative to the current #186 seasonal treatment |
| --- | --- | --- |
| Current | Paired baseline | Existing light, seasonal/weather colours, exposure and sun direction |
| Form and shade | Isolate direct/ambient balance and restrained warm/cool separation | Hemisphere intensity ×0.5; directional intensity ×1.35; sky fill blends 40% toward `#bfd4ee`, ground fill 35% toward `#817970`, sun 20% toward `#ffecd6`; original direction |
| Northern sun | Isolate direction after the same balance change | Identical to Form and shade, with elevation 25° and azimuth 135° (`atan2(x,z)`) |

The current Summer values in #186 are hemisphere 2.067 and direct 2.016; the study's Summer
candidates are 1.0335 and 2.7216. These are parameters for different light types, not a measured
physical light ratio. Seasonal and annual weather intensity ratios remain proportional.
Colours blend with the actual seasonal/weather values rather than replacing the season palette.
Exposure, sky background, fog, source materials and shadow bounds/filter/bias are held fixed.

The gallery contains actual native 3D renders. The HUD is hidden with capture-only CSS,
preserving the canvas size and camera. No image-generation or screenshot recolouring is used.
Changing a gallery control displays another saved capture; it does not run the game.

## Existing implementation and observed constraints

- `src/core/WorldLighting.ts` already supplies directional sunlight, hemisphere fill, seasonal
  weather, mist and an unshadowed hearth. The Fjord's current seasonal contrast treatment is
  `src/config/FjordPresentation.ts`. Other worlds and the Environment Lab retain their defaults.
- `src/core/Renderer.ts` already uses ACES filmic tone mapping, sRGB output and native PCF
  shadows. This study adds no lights, shadow maps, postprocess passes or HDR environment.
- `src/world/BlueprintTerrain.ts` already uses approved albedo/roughness/normal materials and
  layered ground masks. `TerrainShading.ts` provides shared heightfield normals. Neither source
  geometry nor material parameters are changed here; stronger light can expose existing texture
  repetition and surface detail.
- The canonical world's directional shadow camera covers 260m across. Nominal light-camera
  texel spacing is approximately 0.127m at 2048px and 0.254m at 1024px. Direction/projection
  further affect contact readability. Changing a PCF filter radius cannot add shadow resolution.
- The native water adapter derives its intensity from hemisphere lighting. Reducing fill also
  darkens water. Judge sea brightness with the settlement rather than accepting buildings alone.
- Existing detailed pines and all native shadow casters remain. A different sun direction may
  change shadow work even when material/geometry allocations stay constant.

## Evidence protocol

The capture script loads the existing `summer-32`, `summer-17`, `developed-810`, `rain-810`
and `snow-811` fixtures into independent Standard and Low pages. It uses the existing opt-in
golden QA server: paused canonical simulation, fixed effects time 0, DPR 1 and 1440×900 desktop
viewport. Effects are off to isolate surface lighting. World dimensions are recorded per capture.

Every scene/tier captures Current → Form → Northern → Current. Assertions verify:

- Canonical campaign JSON, blueprint JSON, actor transforms/animation state and camera remain
  identical to that scene's baseline. Source fixture hashes and calendar states are retained.
- All entities use actual assets, with no placeholders.
- One directional shadow source; native 2048px Standard / 1024px Low maps.
- Identical material inventory/parameters, geometry count and texture count across treatments.
- Returning to Current restores exactly the same raw pixels. JPEGs are only delivery copies;
  raw pixel hashes and settings are retained in [observations.json](observations.json).
- No browser errors and no source edits during the capture run.

Draw calls and triangles explicitly include the native shadow pass. Different sun directions can
change submissions/culling; compare the recorded counters rather than infer zero rendering cost.
The file contains the actual browser/GPU, runtime-source hashes, camera, sun direction, fill,
exposure, shadow settings and material inventory. A return-to-baseline check is not proof of
two independent reloads; the earlier #186 golden evidence supplies that separate foundation.

This pass supplies visual comparisons and allocation/counter checks. It does **not** measure
animated GPU frame time, long-running simulation CPU cost, VRAM or physical mobile performance.
Historical Northstar HDR measurements remain historical and are not reused as current results.

Completed validation: **30 delivered captures across 10 scene/tier pairs; all pass**, with exact
baseline pixel restoration in every pair and zero browser errors. Shadow-inclusive calls and
triangles are also unchanged between the three treatments within every pair. The machine is
the recorded Intel HD Graphics 630 / Direct3D11 Edge host; this is not an FPS result.

The public review gallery passed 30 scene/tier/treatment selections, with delivered JPEG bytes
matching these files. Its slider, 390px review-page layout, read-only exposure and link back to
selected UI C were checked; this is gallery usability, not mobile game validation. The result is
retained in [gallery-check.json](gallery-check.json). The seven existing lighting/time-visualization
regressions pass. JavaScript syntax and Git whitespace checks pass. Formatting was reviewed
manually; the repository has no configured formatter. Production runtime sources are unchanged.

The capture parent in `observations.json` is #186's `eeba00d`; the new QA files were captured
from the working tree and have their exact hashes in that manifest. This evidence commit
preserves those bytes. Licensed original assets remain local and are not published here.

## Recommended implementation order after visual review

The saved summer/developed views show clearer lit roof planes and shaded façades with the
reduced fill. Water also gets substantially darker. Northern sun lights the visible building
fronts more clearly and creates long terrain/tree shadows, but it exposes coarse shadow edges
especially on snow, and darker terrain in the second seed. This is not yet a general default.
Use Form and shade as the balance experiment, then evaluate lower sun and contact together.
Neither treatment resolves sparse settlement composition or asset-style differences.

1. Choose the direct/ambient balance on summer and snow together. Compare Form to Current
   before selecting a new sun direction. Promote only a bounded Fjord-specific presentation
   configuration, retaining weather and canonical state.
2. Validate direction with orbit, pan, zoom and dense forest/shore views across procedural seeds.
   A fixed azimuth suited to one camera must not dictate every settlement's composition.
3. Improve contact through stable, measured receiver/caster shadow coverage and texel snapping.
   Keep one map and existing tier sizes; verify terrain, off-screen tree shadows and native water
   receivers. Test moving-camera stability, shadow seams and Low quality before promotion.
4. Inspect material families under the selected light: dry timber, rock, cloth, foliage, snow and
   water. Tune only demonstrated mismatches through their existing material adapters. Preserve
   authored geometry/colour and source maps; avoid blanket roughness/metalness overrides.
5. Capture the same seed/season/state matrix after each change. Before production promotion,
   run three serial paired timings per relevant tier/view: 10s warmup + 30s samples, report
   median/p95 presentation intervals and available CPU/GPU spans. Proposed gate: no more than
   5% regression; noisy results remain inconclusive rather than forced passes.

Visual acceptance requires readable shaded façades/people, restrained snow highlights, coherent
warm/cool planes and grounded foundations across the matrix. Fine foot contact is still open.
AO, bloom, reflection changes, volumetrics and extra shadow sources require a separate measured
proposal. CPU clans, combat, source asset replacement, world layout and 2D cleanup are outside
this lighting study.

## Reproduce

Use the repository's existing dependencies and licensed local `Assets/`, plus the prepared
game assets. A new checkout must supply those existing local resources. The initial pilot
correctly failed on a missing local longship source; supplying the unchanged asset fixed it.
That incomplete pilot is not included in this gallery.

```powershell
$env:QA_GOLDEN = '1'
$env:QA_PORT = '5192'
$env:QA_CACHE_DIR = 'artifacts/lighting-study/vite-cache'
node scripts/qa/fjord-runtime-server.mjs
```

In another terminal:

```powershell
$env:QA_OUTPUT = 'artifacts/lighting-study-replay'
node scripts/qa/capture-fjord-lighting-study-180.mjs
```

Use `QA_FIXTURES` or `QA_TIERS` for exploratory subsets. Preserve this dated evidence rather
than overwrite it during later implementation. `fjord-lighting-study-browser.mjs` is explicitly
loaded through the QA server and never imported by the production application.
