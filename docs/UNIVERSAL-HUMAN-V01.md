# Universal Human v0.1 (issue #7)

Character Lab uses one image-derived adult base per LOD, one `PillagersHumanRig` contract and one set of morph names. Sex is identity data, independent of the continuous masculinity slider. There are no alternate male/female body assets.

## Reproduction

1. Prepare one intact frontal view from the supplied turnaround. Check both knees, hands and feet after matting. The first matte damaged the right knee and was rejected before producing a usable model.
2. Run the **already installed** local Pixal3D C++/GGML single-view route (`tools/image-to-3dlab/scripts/pixal3d_generate.py`), resolution 1024, seed 1983. No weights are fetched by this workflow. New installations must follow that project's explicit backend/route/download consent rule.
3. Run `node scripts/asset-pipeline.mjs optimize scratch/universal-human/generated.glb scratch/universal-human/lods --name UniversalHuman --targets 8000 4000 1200`. This is the static mesh/UV/albedo LOD pipeline; run it **before** rigging, since it deliberately rejects skinned/morphed inputs.
4. Run Blender in a separate background factory scene with `--python tools/blender/build_universal_human.py -- --input scratch/universal-human/lods --output public/universal-human`. No live user scene is edited. It adds the same named skeleton, up to four normalized weights, shape keys, sockets and Idle/Walk/Run clips to each LOD. The editable LOD0 `.blend` stays beside the working assets.
5. Run `node --test tests/*.test.mjs`, TypeScript and Vite build. Asset tests inspect the actual GLB binary, including weights and animation channels. Check all three body presets in all three clips in the browser, including the joint silhouettes at knees, elbows and hips.

## DNA and deformation

Optional `morphology: {masculinity: 0..1, height: 1.45..2.10}` round-trips through JSON. Legacy DNA defaults to neutral masculinity and a named deterministic height sample. Legacy ages below 18 are shown as adult anatomy; the editor only offers adult ages. Existing world mannequin behavior is unchanged.

Physicality and agility compose independently. Height shape keys include a modest torso/leg proportion adjustment in addition to stature. Age shifts posture and mass gently. Named seed samples control small head width/length, jaw, nose, leg ratio, shoulder slope and asymmetry variations; these have smaller amplitudes than the explicit axes. Intelligence, Cunning and Temperament do not enter the anatomy profile.

Each skinned instance receives its own cloned bones and materials. Shape keys move the surface; stored joint translation deltas adapt its bind skeleton and inverse bind matrices. Clips contain rotations only, so animation cannot reset those proportions or move the root across the stage. Source geometry/textures remain shared and immutable. Pinning creates an independent comparison skeleton.

## Asset provenance

The reference was supplied by the user. Its neutral bald body, fitted shirt and short underpants guide the generated base. Pixal3D flow weights and runtime are MIT; its bundled DINOv3 encoder has the DINOv3 license. Background removal uses the locally installed BiRefNet-general-lite model (MIT), never BRIA RMBG. The raw input, generation logs, raw GLB and Blender workfile remain local in `scratch/universal-human`; published GLBs have hashes in their manifest. The existing licensed ThreeJS asset packs are untouched.

This pipeline applies skinning to the image-generated, decimated topology. It does not claim artist-authored deformation loops or automatic production retopology. Joint deformation needs visual acceptance before closing #7; the generated shirt hem must also be checked for unwanted volume.

Validated output: 7,999 / 3,999 / 1,199 triangles. Browser checks cover all 27 LOD/preset/animation combinations, pinned comparison, height/masculinity extremes, mobile layout/touch and the existing import/export/naming/heritage flows. GLB tests also reject hand vertices bound to leg bones and discontinuous build morphs. Instance tests ensure inverse-bind arrays never alter the cached source or another character, and per-instance bone textures are released. Hands are single rigid units with no finger bones, as requested. The exported clips are prototype motion loops; detailed locomotion polish remains separate from this integration.
