# Character Lab v0.4 — modular caricature upgrade

Status: **active implementation; Golden body preview integrated, full v0.4 not accepted**.  
Approved task scope: 2026-10-03.  
Visual authority: [Pillagers Low-Poly Character Reference Guide](PILLAGERS-LOW-POLY-STYLE-GUIDE.md).  
Source inventory: [original eight-image reference manifest](references/character-lab-v04/manifest.json) · [additive supplemental metadata](references/character-lab-v04/supplemental-manifest.json).

This document is the executable multi-agent brief for Codex. The associated GitHub issue tracks its acceptance criteria. Creating this document or issue does not start an asset job, approve provider spending, publish new assets, merge code or certify successful tests.

## 1. Mission and fixed scope

Upgrade the **existing** Character Lab to v0.4. Restore the strongly caricatural, intentionally faceted visual language of the supplied illustrations while preserving the current modular system.

Deliver one coherent library:

| Family | Required v0.4 result |
| --- | --- |
| Character | One Golden adjustable human system using the canonical skeleton contract and one master topology per LOD |
| Hair | Five distinct interchangeable hairstyles, plus a non-counted bald/none option |
| Facial hair | Five distinct interchangeable beard styles, plus a non-counted clean-shaven/none option |
| Clothing | Three masculine-presenting and three feminine-presenting complete outfit definitions, composed from reusable garment modules |
| Equipment | Three item types: one sword, one spear and one axe |

This means 19 selected appearance/equipment entries plus the Golden body system, not 20 unrelated character models. Outfit entries may share individual garments. Recolors and none-options do not count as new designs. The human clarified on 2026-10-03 that no asset generated before v0.4 may be reused or count toward this library. All v0.4 modules must follow the same actual Imagegen → visually reviewed reference → Meshy Low Poly → source-preserving planar/colour cleanup → canonical Attachment & Fit route as the new Golden body. Keep older registry entries and dated evidence for legacy inspection; they are not migration candidates for this milestone.

Identity must emerge through composition:

`body configuration × hair × beard × outfit × equipment × materials`

Changing a module must not replace the person, alter DNA, regenerate geometry through a paid service or create a private rig contract.

## 2. Inspect the real starting point

Before editing or generating, inspect the checkout, available branches, local changes, relevant issues, assets and tools. Read applicable repository instructions. Record the branch and commit being used.

At planning time, the developed character implementation is on `codex/universal-human-v02`, inspected at `85d831174b9f9ddd81c7c442b19b44525deec6dd`. The documentation PR is based on `main`; **main is not an equivalent character implementation snapshot**. Recheck before starting. Base implementation on the current successor of the developed character branch and bring these documentation changes across without discarding ongoing work. Do not force-push, merge unrelated branches or overwrite uncommitted work.

Read the current versions of:

- `docs/characters/character-contract.md` — DNA, visual profile, rig and instance ownership.
- `docs/CHARACTER-ATTACHMENT-FIT-CONTRACT.md` — canonical frames, sockets, landmarks, cages, fitting and coverage.
- `docs/characters/asset-registry.md` — publication, provenance, measured budgets and validation.
- `src/characters/CharacterAssets.ts`, `CharacterContract.ts`, `CharacterFactory.ts`, `UniversalHuman.ts` and their relevant profile/fit helpers.
- Existing Golden fixtures, morphology, motion, attachment and browser-smoke tests.
- Issues #7, #8, #10, #11, #15, #16 and #17, distinguishing requirements from actual implementation status.

Retain these current boundaries unless a separate explicit decision changes them:

- `CharacterDNA` remains versioned and deterministic; v0.4 is a Lab milestone, not an instruction to set DNA or skeleton version to 4.
- The existing `morphology.height` and its documented adult range remain authoritative. Do not add a competing persisted `heightScale` field.
- Physicality currently has anatomical deformation disabled. Do not restore trait-to-anatomy mapping merely because older issues mention it; express the approved caricature controls through the appropriate visual/morphology layer.
- Preserve current age progression, child growth, naming, beard eligibility and material-driven greying. Do not silently change gameplay or demographic rules.
- The existing registry, shared Lab/World factory and Attachment & Fit System remain the production path. Do not build a parallel v0.4 character framework.

