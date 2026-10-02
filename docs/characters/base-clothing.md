# Reference clothing — first integration batch

Issue #10 starts with three generated outfits: `cream-tunic`, `long-dress`, and
`mantle-tunic`. The nine other generated clothing candidates remain unpublished.
This batch is in Character Lab; the World keeps its existing lightweight body
path. No additional model generation is started by integration or validation.

The source is the user's original clothing sheet, cropped and image-to-3D
generated locally. Clothing is extracted from those figures, repaired and
optimized in Blender, then calibrated from the original figure's ground and
skull axis. Toe extension measures each source's actual forward direction.
The resulting frame is +Y up, +Z front, in metres. There are no procedural
replacement outfits. Every public GLB has the nested source/crop/generation,
extraction, optimization and calibration provenance and output hash.

Each outfit uses LOD2 at every body LOD, one baked reference-colour material,
one 512px albedo and a 4,400-triangle maximum. The entire original ensemble,
including its belt and footwear, remains one registered full outfit with tagged
cloth/skirt/mantle/footwear surfaces. Separating freely interchangeable tops,
bottoms and mantles can follow after this reference-derived batch is reviewed.

`characterOutfit(seed)` uses the named `clothing.base-outfit` random stream.
Assignment does not depend on sex or age and stays stable as a character grows.
There are no outfit selection controls. The existing clothing-ratio slider
increases garment clearance; it does not change the assigned reference style.
JSON contains the seed, so clothing selection is reproducible without a schema
change. Material recolouring is not enabled in this batch: the source palettes
and colour regions are preserved.

## Fit and animation

`garmentFit: regional` transfers smooth morphology displacements while retaining
the source folds and stand-off. Torso and upper-arm envelopes enforce clearance;
the skirt expands as a loose pelvis envelope rather than following either leg.
The mantle follows Chest/Spine_02; boots use the existing feet and scale uniformly
for children. All surfaces bind to the body's existing skeleton and clips.
No extra armature, finger rig or cloth physics is added.

Coincident export vertices are sewn in positions and skin weights, including
boundaries between drape regions. Shared seams remain joined during animation.
Partial sleeve coverage bands preserve uncovered arm sections. Covered body
faces are reversibly masked, and the technical brown waist wrap is omitted when
a reference outfit is equipped. Source geometry, materials and textures stay
immutable; each character owns its fitted meshes.

Export character GLB includes the clothes and Idle/Walk/Run. Identical exporter
skin records are deduplicated so the file retains one shared skin/joint set.

## Checks

- `node --test tests/clothing-assets.test.mjs`: all three outfits on all twelve
  Golden Characters, independent sources, normalized skin weights, connected
  seams throughout Idle/Walk/Run, coverage restoration and deterministic choice.
- `node scripts/validate-characters.mjs`: registry, complete embedded textures,
  hashes/provenance, bounds/frame, drape tags and all registered module loading.
- `node scripts/clothing-smoke.mjs`: desktop/mobile rendering, seed assignment,
  pose controls, extreme profiles and GLB export with the shared rig/clips.
  Screenshots and the exported review file are saved in ignored `artifacts/clothing`.

Validation on 2026-10-02: TypeScript and production build passed; all 76 repository
tests passed. The full validator passed for 16 assets / 32 GLBs, 12 Golden
Characters and 15 equipped modules, including World compatibility. Desktop/mobile
outfit checks and shared-rig GLB export passed. The final complete-skirt model was
rechecked after fixing the extraction cut at its sides.

These checks do not establish perfect cloth simulation. The first batch uses
static fitting and skinning with loose silhouettes; very large caricature
proportions still need visual review. The remaining nine outfits are the next
integration batch, not automatically accepted by finishing generation.
