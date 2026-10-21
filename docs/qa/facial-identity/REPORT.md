# Heritable faces — approved shape and application integration

Issue #198 started as an opt-in study on main revision
`d36d7ef3cbd27ec45bb5bd6cc2fbcc7e8c761d2b`. On 21 October 2026 the owner
accepted the shape-only snapshots and requested integration in FjordSide and
Character Lab. The earlier proof report is retained in `baseline/REPORT-shape-proof.md`.
This branch now uses the inherited shape in world residents and the existing
person-card avatar, and in native Character Lab previews. Saved DNA, gameplay
traits, Core RNG and reproduction remain unchanged.

## Application integration

- World residents keep the existing native LOD2. Their facial profile is part of
  the render projection, never canonical simulation state or discovery knowledge.
- The selected person card replaces its emblem with a three-quarter PNG. Its
  wardrobe uses the exact same selection function as the world. Other cards retain
  their current icons. Desktop and mobile peek/details use the same cached image.
- Portrait requests are serialized and cached by complete appearance (up to 24
  PNGs per consumer). Selection, age, wardrobe, DNA or quality changes invalidate
  the relevant request. Queued cancelled requests never render; late results
  cannot replace a newer selection. Failed requests retain the identity emblem.
- One temporary studio serves each request burst. Models are disposed after each
  capture; its renderer/context is released after the burst. There is no portrait
  animation loop, permanent renderer per card or background population job.
- Portraits use native LOD0 at 256 pixels with the existing quality cap (1× Low,
  1.5× Standard). They share source caches with world residents; world LOD stays 2.
- Character Lab has an explicit **Render portrait** button. Editing the preview
  hides its old PNG. Native Lab snapshots and pinned comparisons retain optional
  versioned face data; old snapshots without it use the founder rule for their seed.
  Native neutral still shows the exact source anatomy; playback restores identity.
- Historical portraits use retained identity and observed age at death/transfer.
  Incomplete records fall back to the emblem rather than inventing an age. No new
  frozen portrait-at-event history is written into campaign saves.

## Identity and presentation contract

`facial-identity-v1` projects seven bounded facial axes from recorded ancestry.
It reads living personas and the persona archive. Two known parents contribute
their mean per axis plus a small deterministic individual offset; one known
parent contributes 80% of that parent's axis plus 20% individual variation.
Founders and people with no known parents use a deterministic sample of their
own DNA seed. Missing parent records are deliberately omitted, not invented.
Parent IDs are sorted before projection. The projection never advances Core RNG
and never uses personality, intelligence, cunning or ancestry labels to infer
anatomy. Its version and source parent IDs are explicit in the result.

The profile is derived when requested, not written into a historic save.
Repeated save/load/import reproduces it while the same canonical person, DNA
seed and parent/archive records are retained. If a parent record is later added
or removed, a newly projected face can change under this v1 policy. The integration
deliberately retains this derived-v1 policy, without backfilling or rewriting saves.
It does not promise an immutable portrait across later genealogy edits. A future
profile version must use an explicit migration decision.

The native source has no authored facial morphs. Seven shared morphs implement
the inherited axes on all three existing body LODs. Two further shared morphs
are **source-specific art correctives**, separate from inherited identity:
`feminine` derives from canonical morphology/sex, and `juvenile` follows the
existing `childGrowthWeight(age)` curve. They are not biological categories,
new gameplay stats or extra inheritance. The original skin, UVs, joints,
index and positions are shared across residents. The corrective field fades
to zero at the 1.44 m neck seam and is applied to fitted hair, beards and hats.
The portrait is an on-demand 2D snapshot of the real native 3D character from
a three-quarter view. The owner chose shape-only faces: no eye/brow mesh,
extra feature pass or live 3D portrait widget is part of this proof.