Document conflicts and a minimal migration proposal before changing contracts. A request for more caricatural bodies is not permission to silently change identity semantics or world scale.

## 3. Reference access and generation capability

Use the actual eight unique supplied illustrations. The duplicated adult sheet is one source. Verify the local/task `pillagers-character-lab-v04-references.zip` against the repository manifest before visual work. The ZIP and original images are task attachments, not files automatically available through a GitHub issue. A sandbox path in a chat is not a Codex repository path.

The later user-supplied six-build sheet (original `1-Foto-1.jpg`, SHA-256 `7b5f890c3e0c4d31af7b7d5035136bde967c6a63e52897f0b9907305a203b766`, 1280×960, 149,602 bytes) is **adult body proportion and extreme-silhouette authority**, additive to the original eight verified ZIP files. Its image remains task-local/private; only supplemental metadata is recorded in the repository. Apply Giant/Raven/Bear/Fox/Elder/Jarl torso/limb masses and posture direction without copying larger hands/feet, individual toes, painted folds or the exposed Fox abdomen. Preserve shared adult head/hand/foot construction, the adopted <=5% bounds tolerance and shape lock, central shape strength 0.6, maximum adult height 1.60m and full opaque white abdomen coverage. Do not invent a universal big-head ratio. This reference decision is not a new 3D approval, rig migration, six independent bodies or provider budget.

If the source images are absent, report the missing reference pack and pause reference-dependent generation/review. Repository inspection and nonvisual contract work may proceed. Do not claim to have inspected images from filenames alone.

Check which image-generation and 3D-authoring capabilities are actually available in this Codex environment. Codex must perform and record real image-generation calls for the concept phase; a prompt file is not a generated image, and a generated image is not a rigged 3D asset. Do not invent a tool, job ID, external service result or visual approval. When a required capability or budget is missing, report that blocker and ask for the specific authorization/setup needed. Do not silently switch to a paid provider, provision cloud infrastructure or expand the budget.

Keep source illustrations task-attached/local unless their publication rights have been confirmed. Store their filename/hash provenance in Git. Newly generated concepts and exports follow the existing project asset-publication policy.

## 4. Multi-agent ownership and resource limits

The coordinator owns the plan, dependencies, shared-file integration and final report. Use these specialist roles; they need not all execute simultaneously:

| Role | Exclusive responsibility |
| --- | --- |
| A — Art Guardian | Read references, apply the style guide, freeze visual proportions, independently review actual concept/render evidence |
| B — Golden Human / Rig | Body source, topology, morphological controls, rig adaptation and standard head/hand/foot regions |
| C — Hair / Beard | Five hair and five beard modules against the frozen head/cage contract |
| D — Clothing | Six outfit definitions, garment meshes, fit/correctives/coverage metadata |
| E — Equipment | Sword, spear, axe and validated grip/carry metadata |
| F — Integration / QA | Shared runtime integration, registry publication, Lab controls, test runner and evidence matrix |

Each role gets an explicit task, allowed paths, inputs, output IDs and definition of done. Workers use separate worktrees or non-overlapping staging paths. Only the integrator edits the shared registry, generated manifests, common contracts, package configuration and Lab integration files. Workers submit metadata fragments rather than racing to edit those files.

Use the available native delegation mechanism. If true subagents are unavailable, report that limitation and execute the same role boundaries sequentially; never claim independent agent review that did not occur.

Default limits for the older development laptop:

- At most one resource-heavy local Blender/mesh/bake/export job at a time. Use an explicit ownership/queue mechanism, not several agents controlling the same Blender scene.
- At most two lightweight local test/browser jobs, and only if measured memory/CPU permit it. Lower concurrency when contention appears.
- Initially one external generation job in flight; increase only within an explicitly approved provider budget/capacity.
- No simultaneous writers to the same asset, scene, registry or review record.

