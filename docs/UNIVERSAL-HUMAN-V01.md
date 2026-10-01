# Universal Human v0.1 (issue #7)

Character Lab uses one image-derived adult base per LOD, one `PillagersHumanRig` contract and one set of morph names. Sex derives from the Femininity ↔ Masculinity slider: 0–49% masculinity is female, 51–100% is male, and exactly 50% is excluded. Feminine forms narrow the shoulders, grow the chest and widen the hips; masculine forms broaden the shoulders, chest and waist. There are no alternate male/female body assets.

## Reproduction

1. Prepare one intact frontal view from the supplied turnaround. Check both knees, hands and feet after matting. The first matte damaged the right knee and was rejected before producing a usable model.
2. Run the **already installed** local Pixal3D C++/GGML single-view route (`tools/image-to-3dlab/scripts/pixal3d_generate.py`), resolution 1024, seed 1983. No weights are fetched by this workflow. New installations must follow that project's explicit backend/route/download consent rule.
3. Run `node scripts/asset-pipeline.mjs optimize scratch/universal-human/generated.glb scratch/universal-human/lods --name UniversalHuman --targets 8000 4000 1200`. This is the static mesh/UV/albedo LOD pipeline; run it **before** rigging, since it deliberately rejects skinned/morphed inputs.
4. Run Blender in a separate background factory scene with `--python tools/blender/build_universal_human.py -- --input scratch/universal-human/lods --output public/universal-human`. No live user scene is edited. It adds the same named skeleton, up to four normalized weights, shape keys, sockets and Idle/Walk/Run clips to each LOD. The editable LOD0 `.blend` stays beside the working assets.
5. Run `node --test tests/*.test.mjs`, TypeScript and Vite build. Asset tests inspect the actual GLB binary, including weights and animation channels. Check muscular, feminine and slight extremes in all three clips in the browser, including the joint silhouettes at knees, elbows and hips.

## DNA and deformation

Optional `morphology: {masculinity: 0..1, height: 1.16..1.60}` round-trips through JSON. Legacy DNA defaults to 51% masculinity for male and 49% for female and a named deterministic height sample. Legacy ages below 18 are shown as adult anatomy; the editor only offers adult ages. Existing world mannequin behavior is unchanged.

Physicality and agility compose independently. Height shape keys include a modest torso/leg proportion adjustment in addition to stature. After age 50, Age progressively lowers the shoulders and head and bends the torso forward. The whole body is 20% shorter vertically (width/depth preserved); default height is 1.32–1.52m and the editor caps height at 1.60m. Muscle, breast and hanging belly morphs use intentionally exaggerated caricature volumes. Named seed samples control small head width/length, jaw, nose, leg ratio, shoulder slope and asymmetry variations; these have smaller amplitudes than the explicit axes. Intelligence controls a fictional caricature weight rule: susceptibility is (1 − intelligence)^1.35. A stable weightTendency seed sample chooses overweight (80% of seeds) or underweight (20%); intensity falls to zero at intelligence 100%. Overweight adds a pronounced forward belly and soft torso volume; underweight reduces soft volume around the torso and limb centres. These morphs do not move joints or change muscular/sex axes. Cunning and Temperament do not enter the anatomy profile. The supplied Raven/Bear silhouettes and exaggerated belly reference guide the weight extremes; outfits and weapons remain separate work.

Each skinned instance receives its own cloned bones and materials. Shape keys move the surface; stored joint translation deltas adapt its bind skeleton and inverse bind matrices. Clips contain rotations only, so animation cannot reset those proportions or move the root across the stage. Source geometry/textures remain shared and immutable. Pinning creates an independent comparison skeleton.

## Asset provenance

The reference was supplied by the user. Its neutral bald body, fitted shirt and short underpants guide the generated base. Pixal3D flow weights and runtime are MIT; its bundled DINOv3 encoder has the DINOv3 license. Background removal uses the locally installed BiRefNet-general-lite model (MIT), never BRIA RMBG. The raw input, generation logs, raw GLB and Blender workfile remain local in `scratch/universal-human`; published GLBs have hashes in their manifest. The existing licensed ThreeJS asset packs are untouched.

This pipeline applies skinning to the image-generated, decimated topology. It does not claim artist-authored deformation loops or automatic production retopology. Joint deformation needs visual acceptance before closing #7; the generated shirt hem must also be checked for unwanted volume.

Validated output: 8,559 / 4,295 / 1,293 triangles. Browser checks cover all 27 LOD/silhouette/animation combinations, pinned comparison, height/masculinity extremes, mobile layout/touch and the existing import/export/naming/heritage flows. GLB tests also reject hand vertices bound to leg bones and discontinuous build morphs. Instance tests ensure inverse-bind arrays never alter the cached source or another character, and per-instance bone textures are released. Hands are single rigid units with no finger bones, as requested. The exported clips are prototype motion loops; detailed locomotion polish remains separate from this integration.




## Orientation

The generated source faces +Y in Blender. The rig, toes, belly/chest morphs and forward slouch use −Y in Blender (+Z in glTF). The exporter rotates the source 180 degrees around the vertical axis before building morphs, weights and clips; it explicitly switches the imported object's quaternion rotation mode to Euler for that operation. Asset validation compares the actual toe silhouette against the ankle centre to catch a reversed source independently of the procedural morphs.

## Rounded soft regions and secondary motion

Before morphing, duplicate surface vertices are welded (UVs remain on loops) and the largest front-torso triangles receive local subdivision. This keeps the three LOD budgets while providing enough surface samples for a broad ellipsoid belly cap and rounded hanging underside. The base remains faceted. Published files contain BellyJiggle and BreastJiggle morphs with no skeleton translation.

Each runtime instance owns two bounded damped springs with fixed substeps, driven by the current locomotion cadence and vertical root acceleration. Belly response scales with Overweight; breast response scales with Feminine. Idle has a small drive, Walk and Run have progressively larger drives. Anatomy changes reset spring state; source geometry and pinned instances are independent. This is inexpensive secondary motion for the prototype, without soft-body collision simulation.

## Rigid hands and feet

Every morphology axis preserves hand and foot shape. These regions receive only a uniform joint-centre translation, blended smoothly into the wrist/ankle; core hand vertices have 100% Hand influence and core foot vertices 100% Foot influence. Seed variations, height, muscularity, weight, age and jiggle cannot change their thickness or reshape toes/fingers. Binary tests verify constant per-region morph offsets and a single bone influence across all LODs. The browser regression imports the supplied seed 473419265 DNA and captures Idle/Walk/Run for every LOD.

Breast growth uses two broad ellipsoid caps with lateral and vertical fullness as well as depth. Taking the maximum of the overlapping caps preserves the sternum valley. Local subdivision reserves surface samples for both chest and belly on every LOD. The breast spring uses the same rounded region mask, and asset tests verify lateral volume growth.
