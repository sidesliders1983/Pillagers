# Character Attachment & Fit System v0.1

Issue: https://github.com/sidesliders1983/Pillagers/issues/15

`pillagers-fit/0.1` is the shared Lab/World attachment contract. The runtime
owns a `CharacterFitSystem`; `CharacterFactory` registers and loads modules.
There are no DNA-specific asset offsets. Fitting runs when DNA or equipment
changes. Animation continues through the existing PillagersHumanRig.

## Coordinate and authoring frames

- Universal Human bind coordinates: metres, feet/root origin, **+Y up, +Z
  front**, anatomical left on +X. The final existing 0.8 height scale belongs
  to the character root, not each asset.
- Head-module canonical coordinates: skull bounding-box centre as origin,
  the same axes, canonical head dimensions `[0.1992, 0.2397, 0.2189]` metres.
  `canonicalHeadSize` can explicitly override authoring dimensions. Current
  head, hand and foot shapes remain fixed as requested; the fit path supports
  different cage dimensions without introducing new anatomy morphs.
- Existing image-to-3D busts use `measured-reference-head`. Their calibrated
  source front/up/centre/radius in `ReferenceHeadFrames.ts` convert them into
  the canonical head frame before fitting. This is a one-time asset import
  calibration, not a per-character adjustment. Future assets should be
  exported directly in the canonical frame.
- Garments use canonical full-body bind coordinates. Equipment uses the
  selected socket's local origin and neutral +Y/+Z orientation.

## Stable sockets

| Socket | Animation bone | Surface anchor |
| --- | --- | --- |
| socket_head_top | Head | HEAD_TOP |
| socket_face | Head | FOREHEAD |
| socket_jaw | Head | CHIN |
| socket_neck | Neck | NECK_FRONT |
| socket_back_head | Head | OCCIPUT |
| socket_chest | Chest | CHEST_CENTER |
| socket_back | Chest | BACK_CENTER |
| socket_shoulder_L / R | UpperArm_L / R | CLAVICLE_L / R |
| socket_waist | Hips | WAIST_FRONT |
| socket_hip_L / R | Hips | HIP_L / R |
| socket_hand_L / R | Hand_L / R | HAND_GRIP_L / R |
| socket_forearm_L / R | LowerArm_L / R | FOREARM_L / R |

Sockets are non-deforming child Groups of the animation bones. Surface-anchored
sockets are placed from resolved body vertices in the neutral pose; then the
normal skeleton moves them. Existing weapon/shield sockets remain available.

## Landmarks and fit volumes

The canonical master positions select stable vertex anchors on each LOD's
immutable topology. Anchors are chosen independently of DNA, then evaluated
with the body's actual morph targets and adapted rig. They are not fixed
offsets on the final character. Flat-normal/UV duplicate vertices do not
create additional semantic landmarks.

Head: HEAD_TOP, FOREHEAD, TEMPLE_L/R, EAR_L/R, OCCIPUT, CHIN, JAW_L/R,
UNDER_CHIN, NECK_FRONT/BACK. Body: CLAVICLE_L/R, CHEST_CENTER, BACK_CENTER,
WAIST_FRONT/BACK, HIP_L/R, HAND_GRIP_L/R, FOREARM_L/R. Hand and forearm sockets
also use surface anchors so child limb proportions do not leave equipment
at an adult bone-origin offset. Topology replacement requires checking this
canonical anchor mapping, not retuning every DNA profile.

Four volumes are derived from those same morphed source surfaces:

- HEAD_CAGE: fixed skull hull; excludes neck/arms.
- LOWER_FACE_CAGE: jaw/front-neck region.
- TORSO_CAGE: upper/lower torso; excludes arm weights.
- PELVIS_CAGE: hip/waist region.

Body cages use 26 support directions to select a small convex envelope. The
head retains its source hull vertices for accurate faceted surface clearance.
These are fitting data, not additional body render meshes. Debug triangulates
them only when requested. Cage debug vertices follow their source skin anchors
without recalculating convex hulls or fitting modules in the frame loop.

Head module fitting uses the HEAD_CAGE collision surface and normalized
attachment bands. Beard attachment bands define the lower-face contact;
free beard lengths remain outside that band. Stubble retessellates existing
source triangles before shell fitting. Hair triangle interiors also receive
clearance checks; UV/flat-shading copies move together. Imported extraction
cleanup is declared in module metadata (`trim`), not a character preset rule.
Only existing reference geometry is used, with no generated replacement styles.

