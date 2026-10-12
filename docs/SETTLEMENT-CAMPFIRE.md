# Settlement campfire

The canonical `/fjord-play` settlement has one StoneCampFire from landing. Its stable location
is the midpoint of the saved settlement bounds. It is a presentation landmark, not a Core
building, inventory item or household. This slice adds no cost, production, ceremonies or
settlement information panel.

The owner-supplied Meshy stone circle is displayed at **twice its source size**: approximately
6.40 × 1.50 × 6.46 metres. All axes use the same scale. The source geometry and its four maps
are retained. The supplied model has no flame animation; none is fabricated in this slice. Its upper stone
and log surfaces receive the same seasonal snow and Spring thaw as homes and tents.
A 7m-radius middle place excludes dwellings and clears nearby nature. A 4.4m obstacle radius,
plus each actor's body clearance, keeps residents and cattle outside the stone ring.

Ordinary permanent homes face this point. Active Farmyards remain at their existing 180°
orientation with their terrain and fences. Tents stay on grass. The first permanent house
already gains a dry path to the middle place. Paths use the saved terrain's existing slope
and water limits and never cross the fire ring or other dwelling reservations.

All dwellings reserve a 15m square from arrival, large enough for the entire rotated Great
Hall or calibrated Longhouse. Grid spacing is 17m. The physical Farmyard remains its previous
approximately 13m square; reserving upgrade clearance does not enlarge its source model.

## Save/load

Presentation layout v2 stores parcels and outdoor anchors as before. The campfire is derived
from the frozen geography, so ticks, deaths, construction and save/load cannot move it.
Older v1 sidecars are validated and their presentation layout is rebuilt once around the
middle place. Canonical state, history, RNG, geography, selection and the mooring survive;
old visual parcel positions change. New v2 saves preserve the complete layout exactly.
Imports that occupy the middle place or corrupt layout identity fail atomically.

## Asset provenance and reproduction

Runtime: `public/scenery/meshy-campfire-v1/campfire.glb` (1.93 MB, 13,517 triangles).
The adjacent manifest records SHA-256 and byte size for the supplied FBX and all four PNGs,
plus output hash, bounds and triangle count. The runtime file is committed; source copies
and Blender intermediates stay under ignored `Assets/StoneCampFire`.

1. Run isolated Blender 4.5 with `--background --factory-startup --python-exit-code 1
   --python scripts/convert-stone-campfire.py -- <StoneCampFire source folder>`.
2. Run `node scripts/prepare-stone-campfire.mjs <StoneCampFire source folder>`.

The conversion reconstructs the material from the supplied albedo, normal, roughness and
metallic maps. Runtime preparation centers and grounds the model, limits textures to 1024px,
uses WebP (lossless normal/material maps) and Meshopt. Source geometry and dimensions stay
unchanged; the approved 2× display scale lives in the projection.

## Verification

Public projection and save/load regressions: `tests/fjord-bridge.test.mjs`.
Browser rendering, source bounds, touch selection and movement:
`scripts/qa/check-settlement-campfire.mjs`.
Visual evidence: [review](qa/settlement-campfire/review.html).
