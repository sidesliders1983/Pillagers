# Reference clothing — first integration batch

Current status (2026-10-08): the owner retired all three legacy outfits for complete clothing redevelopment. They are archived outside public/ at docs/archive/legacy-clothing and removed from discovery, choices and automatic assignment. The older sections below describe historical implementation, not currently available outfits.

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

`garmentFit: regional` first calibrates the generated figure's measured bind
landmarks to the immutable canonical joints. Production candidates bake that
source pose once and store the resulting canonical bind frame in their provenance.
Exact canonical-body triangle anchors transfer the actual body surface
morphology using barycentric coordinates and the measured source stand-off.
Offline authoring calibrates the original figure's transverse proportions to
the canonical body cage before the runtime wear-clearance pass. Garment ratio
expands the garment-to-body gap while retaining body-sized attachment axes. The mantle
follows Chest/Spine_02. Boot soles use the feet; shafts blend into the lower leg,
with the shared canonical ground plane constraining the sole underside.
All surfaces bind to the body's existing skeleton and clips.
No extra armature, finger rig or cloth physics is added.

Coincident export vertices are sewn in positions and skin weights, including
boundaries between drape regions. Shared seams remain joined during animation.
Measured regional garments receive bounded local edge supports only where coarse
facets cross the body. Clothing layers over the complete original body; these
outfits do not mask torso, limb or foot geometry. The technical brown waist wrap
is omitted when a reference outfit is equipped. Source geometry, materials and
textures stay immutable; each character owns its fitted meshes and shares one
cloned source material across the outfit's regions. Repeated flat-shaded source
points are fitted once per semantic region without changing their UVs or topology.

Export character GLB includes the clothes and Idle/Walk/Run. Identical exporter
skin records are deduplicated so the file retains one shared skin/joint set.

## Checks

- `node --test tests/clothing-assets.test.mjs`: all three outfits on all twelve
  Golden Characters, independent sources, normalized skin weights, connected
  seams throughout Idle/Walk/Run, intact body topology and deterministic choice.
- `node scripts/validate-characters.mjs`: registry, complete embedded textures,
  hashes/provenance, bounds/frame, drape tags and all registered module loading.
- `node scripts/clothing-smoke.mjs`: desktop/mobile rendering, seed assignment,
  pose controls, extreme profiles and GLB export with the shared rig/clips.
  Screenshots and the exported review file are saved in ignored `artifacts/clothing`.

The current optimization pass is pending independent visual acceptance. Historical
generation or validation results do not qualify the replacement geometry.
Final asset hashes, fitted triangle ranges, test results and browser evidence
will be recorded here after the reviewed sources pass the complete matrix.

The source audit also separates two authoring steps: the complete generated
figure supplies a repaired external surface, then its original UV pigment domain
is cut before reduction. An immutable external-surface cache stores original
face/UV correspondence so changing a pigment threshold does not repeat remeshing
or inherit a coarse facet that crosses a skin/fabric boundary. Atlas exports own
one explicit UV domain. Generated palette and source silhouette remain the art
authority; the cache and each output retain their source hashes.

Canonical source-pose calibration maps coordinates through the shared measured
joint frames only. It runs no morphology, body projection, collision support
refinement or wear clearance. Coincident source copies stay sewn across semantic
domains, and free hems/ties follow the hips frame independently of leg poses.
The registered production fit is applied once when equipping the canonical
module. Regressions check pose parity, unchanged topology, source immutability,
shared boundaries, hips-owned drape and one production clearance pass.

Source ownership is assigned before that calibration. The generated figure's
native pigment and edge adjacency distinguish the continuous hem/lining from
leg wraps, and the mantle from the trousers. Physically separate free fabric
layers retain separate source points; genuine bodice, cuff and waist seams share
positions and weights. Planar source supports preserve a coarse outer sheet's
measured interior gap without changing its original corners, palette or outline.
The original sheet UVs remain per-face even where a geometric edge is shared.

The pending motion-fit qualification samples the existing Idle/Walk/Run clips on
an isolated cloned rig during equip, including the maximum-stride quarter phases.
This creates a bounded underlayer contact envelope in the hips frame. The live
body, clips and mixer remain immutable, and ordinary animation performs no fit.
An outer accessory then follows the actual fitted primary fabric, preserving its
original source gap instead of receiving another body-clearance projection.
These candidate paths require independent visual acceptance before publication.

Measured regional garments use the actual triangulated body surface rather than
a radial torso hull that erases the shoulder saddle. Clothing ratio controls
the garment-to-body stand-off vector after clearance; it preserves body-sized
collar and cuff axes. Footwear keeps its measured sole/calf policy. Source ties
retain their accessory semantics and skirt wear layer, without entering the
free-drape convex envelope. These policies are shared, with no profile or style
conditions in the runtime fitter; legacy unmeasured modules keep their cage fit.

The shared drape transform follows the measured pelvis cage on all three axes.
Shrinking child proportions scale depth as well as width and height; identity
cages preserve the authored adult drape. A homothetic contract fixture checks
the three-axis scaling independently of the sculpted Golden Character profiles.

These checks do not establish perfect cloth simulation. The first batch uses
static fitting and skinning with loose silhouettes; very large caricature
proportions still need visual review. The remaining nine outfits are the next
integration batch, not automatically accepted by finishing generation.