Clothing coverage can clip and reindex the rendered body mesh. Fit sockets
and portrait landmarks retain original source-triangle IDs. The fit adapter's
posed-surface query therefore reads the source geometry with current bones and
morph weights, then restores the rendered geometry. A public-interface test
holds head vertices stable across a female farmer wardrobe change. The
regression was first observed as an off-target wardrobe portrait in the
browser; the failed image is retained only as diagnostic evidence.
The browser then exposed a separate covered-body error: the geometry merge
used by native clothing dropped the relative-morph flag while copying the
morph buffers. Both full-outfit and independent-clothing merge paths now
restore the source flag. The same public test checks that the actual covered
head vertices still coincide with the unmasked source face.

## Current evidence and limits

- `source-audit/audit.json` records the actual native LODs, rig, texture
  hashes, head weights, and absent authored morph targets.
- `family.json` records a fixed three-generation family from real Core
  parentage and a round-trip save comparison. Funding in that bounded fixture
  is only to obtain a family without fabricated births or links.
- `qualification.json` records source hashes, topology sweeps, attachment
  probes and failures for the current source. Earlier measurements remain in
  `baseline/`; they are not relabelled as current evidence.
- `baseline/captures-eye-pass/` and `baseline/browser-family-eye-pass.json`
  are earlier browser observations with the removed eye/brow feature pass.
  They are preserved only as historical evidence. Current matched captures
  are in `captures/shape-only/`; `browser-shape-only.json` contains the current
  browser metadata. It records 18 family images: six people at front,
  three-quarter and profile angles with recorded ages and existing wardrobe.

The current browser pass showed the native heads and garments together after
the coverage fixes, with no added eye/brow mesh. The shared on-demand studio
made 19 renders, held 19 of its 48 allowed images and ran no animation loop.
The paired inherited-face view used 10 draw calls and 193,854 triangles at
LOD 0 with the existing wardrobe. These are observations from the QA browser,
not comparative performance budgets or physical-device measurements.

For the current source, the qualification script completed 512 corner
combinations on each of LOD 0/1/2 with zero reversed head triangles. It also
completed 24 occupation/animation cases and 54 attachment cases, including
adult women and one child with age-eligible hair, with zero reported failures.
Nine focused public-interface tests passed. Public-asset
validation, TypeScript checking and the Vite production build passed. This is
not a completed full repository test suite; the earlier full-suite log ends
before a final result.

Five related factory/fitting/coverage test files also completed: 12 passed,
zero failed and nine skipped. The skipped native-runtime cases require local
opt-in source clips, so they provide no green result for those paths.

The shared source still has angular adult brow and jaw shapes and baked facial
texture. The current gallery still gives women and children a strongly angular,
adult-looking source face. The presentation correctives are deliberately small
to preserve thin LOD triangles and the neck seam. Finite geometry, fit probes
and a successful build cannot establish convincing age/sex variation or
gap-free fit by eye.
The owner accepted this minimal source appearance before application integration.
Physical iPhone/iPad performance, thermal/memory qualification and frozen archived
portrait moments remain unmeasured. Viewport checks below are desktop emulation,
not a physical-device result. Simulation tests do not establish visual quality.

The integration's focused suites passed 76 tests with no failures or skips before
the final native-neutral regression. The final five facial suites then passed all
15 cases, including that regression. Public assets, TypeScript and the production
build passed. No full-repository result is claimed here. Formatting was reviewed
manually and `git diff --check` passed; no formatter is configured.
`integration/` contains actual application captures: the existing paused Spring 803
checkpoint, a resident card on desktop and at 390px, and the native Character Lab
portrait. Selection/details changes retained the same image and paused clock.
Lab capture/export included `facial-identity-v1`; Apply snapshot and Render portrait
produced exactly the same PNG. `integration/manifest.json` records current source
hashes, executed check totals and the precise browser coverage.

Reproduce the focused checks from the repository root:

```powershell
node --test tests/facial-identity.test.mjs tests/resident-appearance.test.mjs tests/character-portraits.test.mjs tests/lab-facial-snapshot.test.mjs tests/native-facial-geometry.test.mjs
node --test tests/character-lab-presentation.test.mjs tests/fjord-clothing.test.mjs tests/fjord-bridge.test.mjs tests/meshy-lab-integration.test.mjs tests/fjord-interactions.test.mjs tests/fjord-fog.test.mjs
node scripts/qa/qualify-facial-proof.mjs
npm run build
```