At each handoff report: asset ID, input/source hashes, output paths, contract/style version, actual measured counts/bounds, exact validation commands/results, reference/render evidence, unresolved defects and status. Separate `candidate`, `style-approved`, `technically-validated`, `integrated` and `accepted`; none implies the next.

## 5. Golden Human technical requirements

### One contract, independent instances

Use one `PillagersHumanRig` hierarchy, naming scheme, coordinate convention and animation vocabulary. Each character instance still owns its mutable bones, inverse binds, pose, mixer and module state. One shared rig **definition** does not mean one mutable skeleton shared by every inhabitant.

Preserve metres, +Y up, +Z front, anatomical left on +X, and the ground-level body origin, as defined by the existing contract. Do not give each asset family an independent normalization or root-scale policy.

The Golden Human is a bald, clean-shaven, barefoot, neutral adult base with an opaque plain white sleeveless undershirt covering the abdomen and opaque white fitted briefs/short trunks. These test garments add no outer-costume volume.

### Adjustable body, standardized extremities

Produce markedly different adult body silhouettes from the same adjustable system: Giant, Raven, Bear, Fox, Elder and Jarl, plus neutral. These are **visual regression presets**, not gameplay classes, intelligence labels, genders or granted occupations/ranks.

Expose or derive the needed torso/shoulder/belly/chest mass, torso length, arm/leg length and mass, neck transition and posture controls through the existing morphology architecture. Reuse existing parameter names; add only missing visual controls. Clearly separate Lab-only authoring overrides from serialized identity. Preserve identity on export/import; add a versioned migration only when a genuine schema extension is needed.

**Adult head/face, hands and feet retain the same low-poly construction and nearly identical absolute dimensions across body presets.** Do not offer ordinary head/hand/foot scale sliders or scale those regions up with Giant/Bear body mass. Shape transitions belong at neck, wrists and ankles. Adult invariance does not replace existing age-aware child growth.

Gate 0 must record a measurement method and adopted tolerance. Starting proposal: each corresponding local-axis extent, measured in the neutral/rest pose after runtime presentation scale and excluding modules, stays within 5% of neutral for adults. This is a proposed engineering tolerance, not a measurement extracted from the reference images. Do not silently enlarge it to pass failures. Preserve equivalent region shape/topology per LOD, not merely bounding-box size.

Preserve vertex correspondence across morph targets of each master LOD. If topology is replaced, regenerate and validate canonical landmark/coverage mappings and compatibility versions deliberately. Six independently generated meshes with unrelated vertex order are not an adjustable Golden Human.

Separate body-shape fitting from animation. When proportions change, adapt rest/bind state coherently, bind garments to the same instance, and avoid doubled scale/morph application. Do not assume arbitrary animated bone scaling alone solves clothing fit or foot grounding. The same Idle/Walk/Run clips must remain usable across the supported range.

## 6. Module requirements

### Facet-colour policy and source authority

