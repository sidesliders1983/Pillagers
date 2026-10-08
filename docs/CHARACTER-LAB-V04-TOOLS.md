# Character Lab v0.4 review tools

Issue #18 adds a presentation layer for inspecting character assets and authored
body settings. It does not change CharacterDNA v1, the 27-bone rig, the
`pillagers-fit/0.1` contract, or World rendering policy. Current legacy assets
remain unqualified for the new v0.4 visual acceptance gate.

## Identity and presentation

DNA controls seed, real age/sex, heritage, personality, naming and movement.
`CharacterPresentation.ts` supplies registry-derived hair/beard/outfit choices:
Auto follows the seeded profile; None omits the source; a canonical registry ID
loads that module through the existing factory and Attachment & Fit System.
One optional `#RRGGBB` colour override affects independently owned hair/beard
materials. Auto colour continues to use heritage and age. Manual beard choices
cannot bypass derived male sex or the minimum real age of 18.

Golden base view omits all outer modules and the technical waist demonstrator.
It still displays the existing body asset and its original base material; it is
not a replacement body or a new visual approval. Reset to Auto clears module and
colour choices. Existing legacy boolean factory callers retain their previous
technical waist demonstrator behaviour; Lab presentation defaults it off.

## Existing body overrides

`LabBodyPresentation.ts` is separate from DNA. Auto displays the original body.
Technical Neutral zeroes the supported visual axes and uses a 1.44m adult target
height. The six artistic presets remain disabled pending a reviewed comparison
and compatible authored body proof.

Supported visual axes are Masculine/Feminine, Breasts, Powerful/Slight,
Agile/Grounded, Overweight/Underweight, Age posture, LegRatio, ShoulderSlope and
Asymmetry. Displayed adult height reuses the existing 1.16–1.60m height contract.
There are no independent arm/torso/leg-length targets or head/hand/foot scaling
controls. Physicality still has no anatomical mapping. Explicit visual Powerful
is an authoring override rather than a restored Physicality slider.

Only one `HumanProfile` reaches `UniversalHuman.apply`, the bind adaptation and
fit cages. `composeHumanBodyWeights` computes compound axes from unscaled bases,
then applies the existing 60% build strength once to bases and compounds. Explicit
zero overrides remain meaningful. Opposed positive pairs are rejected; editing
one UI pair sets its opposite explicitly to zero. Age posture is a visual axis:
real age, greying, movement and beard eligibility retain their DNA meaning.

Adult overrides requested below age 18 remain saved but are paused. The ordinary
child/teen profile and growth continue rendering; the body controls explain the
pause and are disabled. Returning to adult age reapplies the saved settings.
Restore source DNA body removes the override without rewriting identity.

## Camera, pose and snapshots

Front, Side and Back use a genuine orthographic camera with a fixed 2.4m vertical
span, centred at 0.95m. Character bounds do not change that construction scale.
RTS and Reset view retain the perspective camera and orbit controls. A user may
orbit/zoom from either camera; snapshots record its actual type, scale, position
and target. Fixed-view buttons are commands, not a persistent selection after
free orbit. Pair comparisons may extend beyond a narrow fixed-scale viewport;
use the perspective Reset view for the full pair.

Freeze pose samples the selected Idle/Walk/Run clip at the requested local time
once. It resets stale secondary-motion springs once, updates the posed skeleton,
and pauses the clip clock. Rendering a frozen frame does not repeatedly reset
animation or refit modules. Play resumes animation. Body/presentation changes
recreate the owned instance at the saved clip time through the original factory.

Capture/export snapshot freezes the current pose and writes
`pillagers-lab-snapshot/1`. It contains DNA, body override, module selection and
colour, body LOD, exact sampled clip time, camera, fixed lighting identity, style
and fit versions, and actual selected registry paths and SHA256 hashes. Apply
snapshot validates all fields before changing the current view. Unknown IDs,
unsupported presets, nonfinite/out-of-range values and stale registry hashes are
rejected. Missing body in an earlier foundation snapshot means Auto. DNA export
continues to export identity only.