## Module metadata and extension API

```ts
factory.registerModule({
  version: 'pillagers-fit/0.1',
  id: 'tunic_basic_01', type: 'garment', slot: 'upper',
  anchor: 'socket_chest', fitCage: 'TORSO_CAGE', fitMode: 'drape',
  authoringFrame: 'canonical', clearance: 0.02,
  covers: ['TORSO_UPPER', 'TORSO_LOWER']
}, '/accepted-assets/tunic_basic_01.glb');

await factory.equip(character, 'tunic_basic_01');
factory.unequip(character, 'tunic_basic_01');
```

`UniversalHuman.equip(metadata, source)` is the lower-level extension point.
Hair/beard slots replace their previous same-type modules, garment slots
replace a previously equipped garment in that slot, and equipment can coexist.
Changing DNA refits equipped modules from their immutable source geometry.
Adult male eligibility also applies to registered beard modules. The Lab
keeps automatic profile assignment; no manual hairstyle/beard selectors were
added. Contract metadata is available from `character.fit.snapshot()`.

Canonical hair and masks use the skull-centred cage frame; rigid equipment
uses its socket directly. Generated reference hair/beards share the existing
fitting implementation, with rules selected by metadata.

## Clothing and coverage

Garments are separate owned SkinnedMeshes sharing the existing body's
skeleton and bind matrix. The source's loose silhouette and open hem are
retained. Cage axis deformation handles morphology, and convex-envelope
clearance expands intersecting vertices outward rather than copying body
facets. Four nearest canonical body vertices transfer and normalize weights
using a k-d tree. Full/over garment hems below the torso attach to Hips rather
than independently pulling apart with each leg. Material regions are retained.

The initial fitting uses simple envelopes, not cloth simulation. Real sleeve,
hem and belt authoring still need asset review; v0.1 does not promise a perfect
fit for arbitrary uncalibrated garments.

Coverage zones: HEAD, NECK, TORSO_UPPER, TORSO_LOWER, PELVIS,
UPPER_ARM_L/R, LOWER_ARM_L/R, UPPER_LEG_L/R, LOWER_LEG_L/R, FEET.
Zones are derived from canonical position and dominant animation weights,
so morphology does not change their meaning. `maskBody(covers)` hides fully
covered triangles using an owned index copy. Removing coverage restores the
immutable body geometry; base positions, morphs and cached assets never change.
Boundary triangles are retained to avoid holes at garment edges.

The existing brown waist wrap is still the technical shared-rig demonstrator,
not finished reference clothing. Issue #10's generated clothing candidates
are unreviewed/unrigged and are not published by this issue. Upper and long
garment contract validation uses explicitly technical in-memory test fixtures;
these never appear as replacement artwork in Character Lab.

## Character Lab validation

Open **Attachment & Fit debug · v0.1** below the preview. Independent toggles
show sockets, surface landmarks, animated cages, semantic coverage and module
bounding boxes. Metadata lists all sockets/landmarks/cages and active modules.
Overlays are omitted from exported GLBs.

Presets: very feminine/masculine, high Agility, short/tall adults, older adult,
child, overweight/underweight, and legacy high Physicality. Physicality anatomy
remains disabled; the legacy preset verifies compatibility without restoring
the removed control.

Validation:

- `tests/attachment-fit.test.mjs`: all sockets and landmarks, four volumes,
  all body LODs and ten presets; short/braided reference hair and short/long
  reference beards; upper/long garment fixtures; immutable sources, coverage
  restoration, skin weights, animated debug, and no per-frame refitting.
- `tests/universal-human-motion.test.mjs`: actual skinned geometry through
  Idle/Walk/Run, all reference styles and LODs, hair triangle interior clearance,
  stubble surface clearance, annual age/bind reuse.
- `scripts/attachment-fit-smoke.mjs`: desktop/mobile Lab presets, independent
  overlays, metadata and normal view; screenshots under ignored `artifacts/`.

No hair/cloth physics, new asset generation or wardrobe content belongs to
this contract milestone. Actual reference clothing acceptance remains #10.
