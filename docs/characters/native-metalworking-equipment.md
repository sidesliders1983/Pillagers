# Native metalworking equipment sources (#224)

The owner supplied the actual iron spear and reinforced shield through the
[Combat folder](https://drive.google.com/drive/folders/1KLQh4TMMHZmr6WPw2UpUOzJRMUouGaVV).
This extends the three-item native equipment baseline; it does not add the
helmet or body-armor sources from #333.

| Item | Exact Drive source ID | Original bytes | Source triangles | Runtime bytes |
| --- | --- | ---: | ---: | ---: |
| Iron-tipped Spear | 1Ttjy71EiCnVYwRBt_Wq8naBe8gyRvnNM | 44,460,656 | 3,016 | 651,048 |
| Iron-reinforced Shield | 1pUj9uFFRlrIwqfHOzuiiSLst8-Ym-EYX | 48,473,968 | 2,866 | 815,552 |

The original Drive filenames are
`Meshy_AI_viking_spear_iron_mod_1111090607_image-to-3d-texture.glb` and
`Meshy_AI_viking_shield_metal_m_1111090758_image-to-3d-texture.glb`.
Their exact SHA-256 identities and ignored local paths are frozen in
[scripts/characters/native-combat-equipment.sources.json](../../scripts/characters/native-combat-equipment.sources.json).
Preparation checks the original byte counts and hashes before importing them.
The originals remain under ignored `Assets/Combat` and are excluded from public
packages.

The authorization basis is the owner's supplied folder and request to use these
assets in Pillagers. These files are identified as Meshy exports by the owner's
source names and existing project records. Their embedded generator is Khronos
glTF Blender I/O v4.4.55. No copyright or license text is embedded in either GLB,
and no separate license document was present among the folder's twelve direct
children. Drive sharing permission is not an independently verified third-party
redistribution license. Do not describe these sources as CC0 or an open asset
library. No replacement model, new generation or paid service was used.

## Source inspection and native fitting

Both originals contain one identity-transformed mesh, one material, no skin,
no skeleton and no animation. Source-only native browser views verified that
the shield is a wooden board with iron rim, boss and spokes, rather than a
solid metal plate. Its decorated front points along source +Z; the plain wooden
back and horizontal bar face -Z. The source is about 0.900 m across in XY.
Scale 0.78 produces the same approximately 0.70 m shield size as the baseline.

The iron spear is 2.0 m tall along source +Y. Inspection confirms a wooden shaft,
iron blade and fittings. The plain shaft section at Y = 0.9 m measures about
81.3 by 75.2 mm. Its measured grip centre is
(-0.0001413971, 0.9, -0.0042319577) m, below the blade/fittings.
Scale 0.9 yields a 1.80 m fitted spear. The shaft grip is measured from this
source, not inferred from the wooden spear's vertices.

The existing preparation script binds the actual derivatives to the unchanged
native hand anchors: right hand joint 24 for the spear and left hand joint 11
for the shield. There are no new bones, body replacement, source clips, body
masks or renderer. Source coordinates are transformed into the native bind
frame once. The new catalogue IDs are `equipment/native-iron-spear` and
`equipment/native-iron-shield`.

The shield's 112 mm rear mount offset was checked against the actual fitted
forearm and fingers. Eighty samples cover ages 16/32, both sex presentations,
Idle/Walk/Run and ready/spear/shield phases. The nearest sampled skin remains
3.009 mm behind the real rear surface; the largest closest-forearm gap is
8.825 mm. No sampled skin is ahead of the front. At peak defence the signed
front normal has a forward dot product of at least 0.99997. This is a sampled
mounting-seam check, not a whole-body collision certificate or owner acceptance.

## Optimization and reproduction

Run `node scripts/prepare-native-combat-equipment.mjs` with the exact originals
available. Every original triangle index and UV coordinate is retained. The
measured source-to-native transformed positions differ from the Float32 output
by less than 0.000000067 m. No source components are substituted or removed.

The original materials have three embedded 4096 by 4096 PNG maps each.
The established equipment policy keeps base color at 1024 by 1024 and packed
metallic/roughness at 512 by 512, encoded as JPEG, and removes the normal map.
The two optimized GLBs total 1,466,600 bytes rather than 92,934,624 original
bytes. Each visible item contributes one source mesh/material draw, as with the
existing equipment. This states payload and topology cost; it does not certify
frame rate or physical-phone thermal behavior.

The three earlier props, bindings and provenance files remain byte-identical.
Their #309 preparation receipt retains its original scope. The iron items have
a separate [preparation receipt](../../output/native-combat-equipment-224/preparation.json)
and [source-preservation/contact audit](../../output/native-combat-equipment-224/source-audit.json).
The mounting audit was run after the working #224 native role generalization;
final pinned integration and broader motion/appearance results are separate.

The assets retain their explicit pending-combined-owner-QA review status.
Extreme body forms, hair/clothing interaction, complete field/combat motion,
world/portrait parity, LODs and physical iPhone acceptance must be checked in
the integrated build. These asset derivatives alone do not prove inventory,
crafting, combat balance or save/replay behavior.