Pin comparison captures the full snapshot, including body override, appearance,
LOD and frozen clip time. Later current-view edits do not mutate the pinned model
or cached source textures. Mutable bones, inverse binds, material colours and
morph influences belong to each instance; immutable body geometry may be shared.
Skin tint owns a separate texture `Source`, preventing progressive retinting of
cached albedo after refreshes.

Pixel comparison assumes the same viewport/device scale and overlay settings.
Viewport and debug-overlay toggles are review-environment controls rather than
snapshot fields. Lighting is currently the fixed `lab-neutral/1` setup. The
snapshot does not claim to resume arbitrary secondary-motion simulation history.

## Extension and acceptance

The user requires all new hair, facial-hair/face-covering, clothing and accessory
designs to follow this source chain: **actual Imagegen concept output → visual
review → 3D-provider conversion → optimization and canonical fitting → validation
and acceptance**. Retain the real tool output, its prompt/job metadata and hashes,
the visual-review decision, provider task/source lineage, and optimized exports.
A prompt file by itself or a directly invented procedural/manual mesh does not
satisfy the concept or provenance gate. Optimization, retopology and fit repairs
may edit the converted source while preserving the reviewed design; they do not
substitute an invented mesh design for the required concept/conversion stages.
The human clarified on 2026-10-03: the pre-v0.4 library stays legacy-inspection-only
and must not be reused or count toward v0.4. New modules use the same actual
Imagegen → reviewed reference → Meshy Low Poly → planar/colour cleanup → canonical
fit workflow as the new body. This workflow does not authorize additional paid jobs.

New accepted modules also follow the authoritative vertex/facet colour policy:
one RGB(A) `COLOR_0` value per vertex; default constant colour across all corners
of each intended facet, with optional declared/reviewed vertex gradients. Split
colour attributes at region borders while retaining coincident geometry, skin
weights and morphs. Do not paint garment edges inside faces or use high-frequency
diffuse facets as a substitute for geometry. Source-preserving colour quantization
and bake follows the actual Imagegen/review/provider chain; it does not authorize
a new design or invent missing concept provenance.

The shared UniversalHuman runtime now supports coherent mapless vertex-colour body materials. It owns the instance geometry/palette before canonical fit captures coverage geometry and applies the existing selective 40% skin blend from immutable original linear RGB(A). White/non-skin values and alpha remain unchanged; retinting never compounds, alters shape/morph/rig/index data or modifies cached/pinned characters. Active coverage clones and restoration retain the current palette. Mapped or mixed textured/palette materials stay on the legacy texture path to avoid double tint. Owned palette and coverage geometry is disposed with its character. This generic path has real canonical-rig fixture coverage, not candidate visual approval.

Next accepted exports must prove mapless base colour (linear `COLOR_0`, neutral white factor, no albedo dependency), then independently pass matching front/side/back silhouette/facet review and fixed-RTS readability. A geometry/attribute validator alone does not certify style or generated-source quality.

The current Lab inspection style label remains `0.4-draft.1`; existing snapshots
and dated screenshots retain their meaning. Pre-v0.4 assets are excluded from
the new library; their old validation failures are legacy CI context, not a v0.4
garment repair or migration task. Plan and freeze a separate next
accepted-asset style identifier, colour proof and compatibility/snapshot handling
before publication. No runtime/registry version changes result from this policy.

Add future published modules to `CharacterAssets.ts` with canonical socket,
landmark/cage, bind, LOD/budget and provenance metadata. Selectors discover that
registry; do not add private paths or per-DNA position corrections. New body axes
require authored targets, compatibility checks and deliberate allowlist changes.
The 17-joint garment calibration subset does not replace the full 27-bone rig.

The tools foundation has no equipment assets or six composed outfit presets to
publish. It offers the three existing full garments for inspection. Successful
UI/runtime tests do not qualify those garments, the body, or any head module.
Independent style and morphology/animation review remains a separate gate.

Evidence is recorded in `artifacts/character-lab-v04/integration-qa/`.


## Generic technical style command

