# Heritable face proof — review gate

This is an opt-in study of issue #198 on main revision
`d36d7ef3cbd27ec45bb5bd6cc2fbcc7e8c761d2b`. It does not change the
default world, Character Card, saved DNA, gameplay traits or reproduction.
Open `review.html` through the QA server to inspect the fixed real Core family.
The gallery starts with the resident's existing wardrobe; anatomy-only and
occupation-hat controls remain available for fit inspection.

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
or removed, a newly projected face can change under this v1 policy. A future
rollout needs an explicit persisted-version or migration decision before it
promises an immutable historical portrait across such edits.

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
Owner review of front, three-quarter, profile, RTS/LOD and wardrobe views
remains required before any default Character Card or world integration.
Desktop and physical iPhone landscape performance and memory measurements,
portrait cache invalidation, archived portrait moments, and real Character
Card integration also remain open under issue #198.
