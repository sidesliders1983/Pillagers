# Meshy Human runtime integration

The user-authored source is `Assets/Characters/Human/Human-textured.glb`. Preserve it.
The Meshy preview and the opt-in Fjord mode share `src/characters/MeshyHuman.ts`;
they do not rename or convert the source skeleton to PillagersHumanRig.

## Open locally

The original `/character-lab` now defaults to Meshy Human and uses its existing DNA, body overrides, pin/comparison, fixed views, pose sampling, LOD and snapshot controls. `/character-lab?source=meshy` opens that same original Lab. Published and v0.4 bodies remain selectable. Meshy snapshots record the exact prepared LOD hash. Source-specific module previews, hair colour and native socket/coverage debug are enabled. Breast morphs, generic appearance-size fitting and legacy equipment carry overrides remain unsupported. Existing source bodies retain their tools. Vite scans every application entry before route loading to avoid stale dependency modules when changing routes.

- `/meshy-preview`: all 14 source clips, exact time sampling, pause/restart,
  height, three detail levels and a 40-instance inspection scene.
- `/?characters=meshy`: existing Fjord settlement with the new human runtime.
- `/?characters=meshy&residents=40`: 40 residents in the existing settlement.
- The existing Character Lab navigation links to the new Meshy preview.
  The published body and morphology/attachment tools remain selectable in the original Lab.

## Rebuild after replacing the source

Run `pnpm assets:human`, then `pnpm build`.
The preparation script writes three self-contained GLBs and a provenance manifest to
`public/game-assets/human/`. The three frozen runtime LODs and manifest are now tracked as the exact fitting authority and CI fixtures. The Assets master remains ignored; rebuilding needs that user-authored source. A fresh checkout can load the prepared human without rebuilding it.

The current optimized sizes are approximately 6.17 MB (7,644 triangles),
6.12 MB (3,221 triangles), and 6.12 MB (3,219 triangles).
All include the complete 14-clip animation set and the 44-joint skin.
Most remaining size is the three embedded 2048-pixel textures and animation data; reducing triangles alone does not
greatly reduce the file size. Animation resampling tolerance is 1e-7. Meshopt
compression requires the configured decoder on the shared GLTFLoader.
All LODs retain the same source frame in scene extras, before geometry reduction.

Fjord currently uses LOD2 for every Meshy resident, matching the existing fixed
world-LOD policy. Lab allows inspection of each LOD. Automatic near/far switching
is not implemented for this new body.

## Runtime ownership and animation semantics

The factory caches source loads per LOD. Every instance owns cloned bones, an
AnimationMixer, cloned materials and an independent navigation root, while source
geometry and clips remain shared. Disposal releases instance skeleton resources and
materials, retaining cached source geometry. Height uses existing CharacterDNA and
universalHumanProfile calculations; no new persisted DNA field is introduced.

MeshyHumanDynamics adapts the existing age/DNA curves to the Mixamo rig with absolute per-bone proportions. Child head share increases while torso and limbs become smaller. Parent compensation avoids accumulated scaling. Geometry and textures remain shared; no source files are modified. Neutral bounds normalize height and grounding independently of world placement. Age/traits change cadence and walking stride; older profiles gain a restrained stoop and overweight profiles use a bounded waist spring. This is a rig-specific approximation, not a transfer of the legacy authored morph targets. The Meshy Lab exposes age, masculinity, intelligence and agility.

Idle/Walk/Run map to Idle_02/Walking/Running. The semantic map also exposes Talk,
Listen, Farm, Attack, InjuredWalk and Death. Talk maps to Talk_Passionately.
Two UUID-named clips remain selectable with their source names. Attacks and Death are
one-shot clips that hold the last frame; other clips repeat. Restart in the lab
replays a completed one-shot. The other idle clips are presented with source names
until their intended roles are reviewed.

Fjord still drives Idle/Walk/Run from its existing movement system. Adding the
clips does not implement occupation tasks, conversations, combat or health-state
transitions. Those systems must request the corresponding semantic states later.

## Remaining preparation

This source has authored Meshy base-colour, normal and material textures.
The preparation preserves all three image payloads unchanged, and runtime materials
preserve authored values. The earlier procedural garment colouring is no longer used.
The source has no authored body morph targets. Source-specific rig proportions are supported; detailed anatomical morphs,
detailed anatomy is not authored. Skin tone keeps the existing selective 20% adjustment. Native body-bound hair, beard and outfit previews are selectable through the original Character Lab. Existing modules are calibrated for different source bodies and are
not automatically attached. Age and DNA now affect rig proportions and movement; detailed facial anatomy and heritage-specific anatomy are not authored for this source.

