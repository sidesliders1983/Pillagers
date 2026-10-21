# Manually fitted female hairstyles

The owner's three fitted styles are available in native Character Lab and in
FjordSide's automatic adult-woman wardrobe: Knotted braid, Mid-length knotted
hair, and Wavy long hair. Both the 3D resident and its cached portrait use the
same wardrobe choice. Men retain their previous four-style seed stream;
children retain their existing short hairstyles. The new bindings support
ages 18–100. Every style remains manually selectable on compatible adult native
bodies in Character Lab.

Style selection uses the independent `fjord.hair.female.adult.variant` stream.
Occupation and birthdays do not reroll it. Colour and progressive greying use
the existing DNA/phenotype appearance policy, including greying from around 45.
No new DNA field, gameplay trait, simulation randomness or save migration is added.

## Runtime publication

The original GLBs under `Assets/Characters/Human/Manual-Fitting/female` remain
untouched and ignored by Git. Each is a complete authoring scene with older
hairstyles, a reference person/rig and roughly 236 MB of shared reference textures.
The new hair objects themselves have no assigned source material.

`scripts/prepare-female-hair.mjs` extracts exactly these audited objects:

| Source | Selected object | Triangles | Runtime GLB bytes |
| --- | --- | ---: | ---: |
| knotted-braid.glb | low_poly_unwrapped | 3,088 | 143,104 |
| mid-hair-knotted.glb | low_poly_unwrapped.001 | 2,874 | 148,284 |
| mid-wavy-long.glb | low_poly_unwrapped.002 | 6,182 | 296,372 |

The published GLBs contain only one hair mesh, source topology/normals and
baked manual positioning. Textures, UVs, older hair, reference bodies, copied
rigs and animations are excluded. The neutral colour carrier uses the existing
DNA tint. Cap vertices follow Head; lower locks reuse the established long-hair
blend to Neck/Spine2, never arms. The native 44-joint rig remains unchanged.
Existing facial correctives and headwear clearance apply through the same module
pipeline at all three body LODs. There is no new hair physics system.

Runtime GLBs, bindings and provenance receipts live under
`public/character-lab/modules/female-hair/`. Measurements are generated into
`src/characters/FemaleHairMeasurements.ts`. Rebuild from the repository root with:

```powershell
node scripts/prepare-female-hair.mjs C:/CodexWorkspaces/Pillagers/Assets/Characters/Human/Manual-Fitting/female
```

Review images and direct Lab links are in [the visual review](../qa/female-hairstyles/review.html).
The three source-file SHA256 values, selected objects, manual transforms, output
hashes, binding hashes and pipeline hash are retained in the provenance receipts.
The runtime can be loaded and validated without the authoring files.

## Validation

31 focused tests passed without failures/skips, covering existing hair, clothing,
portraits and Lab snapshots. New hair checks cover three styles × three body LODs
× ages 18/55/85 × bare head/four hats × Idle/Walk/Run. They verify DNA colour and
greying, finite attached geometry, native skeleton reuse, texture removal, source
triangle counts, reproducible receipts and stable automatic selection.

Public-asset validation, the existing character validator, TypeScript and the
production build passed. Actual browser portraits of all three styles were
inspected, plus wavy hair under a fisher hat and its fully grey elder version.
Finite attachment tests are not a proof of perfect visual clearance in every pose;
physical iPhone/iPad performance remains unmeasured. Formatting is reviewed manually;
no formatter is configured.