Run `npm run validate:style -- --family body-proof <local-candidate.glb>` on a local sourced candidate before proposing promotion. The CLI reads only a local GLB and repository-controlled profiles; it neither repairs nor writes the asset. Body-proof budgets are 1,600 triangles / 4,800 render vertices / one material / sixteen colours, with strict coplanar-region, mapless COLOR_0, neutral material RGB, opaque alpha and face-aligned normal checks. It rejects empty authored/rendered geometry, malformed fields and weakened tolerances, and checks that decoded data/hashes still match actual GLB bytes.

API: `readLocalGLB(path)`, `validateVertexPaletteStyle(record, declaration, externalReviewedAuthority)`, `styleProfileHash(profile)` in `scripts/characters/style-validation.mjs`. The default utility ceilings remain 10,000 / 30,000 / two / sixteen and are not family budget approval. `diagnostic-triangle` always reports conditional diagnostics and cannot qualify the strict body proof. Gradient mode requires trusted external exact source/profile/scope review; the CLI accepts none from an input GLB or arbitrary approval file.

Portable full-suite tests generate their own binary fixture bytes and temporary GLBs. Ignored scratch proof files are audited separately with the same command, without making `npm test` depend on them. Passing command output is technical evidence only; source design, silhouette, shared parts, fit, animations and browser/RTS visual review remain independent gates. No asset was accepted or promoted by this integration.

## Current body preview — 2026-10-03

The human explicitly requested implementing the existing candidate in Character Lab. The Lab now opens the byte-exact candidate 002 source as a labelled preview, with Neutral and six draft build recipes. The accepted production asset registry is unchanged; World continues to use the published body.

`LabBodySources.ts` is a closed Lab-only source catalog. The candidate lives at `/character-lab/candidates/golden-v04/body.glb`, SHA-256 `1e958ad5a5fe4fb5b08999cee79d5a5177e189ed6b3f78f308a2bd320f62d647`. It uses the existing factory, UniversalHuman and Attachment & Fit. No geometry, cage classifier or per-asset fitting offsets were altered.

`LabBodyPresentation` v1 gains an optional source identifier; omitted source retains legacy behavior. Candidate-only build presets resolve through the existing one-time .6 composition. Adult overrides remain paused below 18 while the original growth profile renders. The source selector remains available for children.

Candidate mode is LOD2 and body-only: hair, beard, outfit and the technical waist wrap are unavailable until newly generated v0.4 modules pass the canonical authoring and acceptance gates. These constraints are checked in factory creation/equip and snapshot validation, in addition to the UI. Switching to Published body restores the existing modules/LOD inspection workflow.

Snapshots retain the selected body's distinct ID, full source hash and candidate style identifier. Legacy snapshots remain compatible. Pins retain separate source, morphology, pose and materials. Source selection survives build selection and body reset; the overall Lab reset restores the initial candidate Neutral preview.

The candidate is not an accepted body: extreme feminine chest construction, proper wrist/face crossings and the lower-chin cage deficiency remain disclosed. The earlier generic Head classifier trial stays deferred. This user-authorized preview does not waive Golden/fit/registry acceptance or authorize further provider spending.

Integration evidence and current command receipts: `artifacts/character-lab-v04/implemented-preview/`.

## Superseding chest/hand preview r1 — 2026-10-03

The latest user-authorized correction now runs in ordinary Character Lab through the existing CharacterFactory / UniversalHuman / CharacterFitSystem. Source /character-lab/candidates/golden-v04/body-r1.glb, SHA-256 b5631dc884c0b1dc10969e1fd72f2b46aa5aca99e0caea10952333f1504ec2d8, style pillagers-character-style/0.4-candidate-002-r1, retains 1,322 triangles. Breast target roll-off and joined hand/wrist geometry are corrected; topology, skin, bind, palette and clips are preserved. Previous body.glb and its provenance remain byte-identical. Old candidate snapshots reject the new source identity; published snapshots retain their previous compatibility. Independent bounded browser QA, build, strict source style and 31 focused tests pass. The full suite is 212/216; validate:characters still fails on the existing cream-tunic topology. Complete body acceptance remains HOLD for Giant inner-thigh/crotch crossings and canonical lower-chin cage migration. Current report: [chest/hand correction](C:/CodexWorkspaces/Pillagers/artifacts/character-lab-v04/body-correction/REPORT.md). Earlier results above are historical evidence.

