# Warm home lighting — #256

Northern Light is now the default for Fjord Play following owner acceptance.
Unified sunlight, coastal shadows and directional atmosphere from #237 are also
enabled by default following the owner's 23 October request. `?lighting=baseline`
retains the original comparison; `?sunlight=northern-v1` retains annual Northern
Light without the unified water/haze integration.

Following owner visual acceptance, supported occupied homes now use the warm
window and ground glow by default. `homes=baseline` explicitly disables it for
matched comparisons; `homes=warm-v1` remains a supported explicit link. No
canonical rules, costs, saves, seasonal calendar or RNG change.

The separate review server (`node scripts/dev-warm-home-review.mjs`, port 5229)
uses the same defaults as production. It no longer injects a development switch.

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
no additional shader for the window material, light, bloom or postprocess pass.

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
absent and their bindings are removed. Ground spill is also clipped to observed land.
Campfire code, tuning, particles, halo and state are unchanged.

## Warm light on snow and ground

Following owner review, supported occupied windows also cast a small presentation
light patch on nearby ground. Window anchors and outward directions are generated
from the same reviewed aperture regions and transformed with the actual house.
The patch extends 3.4 metres outward and fades softly across and along its footprint;
maximum additive opacity is .2. It follows canonical terrain heights with a .045m
surface offset and skips submerged or unobserved ground. No new discovery occurs.

All patches share one geometry/material/draw per settlement layer, not one light or
material per house. Vertices rebuild only when housing poses, occupancy, world or
visible territory change. Interpolated darkness updates one uniform; summer and
empty batches are hidden. It has depth testing, distance-fog attenuation, no depth
writing, shadow source, new texture, timer or raycast target. It does not illuminate
walls/actors like a dynamic light. This preserves the accepted campfire lighting.

## Fauna reflect scene light

The source audit covered all 13 livestock variants and 14 wildlife assets. The
nine goat, pig and sheep GLBs imported an emissive factor of `[1,1,1]`; cattle and
wildlife were already non-emissive lit PBR materials. `prepareFaunaLighting` now
disables emission once on livestock/wildlife templates before instancing. Albedo,
normal maps, skinning and animation stay intact, and texture references remain
owned by their existing loader. No per-frame fauna material recoloring is needed.
`prepare-livestock.mjs` also clears emission on future exports. Original supplied
assets and the current runtime GLB bytes are preserved. Marine spray/wake effects
are separate presentation effects and are not animal-coat materials.

## Review and limits

Open `/scripts/qa/warm-homes-256.html` on the separate test origin. Four archived
real command-built saves contain occupied Homestead, Longhouse, GreatHouse,
Farm Hut and Farm Homestead, plus founding tents. The launcher restores identical
paused saves for current lighting versus home glow, Low/Standard and normal/close
views. Existing game controls allow fire, vacancy, upgrade and time checks.
`node scripts/prepare-warm-home-review.mjs` rebuilds these fixtures.

See [the QA report](qa/warm-homes-256/REPORT.md) for executed tests and CPU-only
measurements. Actual paired game captures, GPU timing and physical iPhone/iPad
checks remain separate from owner visual acceptance. The owner has approved the
appearance and main integration. Historical measurements retain their original
scope; this integration adds no new GPU or physical-device measurement. PRs still
require successful checks for their current head before merging.
