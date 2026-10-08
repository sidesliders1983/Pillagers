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
- Garments use canonical full-body bind coordinates. `garmentBind.joints` records
  measured generated-source neutral joint positions in that same frame. The fit
  system maps the source stance to `fit.canonicalJoints`, captured from the rig
  before morphology. This is asset calibration, never a per-DNA offset.
  Equipment uses the
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

Head module fitting uses the HEAD_CAGE collision surface and a separate
authored skull frame for dimensions/origin. Legacy bodies alias that frame to
their unchanged HEAD_CAGE. A calibrated source may include lower-chin collision
vertices without enlarging its module authoring frame. Beard attachment bands define the lower-face contact;
the contact band includes the measured chin and under-chin at every body LOD
(the lowest under-chin anchor is approximately -0.54 skull heights). Free beard
lengths remain outside that band. Automatic and explicitly equipped head modules
use the same skull-frame dimensions/origin while LOWER_FACE_CAGE resolves jaw fit.
Stubble retessellates existing
source triangles before shell fitting. Hair triangle interiors also receive
clearance checks; UV/flat-shading copies move together. Imported extraction
cleanup is declared in module metadata (`trim`), not a character preset rule.
Only existing reference geometry is used, with no generated replacement styles.

### Source-authored body surface calibration

pillagers-body-surface/1 is optional, versioned body-source metadata; the module
contract remains pillagers-fit/0.1. It declares ordered neutral positions and
indices, semantic coverage, immutable common-part memberships, cage regions,
landmark indices and the skull module-frame subset. The trusted source catalog
binds it to an exact GLB SHA-256. CharacterFactory validates correspondence to
the loaded source, and CharacterFitSystem rechecks each cloned body neutral
topology before using it. Unknown fields, stale source identity, malformed or
split-copy memberships, incompatible cage zones and overlapping immutable cores
are rejected. Validation owns a frozen defensive copy. Direct array comparison
works on ordinary LAN HTTP without WebCrypto.

Calibrated landmarks and cages follow the same morphed/skinned source vertices
as the render body. Metadata is loaded lazily for that selected body source;
World and uncalibrated legacy bodies keep their existing classification and
frames. This is a deliberate topology migration, never a per-DNA fitting offset
or a runtime heuristic that expands every body head region. The r2 Golden
preview complete head collision region has 877 corner records, while its
859-record module frame remains exactly the previous frame. This establishes
source correspondence, not acceptance of the complete morphology range or of
any hair/beard/garment on the new body.

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
Adult male eligibility also applies to registered beard modules. Automatic profile
assignment remains the default. Issue #18 deliberately supersedes the earlier
profile-only Lab UI: registry-based Auto/None/manual choices are presentation
inspection tools, and they use this same factory/socket/cage path. Manual choices
do not change DNA or approve an asset. Beard eligibility still uses the real
derived sex and age 18+. Contract metadata is available from
`character.fit.snapshot()`; Lab diagnostics also report the selected presentation
and the separately resolved body override.

Canonical hair and masks use the skull-centred cage frame; rigid equipment
uses its socket directly. Generated reference hair/beards share the existing
fitting implementation, with rules selected by metadata.

## Clothing and coverage

Garments are separate owned SkinnedMeshes sharing the existing body's
skeleton and bind matrix. Measured reference garments bake their native pose
into the canonical 17-joint frame during authoring. Transverse source-cage
calibration also accounts for the actual source torso depth and width; joint
locations alone cannot measure those dimensions. This is recorded source
calibration, not a style or DNA adjustment in the runtime fitter.

Runtime morphology transports each measured source point through an exact
canonical body-triangle anchor and its barycentric coordinates, retaining a
bounded source stand-off vector. A continuous waist field joins torso transport
to the pelvis-owned free drape. Collision clearance is applied once when the
module is equipped. Measured regional garments transfer and normalize the
existing skin weights through actual body-triangle barycentric coordinates;
the legacy unmeasured path uses four nearest canonical body vertices. Free
hems follow Hips, rather than separate leg poses. The
original facets, UVs, material regions and loose silhouette remain the authority.
Legacy unmeasured garments retain the simpler cage/envelope path.

Coincident copies at genuine sewn seams share fitted positions and weights.
UV copies retain the interpolation of their own source face, including when
a geometric edge support is shared across two atlas tiles. Sharing a support
position never authorizes copying a neighbouring face's texture coordinates.
Physically separate wear layers must be separated in source authoring; a free
cloth hem welded to trousers cannot be corrected by averaging both layers'
animation weights. Open collars, cuffs and free hems are intentional boundaries,
but disconnected seam fans and accidental gaps are not. This fitting and
skinning path is not cloth simulation and still requires native-source and
animated browser review.

Coverage zones: HEAD, NECK, TORSO_UPPER, TORSO_LOWER, PELVIS,
UPPER_ARM_L/R, LOWER_ARM_L/R, UPPER_LEG_L/R, LOWER_LEG_L/R, FEET.
Uncalibrated legacy zones are derived from canonical position and dominant animation weights;
calibrated bodies use validated authored source memberships. In both paths,
morphology does not change their meaning. `maskBody(covers)` hides fully
covered triangles using an owned index copy. Removing coverage restores the
immutable body geometry; base positions, morphs and cached assets never change.
Boundary triangles are retained to avoid holes at garment edges.

Published reference outfits deliberately use `covers: []`: the full character
remains underneath clothing. Broad-zone hiding can expose a hollow torso through
open cuffs/hems and must not substitute for correcting garment fit.

The brown waist wrap is a technical shared-rig demonstrator and is omitted when
a reference outfit is equipped. The current registry contains three generated
full ensembles: cream tunic, long dress and mantle tunic. Their replacement
optimization candidates remain unqualified until source, fit, motion and
independent visual checks pass. Upper and long garment contract tests also use
explicitly technical in-memory fixtures; these never appear as replacement
artwork in Character Lab.

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

### Optional source contact zones

A fitted module may declare a unique nonempty fitContactZones list. CharacterFitSystem.contactVolume derives the exact authored cage-member intersection with validated coverage, retaining complete cages for collision. Explicit selectors fail closed without source calibration, on stale neutral correspondence or insufficient/nonfinite regions. Absent selectors retain the legacy path. Current fitting consumption is beard width only; other consumers reject explicit selectors. A beard with fitContactZones HEAD therefore follows the fixed jaw without widening from neck/body girth. Fit runs in neutral bind pose after refit; points stay in canonical root metres and the existing root0.8 scale is not duplicated.


### v0.4 source compatibility and measured rigid carry

New Lab modules declare the exact Golden body asset ID and GLB SHA-256 in the canonical registry. Auto and manual selections filter by that identity; legacy modules remain available for their original body. A registered v0.4 source cannot be replaced by a privately overridden path or metadata object.

Rigid equipment now requires an item-local measured grip frame and an explicit subset of canonical hand/hip/back socket carry frames. Each frame has a metre position and unit quaternion. The shared attachment transform is socket-local carry multiplied by inverse item-local grip; changing supported carry leaves item geometry untouched. Unsupported carry is rejected before fetching an asset. This is Lab presentation/snapshot state, independent of CharacterDNA.

Mapless v0.4 garments preserve absent UVs and their COLOR_0 attribute through shared regional refinement. Source footwear surfaces are aggregated before calibrating each side, preventing separate boots from overwriting the opposite side with empty bounds. The 26 targeted consumer/presentation/candidate checks passed on 2026-10-03; those checks do not qualify pending module visual fit.
