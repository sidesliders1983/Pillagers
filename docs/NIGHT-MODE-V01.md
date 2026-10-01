# Night Mode v0.1 — issue #5

Open ⋯ → Debug → Lighting → Day / Night. Presets change without reloading;
day remains the default. Fog and shadow preferences survive preset changes.
There is no simulated clock, schedule, weather or gameplay effect.

## Lighting budget

- One hemisphere fill and one directional light reused as sunlight/moonlight.
- Day uses the existing 2048px directional shadow map; night uses 1024px.
  Old shadow targets are disposed when changing map size.
- One night-only amber point light at the existing hearth, radius 10 metres,
  intensity 28, no point-light cube shadow maps.
- A single transparent radial ground halo. It cannot intercept character picking.
- Existing window/flame triangles receive emissive material groups, rather than
  coplanar overlays or new models. Windows add no realtime lights or shadow maps.
- No bloom, volumetrics, particle system or post-processing pipeline. Existing
  renderer device-pixel-ratio cap is retained.

`src/config/lightingConfig.ts` exposes night sky/fog, hemisphere colors/intensity,
moon color/intensity/position, shadow resolution, exposure, fire radius/intensity,
flicker strength/speed, halo parameters and window/fire emission. Day settings
continue to come from `worldConfig.lighting`.

The fire intensity uses two deterministic smooth sine waves, bounded to ±5.5%.
Its update changes existing light/material uniforms without creating resources.
The original cooking-hearth flames are reused. Only their low flame surfaces
receive emission; the kettle stays unlit by emission.

## Source-model treatment

The supplied GLBs have a single vertex-colored material. Before the existing
palette treatment, `AssetManager` recognizes blue-grey glass faces in the hall,
turf dwelling and storehouse, and saturated low flame faces in the hearth.
`splitEmissiveSurfaces` partitions indices into two material groups without adding
vertices or changing triangles. Original source files stay untouched and excluded
from Git. Day sets emission to zero, preserving the daytime vertex palette.
The three building/window materials are shared by their cloned scene instances.
This classifier is specific to the current asset pack; check it when replacing
models. Browser validation checks that all three window materials are present.

## Validation

27 Node tests include triangle partitioning, reversible presets, single shadow
source, fog/shadow preference preservation and bounded smooth flicker. Strict
TypeScript and the production build pass on a snapshot of committed code plus
this issue's files. A simultaneous unfinished Asset Lab route in the working tree
was left untouched and excluded from that snapshot. `scripts/night-smoke.cjs` checks live
desktop/mobile switching, three emissive window materials, light/shadow budgets,
repeated switching, preferences, viewport bounds and browser/shader errors.

Production headless Chromium on this workstation measured 286 → 287 desktop draw
calls and 202 → 208 mobile-context draw calls at the home camera, with one shadow
source throughout. Counts can change as residents move and light/camera frusta
change. Software-renderer FPS and shader compilation are not physical-phone
benchmarks; the smoke script waits for several post-switch samples before its
night reading. Visual screenshots are saved in ignored `artifacts/`.