The native BodyFitAdapter now calibrates 16 semantic sockets and supplies exact source/posed surfaces, native bind state and body/LOD identities. Clothes share each instance's actual skeleton; source geometry is cached and never modified.
A future morphology pass must author actual deformation data and validate it
under all relevant clips. This body is an animation/runtime preview, not a
replacement certified for all existing character-contract capabilities.

The Fjord scenery pack was already present in `Assets/Fjord - free assets/`.
Missing `Assets/Terrain/*.glb` files were copied from that local pack, without
overwriting existing terrain files, to satisfy the current AssetManager paths.

## Validation

Run `node --test tests/meshy-human-runtime.test.mjs` after preparation.
The eight integration tests compare the decoded source/export animation poses,
check animated LOD0 silhouette bounds within 5 mm at sampled frames, verify
independent instance skeletons/materials with shared geometry across 40 residents,
verify decreasing triangle counts with all clips/joints on each LOD, compare all texture image hashes, check child head-to-height ratios and reversible growth, and exercise every clip with changing DNA.
Source-to-export comparisons skip if the ignored original is unavailable; the tracked body LODs and new native-module tests do not need that original.

Browser evidence is in `artifacts/meshy-human-integration/`.
The browser check exercises every clip, 40 lab instances, LOD selection and the
40-resident Fjord route. Headless Chromium uses a software GPU in this environment;
its FPS is not a hardware performance certification.





LOD2 correction: all simplification levels lock borders and use relative error .002. LOD2 now retains 3,219 triangles; the old 1,145-triangle version caused unacceptable shape loss. Its current reduction from LOD1 is negligible because the quality constraint limits further simplification. Runtime URLs include the prepared asset hash. A regression check compares LOD1/LOD2 animated bounds within 2 cm across all clips at ages 6, 32 and 80.


The original Character Lab now lists every clip embedded in the loaded Human asset in its Animation selector (14 in the current export). Freeze, pin, snapshot restore and LOD changes preserve the selected clip. Switching to a body without that clip resets to Idle. UUID-only clips are labelled Unnamed clip 1/2; their original names are retained in snapshots. Prepared clip names are regenerated with assets:human.

## Issue #65 — outfit milestone

Retain the adapter, sockets, binding checks, swaps, coverage restoration and exact snapshot identities. The current fitting fixture is one designed **tunic, trousers and boots**, selected as **Tunic, trousers and boots · outfit preview** in the existing Character Lab. The four earlier proof entries remain previews; hair/beard/pouch expansion and general fitting are deferred.

The outfit is designed from panel loops, a sewn trouser crotch and boot shaft/instep/sole loops. It is not a decimated body shell. Neck/sleeve/boot opening rims are locked contact groups; the remaining panels have authored free volume and native weights. Covered torso, legs and feet use a per-LOD source-triangle mask. Wrist openings use source-derived contact loops, partial body cuts and common boundary subdivisions at each LOD. Free sleeves bind to arm regions, avoiding accidental torso weights on inner elbow points. Removal restores the exact original body geometry and removes dependent pouches.

Qualification is limited to neutral, narrow and broad adults during Idle/Walk/Run. Use the neutral Lab build preset, then Slight + Underweight = 1 for narrow, or Powerful + Overweight = 1 for broad. Existing 60% body-build strength stays unchanged. Below 18 the outfit is excluded and its selectors are disabled. Child/older and further clips await separate qualification. **All assets stay previews until the user approves the exact appearance.**

Authoring: `pnpm assets:human-modules` with Blender 4.5.9 and the original master available. Editable source: `Assets/Characters/Human/Modules-v2/MeshyHuman_modules-v2.blend`; recipe: `scripts/characters/templates/meshy_modules_v2.py`. Runtime GLBs, exact per-LOD binding sidecars and truthful authored-template receipts live in `public/character-lab/modules/meshy-v2/`. Module exports carry no body textures, animations or second skeleton.

Run the focused native tests and `node scripts/validate-characters.mjs --lab-previews`. The native audit uses the real Meshy factory at all three body LODs; it reports fixed-rim transport separately from the legacy Golden audit. Normal playback never refits. These samples are not general fitting or crowd-performance certification.

Fitting-first clarification (2026-10-08): the user now treats this outfit as a technical fitting fixture. Prioritize source-bound contact rims, native skinning, coverage and swaps across neutral/narrow/broad Idle/Walk/Run. Further artwork polishing is deferred; more detailed Meshy models will follow the fitting proof. Existing preview status is retained.

Current fitting evidence: [Meshy outfit fitting proof](qa/meshy-modules-v2/REPORT.md). The fixture remains a preview; clothing artwork is deferred.
