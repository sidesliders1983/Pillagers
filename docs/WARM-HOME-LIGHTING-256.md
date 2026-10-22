# Warm home lighting — #256

Northern Light is now the default for Fjord Play following owner acceptance.
`?lighting=baseline` retains the comparison. #237's water/haze integration remains
independently selectable with `sunlight=unified-v1`.

The new housing effect remains opt-in with `homes=warm-v1` pending owner visual
acceptance. No canonical rules, costs, saves, seasonal calendar or RNG change.

## Shared seasonal signal

Homes consume `WorldLighting.darkness`, the same interpolated annual darkness
that owns the accepted environment lighting. No second clock, seasonal switch,
snow multiplier, per-house timer or threshold is added. Existing window color
`0xffc481` and maximum emissive intensity `2.4` are reused.

With the approved #236 profile, darkness first rises around year progress .802
(about one fifth into Autumn), reaches full strength around .955, and remains
full across the year boundary until .045. Returning winter light fades it to
zero around .198. Spring and summer are unlit even while seasonal snow persists.
This is an annual artistic light profile, not an hour-of-day schedule.

## Authored surface inventory

All six ordinary/Farmyard runtime houses use one combined atlas each, without
native emissive maps. Original GLBs and atlases remain byte-identical.

| Actual gameplay asset | Binding |
| --- | --- |
| Tent | Unlit; no confirmed authored window/interior surface |
| Hut | Unlit; round door detail is not assumed to be glazing |
| Homestead / Dwelling | Two small existing gable window apertures |
| Longhouse | Two small existing gable window apertures |
| GreatHouse / greatHall | Unlit; openings have no independent interior surface. A trial mask lit the exterior back wall and was rejected |
| Farm Hut | Two existing front window apertures |
| Farm Homestead | Unlit; closed timber doors/walls, decorative lanterns left unchanged |

`scripts/inspect-home-surfaces.mjs` decodes runtime geometry and extracts atlases.
`scripts/inspect-home-surfaces.py` produces orthographic source inspections;
these are geometry/UV inspections, **not real-game screenshots**. The mask builder
records explicit projected aperture regions and exact runtime GLB hashes in
`public/game-assets/houses/lights/manifest.json`. Its dark-pixel restriction is
local to those regions and preserves brighter frames/mullions. It is not a
global atlas brightness recoloring rule. No synthetic window geometry is added.
The 512px grayscale masks use the original glTF UV orientation and native
`emissiveMap` on UV channel 1. An explicit triangle binding copies the original UV
only on supported aperture triangles; every other triangle samples a black corner.
This avoids filtered atlas bleed on unrelated walls. Three shared runtime geometry
buffers are expanded once to preserve per-corner UVs, with identical authored
positions, normals, triangle order and draw groups. They replace the original
buffers before instance creation; no per-house geometry copy is made. There is
no new material shader, light, bloom or postprocess pass.

Reproduce masks with `node scripts/prepare-home-light-masks.mjs`. Hash and area
checks fail on mismatched runtime assets, so a future house replacement requires
surface review and regeneration. Small unsupported-source corrections remain
explicit rather than silently replacing the model.

## Instance ownership and discovery

Only an existing house residence assigned to a household with a living member is
inhabited. Being temporarily away does not vacate a home. A removed/collapsed
building leaves the existing projection; reassignment clears the old occupancy.
Farmyard classification stays with the existing Core projection.

Bindings resolve once after `StructureSeasonTint` creates its existing owned
material copies, and before the optional #237 atmosphere hook. They borrow those
copies and the AssetManager's three shared maps. Only intensity changes during a
light transition; stable light skips the loop. No frame traversal, clone,
material version update or shader recompilation is introduced by occupancy.
Upgrade/removal disposes bindings before the snow owner releases its copies.
World teardown releases the three maps through AssetManager.

Rivals receive only the existing currently observed entity projection. A boolean
inhabited presentation signal is forwarded only for a currently visible building;
no resident IDs or household list is added. Hidden and mapped-only buildings are
absent and their bindings are removed. There is no new exterior light spill.
Campfire code, tuning, particles, halo and state are unchanged.

## Review and limits

Open `/scripts/qa/warm-homes-256.html` on the separate test origin. Four archived
real command-built saves contain occupied Homestead, Longhouse, GreatHouse,
Farm Hut and Farm Homestead, plus founding tents. The launcher restores identical
paused saves for current lighting versus home glow, Low/Standard and normal/close
views. Existing game controls allow fire, vacancy, upgrade and time checks.
`node scripts/prepare-warm-home-review.mjs` rebuilds these fixtures.

See [the QA report](qa/warm-homes-256/REPORT.md) for executed tests and CPU-only
measurements. Actual paired game captures, GPU timing and physical iPhone/iPad
checks remain pending. Keep the housing effect opt-in and PR draft until review
and required current-head checks pass. This change does not merge or publish.
