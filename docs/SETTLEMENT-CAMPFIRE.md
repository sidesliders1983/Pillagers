# Settlement campfire

The canonical `/fjord-play` settlement has one StoneCampFire from landing. Its stable location
is the midpoint of the saved settlement bounds. Its location remains a presentation landmark,
independent of Core buildings and households.
The #97 spike adds a canonical burning state and fuel reserve, controlled by selecting the
campfire in `/fjord-play`. Ceremonies, production bonuses and settlement information remain future work.

The owner-supplied Meshy stone circle is displayed at **twice its source size**: approximately
6.40 × 1.50 × 6.46 metres. All axes use the same scale. The source geometry and its four maps
are retained. The supplied model has no flame animation. The #97 spike layers flames,
smoke and sparks
from three.quarks onto the logs. Upper stone and log surfaces receive seasonal snow and
Spring thaw; while burning, this local snow layer fades out over three active seconds.
After extinguishing it returns over six active seconds, multiplied by the current season.
Homes, tents and the surrounding terrain keep their seasonal treatment.
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

## Campfire fuel — #97 spike

The settlement campfire starts unlit. Select it in `/fjord-play` and use **Light campfire**
or **Extinguish campfire** in the contextual action panel. One Material purchases exactly
1,000 burning simulation ticks (one full year/Winter), regardless of calendar season or
chosen real-time year length. Lighting with prepaid ticks costs nothing. Extinguishing
preserves the remaining ticks; there is no refund. At zero prepaid ticks the next attempted
burning tick purchases one more Material, or extinguishes the fire if none is available.
Finishing a purchased year does not charge the next one early.

Fuel is paid before that tick's work output and before annual building upkeep. Materials
produced later in the same tick do not revive an extinguished fire; the player can relight it.
The normal clock, `+1 Year`, 2D/3D handoff and save/load all use this same canonical rule.
Pausing, a hidden tab or being offline consumes no fuel. Fire-effects Off/Low/Normal and
reduced-motion preferences are presentation settings and never change fuel consumption.

The optional version-1 `campfire` save extension stores `lit` and integer `fuelTicks`.
Absent state means off with no fuel; old saves acquire no invented costs. CPU settlements
remain unlit unless explicitly commanded. `CampfireFuelConsumed` records each Material
purchase; the Clan Book factual ledger includes these under Materials spending. This spike
adds no warmth, shelter, productivity, health or ceremony bonuses.

See [VFX implementation and evidence](CAMPFIRE-VFX-SPIKE.md).