## Superseding Giant/head-cage preview r2 — 2026-10-03

The current ordinary Lab source is /character-lab/candidates/golden-v04/body-r2.glb, SHA-256 ba27e0a4b9cafe1d5db656473e28263d5bb80d6837475bf72ed4f5e35c806cc0, style pillagers-character-style/0.4-candidate-002-r2. It retains r1 chest/hand fixes and adds a general Powerful medial-leg correction, reducing Giant crossings10→0 without changing its recipe or one-time .6 strength.

Optional pillagers-body-surface/1 now provides source-authored coverage, landmarks, fixed common-core membership and cages through the existing Attachment & Fit path. Golden HEAD_CAGE includes all877head corner records, including18formerly omitted chin records. Head-module placement uses the exact previous859-record frame; legacy bodies keep their exact existing mapping. Metadata is lazy loaded only for this source and direct neutral correspondence works on LAN HTTP.

Independent scoped browser PASS:15 originals/13exports, matching source and final bundles, no browser errors. Build and strict style PASS; full tests218/222, four existing cream-tunic failures; validate:characters remains FAIL for that existing garment. Full compound morphology/GoldenGate1 and module verticalslice remain HOLD. A bounded source-domain investigation is staged separately; it does not alter the reviewed r2 preview. [Current r2 report](C:/CodexWorkspaces/Pillagers/artifacts/character-lab-v04/body-r2/REPORT.md). Earlier preview descriptions above are dated history.

## Superseding r3 preview and static posed export — 2026-10-03

Current Lab source is /character-lab/candidates/golden-v04/body-r3.glb, SHA-256 8e01bc03d4d663bb9c3298cfbf8a5703089a696a51be71b1c7ab39c9f5ebd47e, style pillagers-character-style/0.4-candidate-002-r3. Source topology and common adult parts are preserved; coherent Powerful upper-body/arm sections, matching bone translations and authored torso skin ownership remove the sampled compound fold/contact faults. One-time shape strength remains .6. Optional source-authored fit calibration remains unchanged apart from exact new source identity.

Independent actual body QA: 17 originals inspected and 20 rigged exports audited, with zero sampled proper crossings. Named-build continuity, core/child/height/ground checks pass. Maximum compound shoulders/arms and feminine chest/belly still require art review; full Golden Gate1 is HOLD. Earlier r1/r2 descriptions above are dated historical evidence.

Character Lab now offers Rigged character GLB and Static posed GLB. Static mode freezes the current pose, evaluates an isolated clone through the actual canonical morph/skin path, bakes scale once and removes only review-layout translation. It emits owned split-corner meshes with exact geometric normals after final Float32 positions, no rig/morphs/animations, unchanged clean COLOR_0 and the exact source/Lab snapshot in extras. Debug/current/pinned/cache resources are not altered by the helper. Ordinary GLTFLoader uses default smooth materials and still sees the preserved hard facets. The original rigged exporter remains unchanged; additive animated morph-normal export remains unqualified.

Five actual source roundtrips and eight portable helper tests pass. Build and strict source style pass; final full suite is 228 PASS /4 existing legacy cream FAIL /1 optional local-source evidence SKIP (233 total). validate:characters still fails on the legacy cream topology. Those old failures remain honest CI context and are not v0.4 reuse/repair work.

Human new-only rule: no pre-v0.4 asset is reused or counts toward the new library. New hair, facial hair, clothing and items follow actual Imagegen → reviewed reference → Meshy Low Poly → source-preserving planar/flat COLOR_0 cleanup → canonical fit/rig → independent runtime QA. No new v0.4 tunic has been generated or integrated; candidate mode stays body-only. Earlier reuse/migration allowances are superseded. No new paid generation is authorized by this policy.

Current report and exact evidence: artifacts/character-lab-v04/body-r3/REPORT.md; body QA under body-r3/qa, static export under export-proof and body-r3/static-export-qa. Full issue #18 and module vertical slice remain incomplete.
