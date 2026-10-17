# Current replacement preview

The replacement tunic native-019 is ready for human appearance inspection in the existing Character Lab. One new Meshy task converted the explicitly approved image-review-005 tunic. Existing trousers and shoes are byte-identical to native-011. The native 44-bone skeleton and original Human body remain unchanged.

The 48 Walking/Idle samples pass both the existing edge-stretch screen and an additional actual collar-to-body check (maximum gap 25 mm, penetration tolerance 3 mm). Observed animated maximum gap is 18.61 mm; NativeNeutral collar gap 22.64 mm and shoulder gap 22.76 mm. Covered-body intersections remain handled by masks. Source facets remain visible at close range; this is an adult default-DNA preview, not exhaustive collision or extreme-DNA approval. See output/meshy-outfit-pipeline/pass-009/qa-native-019/summary.json for the exact current hashes and qualifications.

The fit keeps a damped field for the inner and outer cloth shells, enforces a 6 mm minimum inner collar clearance in authoring space, transfers actual source skin weights at the collar, smooths the sleeve/torso weighting transition and restores only the real neck/front slit. No extra body or skeleton is introduced. Preparations 014–018 preserve the rejected intermediate evidence. Exact prompts remain under imagegen/tunic-neck-003/ in pass-009; the new approval and input manifests are separate from the original immutable approval.

The following sections preserve the earlier investigation and its limitations.

# Fisherman outfit 009

Current status: **tunic rejected** after human review of the neckline and shoulders. Earlier edge-stretch checks did not certify garment contact. See output/meshy-outfit-pipeline/pass-009/neck-shoulders-001/ for diagnostic images and the preserved historical report. No corrected 3D tunic is published. A large surface shrink was rejected before publication; a new tunic image set must be reviewed before conversion. Trousers and shoes remain available.

The following describes the historical native-011 preview and its limited checks.

The existing Meshy Human has three additional adult preview choices: Fisherman wool tunic, Fisherman linen trousers and Fisherman leather shoes. Open `/character-lab?clothing=fisherman-009`. Existing accepted clothing and hair assets are unchanged; Fjordplay occupation selection is unchanged.

The four approved orthographic images were sent separately for each component. The oblique view was reference only. Local authoring evidence, exact image approval and immutable Meshy task/download receipts remain in `output/meshy-outfit-pipeline/pass-009/`. The first tunic was rejected; the replacement is used. One connected shoe from the two-shoe provider result is retained and reflected before native-pose inversion, with matching UVs, normals, winding and mirrored joints.

Final recipe: `scripts/characters/prepare-fisherman-native.mjs`, preparation `native-011`. It uses the recorded reversible static A20 authoring pose, the original 44-bone native rig and four normalized influences per vertex. Lower sleeve sectors prevent cuff vertices from receiving pelvis weights. The hem follows the upper legs. The upper trousers are tucked by at most 20 mm, the tunic layer correction reaches 23.1 mm, and source-bound runtime underlap clips only the matching trousers beneath the tunic. Rejected cap/radial-repair experiments are not part of this recipe.

Validation: 48 sampled Walking/Idle 02 poses pass the ratio >4 and posed-edge >50 mm screen. Five opening detail views and front/left/back/right pose images are in `qa-final/`. The relevant 28 clothing tests pass, including unchanged generic/farmer clothing and hair; three dedicated fisherman tests verify slots, child exclusion, exact authoring-space shoe reflection and shared skeletons at all three body LODs. TypeScript and the production build pass. Formatting used the existing TypeScript printer followed by manual inspection.

These are explicit Lab previews pending human 3D appearance approval. The visual sample uses adult default DNA; this is not female/child/extreme-DNA approval or exhaustive collision/cloth simulation. No runtime skeleton or replacement body is supplied by the garments.

To rerun browser QA, set `PLAYWRIGHT_MODULE` to an installed Playwright module path and run `scripts/qa/verify-fisherman-motion.mjs` against the local Vite server on 5195. The Meshy CLI reads credentials only server-side using `PILLAGERS_MESHY_CREDENTIAL_WORKSPACE` or its worktree root, validates the pinned image approval and refuses automatic resubmission after an unresolved intent. Never expose the credential file or copy it into public output.

## Reopened neck and shoulder review

The approved side-view grid expanded the upper contour to 1.958 times the upper-torso scale. Coverage screening missed that extrapolation. Revised image-review-005 keeps the top registration continuous at 1.0 times the torso scale and is pending exact-image approval. The new regression control rejects the actual old grid fixture. The new neckline and shoulder images use built-in ImageGen; the exact prompt is saved in imagegen/tunic-neck-003/prompt.txt under pass-009.

The body reference and runtime four-weight surface agree within tenths of a millimetre at the diagnostic collar/shoulder samples. The 3D source requires up to 100.7 mm local displacement and is rejected rather than heavily deformed. The original skeleton remains unchanged. The earlier mask also removes too much exposed upper-body surface; a replacement must prove collar closure against retained actual body geometry in neutral, Walking and Idle 02, including top views. No replacement 3D tunic is yet published.

Source rejection is enforced before preparation. Components are staged before public asset publication. An aborted local experiment changed only the public trousers binding; that binding was restored byte-for-byte from native-011 and the integrity/rig tests pass again. LAN assets, Lab warning and new review page were checked without browser errors. Source formatting was inspected manually; no formatter is configured in this repository.

Current validation: 31 relevant clothing tests, TypeScript and production build pass. LAN serves all six exact current asset files; the current Lab preview loads with no browser errors. Ten changed pipeline/QA sources were formatted with the existing TypeScript printer and parsed before/after. No new formatter dependency was added.

## Owner approval and Fjordplay selection

The owner approved native-019 for the fisherman occupation. FjordWardrobe explicitly selects the three pieces for adults with canonical occupation fisher, both sexes. The source-bound runtime descriptor retains its technical preview lifecycle because prepared bindings are validated under that contract; this does not authorize unrelated automatic clothing selection. No geometry, texture, mask, skeleton or shoe pair is regenerated for this promotion.
