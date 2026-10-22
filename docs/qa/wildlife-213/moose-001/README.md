# Moose walk retarget and wildlife animation audit

The original `Elk.glb` has 35 joints and no animation. The runtime derivative now
contains a one-second `Walk` retargeted from the supplied `Lynx-animated.glb` and a
separate neutral `Idle`. Original assets are unchanged. Geometry, UVs, skin
weights, bind matrices and segment lengths are retained; only derivative animation
channels are added. Both source hashes are pinned in the runtime manifest.

World rotation deltas are applied in hierarchy order to the moose bind pose.
Additional neck, shoulder and hoof joints share the corresponding donor motion.
The authoring pass samples 241 frames, corrects vertical root height to the lowest
skinned hoof, and removes no horizontal movement from the world controller.
Sampling at half-frame intervals checks contact within 6 mm, all four strides,
fixed limb lengths, compact skin bounds and a continuous loop seam.

Rest uses all four neutral hooves rather than freezing a raised walking leg.
Head turns and breathing use the same reversible overlay and paused clock as the
other mammals. Tests exercise idle-to-walk transitions against an untouched
control rig, so resting rotation cannot leak into locomotion.

## Audit scope

| Animals | Active motion and verification |
| --- | --- |
| Moose | Retargeted lynx walk, original moose skeleton, neutral idle, contact and pause checks. |
| Bear, wolf, fox, lynx | Existing Meshy source walk retained; visible skin motion, bounded geometry, rest and pause checked. |
| Reindeer | Existing Meshy walk and mirrored right hind-chain repair retained; hind legs stay on their own side. |
| Otter, seal | Existing Meshy locomotion and independent resting overlays retained; land/water motion and pause checked. |
| Flying gull | Ascent-driven wing effort and descending glide checked. |
| Grounded gull | Folded/lowered wings, head scan, lift-spread-fold-lower sequence and fixed feet checked. |
| Puffin | Skin deformation while waddling, paddling and resting; shoreline placement and pause checked. |
| Rabbit | Gather, flight, forepaw landing and hind-paw recovery; slope contacts and exact paused pose checked. |
| Whale, orca | Existing episodic encounter motion, submerged visibility, water sampling, tail motion and sightings checked. |

The seven existing Meshy GLBs have not been regenerated. Swimming otters and
seals still reuse their supplied locomotion clips rather than dedicated swimming
cycles. The moose gait is transferred feline motion, not new moose motion capture.
These existing animation-quality limits are separate from missing playback or rig
regressions.

## Review and validation

`/scripts/qa/moose-walk.html` loads the eight actual published mammal GLBs. It
provides animal selection, walk/rest, exact phase inspection, pause and orbit.
Its rest overlay comes from the production module. Production `WildlifeLayer`
behavior is exercised separately by the automated tests.

- 49 wildlife, marine encounter and wildlife sighting tests pass.
- Production asset validation, TypeScript and Vite build pass.
- Tracked-public validation and all 20 character asset contracts pass, including
  the existing explicit Lab preview audits.
- A fresh Fjord Play test campaign loads on port 5222 with 30 wildlife instances,
  14 shared assets, no wildlife diagnostics and no browser error logs. The scene
  is paused after inspection; existing campaign behavior is not changed.
- Handwritten formatting reviewed manually; no project formatter is configured.

Historical wildlife QA reports are unchanged.