Apply the [style guide's palette/vertex-colour rules](PILLAGERS-LOW-POLY-STYLE-GUIDE.md#10-palette-and-materials): one RGB(A) value per exported `COLOR_0` vertex; default identical colours on all corners of each deliberate polygon/facet. Optional deliberate vertex gradients need a named region/purpose and visual review. Split colour attributes at borders while preserving coincident positions, weights and morphs; no geometric seams, intraface painted garment edges or high-frequency diffuse facets used as fake geometry.

All new hair, beard/face-covering, clothing and accessory concepts require actual Imagegen → visual review → 3D-provider conversion → source-preserving optimization/canonical fit and colour quantization/bake. Record palette, facet-region and gradient decisions with actual source/output hashes. Prompt-only or directly invented mesh designs cannot satisfy that lineage. Pre-v0.4 assets stay legacy-inspection-only and are excluded from the v0.4 library, including the old cream tunic and its later cleanup candidates. No reuse, migration or bulk conversion of these older assets is part of v0.4. This new-only decision does not authorize provider spending.

The next accepted colour-pipeline proof must export mapless linear RGB(A) `COLOR_0` with neutral white base-colour factor and no albedo dependency. Attribute, topology and budget checks are technical gates; reference silhouette, purposeful broad facets and actual fixed-RTS readability require separate independent visual acceptance. Generic runtime palette support does not publish or approve any candidate.

Keep current Lab inspection labels, draft1 snapshots and dated historical evidence honest. Freeze an explicit next accepted-asset style revision and its colour proof/migration plan before publishing accepted assets; this policy-only clarification does not change runtime/registry versions or invalidate current fixtures.

### Hair and beard

Implement the five-plus-five vocabulary from the style guide using new v0.4 Imagegen concepts and reviewed conversions; pre-v0.4 meshes are not source candidates. Use chunky planar masses, not strands, wispy alpha or high-frequency detail. Base body and exported head modules must contain no baked replacement head.

Use existing `socket_head_top`, `socket_jaw`, `HEAD_CAGE` and `LOWER_FACE_CAGE` semantics and canonical authoring frames. Do not introduce parallel names such as `HEAD_HAIR` in the runtime when the current contract already provides a socket.

Material-driven color and existing age greying remain independent from geometry. Add registry-driven manual Lab selectors plus Auto/None where meaningful; manual selection must not silently bypass current adult-beard eligibility or rewrite persistent identity. Keep selection and presentation policies distinct from asset compatibility.

### Clothing

Produce three masculine-presenting and three feminine-presenting outfits following the guide. They are garment cuts, not separate skeletons or hard gender locks. Use upper/lower/full-body/over-layer/belt/footwear slots only as supported or deliberately extended; do not create six embedded characters.

Deforming garments are separate skinned meshes using the character's canonical skeleton and bind state. Reuse the fit cages, weight transfer, limited corrective profiles and semantic coverage masks. Rigid sockets are appropriate for rigid pieces, not a substitute for making a tunic fit.

No bespoke transform fixes per character/seed. A systematic corrective fit profile can address a defined region of the supported parameter space. Explicitly document support ranges and reject unsupported configurations rather than pretending every arbitrary body extreme is valid.

Preserve open necks, sleeves and hems. Mask only covered body regions and restore them on removal; masking cannot excuse torn garment silhouettes or missing exposed limbs. Strip source bodies, hair and equipment from garment exports. No cloth simulation or elaborate hero armor in this milestone.

### Equipment

Implement one sword, spear and axe as rigid assets without humanoid rigs. Use existing `socket_hand_L/R`, `socket_hip_L/R` and `socket_back` where appropriate. Record an item-local grip frame plus socket-specific carry transforms. Derive scale from the common hand and declared item dimensions.

Demonstrate hand attachment for all three items and hand-to-hip/back changes for the sword without editing its geometry. Validate axe carry where supported. A spear may explicitly reject an unsuitable hip slot; expose supported slots rather than inventing a universal holster. No new combat or two-hand IK system is required.

## 7. Gated image → 3D → runtime workflow

### Gate 0 — audit and contract freeze

Record the working branch/commit, actual references, available tools, baseline screenshots, existing test status, supported body ranges, proposed size tolerance, performance budgets, owner/path map, provider budget and concurrency limits. Reconcile this guide with existing contracts.

Do not start mass asset generation while these are unknown. Continue autonomously after recording the plan when no fundamental architecture, visual-direction or authorization decision is outstanding.

### Gate 1 — Golden Human proof

Generate a clean bald-base concept and a same-scale seven-preset comparison using the supplied references. Use the existing technical rest pose. Save isolated front/side/back views and an optional three-quarter view; sheet labels are not part of isolated conversion inputs.

Art Guardian reviews actual images for caricature, common head/hands/feet and deliberate facets. Turn accepted reference views into one editable canonical 3D source with morphology and rigging. Independent generated views may disagree; reconcile them before modeling. Reject normalized realistic anatomy or mismatched shared parts before downstream authoring.

Prove the Golden body in the real Lab with Idle/Walk/Run and the shared-region measurements. Body approval requires both style and technical evidence.

### Gate 2 — end-to-end vertical slice

Before making the complete library, generate and implement one hairstyle, one beard, one garment/outfit and one item against the frozen Golden source. Prove import, extraction, canonical fit, skinning where needed, registry metadata, live selectors, module removal, body-range changes and animation.

A working concept sheet alone does not pass this gate. Use a feature branch/staging registry or explicit candidate mode; do not silently replace the accepted runtime library with unreviewed candidates.

### Gate 3 — controlled library expansion

Only after Gate 2, allow hair/beard, clothing and equipment authoring to proceed in parallel under the resource limits. Each family uses its own narrowly scoped image prompts and the same style version, approved construction views and measured frames.

Generate isolated module references, not complete bespoke heroes and not a collage as a single image-to-3D input. Review candidates before expensive conversion. Prefer simplifying/regenerating a wrong silhouette over repeatedly repairing it.

### Gate 4 — integration, regression and promotion

Integrate the selected five hair, five beards, six outfits and three items using the existing registry/factory. Run the complete validation plan, inspect actual screenshots and publish evidence. Promote only accepted assets, preserve an explicit rollback path and keep existing asset IDs/imports working or migrate them deliberately.

## 8. Bounded attempts and honest progress

Default per new asset: at most two concept candidates, at most two 3D candidates, and one focused technical repair pass per 3D candidate. Existing accepted assets are reviewed before any regeneration. Any change to these caps must be recorded with justification and authorized budget; do not hide retries inside nested scripts.

Pause the affected family when the cap is reached, or after 30 minutes of active repair without measurable improvement. Save the best candidate, actual before/after evidence, failure cause and proposed simpler alternative. Queue time and provider runtime are reported separately, not mislabelled as repair progress. Independent unblocked work may continue; do not expand scope to avoid reporting a blocker.

Use documented timeouts and cancellation behavior for external jobs. Track job IDs and poll/resume existing jobs rather than submitting duplicates. Cache by source/configuration/tool version and output hash; validator, build and status commands must not trigger generation, network calls or optimization.

At every gate and after at most 30 minutes of active work, write a short factual checkpoint: accepted/target counts per family, artifact paths, completed command results, active job IDs, elapsed time, actual cost when available, blockers and next bounded action. Never claim a reliable ETA without evidence. Do not leave a multi-hour run described only as 'agents are working'.

## 9. Character Lab v0.4 controls

Keep the Lab a development tool around the production runtime, not a parallel editor framework.

Provide:

- Body controls and neutral/Giant/Raven/Bear/Fox/Elder/Jarl presets; preserve existing age, identity and DNA tools.
- Registry-driven hair, beard, outfit and equipment selectors, Auto/None where applicable, hair/material color controls and supported socket selection.
- Reset and deterministic comparison/reproduction; include asset IDs, body configuration, seed, style/contract versions, pose and camera settings in a test snapshot without silently changing DNA semantics.
- Fixed front/side/back cameras and fixed-scale comparison without auto-fitting each character to equal apparent height; a real RTS-distance preview.
- Existing sockets, landmarks, cages, coverage, bounds, LOD/triangle/material diagnostics and current equipped metadata.
- Independent removal/replacement of modules with no stale coverage, leaked mutable geometry/materials or changes to another instance.

World must still use the shared factory and retain its current performance/LOD policy. Do not automatically enable the full Lab wardrobe on every world inhabitant. Any World appearance expansion is a separate measured decision; this milestone requires compatibility, not a crowd-feature expansion.

## 10. Validation and evidence

### Coverage, not an exhaustive combinatorial explosion

Test each selected module individually against neutral and the six adult visual presets, applying beard eligibility correctly. Exercise rest pose and the existing Idle/Walk/Run clips at reproducible animation times. Add the existing short/tall, widest/thinnest and mixed-range extremes whenever the visual presets do not cover them.

Keep the existing deterministic Golden fixtures, including child/older profiles, as regression checks. New garment support need not expand into a child wardrobe, but existing child growth/runtime must not regress. Record unsupported combinations explicitly; they are not successful tests.

Add a small fixed set of at least 12 fully assembled combinations covering every outfit, all module families and fit-sensitive interactions such as long beard plus neckline, long hair plus shoulder wrap, and sword carry plus wide torso. Use pairwise selection where helpful, not every possible Cartesian product.

### Automated checks

Reuse and extend the actual scripts and validators. Required commands on the developed branch include:

```sh
npm run assets:registry     # after deliberate accepted-registry changes only
npm run validate:characters
npm test
npm run build
```

Use `npm run assets:test` for the appropriate Blender authoring checks when available, separate from the fast suite. Honor the repository's Node/dependency/lockfile requirements. Do not add a heavyweight framework merely for this task.

Validate IDs/versions, GLB loading and structure, finite geometry/transforms, normals/orientation, scale/bounds, materials/texture references, budgets, rig bone/morph compatibility, weights/binds, fit metadata and coverage restoration. Check shared adult region shape/size invariance, deterministic configuration/import/export, independent instance state, animation initialization/motion, sockets and module swapping.

A schema/geometry test cannot certify all visual intersections or artistic quality. Art Guardian must inspect fixed-view rendered evidence; reviewers cannot just repeat the asset author's approval message. If browser/Blender/image review cannot run, report it as blocked or not run, never as passed.

### Visual/performance evidence

Capture baseline and candidate screenshots with matching camera/lighting/configuration at Lab and RTS distance. Include front/side/back for body and fitting, plus representative motion frames. Check transparency against light and dark backgrounds for isolated concept cutouts: no opaque checkerboard, colored halo or leftover background.

Measure exported triangles, materials/draw calls, textures, load size and bounds. Inherit and deliberately revise the existing registry budgets at Gate 0. Existing 10k-triangle head-module exceptions are not a default target for new simple styles. Record device/browser, scene population, LOD, frame time and spawn/load timing for a modest repeatable comparison; do not claim universal FPS or buy hardware as part of this task.

The World smoke check may need the authorized local scenery assets. If unavailable, report that limitation distinctly from passing Lab/build tests. No full crowd renderer, physics or infrastructure overhaul is required.

## 11. Acceptance criteria

Every checkbox requires an artifact path, test result or named visual-review record. 'Prepared', 'generated' or 'should work' is not acceptance.

- [ ] **AC01 — Baseline:** actual branch/commit, existing contracts, reference hashes, tools and initial test state are recorded; no parallel modular framework is introduced.
- [ ] **AC02 — Style:** actual generated concepts and rendered assets pass the reference-guide rubric, including default flat facet vertex colours and reviewed deliberate gradients; body silhouettes remain caricatural at a fixed RTS camera.
- [ ] **AC03 — Golden system:** one adjustable human source and canonical rig definition generate neutral plus all six visual presets; no independently generated incompatible body families.
- [ ] **AC04 — Shared parts:** adult head/face, hands and feet preserve common shape/topology and the explicitly adopted near-equal absolute-size tolerance; no automatic scaling with body mass.
- [ ] **AC05 — Base presentation:** bald, clean-shaven, barefoot, opaque white full-length undershirt and fitted briefs; no baked hair, equipment or outer costume.
- [ ] **AC06 — Rig/motion:** body and fitted garments share each instance's canonical bind/skeleton state; Idle/Walk/Run work across supported extremes with independent character instances.
- [ ] **AC07 — Hair:** five genuinely distinct selected hairstyles and None are registered, material-driven, interchangeable and visually/technically accepted.
- [ ] **AC08 — Beards:** five genuinely distinct selected beard styles and None are registered, accepted and selectable subject to existing eligibility; greying/color remains independent of geometry.
- [ ] **AC09 — Wardrobe:** six accepted outfit definitions represent three masculine-presenting and three feminine-presenting cuts, without hard gender locks or separate rigs.
- [ ] **AC10 — Fit:** outfits use the canonical fit/coverage approach, no per-seed hacks or embedded source bodies; openings, seams, layering and supported-range locomotion pass actual review.
- [ ] **AC11 — Equipment:** sword, spear and axe use canonical grip/socket metadata; hand attachment works and the sword switches to hip/back without mesh edits; unsupported carry slots fail clearly.
- [ ] **AC12 — Orthogonality:** swapping/removing modules does not replace identity, mutate another instance, leave body masks active or require a new generation job.
- [ ] **AC13 — Registry:** one registry drives runtime, UI and validation; versions, paths, hashes, measured budgets, fit ranges and material slots are recorded; generated manifests are regenerated by their existing tool.
- [ ] **AC14 — Lab:** live body/module/material/socket controls, fixed views, deterministic comparison/reset and inspectable test snapshots work in Character Lab v0.4.
- [ ] **AC15 — Debug:** sockets, landmarks, cages, coverage, bounds, asset/contract metadata and useful geometry/performance metrics remain accessible.
- [ ] **AC16 — Matrix:** each module is tested across the supported adult preset/extreme set and rest/Idle/Walk/Run; at least 12 assembled combinations and fit-sensitive interactions have evidence.
- [ ] **AC17 — Regression:** existing DNA/import/export, naming, eligibility, age/child growth and Golden fixtures remain valid or have an explicitly approved, tested migration.
- [ ] **AC18 — Checks:** character validation, tests and build pass; required authoring/browser checks have actual results, with blocked/not-run checks clearly separated.
- [ ] **AC19 — World/performance:** the shared World path remains compatible, its LOD policy is preserved, and measured baseline/candidate costs and environment limitations are reported.
- [ ] **AC20 — Provenance:** image-generation calls, prompts, reference IDs/hashes, available tool/model/job metadata, approved views, 3D sources and exports are traceable; no fabricated review or generation evidence.
- [ ] **AC21 — Process:** Golden proof and vertical slice pass before library expansion; worker ownership, concurrency limits, attempt/time caps and checkpoint reporting are enforced.
- [ ] **AC22 — Delivery:** editable source assets or reproducible generation scripts, accepted GLBs, concept views, manifests, tests and screenshots are discoverable under repository conventions.
- [ ] **AC23 — Extension docs:** document how to add a body control, hairstyle, beard, garment/outfit and socketed item, including fitting, validation and publication.
- [ ] **AC24 — Promotion:** final report links every criterion to evidence, names remaining defects, preserves rollback/backward compatibility and does not label partial work as fully accepted.

### Source cleanup boundary

The human's style instructions permit rebuilding/cleaning topology and re-authoring an unsuitable candidate while retaining the actual Imagegen design route. Source preservation protects approved construction and silhouette; it does not impose an absolute ban on all cleanup facets or vertex changes. Generator orientation alone must not decide material versus cavity. Exact arrangement failures are retained as evidence, then a coordinator-reviewed finite source-panel repair may declare truthful new-facet lineage, source landmarks, measured deviations and unchanged principal exterior. Independent art, actual geometry/contact, canonical fit and browser gates remain mandatory. This clarification approves no individual repair or public asset; see the dated coordinator decision in the #18 evidence tree and each concrete candidate plan.

## 12. Out of scope

No replacement game architecture, new occupation/combat/genetics mechanics, historical-authenticity research project, separate gender/child rig families, facial/finger animation expansion, cloth/hair physics, final crowd renderer, provider subscription purchase, cloud deployment or automatic merge to main.

Prefer a simpler reusable approved asset over a spectacular one-off. When blocked, deliver the saved work and a specific bounded next step rather than an unbounded autonomous repair loop.


## 11. Integrated technical style validation boundary

F integrated the generic style utility and portable binary negative tests without publishing a body/module. New v0.4 candidates must record the trusted family style command before promotion; the current Golden body proof command is `npm run validate:style -- --family body-proof <local-candidate.glb>`, with 1,600 triangles / 4,800 render vertices / one material / sixteen colours and coplanar-region policy. Authored and actual active-scene instance counts are separately measured and must both fit budgets. Other families require their own reviewed repository profile; generic ceilings or a diagnostic triangle profile do not grant budget/style approval.

Profiles and tolerances are typed and bounded; exact external source/profile-bound gradient review cannot be replaced by GLB extras or a global boolean. Technical style validation is additive to current character, provenance, attachment and budget validation. It does not replace independent silhouette/facet/fixed-RTS review or certify any source. The historical smooth-normal proof fails hard normals, the painted source fails map policy, and the separate corrected-normal proof passes only this technical gate. No rig, common-part, fit or asset acceptance follows from those results.

## Human prototype progression decision — 2026-10-03

The human is satisfied with the current r3 body for now and explicitly requests proceeding with facial hair to test the model instead of further fine-tuning extreme combinations. Treat r3 as sufficient and frozen for one new beard prototype slice. Defer the documented compound silhouette refinements; do not mark all body/Gate1/issue18 checks fully accepted. Existing common-part, source, canonical fit, eligibility, flat-colour and no-pre-v0.4-reuse requirements remain. This explicit decision permits the facial-hair slice before final body polish; it is not blanket library expansion or fresh provider-budget authorization.

## Human full-workflow continuation — 2026-10-03

The human explicitly states: "Deze pipeline mag door tot #18 is vervuld en geintegreerd in the character lab" in response to the reviewed beard references and pending Meshy conversion. This supersedes the previous one-prototype-only continuation/budget boundary. Continue the actual new-source Imagegen → independently reviewed input → Meshy T2 → source-preserving cleanup → canonical Attachment & Fit → browser QA route through all issue18 deliverables. Do not repeatedly request per-asset provider permission within this scope. Coordinator working ceiling is310 existing credits (max2 candidates per19 new modules, mesh-only5 credits for13 head/item modules and temporary-colour15 credits for6 outfits); no purchases/subscriptions. Retain bounded attempts, one initial provider/heavy local job and Gate2 before expansion. This does not certify generated assets, waive validation, authorize old-asset reuse or automatically merge/publish externally.

## Source sculpture and calibration review — 2026-10-04

The independent genuine bun browser review rejected the current import even though its actual body/self crossings were zero. Native source and source-preserving cleanup retain a dome and round knot; the frozen authoring affine uses axis scales [0.24, 0.127034, 0.24], compressing native height to 52.93% of lateral scale. The consumer does not repeat this affine, and the inherited whole-character Y presentation scale remains unchanged. See the preserved negative evidence in artifacts/character-lab-v04/vertical-slice-qa/bun-browser-qa-coherent and scratch/head-shell-consumer-transform-audit. No acceptance follows from an intersection-only result.

For subsequent source calibration, default to one measured positive similarity: semantic orientation, one native-to-metre scale, and canonical placement. Determine front/up/contact origin from actual source views and native contact contours, not bounding-box extrema alone or camera-axis filenames. A fit to selected planes that substantially changes source aspect ratios cannot be treated as sculpture preservation. Any necessary nonuniform authoring transform must be explicitly reported and independently compared against the approved concept and source before/after views; do not bury it in a runtime ratio or offset. Preserve source topology/planes at authoring, and separately disclose deformation performed by the shared fitter.

Compatible unaccepted preview entries stay available through explicit manual Lab selection for inspection. New-library Auto composition selects independently accepted registry entries only. Legacy body selection remains unchanged. This gate applies generically by review status, without an asset/seed exception.
