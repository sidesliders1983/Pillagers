# Fjordside visual foundations

First implementation slice of [#180](https://github.com/sidesliders1983/Pillagers/issues/180),
based on merged [PR #179](https://github.com/sidesliders1983/Pillagers/pull/179),
commit `c3027b4cd91ad355d89c1cc158f3993487af2503`.
Desktop UI is in scope. Mobile layout work remains in [#182](https://github.com/sidesliders1983/Pillagers/issues/182).

## Current implementation and scope

The earlier [audit PR #184](https://github.com/sidesliders1983/Pillagers/pull/184) describes an older snapshot.
PR #179 already contains canonical 3D campaigns, approved clothing/hair, structural snow,
precipitation, cached campaign reads and earlier navigation/fitting optimizations. This change
preserves those systems and does not repeat the older audit's proposed replacements.

This slice implements the golden-scene foundation, a bounded seasonal lighting treatment and
desktop UI tokens. It does not complete all Phase A work or claim reference parity.
Terrain generation, stored geography/navigation, placement rules, source assets, character
bindings, canonical ticks, economy, expedition behavior and save schemas are unchanged.
No 2D presentation work is included; shared simulation components remain available.

## Desktop presentation

`src/fjord-play/desktop-foundations.css` applies only above 1100 CSS pixels. Existing DOM IDs,
header controls, selection handlers, resource counters, panel collapse and menu ownership remain.
Charcoal surfaces, warm ivory/gold emphasis, clearer resource separators, larger inspector text,
visible keyboard focus and consistent panel borders improve the existing desktop hierarchy.
There is no blur, texture/font download, runtime UI dependency or added world rendering pass.
The existing narrow-layout rules and pacing-control relocation are preserved.

`src/config/FjordPresentation.ts` scopes lighting to the canonical `/fjord-play` scene.
The selected Northern sun treatment uses a fixed world direction at 25° elevation and 135°
azimuth, cooler sky fill, restrained warm sunlight and a small lift in shaded faces. After
seasonal/weather composition, hemisphere intensity is multiplied by `0.78 × 0.56` and direct
intensity by `1.12 × 1.35`. Fill is 12% higher than the earlier selected lighting study; direct
intensity and direction match that study. Existing seasonal sky, fog, exposure and weather
ratios remain. These are presentation settings, not gameplay or seasonal balance changes.
Native day/night modes, the legacy prototype and Environment Lab retain their previous defaults.
The scene still has one directional shadow source and its existing unshadowed hearth.

`src/core/DirectionalShadowCoverage.ts` fits that one native PCF map to visible receivers within
the existing fog depth. X/Y extents are independent, quantized and snapped to shadow texels.
Full scene caster depth retains upstream roofs and trees outside the player's view, while
the receiver-only seabed skirt does not inflate that depth range. The world bounds are collected
on creation/discovery; moving entity bounds extend them during the existing scene sync. Unchanged
camera/direction/quality/bounds reuse the previous fit. Standard remains 2048px and Low 1024px.
There is no extra shadow map, scene pass, SSAO, material replacement or new dependency. Far zooms
and Low quality still have finite shadow detail; texel snapping does not guarantee flicker-free
transitions when the quantized coverage span changes.

The selected/refined native comparison and methodology are in
[`docs/qa/northern-lighting-180/`](qa/northern-lighting-180/README.md).

## Golden scenes

Use the existing runtime QA server rather than a production debug API. In PowerShell:

```powershell
$env:QA_GOLDEN = '1'
$env:QA_PORT = '5191'
$env:QA_CACHE_DIR = 'artifacts/golden-vite-cache'
node scripts/qa/fjord-runtime-server.mjs
```

In a second terminal:

```powershell
$env:QA_ORIGIN = 'http://127.0.0.1:5191'
$env:QA_OUTPUT = 'artifacts/fjord-golden'
node scripts/qa/capture-golden-fjord.mjs
```

The default cases reuse frozen `summer-32`, `summer-17`, `developed-810` and `snow-811`
campaigns in `docs/qa/fjord-runtime-performance/fixtures`. `QA_FIXTURES` selects comma-separated
case names, `QA_FIXTURE_DIR` selects a different frozen fixture directory, and `QA_QUALITY`
chooses a cold Standard/Low load. Desktop defaults are 1400×900 at DPR 1; `QA_WIDTH` and
`QA_HEIGHT` select another viewport. Two independent pages are loaded per case by default.
`QA_RELOADS=1` is an exploratory smoke only, not proof of reload reproducibility.

The QA-only transform suppresses the campaign timer and freezes frame delta/effects time from
startup. It does not replace `performance.now`, alter production clock semantics or add fields
to saves. Actors keep their existing zero-delta poses; water/wind receive fixed presentation
time. Canonical season/year/tick come from the full saved campaign, not a screenshot-only season.
Spring fixtures should use tick 375 for the current thaw contract; tick 250 is still winter-white.
Particles are explicitly Off for these structural golden comparisons. Discovery-fade/active-VFX
and combat fixtures require separate qualification; they are not certified by this initial matrix.

Each capture records input and loaded fixture hashes, canonical/blueprint hashes, actor transforms
and animation phase, exact camera/projection, calendar, quality, lighting/shadow settings,
shadow-inclusive calls/triangles and resource counts. Served binary resources are hashed; missing
resources, actual entity placeholders, changed asset bytes, differing consecutive pixels or
differing reload state/pixels fail the run. Source hashes include uncommitted source files.
Failures retain their message and page context. Screenshot capture alone is not visual approval.
Capture waits for pending action/scene work before reading the scene and checks that source
bytes remain unchanged throughout the run. Golden servers disable file watching so unrelated
historical HTML evidence cannot trigger a reload during the measurement.

For this bounded lighting/UI comparison, a second QA server may set `QA_SOURCE_REF` to the exact
PR #179 commit. It serves the pinned `FjordPlay.ts` and `WorldLighting.ts` through the same QA
bridge, thereby omitting the new desktop import and lighting treatment. Those override hashes
are recorded in `servedSource`; all other files come from the current checkout. This is valid
for this change's two production integration files, not a general historical-version emulator.
`QA_PIN_PRESENTATION=1` additionally pins `src/config/FjordPresentation.ts`; this is needed to
reproduce the selected Northern sun baseline from the exact foundation revision. It is opt-in
so earlier #179 comparisons retain their original contract. Record the revision and transformed
file hashes. For broader future changes, use a complete separate source checkout instead.

Normal builds never import the QA browser bridge, capture clock or window binding.
Existing runtime profiling automatically releases the golden presentation freeze before active
measurements. Do not use frozen screenshot cadence as an animated performance result.

## Review and remaining work

Compare scenes with the same canonical/blueprint/actor signatures and report actual canvas
dimensions. Desktop shell typography can change the available canvas height even at the same
browser viewport. Rendering-cost comparisons must distinguish that from added geometry/passes.
Record actual device/browser identity, warmup, sampling duration and instrumentation overhead.
Main-thread submission/rAF intervals are not GPU execution time. Unavailable timer queries must
remain unavailable in results, not be represented as zero cost.

The Northern sun refinement adds a five-fixture Standard/Low lighting gallery and native shadow
coverage checks. Remaining Phase A work includes broader seed/season qualification, measured
camera/framing studies, coherent material/terrain-mask trials, temporal shadow refinement
and current long-run CPU attribution. Existing performance reports and unresolved gates remain
historical records. Placement/density changes still need explicit saved-world compatibility.
Final gameplay HUD/combat/CPU-clan polish remains Phase B.

Validation results and before/after evidence are in
[`docs/qa/visual-foundations-180/`](qa/visual-foundations-180/README.md).
Run `node scripts/qa/check-fjord-desktop-foundations.mjs` against a normal source server
(`QA_ORIGIN`, default `http://127.0.0.1:5183`) for real timer, selection, keyboard/menu and
desktop layout checks. This script deliberately requires the production QA binding to be absent.
No formatter is configured; check new source formatting manually, use `node --check` for QA
scripts, `git diff --check`, the full existing test/character checks and the production build.
