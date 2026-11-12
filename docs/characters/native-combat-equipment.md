# Native visible combat equipment (#309)

The owner supplied three standalone Meshy props through the Drive folder
https://drive.google.com/drive/folders/1KLQh4TMMHZmr6WPw2UpUOzJRMUouGaVV.
Their fitted derivatives are explicitly **preview assets pending combined owner QA**.
The source was supplied for this project; no new generation, paid service, external
library asset or replacement character was used.

| Canonical item | Runtime asset | Source triangles retained | Runtime bytes | Native hand |
| --- | --- | ---: | ---: | --- |
| woodenSpear | equipment/native-wooden-spear | 3,098 | 684,740 | RightHand, joint 24 |
| woodenShield | equipment/native-wooden-shield | 2,914 | 801,080 | LeftHand, joint 11 |
| leatherShield | equipment/native-leather-shield | 3,020 | 850,132 | LeftHand, joint 11 |

The large originals stay ignored under Assets/Combat. Each source filename, exact
byte count, locally measured SHA-256 and Drive file ID is frozen in
scripts/characters/native-combat-equipment.sources.json. Preparation rejects a
source with different bytes. Original Drive filenames were not used as identity;
the immutable file IDs and measured bytes identify the supplied exports.

Run node scripts/prepare-native-combat-equipment.mjs to reproduce the three GLBs,
bindings, provenance and NativeCombatEquipmentMeasurements.ts. All original
triangles and UVs remain. Source nodes contain no mannequin, skin or animation;
the small disconnected leather-rim components are retained as supplied.
The existing occupation-tool texture policy reduces base colour to 1024 pixels
and metallic/roughness to 512, retaining source colours while removing normal,
occlusion and emissive maps. The three optimized payloads total 2,335,952 bytes
rather than 137,724,004 source bytes. Textures and source templates remain cached
by the existing native factory; instances retain the existing fitted geometry
and material ownership. Each prop adds one mesh/material draw to a visible actor.
No additional renderer or skeleton is created.

Bindings use the unchanged native 44-joint rig and exact body/topology identities.
The spear uses socket_hand_R and the shields socket_hand_L. Each vertex has one
full influence on its actual hand joint. The existing measured finger-cavity
recipe supplies closed fingers and the bounded carry pose. Shield fronts face
outward from the left hand, with the measured target behind the source centre;
no new handles, straps or substitute geometry were added. Fitting uses scale 0.9
for the supplied 2m spear (1.80m) and scale 0.78 for the supplied 0.90m shields
(about 0.70 m). Geometry is transformed into the source bind frame once; animation
does not reauthor or refit it. Ready, strike, block and reaction animation remains
separate work in #310; carry checks do not qualify those poses.

The shared catalog is the only asset discovery addition. Scalar occupation
equipment remains supported. The field wardrobe layers actual assigned props
over the existing normal tunic, hair and face; it does not select a new body.
There are no equipment rules, costs, inventory changes or combat coefficients in
this asset change.

## Eligible teenage field clothing

The existing normal tunic and low shoes previously declared minimum age 18 even
though expedition eligibility begins at 16. Numeric qualification extends only
those two native binding descriptors to 16, preserving their exact GLB geometry,
source body identities, rig and coverage definitions. The field-only wardrobe
selection is owned by FjordWardrobe; ordinary civilian clothing and hair/beard
age contracts remain separate.

Run node scripts/qualify-field-teen-clothing.mjs for a non-mutating qualification;
--apply explicitly writes the qualified age descriptors and their byte hashes.
An isolated module loader changes only the candidate metadata hashes in memory,
so the actual native factory still validates every binding byte. It tests the
full tunic, low shoes and both supplied props on world LOD2 at ages 16/17 and age 18
controls, male and female. Every one of 144 sampled Idle/Walk/Run frames retains
44 native bones, an active coverage mask, finite sampled module vertices, no
severe stretched sleeve triangles under the existing threshold, and no motion
refits. Actual teen Child weights remain 0.1067 and 0.0533; age is never coerced to 18.
The detailed measured report is docs/qa/visible-equipment-309/teen-clothing-measurements.json.

This is numeric fitting evidence, not owner visual acceptance or whole-garment
penetration certification. Extreme body profiles, authored combat action poses
and physical phone performance require their own correctly labelled evidence.
Existing base clothing is substantially more detailed than these props; this
change preserves its geometry and does not claim a whole-character performance
improvement.
